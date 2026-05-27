# Blueprint/utils.py
import msal
import requests
import base64
import email
import re
from typing import List, Dict, Any
import openai
import os
from dotenv import load_dotenv
from dateutil import parser as date_parser
import json


load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")


# Microsoft Graph Configuration
TENANT_ID = os.getenv("AZURE_TENANT_ID")
CLIENT_ID = os.getenv("AZURE_CLIENT_ID")
CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET")
AUTHORITY = os.getenv("AZURE_AUTHORITY")
# SCOPES should be a JSON array string from environment variable
SCOPES_STR = os.getenv("AZURE_SCOPES", '["https://graph.microsoft.com/Mail.Read"]')
try:
    SCOPES = json.loads(SCOPES_STR)
except json.JSONDecodeError:
    SCOPES = ["https://graph.microsoft.com/Mail.Read"]
GRAPH_ENDPOINT = "https://graph.microsoft.com/v1.0"


def _get_graph_token() -> str:
    """
    Acquire token for Microsoft Graph using client credentials flow
    Returns access token string
    """
    app = msal.ConfidentialClientApplication(
        client_id=CLIENT_ID,
        authority=AUTHORITY,
        client_credential=CLIENT_SECRET,
    )
    
    # Try to get token from cache first
    result = app.acquire_token_silent(SCOPES, account=None)
    
    if not result:
        result = app.acquire_token_for_client(scopes=SCOPES)
    
    if "access_token" in result:
        return result["access_token"]
    else:
        error_msg = f"Failed to acquire token: {result.get('error')}\n"
        error_msg += f"{result.get('error_description')}\n"
        error_msg += f"{result.get('correlation_id')}"
        raise Exception(error_msg)


def fetch_recent_emails(max_results: int = 20) -> List[Dict[str, Any]]:
    """
        Fetch recent emails from Exchange/Outlook via Microsoft Graph API
        Returns same structure as Gmail version for compatibility
        """
    try:
        # Get fresh token using MSAL (we already have this working)
        token = _get_graph_token()
        
        # Make raw request to Microsoft Graph (NO SDK NEEDED)
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        }
        params = {
            "$top": max_results,
            "$orderby": "receivedDateTime DESC",
            "$select": "id,subject,from,receivedDateTime,bodyPreview,body"
        }
        
        response = requests.get(
            f"{GRAPH_ENDPOINT}/me/mailfolders/inbox/messages",
            headers=headers,
            params=params,
            timeout=30  # Add timeout for reliability
        )
        response.raise_for_status()
        
        messages = response.json().get("value", [])
        emails = []
        
        for msg in messages:
            # Extract plain text body (handle both text and html)
            body = ""
            if msg.get("body", {}).get("contentType") == "text":
                body = msg["body"]["content"]
            elif msg.get("body", {}).get("contentType") == "html":
                # Simple HTML to text fallback (for basic emails)
                import html
                body = html.unescape(msg["body"]["content"])
                # Remove HTML tags (basic)
                body = re.sub('<[^<]+?>', '', body)
            elif msg.get("bodyPreview"):
                body = msg["bodyPreview"]
            
            # Parse sender
            sender_info = msg.get("from", {}).get("emailAddress", {})
            sender = sender_info.get("address", "")
            sender_name = sender_info.get("name", "")
            if sender_name and sender_name not in sender:
                sender = f"{sender_name} <{sender}>"
            
            emails.append({
                "id": msg["id"],
                "subject": msg.get("subject", "(no subject)"),
                "from": sender,
                "date": msg.get("receivedDateTime", ""),
                "body": body
            })
        
        return emails
        
    except requests.exceptions.RequestException as e:
        # Handle network/API errors gracefully
        print(f"Exchange API error: {str(e)}")
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response status: {e.response.status_code}")
            print(f"Response text: {e.response.text[:200]}")
        return []
    except Exception as e:
        # Catch-all for unexpected errors
        print(f"Exchange sync error: {str(e)}")
        return []


def parse_email_with_llm(email_dict: Dict[str, Any]) -> Dict[str, Any]:
    """
        Extract date, assigned_to, quote, notes using LLM
        (Unchanged from Gmail version - works identically for Exchange)
        """
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
        import json
        data = json.loads(content)
        return {
            "date": data.get("date"),
            "assigned_to": data.get("assigned_to") or None,
            "quote": data.get("quote") or None,
            "notes": (data.get("notes") or "")[:200]
        }
    except Exception as e:
        # Fallback: Regex-based extraction (more robust than before)
        body = email_dict["body"]
        date_str = None
        quote_str = None
        assigned_to = None
        notes = body.strip().replace("\n", " ")[:200]
        
        # Date extraction - multiple formats
        date_patterns = [
            r"\b(\d{4}-\d{2}-\d{2})\b",  # YYYY-MM-DD
            r"\b(\w{3}\s+\d{1,2},\s*\d{4})\b",  # Month DD, YYYY
            r"\b(\d{1,2}/\d{1,2}/\d{4})\b"  # MM/DD/YYYY
        ]
        
        for pattern in date_patterns:
            date_match = re.search(pattern, body, re.IGNORECASE)
            if date_match:
                try:
                    date_str = date_parser.parse(date_match.group(0)).date().isoformat()
                    break
                except:
                    continue
        
        # Fallback to email Date header
        if not date_str:
            try:
                date_str = date_parser.parse(email_dict["date"]).date().isoformat()
            except:
                date_str = None
        
        # Quote extraction - more comprehensive
        quote_patterns = [
            r"\$\s*\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[kK]?\b",  # $1,234.56 or $1.2k
            r"\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[dD][oO][lL][lL][aA][rRsS]\b",  # 1234 dollars
            r"\b\d{1,3}(?:[,\s]\d{3})*(?:\.\d+)?\s*[bB][uU][cC][kK][sS]\b"  # 1234 bucks
        ]
        
        for pattern in quote_patterns:
            quote_match = re.search(pattern, body, re.IGNORECASE)
            if quote_match:
                quote_str = quote_match.group(0)
                # Clean up extra spaces
                quote_str = re.sub(r'\s+', ' ', quote_str).strip()
                break
        
        # Assignee extraction - more patterns
        assignee_patterns = [
            r"(?:to|assigned\s+to|for|responsible\s+party|contact)\s*[:]\s*([^\n\r\.]{1,80})",
            r"(?:please\s+contact|reach\s+out\s+to)\s+([^\n\r\.]{1,80})",
            r"(?:[fF]or\s+[aA]ttention\s+of)\s+([^\n\r\.]{1,80})"
        ]
        
        for pattern in assignee_patterns:
            assignee_match = re.search(pattern, body, re.IGNORECASE)
            if assignee_match:
                assigned_to = assignee_match.group(1).strip()
                break
        
        return {
            "date": date_str,
            "assigned_to": assigned_to,
            "quote": quote_str,
            "notes": notes
        }