import os
import msal
import httpx
from typing import List, Dict, Any

TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
SCOPES = ["https://graph.microsoft.com/.default"]

async def acquire_graph_token() -> str:
    """Acquire token using Client Credentials Flow (Service Principal)"""
    app = msal.ConfidentialClientApplication(
        CLIENT_ID,
        authority=f"https://login.microsoftonline.com/{TENANT_ID}",
        client_credential=CLIENT_SECRET
    )
    result = app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" not in result:
        raise Exception(f"Graph auth failed: {result.get('error_description')}")
    return result["access_token"]

async def fetch_emails(token: str, max_results: int = 30) -> List[Dict[str, Any]]:
    """Fetch emails from Microsoft Graph API"""
    async with httpx.AsyncClient(timeout=30) as client:
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        params = {
            "$top": max_results,
            "$orderby": "receivedDateTime DESC",
            "$select": "id,subject,from,receivedDateTime,bodyPreview,body"
        }
        resp = await client.get("https://graph.microsoft.com/v1.0/me/messages", headers=headers, params=params)
        resp.raise_for_status()
        return resp.json().get("value", [])