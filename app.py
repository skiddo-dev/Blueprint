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
                    
                    # --- NEW: Date & Notes Fields ---
                    col_date, col_notes = st.columns(2)
                    with col_date:
                        # Handle potential string-to-date conversion if stored as string
                        current_date = task.get('date', None)
                        if isinstance(current_date, str):
                            from datetime import datetime
                            current_date = datetime.strptime(current_date, "%Y-%m-%d").date()
                        
                        new_date = st.date_input("📅 Date", value=current_date, key=f"date_{task['id']}")
                        if new_date != current_date:
                            # Save as ISO string for consistent backend storage
                            update_task_field(task['id'], 'date', str(new_date))
                            
                    with col_notes:
                        current_notes = task.get('notes', '')
                        new_notes = st.text_area("📝 Notes", value=current_notes, key=f"notes_{task['id']}", height=60)
                        if new_notes != current_notes:
                            update_task_field(task['id'], 'notes', new_notes)
                    
                    # --- NEW: Quote Field with Clickable Submenu ---
                    # Uses st.popover (requires Streamlit >= 1.30.0)
                    quote_display = f"💰 Quote: {task.get('quote_type', 'Not Set')}"
                    with st.popover(quote_display):
                        st.caption("Configure Quote Type & Assignee")
                        c_q1, c_q2 = st.columns(2)
                        
                        with c_q1:
                            quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request"]
                            curr_type = task.get('quote_type', quote_types[0])
                            new_type = st.selectbox("Quote Type", quote_types,
                                                    index=quote_types.index(curr_type) if curr_type in quote_types else 0,
                                                    key=f"qtype_{task['id']}")
                            if new_type != curr_type:
                                update_task_field(task['id'], 'quote_type', new_type)
                                
                        with c_q2:
                            quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley"]
                            curr_person = task.get('quote_assignee', quote_people[0])
                            new_person = st.selectbox("Assign To", quote_people,
                                                      index=quote_people.index(curr_person) if curr_person in quote_people else 0,
                                                      key=f"qperson_{task['id']}")
                            if new_person != curr_person:
                                update_task_field(task['id'], 'quote_assignee', new_person)
                    
                    # Assignment & Status Controls (unchanged)
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
