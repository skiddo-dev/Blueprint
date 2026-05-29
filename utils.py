# Blueprint/utils.py
import os
import re
import html
import json
import logging
import requests
import msal
import openai
from typing import List, Dict, Any
from dateutil import parser as date_parser
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)

# ========================
# CONFIGURATION
# ========================
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID")
SCOPES = ["Mail.Read"]

ATTACHMENT_DIR = os.getenv("ATTACHMENT_DIR", "attachments")
MAX_ATTACHMENT_SIZE = int(os.getenv("MAX_ATTACHMENT_SIZE_MB", "10")) * 1024 * 1024
MAX_ATTACHMENTS_PER_EMAIL = int(os.getenv("MAX_ATTACHMENTS_PER_EMAIL", "5"))


def get_graph_token() -> str:
    """
    Acquire Microsoft Graph token via interactive OAuth2.
    Uses try/except to handle all MSAL versions automatically.
    """
    authority = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"
    
    # 1. Initialize App (Try with redirect_uri first)
    try:
        app = msal.PublicClientApplication(
            AZURE_CLIENT_ID, 
            authority=authority, 
            redirect_uri="http://localhost"
        )
        constructor_took_redirect = True
    except TypeError:
        # Fallback for older MSAL versions that don't support redirect_uri in constructor
        app = msal.PublicClientApplication(AZURE_CLIENT_ID, authority=authority)
        constructor_took_redirect = False

    # 2. Silent token (cached accounts)
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            return result["access_token"]

    # 3. Interactive login
    logger.info("🔐 Opening browser for Microsoft login...")
    try:
        if constructor_took_redirect:
            # If constructor accepted it, don't pass it here to avoid conflicts
            result = app.acquire_token_interactive(
                scopes=SCOPES, 
                prompt="select_account"
            )
        else:
            # If constructor didn't take it, pass it here
            result = app.acquire_token_interactive(
                scopes=SCOPES, 
                prompt="select_account",
                redirect_uri="http://localhost"
            )
    except TypeError:
        # Fallback if method signature is unexpected
        result = app.acquire_token_interactive(
            scopes=SCOPES, 
            prompt="select_account"
        )

    if "access_token" in result:
        logger.info("✅ Authentication successful")
        return result["access_token"]

    error = result.get("error", "unknown")
    desc = result.get("error_description", "No description")
    raise Exception(f"Auth failed: {error} | {desc}")


def fetch_recent_emails(max_results: int = 20) -> List[Dict[str, Any]]:
    """Fetch emails & attachments via Microsoft Graph API v1.0"""
    try:
        token = get_graph_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        url = "https://graph.microsoft.com/v1.0/me/messages"
        params = {
            "$top": max_results,
            "$orderby": "receivedDateTime DESC",
            "$select": "id,subject,from,receivedDateTime,bodyPreview,body"
        }
        response = requests.get(url, headers=headers, params=params, timeout=30)
        response.raise_for_status()
        messages = response.json().get("value", [])

        emails = []
        for msg in messages:
            # Extract body
            body = ""
            body_obj = msg.get("body", {})
            if body_obj.get("contentType") == "text":
                body = body_obj.get("content", "")
            elif body_obj.get("contentType") == "html":
                body = html.unescape(body_obj.get("content", ""))
                body = re.sub(r'<[^<]+?>', '', body)
            elif msg.get("bodyPreview"):
                body = msg["bodyPreview"]

            # Extract sender with robust fallbacks
            sender_info = msg.get("from", {}).get("emailAddress", {})
            sender_email = sender_info.get("address", "")
            sender_name = sender_info.get("name", "")
            
            if not sender_email and isinstance(msg.get("from"), str):
                sender_email = msg.get("from")
                
            if sender_name and sender_name not in sender_email:
                sender_display = f"{sender_name} <{sender_email}>"
            else:
                sender_display = sender_email or sender_name or "Unknown Sender"

            # Fetch attachment metadata only (download happens in main.py)
            attachment_ids = []
            msg_id = msg.get("id")
            if msg_id:
                att_url = f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}/attachments"
                att_resp = requests.get(att_url, headers=headers, timeout=15)
                if att_resp.status_code == 200:
                    atts = att_resp.json().get("value", [])
                    for att in atts[:MAX_ATTACHMENTS_PER_EMAIL]:
                        att_name = att.get("name", "unknown")
                        att_size = att.get("size", 0)
                        is_inline = att.get("isInline", False)
                        content_type = att.get("contentType", "application/octet-stream")

                        if is_inline:
                            attachment_ids.append({"filename": att_name, "size": att_size, "is_inline": True, "skipped": True})
                        elif att_size > MAX_ATTACHMENT_SIZE:
                            attachment_ids.append({"filename": att_name, "size": att_size, "error": "Too large", "skipped": True})
                        else:
                            attachment_ids.append({
                                "filename": att_name,
                                "size": att_size,
                                "content_type": content_type,
                                "download_url": f"https://graph.microsoft.com/v1.0/me/messages/{msg_id}/attachments/{att.get('id')}/$value"
                            })

            emails.append({
                "id": msg_id,
                "subject": msg.get("subject", "(no subject)"),
                "from": sender_display,
                "sender_name": sender_name,
                "sender_email": sender_email,
                "date": msg.get("receivedDateTime", ""),
                "body": body,
                "attachments": attachment_ids
            })
        return emails

    except Exception as e:
        logger.error(f"Graph sync error: {str(e)}")
        return []


