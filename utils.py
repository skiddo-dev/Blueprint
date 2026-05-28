# Blueprint/utils.py
import os
import re
import html
import json
import openai
import logging
import requests
import msal
from pathlib import Path
from typing import List, Dict, Any
from dateutil import parser as date_parser
from dotenv import load_dotenv

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Microsoft 365 / Graph Configuration
AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID")
AZURE_REDIRECT_URI = os.getenv("AZURE_REDIRECT_URI", "http://localhost:8080")
SCOPES = ["Mail.Read"]

# Attachment Configuration
ATTACHMENT_DIR = os.getenv("ATTACHMENT_DIR", "attachments")
MAX_ATTACHMENT_SIZE = int(os.getenv("MAX_ATTACHMENT_SIZE_MB", "10")) * 1024 * 1024
MAX_ATTACHMENTS_PER_EMAIL = int(os.getenv("MAX_ATTACHMENTS_PER_EMAIL", "5"))

TOKEN_CACHE_FILE = Path.home() / ".graph_token_cache.json"


def _get_token_cache():
    if TOKEN_CACHE_FILE.exists():
        with open(TOKEN_CACHE_FILE, 'r') as f:
            return json.load(f)
    return {}


def _save_token_cache(cache):
    with open(TOKEN_CACHE_FILE, 'w') as f:
        json.dump(cache, f)


def get_graph_token() -> str:
    """Acquire token via interactive OAuth2 login (works with MFA)"""
    authority = f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"
    app = msal.PublicClientApplication(AZURE_CLIENT_ID, authority=authority)
    
    cache = _get_token_cache()
    app.token_cache._cache = cache

    accounts = app.get_accounts()
    token = None

    if accounts:
        result = app.acquire_token_silent(SCOPES, account=accounts[0])
        if result and "access_token" in result:
            token = result["access_token"]

    if not token:
        logger.info("🔐 Opening browser for Microsoft login...")
        result = app.acquire_token_interactive(
            scopes=SCOPES,
            redirect_uri=AZURE_REDIRECT_URI,
            prompt="select_account"
        )
        if "access_token" in result:
            token = result["access_token"]
            app.add_account(result.get("account"))
            _save_token_cache(app.token_cache._cache)
            logger.info("✅ Authentication successful")
        else:
            raise Exception(f"Auth failed: {result.get('error')} | {result.get('error_description')}")

    return token


def save_attachment(name: str, content: bytes, email_id: str) -> str:
    os.makedirs(ATTACHMENT_DIR, exist_ok=True)
    safe_name = re.sub(r'[^\w\-.]', '_', name)
    path = os.path.join(ATTACHMENT_DIR, f"{email_id}_{safe_name}")
    with open(path, "wb") as f:
        f.write(content)
    return path


def fetch_recent_emails(max_results: int = 20) -> List[Dict[str, Any]]:
    """Fetch emails & attachments via Microsoft Graph API"""
    try:
        token = get_graph_token()
        headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        
        # Fetch messages
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

            # Extract sender
            sender_info = msg.get("from", {}).get("emailAddress", {})
            sender_email = sender_info.get("address", "")
            sender_name = sender_info.get("name", "")
            sender = f"{sender_name} <{sender_email}>" if sender_name and sender_name not in sender_email else sender_email

            # Fetch & download attachments
            attachments = []
            if msg.get("id"):
                att_url = f"https://graph.microsoft.com/v1.0/me/messages/{msg['id']}/attachments"
                att_resp = requests.get(att_url, headers=headers, timeout=15)
                if att_resp.status_code == 200:
                    atts = att_resp.json().get("value", [])
                    for att in atts[:MAX_ATTACHMENTS_PER_EMAIL]:
                        att_name = att.get("name", "unknown")
                        att_size = att.get("size", 0)
                        is_inline = att.get("isInline", False)
                        att_id = att.get("id")
                        content_type = att.get("contentType", "application/octet-stream")

                        if is_inline:
                            attachments.append({"filename": att_name, "size": att_size, "is_inline": True, "skipped": True})
                        elif att_size > MAX_ATTACHMENT_SIZE:
                            attachments.append({"filename": att_name, "size": att_size, "error": "Too large", "skipped": True})
                        else:
                            dl_url = f"https://graph.microsoft.com/v1.0/me/messages/{msg['id']}/attachments/{att_id}/$value"
                            dl_resp = requests.get(dl_url, headers=headers, timeout=30)
                            if dl_resp.status_code == 200:
                                path = save_attachment(att_name, dl_resp.content, msg["id"])
                                attachments.append({
                                    "filename": att_name,
                                    "size": att_size,
                                    "path": path,
                                    "content_type": content_type
                                })
                            else:
                                attachments.append({"filename": att_name, "size": att_size, "error": "Download failed", "skipped": True})

            emails.append({
                "id": msg["id"],
                "subject": msg.get("subject", "(no subject)"),
                "from": sender,
                "date": msg.get("receivedDateTime", ""),
                "body": body,
                "attachments": attachments
            })
        return emails

    except Exception as e:
        logger.error(f"Graph sync error: {str(e)}")
        return []


def parse_email_with_llm(email_dict: Dict[str, Any]) -> Dict[str, Any]:
    """Extract structured data using LLM (unchanged logic)"""
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
            "notes": (data.get("notes") or "")[:200]
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

        return {"date": date_str, "assigned_to": assigned_to, "quote": quote_str, "notes": notes}