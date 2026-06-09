# Deploy setup (one-time)

`.github/workflows/deploy.yml` builds the image **on the GitHub runner**, pushes
it to ACR, and rolls it out to the Azure Container App on every push to `main`.
It authenticates to Azure with **OIDC** (no stored credential). Do the three
steps below once, then merges to `main` deploy automatically.

> **Why the runner builds the image (not `az acr build`):** this subscription
> has ACR Tasks disabled — `az acr build` fails with `TasksOperationsNotAllowed`.
> So the workflow does a `docker buildx build --platform linux/amd64 ... --push`
> on the runner instead (the same path proven manually). The
> `--platform linux/amd64` is **required**: Container Apps runs amd64, so the
> pushed image must be amd64 regardless of the build host's architecture.

Replace the `<…>` placeholders with your values.

## 1. Create a deploy identity with OIDC federation (Azure)

```bash
RG=Blueprint
SUB=$(az account show --query id -o tsv)
TENANT=$(az account show --query tenantId -o tsv)

# App registration + service principal used only by GitHub Actions
APP_ID=$(az ad app create --display-name blueprint-github-deploy --query appId -o tsv)
az ad sp create --id "$APP_ID"

# Trust GitHub Actions running on the main branch of this repo
az ad app federated-credential create --id "$APP_ID" --parameters '{
  "name": "github-main",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:skiddo-dev/Blueprint:ref:refs/heads/main",
  "audiences": ["api://AzureADTokenExchange"]
}'

# Contributor on the resource group covers `az acr login` + push to ACR (the
# runner-side image build) AND `az containerapp update`. For least privilege you
# could instead grant AcrPush on the registry + Container Apps Contributor on the
# app, but Contributor on the RG is the simplest working option.
az role assignment create --assignee "$APP_ID" --role Contributor \
  --scope "/subscriptions/$SUB/resourceGroups/$RG"

echo "AZURE_CLIENT_ID=$APP_ID"
echo "AZURE_TENANT_ID=$TENANT"
echo "AZURE_SUBSCRIPTION_ID=$SUB"
```

> This `blueprint-github-deploy` identity is separate from the app's Entra
> sign-in registration — don't reuse the app's client ID/secret here.

## 2. Add the GitHub repo secrets

The workflow reads all of these from `secrets.*` — none are configured yet
(`gh secret list` is empty), so the workflow can't run until they exist.

| Secret | Value (for this repo) |
|---|---|
| `AZURE_CLIENT_ID` | from step 1 |
| `AZURE_TENANT_ID` | from step 1 |
| `AZURE_SUBSCRIPTION_ID` | from step 1 |
| `ACR_NAME` | `blueprintravesacr` (registry name, no `.azurecr.io`) |
| `CONTAINERAPP_NAME` | `raves-blueprint` |
| `RESOURCE_GROUP` | `Blueprint` |

Set them in Settings → Secrets and variables → Actions → New repository secret,
or scripted with `gh` (fill in the three step-1 values first):

```bash
gh secret set AZURE_CLIENT_ID        --body "<APP_ID from step 1>"
gh secret set AZURE_TENANT_ID        --body "<TENANT from step 1>"
gh secret set AZURE_SUBSCRIPTION_ID  --body "<SUB from step 1>"
gh secret set ACR_NAME               --body "blueprintravesacr"
gh secret set CONTAINERAPP_NAME      --body "raves-blueprint"
gh secret set RESOURCE_GROUP         --body "Blueprint"
```

## 3. Set the app's runtime env on the Container App (once)

The app reads these at runtime; they live as Container App **secrets** (never in
the image or the workflow). Sensitive values use `secretref:`.

```bash
APP=raves-blueprint; RG=Blueprint

az containerapp secret set -n "$APP" -g "$RG" --secrets \
  auth-secret="<AUTH_SECRET>" \
  azure-client-secret="<AZURE_CLIENT_SECRET>" \
  mongodb-uri="<MONGODB_URI>" \
  openai-key="<OPENAI_API_KEY>"

az containerapp update -n "$APP" -g "$RG" --set-env-vars \
  AUTH_SECRET=secretref:auth-secret \
  AZURE_CLIENT_SECRET=secretref:azure-client-secret \
  MONGODB_URI=secretref:mongodb-uri \
  OPENAI_API_KEY=secretref:openai-key \
  AZURE_CLIENT_ID="<AZURE_CLIENT_ID>" \
  AZURE_TENANT_ID="<AZURE_TENANT_ID>" \
  AZURE_USER_EMAIL="<mailbox@domain>" \
  ADMIN_EMAILS="<admin@domain>"
```

**Multi-mailbox sync (per-PM inboxes):** flagged email is pulled from every
provisioned PM's own inbox, with a Graph subscription created per mailbox. The
scanned set is every user with the `pm` role by default — provisioning a PM is
all that's needed. To pin an explicit set instead, add
`PM_MAILBOXES="ben@domain,andrew@domain"` to the `--set-env-vars` above.

Also make sure:
- The app's **`Mail.Read` application permission** covers the PM mailboxes
  (admin-consented). If you scope app mailbox access with an **Exchange
  Application Access Policy**, every PM mailbox must be in that policy.
- The Container App can **pull from ACR** — enable its managed identity with
  `AcrPull`, or use ACR admin creds (`az containerapp registry set`).
- **Azure AD → App registration → Redirect URIs** includes
  `https://<prod-domain>/auth/callback/microsoft-entra-id`.