def parse_email_with_llm(email_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Extract structured data using LLM with regex fallback"""
    att_info = ""
    if email_dict.get("attachments"):
        att_names = [a["filename"] for a in email_dict["attachments"] if not a.get("skipped")]
        att_info = f"\n📎 Attachments: {', '.join(att_names)}"

    prompt = f"""
    You are an assistant extracting structured data from grocery construction emails.
    From the email below, return JSON with:
    - "date": Task date (ISO 8601, e.g. "2025-01-15"). If not explicit, infer from email Date.
    - "assigned_to": Person/team assigned (string). Null if unclear.
    - "quote": Monetary figure (string, keep raw like "$12,300"). Null if none.
    - "notes": Task summary (max 200 chars).

    Email:
    Subject: {email_dict['subject']}
    From: {email_dict['from']}
    Sender: {email_dict.get('sender_name', '')} ({email_dict.get('sender_email', '')})
    Date: {email_dict['date']}
    Body: {email_dict['body'][:1500]}
    {att_info}

    Return ONLY JSON object.
    """
    try:
        response = openai.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=200
        )
        content = response.choices[0].message.content.strip()
        data = json.loads(content)
        return {
            "date": data.get("date"),
            "assigned_to": data.get("assigned_to") or None,
            "quote": data.get("quote") or None,
            "notes": data.get("notes") or ""  # ✅ Defaults to blank string
        }
    except Exception as e:
        logger.warning(f"LLM parsing failed, using fallback: {e}")
        body = email_dict["body"]
        date_str = quote_str = assigned_to = None
        notes = body.strip().replace("\n", " ")[:200]
        
        date_patterns = [r"\b(\d{4}-\d{2}-\d{2})\b", r"\b(\w{3}\s+\d{1,2},\s*\d{4})\b", r"\b(\d{1,2}/\d{1,2}/\d{4})\b"]
        for pattern in date_patterns:
            m = re.search(pattern, body, re.IGNORECASE)
            if m:
                try:
                    date_str = date_parser.parse(m.group(0)).date().isoformat()
                    break
                except: continue
        if not date_str:
            try: date_str = date_parser.parse(email_dict["date"]).date().isoformat()
            except: date_str = None

        quote_patterns = [r"\$\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[kK]?\b", r"\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[dD][oO][lL][lL][aA][rRsS]\b", r"\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[bB][uU][cC][kK][sS]\b"]
        for pattern in quote_patterns:
            m = re.search(pattern, body, re.IGNORECASE)
            if m:
                quote_str = re.sub(r'\s+', ' ', m.group(0)).strip()
                break

        assignee_patterns = [r"(?:to|assigned\s+to|for|responsible\s+party|contact)\s*[:]\s*([^\n\r\.]{1,80})", r"(?:please\s+contact|reach\s+out\s+to)\s+([^\n\r\.]{1,80})", r"(?:[fF]or\s+[aA]ttention\s+of)\s+([^\n\r\.]{1,80})"]
        for pattern in assignee_patterns:
            m = re.search(pattern, body, re.IGNORECASE)
            if m:
                assigned_to = m.group(1).strip()
                break

        return {"date": date_str, "assigned_to": assigned_to, "quote": quote_str, "notes": notes or ""}  # ✅ Defaults to blank string
