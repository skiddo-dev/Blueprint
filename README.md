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
