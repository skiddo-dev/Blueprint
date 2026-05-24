import streamlit as st
import uuid
import os
import re
import base64
import email
from urllib.parse import parse_qs
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

# --- PAGE CONFIG ---
st.set_page_config(page_title="GroceryBuild Kanban + Gmail", layout="wide")

# --- SESSION STATE INITIALIZATION ---
for key in ["tasks", "synced_ids", "credentials", "flow", "is_authed", "use_mock"]:
    if key not in st.session_state:
        st.session_state[key] = [] if key in ["tasks", "synced_ids"] else (False if key == "use_mock" else None)

SCOPES = ["https://www.googleapis.com/auth/gmail.readonly"]
CLIENT_SECRETS_FILE = "client_secret.json"

# --- OAUTH & GMAIL HELPERS ---
def init_flow():
    if os.path.exists(CLIENT_SECRETS_FILE):
        return Flow.from_client_secrets_file(
            CLIENT_SECRETS_FILE, SCOPES, redirect_uri="http://localhost:8501/oauth2callback"
        )
    return None

def get_auth_url():
    flow = init_flow()
    if flow:
        auth_url, _ = flow.authorization_url(access_type="offline", include_granted_scopes="true")
        return auth_url
    return None

def handle_oauth_callback():
    code = st.query_params.get("code")
    if code and st.session_state.flow:
        try:
            st.session_state.flow.fetch_token(code=code)
            st.session_state.credentials = st.session_state.flow.credentials
            st.session_state.is_authed = True
            st.query_params.clear()
            st.rerun()
        except Exception as e:
            st.error(f"❌ Authentication failed: {e}")

def get_gmail_service():
    if st.session_state.credentials and st.session_state.credentials.valid:
        return build("gmail", "v1", credentials=st.session_state.credentials)
    return None

def parse_email_body(message_data):
    """Extract plain text body from Gmail message payload."""
    raw = message_data.get("raw", "")
    if not raw:
        return ""
    msg = email.message_from_bytes(base64.urlsafe_b64decode(raw))
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body = part.get_payload(decode=True).decode("utf-8", errors="ignore")
                break
    else:
        body = msg.get_payload(decode=True).decode("utf-8", errors="ignore")
    return body.strip()[:300]

def extract_quote(text):
    """Regex to find dollar amounts in email text."""
    match = re.search(r'\$[\d,]+\.?\d*', text)
    return match.group(0) if match else "$0.00"

def fetch_gmail_emails(max_results=6):
    service = get_gmail_service()
    if not service:
        return []
    
    results = service.users().messages().list(userId="me", q="is:unread", maxResults=max_results).execute()
    messages = results.get("messages", [])
    parsed_emails = []
    
    for msg in messages:
        msg_data = service.users().messages().get(userId="me", id=msg["id"], format="full").execute()
        
        subject = msg_data.get("snippet", "No Subject")
        for h in msg_data.get("payload", {}).get("headers", []):
            if h["name"] == "Subject":
                subject = h["value"]
                break
                
        body = parse_email_body(msg_data)
        quote = extract_quote(f"{subject} {body}")
        
        parsed_emails.append({
            "id": msg["id"],
            "title": subject,
            "description": body,
            "quote": quote
        })
    return parsed_emails

# --- SYNC LOGIC ---
def sync_emails():
    if st.session_state.use_mock:
        # Fallback mock emails for demo/testing
        mock_emails = [
            {"id": "m1", "title": "Quote: Commercial Freezer Units - Store #402", "description": "Attached is the final quote for 12 walk-in freezer units. Installation & calibration included.", "quote": "$12,500.00"},
            {"id": "m2", "title": "Permit Approved: Electrical Upgrade - Downtown Market", "description": "Your electrical permit for the downtown location has been approved. Valid for 6 months.", "quote": "$0.00"},
            {"id": "m3", "title": "Concrete Pour Delayed: Aisle 3 Expansion", "description": "Due to heavy rain, the scheduled pour is pushed to next Tuesday. Please adjust site fencing.", "quote": "$0.00"},
            {"id": "m4", "title": "HVAC Ductwork Estimate - New Bakery Section", "description": "Estimate for commercial-grade ventilation and insulated ductwork for the new bakery wing.", "quote": "$8,200.00"},
            {"id": "m5", "title": "Tile Supplier Update: Non-slip Flooring", "description": "Quote for 2,000 sq ft of commercial non-slip epoxy flooring for produce & dairy sections.", "quote": "$4,750.00"},
            {"id": "m6", "title": "Safety Inspection Scheduled: Loading Dock", "description": "OSHA compliance inspection scheduled for Friday at 9 AM. Ensure all signage & guardrails are up.", "quote": "$0.00"}
        ]
        emails_to_sync = mock_emails
    else:
        emails_to_sync = fetch_gmail_emails()
        
    added = 0
    for em in emails_to_sync:
        if em["id"] not in st.session_state.synced_ids:
            st.session_state.tasks.append({
                "id": str(uuid.uuid4()),
                "title": em["title"],
                "description": em["description"],
                "quote": em["quote"],
                "assigned_to": "Unassigned",
                "status": "To Do"
            })
            st.session_state.synced_ids.append(em["id"])
            added += 1
            
    if added > 0:
        st.success(f"✅ Synced {added} new task(s)!")
    else:
        st.info("📭 No new emails to sync.")

