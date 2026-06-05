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

Also make sure:
- The Container App can **pull from ACR** — enable its managed identity with
  `AcrPull`, or use ACR admin creds (`az containerapp registry set`).
- **Azure AD → App registration → Redirect URIs** includes
  `https://<prod-domain>/auth/callback/microsoft-entra-id`.
