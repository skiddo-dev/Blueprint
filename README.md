# Blueprint: Email-to-Task Kanban for Grocery Construction (Exchange Integration)

Convert vendor emails, permits, and site alerts into actionable tasks with AI-powered parsing.

## 🔑 Microsoft Exchange Setup Required
1. **Register App in Azure Portal**:
   - [Azure Portal > Azure AD > App registrations](https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredApps)
   - New registration → Name: `Blueprint-Exchange-Integration`
   - Supported accounts: `Accounts in this organizational directory only`
   - Redirect URI: `http://localhost:8501`

2. **Configure Permissions**:
   - API permissions → Add permission → Microsoft Graph → Delegated → `Mail.Read` → Grant admin consent

3. **Collect Credentials**:
   - Directory (tenant) ID: Azure AD > Properties
   - Application (client) ID: App registration Overview
   - Client secret: Certificates & secrets → New client secret

4. **Update `.env`**:
   ```dotenv
   AZURE_TENANT_ID=your-tenant-id
   AZURE_CLIENT_ID=your-client-id
   AZURE_CLIENT_SECRET=your-client-secret
   AZURE_SCOPES=["https://graph.microsoft.com/Mail.Read"]
   ```

## 🔐 Access Control (sign-in + roles)

Users sign in with their Microsoft account (Entra SSO). Each user has a role:
- **admin** — full app: board, Sync Emails, Clear All, Quote Generator / Dashboard pages, and the User Access panel.
- **viewer** — board only: can view and edit cards (status/date/notes/assignee), but no sync, clear, or admin pages.

### One-time setup
1. **Azure app registration → Authentication →** add a **Web** redirect URI
   `http://localhost:8501/oauth2callback` (and `<your-prod-url>/oauth2callback` for the deployed app).
2. **Create `.streamlit/secrets.toml`** from `.streamlit/secrets.toml.example`, filling in
   `client_id`/`client_secret` (same as your Azure values), the tenant `server_metadata_url`,
   and a random `cookie_secret` (`python -c "import secrets; print(secrets.token_hex(32))"`).
3. **Set `ADMIN_EMAILS`** in `.env` to your address (comma-separated) — these are always admin,
   so you can sign in and provision everyone else even before the `users` collection exists.

### Provisioning users
Sign in as an admin → sidebar **👥 User Access** panel → add a colleague's email and pick a role
(`viewer`/`admin`), or remove them. Roles are stored in the MongoDB `users` collection. An
authenticated user who hasn't been provisioned (and isn't in `ADMIN_EMAILS`) sees a
"request access" screen until an admin adds them.
