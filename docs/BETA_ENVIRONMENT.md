# Beta environment — implementation plan

**Status:** proposal for review. No infrastructure is created by this document.
**Owner decision needed on the items in [§7 Open decisions](#7-open-decisions).**

## 0. Why

On 2026-06-08 a sign-in-breaking change reached production and stayed broken for
~8.5h overnight. Two reasons it got that far:

1. **No pre-prod gate.** Changes go straight `main → prod`. The bug only showed
   on the *real* Microsoft Entra OAuth redirect, and the `DEV_FAKE_AUTH` bypass
   used in dev/CI/preview never exercises that path — so nothing ran the real
   sign-in flow before prod did.
2. **No alerting.** Nothing pages a human when prod breaks (tracked separately).

A Beta environment that runs **real Entra auth** (`DEV_FAKE_AUTH` off) closes #1:
it would have 500'd on Beta first, failing promotion to prod.

The deploy health-gate has already been deepened (PR #94) to probe the real
sign-in path and roll back on a 5xx — Beta is the complementary pre-prod layer.

## 1. Current production topology (facts, for reference)

| Thing | Value |
|---|---|
| Subscription | `30722858-df32-40d8-9de7-0a4680cd478c` |
| Resource group | `Blueprint` |
| Container Apps environment | `blueprint-env` (reusable for Beta) |
| ACR | `blueprintravesacr.azurecr.io`, image `blueprint:<git-sha>` |
| Prod Container App | `raves-blueprint` |
| Prod FQDN | `raves-blueprint.icyglacier-c4295385.eastus.azurecontainerapps.io` |
| Scale | min 1 / max 2 |
| Deploy | `.github/workflows/deploy.yml` — push to `main` → buildx → ACR → `az containerapp update` → health-gate (readyz + sign-in probe, rollback on fail) |
| Azure auth in CI | OIDC (`AZURE_CLIENT_ID`/`AZURE_TENANT_ID`/`AZURE_SUBSCRIPTION_ID` secrets) — no stored creds |
| Runtime auth env | `AZURE_CLIENT_ID/SECRET`, `AZURE_TENANT_ID`, `AUTH_SECRET`, `AUTH_COOKIE_SECRET`, `AUTH_REDIRECT_URI`, `AZURE_REDIRECT_URI`, `ORIGIN`, `APP_BASE_URL`, plus Mongo / OpenAI / Graph secrets |

## 2. Target topology

A second Container App in the **same** `blueprint-env` and **same** ACR:

| Thing | Value |
|---|---|
| Beta Container App | `raves-blueprint-beta` |
| Beta FQDN (predicted) | `raves-blueprint-beta.icyglacier-c4295385.eastus.azurecontainerapps.io` |
| Image | the **same** `blueprint:<sha>` built once and promoted (never rebuilt for prod) |
| Scale | min 0 / max 1 — scale-to-zero when idle to keep cost near zero; the promotion smoke step wakes it |
| Auth | **real Entra**, `DEV_FAKE_AUTH` unset/false |
| Data | separate Mongo db (see §7) so Beta never writes prod data |
| Graph mailbox sync | **OFF on Beta** (see §7) — must not double-process the prod mailbox |

## 3. Promotion flow (recommended)

Build once, validate on Beta, promote the same image sha to prod. Implemented by
splitting `deploy.yml` into two jobs sharing one build:

```
push to main
  └─ build-and-push   (buildx → ACR, tag blueprint:<sha>)   ← one build
       └─ deploy-beta (update raves-blueprint-beta to <sha>; run the gate:
       │               /readyz=200 AND GET /auth/signin/...=non-5xx, on the BETA fqdn)
            └─ deploy-prod  (GitHub Environment "production" with required reviewers
                             → manual approval → update raves-blueprint to the SAME
                             <sha>; run the same gate on the PROD fqdn; rollback on fail)
```

Key properties:
- **Same sha to prod** — prod gets exactly the bits Beta validated; no rebuild drift.
- **`production` GitHub Environment with required reviewers** gives you a manual
  approval button *and* an email/Slack notification before anything hits prod —
  a second, human answer to "why wasn't I notified."
- If Beta's gate fails, `deploy-prod` never runs. Prod is untouched.

Alternative (simpler, less safe): a `beta` branch with its own `beta.yml`,
promotion by merging `beta → main`. Loses the same-sha guarantee. Not recommended.

## 4. Entra app registration (needs tenant admin — blocker for me)

Beta needs its OAuth redirect URI registered, which requires Azure AD admin on
the tenant. Two options (decision in §7):

- **A. Shared app registration + extra redirect URI** *(fast)*
  Add `https://raves-blueprint-beta.<env>/auth/callback/microsoft-entra-id` to
  the existing app reg's web redirect URIs. Beta reuses `AZURE_CLIENT_ID/SECRET`.
  Caveat: Beta and prod share the same client identity / API permissions.
- **B. Separate Beta app registration** *(isolated, recommended for safety)*
  New app reg with its own client id/secret and only the Beta redirect URI. Beta
  cannot touch prod's Graph subscriptions/mailbox. More setup; needs new GH/app
  secrets (`BETA_AZURE_CLIENT_ID` / `BETA_AZURE_CLIENT_SECRET`).

Either way Beta's `ORIGIN`, `APP_BASE_URL`, `AUTH_REDIRECT_URI`, `AZURE_REDIRECT_URI`
point at the Beta FQDN, and `AUTH_SECRET` / `AUTH_COOKIE_SECRET` are Beta-specific.

## 5. Provisioning steps (ordered)

1. **(admin)** Register Beta redirect URI per §7 choice.
2. Create the app (image pulled from existing ACR; ingress external):
   ```bash
   az containerapp create \
     --name raves-blueprint-beta --resource-group Blueprint \
     --environment blueprint-env \
     --image blueprintravesacr.azurecr.io/blueprint:<current-prod-sha> \
     --target-port <app-port> --ingress external \
     --min-replicas 0 --max-replicas 1 \
     --registry-server blueprintravesacr.azurecr.io --registry-identity system
   ```
3. Set Beta secrets (`az containerapp secret set`) and env (`--set-env-vars`):
   Beta Mongo db name, Beta `AUTH_SECRET`/`AUTH_COOKIE_SECRET`, Beta redirect/ORIGIN/
   APP_BASE_URL, Graph-sync disabled. Mirror prod's other secrets (OpenAI, etc.).
4. Grant the CI OIDC identity rights on the Beta app (Contributor on RG already covers).
5. Confirm health: `/readyz` 200, `/auth/providers` lists `microsoft-entra-id`,
   `/login` 200, and a real interactive sign-in completes against Entra.
6. Wire the split `deploy.yml` (§3) and the `production` Environment approval gate.
7. Smoke a deliberately-broken change end-to-end to prove Beta blocks promotion.

## 6. Cost

Marginal: one extra Container App in an existing environment, scaled to zero when
idle (only spins up during the promotion smoke + when someone uses Beta). Shares
ACR and the managed environment. No new always-on compute.

## 7. Open decisions

| # | Decision | Options | Recommendation |
|---|---|---|---|
| 1 | Entra app registration | A. shared + extra redirect URI / B. separate Beta app reg | **B** (isolation) if admin time allows; **A** to move fast |
| 2 | Data store | separate Beta Mongo db / shared prod db | **separate** — never let Beta writes touch prod data |
| 3 | Graph mailbox sync on Beta | off / point at a separate test mailbox | **off** unless a test mailbox exists |
| 4 | Promotion trigger | auto `main → beta → (approve) → prod` / `beta` branch | **auto + approval gate** (same-sha, notifies before prod) |
| 5 | Prod approval gate | required reviewers on `production` env / none | **required reviewers** — adds a human checkpoint + notification |

## 8. Out of scope (tracked separately)

- **Alerting / paging** on prod 5xx spikes or downtime — the most direct fix for
  "why wasn't I notified" when a failure originates outside the deploy path
  (expired secret, Mongo outage, dependency). Recommended as the next item after Beta.
