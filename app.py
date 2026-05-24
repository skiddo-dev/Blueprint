import streamlit as st
import uuid

# --- PAGE CONFIG ---
st.set_page_config(page_title="GroceryBuild Kanban", layout="wide")

# --- SESSION STATE INITIALIZATION ---
if "tasks" not in st.session_state:
    st.session_state.tasks = []

if "emails" not in st.session_state:
    # 6 Mock emails themed for grocery construction
    st.session_state.emails = [
        {"id": "e1", "sender": "vendor@cooltech.com", "subject": "Quote: Commercial Freezer Units - Store #402", "body": "Attached is the final quote for 12 walk-in freezer units. Installation & calibration included.", "quote": "$12,500.00"},
        {"id": "e2", "sender": "permits@cityhall.gov", "subject": "Permit Approved: Electrical Upgrade - Downtown Market", "body": "Your electrical permit for the downtown location has been approved. Valid for 6 months from issuance.", "quote": "$0.00"},
        {"id": "e3", "sender": "alerts@concreteco.com", "subject": "Concrete Pour Delayed: Aisle 3 Expansion", "body": "Due to heavy rain, the scheduled pour for Aisle 3 is pushed to next Tuesday. Please adjust site fencing.", "quote": "$0.00"},
        {"id": "e4", "sender": "quotes@hvacexperts.com", "subject": "HVAC Ductwork Estimate - New Bakery Section", "body": "Estimate for commercial-grade ventilation and insulated ductwork for the new bakery wing.", "quote": "$8,200.00"},
        {"id": "e5", "sender": "sales@tilepro.com", "subject": "Tile Supplier Update: Non-slip Flooring", "body": "Quote for 2,000 sq ft of commercial non-slip epoxy flooring for the produce & dairy sections.", "quote": "$4,750.00"},
        {"id": "e6", "sender": "scheduler@safetyfirst.com", "subject": "Safety Inspection Scheduled: Loading Dock", "body": "OSHA compliance inspection scheduled for Friday at 9 AM. Please ensure all signage & guardrails are up.", "quote": "$0.00"}
    ]

if "synced_ids" not in st.session_state:
    st.session_state.synced_ids = []

# --- HELPER FUNCTIONS ---
def sync_emails():
    """Simulates IMAP sync: converts unread emails into Kanban tasks."""
    new_count = 0
    for email in st.session_state.emails:
        if email["id"] not in st.session_state.synced_ids:
            st.session_state.tasks.append({
                "id": str(uuid.uuid4()),
                "title": email["subject"],
                "description": email["body"],
                "quote": email["quote"],
                "assigned_to": "Unassigned",
                "status": "To Do"
            })
            st.session_state.synced_ids.append(email["id"])
            new_count += 1
    if new_count > 0:
        st.success(f"✅ Synced {new_count} new task(s) from email inbox!")
    else:
        st.info("📭 No new emails to sync.")

def update_task_field(task_id, field, value):
    """Updates a specific field in the task list."""
    for task in st.session_state.tasks:
        if task["id"] == task_id:
            task[field] = value
            break

# --- SIDEBAR CONTROLS ---
st.sidebar.title("🏗️ GroceryBuild Admin")
st.sidebar.subheader("Email Integration")
if st.sidebar.button("📥 Sync Incoming Emails", type="primary", use_container_width=True):
    sync_emails()

st.sidebar.divider()
st.sidebar.subheader("Demo Controls")
if st.sidebar.button("🔄 Reset Board", use_container_width=True):
    st.session_state.tasks = []
    st.session_state.synced_ids = []
    st.rerun()

# --- MAIN KANBAN UI ---
st.title("🛒 Grocery Construction Kanban")
st.caption("Track permits, vendor quotes, and site tasks")

statuses = ["To Do", "In Progress", "Done"]
assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady","Frank Crew","Bob","Dean","Vickie"]

cols = st.columns(3)

for i, status in enumerate(statuses):
    with cols[i]:
        # Column header with count
        task_count = len([t for t in st.session_state.tasks if t["status"] == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()
        
        # Render tasks for this column
        for task in st.session_state.tasks:
            if task["status"] == status:
                with st.container(border=True, gap="small"):
                    st.markdown(f"**{task['title']}**")
                    st.caption(task['description'][:90] + "..." if len(task['description']) > 90 else task['description'])
                    
                    # Quote field prominently displayed
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