## 4. Monitoring & alerting

Two complementary layers. Health **gates** (`/healthz` liveness, `/readyz`
readiness) hold or recycle a bad instance; **alerts** page a human when something
fails after a successful deploy.

### a) App-level error alerts (in-app)

Error-level logs — background sync / Graph / OpenAI failures, failed data
migrations, and unhandled server errors — are forwarded to an optional webhook so
they don't die silently in the log stream. Point it at a Slack/Teams incoming
webhook (or any JSON endpoint). The same message dedups to at most once per 5 min.

```bash
APP=raves-blueprint; RG=Blueprint
az containerapp secret set -n "$APP" -g "$RG" --secrets \
  alert-webhook-url="https://hooks.slack.com/services/T000/B000/xxxx"
az containerapp update -n "$APP" -g "$RG" --set-env-vars \
  ALERT_WEBHOOK_URL=secretref:alert-webhook-url
```

Unset = no-op (no alerts, app unaffected). The seam lives in
[`src/lib/server/log.ts`](../src/lib/server/log.ts) (`dispatchAlert`) — swap it for
App Insights / Sentry there without touching call sites.

### b) Azure-native availability + log alerts (recommended)

Catches a fully-down app (the in-app webhook can't fire if the process is dead).
The 2026-06-08 sign-in outage was invisible because nothing probed the **real**
sign-in path — both `/healthz` and `/readyz` returned 200 throughout. So probe the
sign-in redirect, not a health endpoint:

- **App Insights availability (standard) test** against
  `https://<prod-domain>/auth/signin/microsoft-entra-id` — expect a **302**
  redirect; alert on any **5xx** or timeout.
- **Log alert** on the app's error logs matching `auth`/`error`/`immutable`
  (the outage signature), in case the redirect itself still 200s.
- Wire both to an **Action Group** that sends **SMS/email** to the on-call number.

These live in Azure (Portal → Monitor → Alerts), not in this repo, so they survive
an app rollback. Document the Action Group recipients alongside your runbook.

## 5. Backup, restore & disaster recovery

### What needs protecting

**All persistent state is one MongoDB Atlas database.** There is no separate blob
store — email/upload **attachments are stored as binary inside Mongo** — so a
single database backup is the complete restore surface for: `tasks` (+ comments),
`attachments`, `quotes`, `prospects`, `users`, `accessRequests`, the accounting
ledger (`journalEntries`, `invoices`, `bills`, `payments`, `billPayments`,
`customers`, `vendors`, `reconciliations`, `accounts`, `counters`), and the
`meta`/`migrations` bookkeeping.

Runtime **secrets/config are NOT in the database or the repo** — they live as
Container App secrets + the Entra app registration. Keep `AUTH_SECRET`,
`AZURE_CLIENT_SECRET`, `MONGODB_URI`, and `OPENAI_API_KEY` in a password manager;
sections 1–3 above are the recipe to rebuild everything else from scratch.

### Backup policy  *(confirm against your cluster)*

Verify in **Atlas → Cluster → Backup**:

- **Dedicated tier (M10+):** enable **Cloud Backup** with **continuous /
  point-in-time recovery (PITR)** plus scheduled snapshots. Recommended: snapshot
  every 6–12h, retain ≥ 7 daily / 4 weekly, PITR window ≥ 72h.
- **Shared tier (M0/M2/M5):** PITR/continuous backup is **not available** — rely on
  scheduled `mongodump` (e.g. a daily GitHub Action to encrypted storage) until you
  move to M10+. Treat this as a gap to close before calling the data tier
  production-grade.

**Targets (set with the client, then record here):**

| Objective | Target | Mechanism |
|---|---|---|
| RPO (max data loss) | _e.g._ ≤ 5 min (PITR) / ≤ 24h (snapshot only) | Atlas continuous backup |
| RTO (max downtime to restore) | _e.g._ ≤ 2h | restore-to-new-cluster drill below |

### Restore drill  *(run quarterly — never restore over prod)*

1. **Atlas → Backup → Restore** the chosen snapshot / PITR timestamp to a **NEW
   cluster** (e.g. `blueprint-restore-test`). Never restore in place over prod.
2. Grab the restored cluster's SRV URI; point a **staging** Container App revision's
   `MONGODB_URI` at it (or run `node build` locally with that URI).
3. Hit **`/readyz`** — expect `{"db":true,"config":true,"migrations":true}` (200).
   Migrations run automatically on first connect; integrity indexes are recreated
   and must succeed or readiness stays 503 (by design).
4. Smoke the data: board loads, dashboard quote totals, and an accounting report
   (trial balance / balance sheet) reconcile against expectations.
5. Record the date and the **actual** RTO observed; delete the test cluster.

### Data-incident runbook

- **Accidental delete / corruption:** on a dedicated tier, **PITR-restore to a new
  cluster at a timestamp just before the incident**, validate per the drill, then
  cut `MONGODB_URI` over. Don't mutate prod while diagnosing.
- **Destructive endpoints to treat with care:** `POST /api/tasks/backfill-cutoff`
  **hard-deletes** old synced cards — always run it **dry-run first**. Accounting
  period close / closing entries are reversible **through the app**, not via raw DB
  edits — never hand-edit `journalEntries`.
- **Comms:** trip the on-call Action Group (section 4b), then post status; the same
  number that gets the availability SMS owns the restore decision.