def update_task_field(task_id, field, value):
    for task in st.session_state.tasks:
        if task["id"] == task_id:
            task[field] = value
            break

# --- HANDLE OAUTH CALLBACK ---
handle_oauth_callback()

# --- SIDEBAR CONTROLS ---
st.sidebar.title("🏗️ GroceryBuild Admin")
st.sidebar.subheader("Email Source")
use_mock = st.sidebar.toggle("Use Mock Emails (Demo Mode)", value=st.session_state.use_mock)
st.session_state.use_mock = use_mock

if use_mock:
    st.sidebar.info("🧪 Demo mode: Uses 6 pre-built construction emails")
else:
    if not st.session_state.is_authed:
        auth_url = get_auth_url()
        if auth_url:
            if st.sidebar.button("🔗 Connect to Gmail", type="primary", use_container_width=True):
                st.session_state.flow = init_flow()
                st.session_state.auth_url = auth_url
                st.rerun()
            if st.session_state.get("auth_url"):
                st.sidebar.markdown(f"[🔐 Click here to authorize]({st.session_state.auth_url})")
        else:
            st.sidebar.warning("⚠️ `client_secret.json` not found. Place it in the project folder.")
    else:
        st.sidebar.success("✅ Connected to Gmail")
        if st.sidebar.button("📥 Sync Unread Emails", type="primary", use_container_width=True):
            sync_emails()

st.sidebar.divider()
if st.sidebar.button("🔄 Reset Board", use_container_width=True):
    st.session_state.tasks = []
    st.session_state.synced_ids = []
    st.rerun()

# --- MAIN KANBAN UI ---
st.title("🛒 Grocery Construction Kanban")
st.caption("Track permits, vendor quotes, and site tasks")

statuses = ["To Do", "In Progress", "Done"]
assignees = ["Unassigned", "Site Foreman", "Project Manager", "Electrician", "Plumber", "Safety Officer"]

cols = st.columns(3)

for i, status in enumerate(statuses):
    with cols[i]:
        task_count = len([t for t in st.session_state.tasks if t["status"] == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()
        
        for task in st.session_state.tasks:
            if task["status"] == status:
                with st.container(border=True, gap="small"):
                    st.markdown(f"**{task['title']}**")
                    st.caption(task['description'][:90] + "..." if len(task['description']) > 90 else task['description'])
                    
                    # Quote field
                    st.markdown(f"💰 **Quote:** `{task['quote']}`")
                    
                    # Assignment & Status Controls
                    col_ctrl1, col_ctrl2 = st.columns(2)
                    with col_ctrl1:
                        new_assign = st.selectbox(
                            "Assign To", 
                            assignees, 
                            index=assignees.index(task['assigned_to']),
                            key=f"assign_{task['id']}"
                        )
                        if new_assign != task['assigned_to']:
                            update_task_field(task['id'], 'assigned_to', new_assign)
                    
                    with col_ctrl2:
                        new_status = st.selectbox(
                            "Move to", 
                            statuses, 
                            index=statuses.index(status),
                            key=f"status_{task['id']}"
                        )
                        if new_status != status:
                            update_task_field(task['id'], 'status', new_status)
                            st.rerun()

# --- FOOTER ---
st.divider()
with st.expander("📊 Sync Log & Info"):
    st.write(f"**Total Tasks:** {len(st.session_state.tasks)}")
    st.write(f"**Synced Email IDs:** {len(st.session_state.synced_ids)}")
    if st.session_state.synced_ids:
        st.code(str(st.session_state.synced_ids), language="json")
