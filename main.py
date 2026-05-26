# Blueprint/main.py
import streamlit as st
from dotenv import load_dotenv
load_dotenv()                  
import streamlit as st
from streamlit_sortables import sort_items
from datetime import datetime
import logging
from typing import List, Dict
import os

# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

if USE_MOCK:
    # Mock database functions (using Streamlit session state)
    def get_tasks():
        if 'mock_tasks' not in st.session_state:
            st.session_state.mock_tasks = [
                {
                    "_id": "mock1",
                    "title": "Mock Task 1: Quote for Freezer Units",
                    "description": "Attached is the final quote for 12 walk-in freezer units. Installation & calibration included.",
                    "quote": "$12,500.00",
                    "assigned_to": "Andrew",
                    "notes": "Follow up with vendor on delivery date.",
                    "date": "2025-06-01",
                    "status": "To Do",
                    "exchange_id": "mock_exchange_id_1",
                    "created_at": "2024-05-26T10:00:00Z"
                },
                {
                    "_id": "mock2",
                    "title": "Mock Task 2: Permit Approved",
                    "description": "Your electrical permit for the downtown location has been approved. Valid for 6 months from issuance.",
                    "quote": "$0.00",
                    "assigned_to": "Unassigned",
                    "notes": "Schedule work within permit validity period.",
                    "date": "2025-05-30",
                    "status": "In Progress",
                    "exchange_id": "mock_exchange_id_2",
                    "created_at": "2024-05-26T10:05:00Z"
                },
                {
                    "_id": "mock3",
                    "title": "Mock Task 3: Concrete Pour Delayed",
                    "description": "Due to heavy rain, the scheduled pour for Aisle 3 is pushed to next Tuesday. Please adjust site fencing.",
                    "quote": "$0.00",
                    "assigned_to": "Mike",
                    "notes": "Notify site crew and update safety barriers.",
                    "date": "2025-06-04",
                    "status": "To Do",
                    "exchange_id": "mock_exchange_id_3",
                    "created_at": "2024-05-26T10:10:00Z"
                }
            ]
        return st.session_state.mock_tasks

    def insert_task(task):
        if "_id" not in task:
            task["_id"] = f"mock_{len(st.session_state.mock_tasks) + 1}_{int(datetime.utcnow().timestamp())}"
        st.session_state.mock_tasks.append(task)
        return task["_id"]

    def update_task_field(task_id, field, value):
        for task in st.session_state.mock_tasks:
            if task["_id"] == task_id:
                task[field] = value
                return True
        return False

    def delete_task(task_id):
        initial_len = len(st.session_state.mock_tasks)
        st.session_state.mock_tasks = [t for t in st.session_state.mock_tasks if t["_id"] != task_id]
        return len(st.session_state.mock_tasks) < initial_len

else:
    # Real mode: Import actual implementations
    from db import get_tasks, insert_task, update_task_field, delete_task
    from utils import fetch_recent_emails, parse_email_with_llm

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Page config
st.set_page_config(page_title="Blueprint - Email to Task Kanban", layout="wide")
st.title("🏗️ Blueprint - Email-to-Task Kanban")
st.caption("For Grocery Construction Companies: Turn Emails into Actionable Tasks")

# Initialize session state for UI controls
if "refresh_key" not in st.session_state:
    st.session_state.refresh_key = 0

# Sidebar controls
with st.sidebar:
    st.header("⚙️ Controls")
    
    if st.button("🔄 Sync Emails from Exchange", type="primary", use_container_width=True):
        if USE_MOCK:
            # MOCK MODE: Generate a new mock task
            with st.spinner("Generating mock task..."):
                new_task = {
                    "title": f"Mock Task {len(get_tasks()) + 1}: Generated at {datetime.utcnow().strftime('%H:%M:%S')}",
                    "description": "This is a mock task generated for testing the UI.",
                    "quote": "$1,000.00",
                    "assigned_to": "Unassigned",
                    "notes": "Click to edit date/notes/quote via the card controls.",
                    "date": datetime.utcnow().strftime("%Y-%m-%d"),  # Today's date
                    "status": "To Do",
                    "exchange_id": f"mock_exchange_{int(datetime.utcnow().timestamp())}",
                    "created_at": datetime.utcnow().isoformat()
                }
                insert_task(new_task)
                st.success("✅ Generated a new mock task!")
                st.session_state.refresh_key += 1
                st.rerun()
        else:
            # REAL MODE: Fetch from Exchange
            with st.spinner("Fetching and processing emails from Exchange..."):
                new_emails = fetch_recent_emails(max_results=30)
                new_count = 0
                
                for email in new_emails:
                    existing = False
                    for task in get_tasks():
                        if task.get("exchange_id") == email["id"]:
                            existing = True
                            break
                    
                    if not existing:
                        parsed = parse_email_with_llm(email)
                        
                        task = {
                            "title": email["subject"],
                            "description": email["body"],
                            "quote": parsed["quote"],
                            "assigned_to": parsed["assigned_to"] or "Unassigned",
                            "notes": parsed["notes"],
                            "date": parsed["date"],
                            "status": "To Do",
                            "exchange_id": email["id"],
                            "created_at": datetime.utcnow().isoformat()
                        }
                        insert_task(task)
                        new_count += 1
                
                if new_count > 0:
                    st.success(f"✅ Synced {new_count} new task(s) from Exchange!")
                    st.session_state.refresh_key += 1
                    st.rerun()
                else:
                    st.info("📭 No new emails to process in Exchange.")
    
    st.divider()
    
    if st.button("🗑️ Clear All Tasks (DANGER)", use_container_width=True):
        if st.checkbox("I confirm deletion of all tasks"):
            if USE_MOCK:
                st.session_state.mock_tasks = []
            else:
                for task in get_tasks():
                    delete_task(task["_id"])
            st.warning("All tasks cleared!")
            st.session_state.refresh_key += 1
            st.rerun()
    
    st.divider()
    st.subheader("📊 Stats")
    tasks = get_tasks()
    st.metric("Total Tasks", len(tasks))
    st.metric("To Do", len([t for t in tasks if t["status"] == "To Do"]))
    st.metric("In Progress", len([t for t in tasks if t["status"] == "In Progress"]))
    st.metric("Done", len([t for t in tasks if t["status"] == "Done"]))

# Main Kanban Board
statuses = ["To Do", "In Progress", "Done"]
assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie"]
quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request"]
quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley"]

# Fetch fresh tasks from MongoDB (or mock)
tasks = get_tasks()

# Create three columns for Kanban
cols = st.columns(3)

# Process each column
for idx, status in enumerate(statuses):
    with cols[idx]:
        # Column header with task count
        task_count = len([t for t in tasks if t["status"] == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()
        
        # Get tasks for this column
        column_tasks = [t for t in tasks if t["status"] == status]
        task_ids = [t["_id"] for t in column_tasks]
        
        # Render sortable list for drag-and-drop
        if task_ids:
            new_ids = sort_items(task_ids, key=f"col_{status}_{st.session_state.refresh_key}")
            
            # Detect changes and update task statuses
            if set(new_ids) != set(task_ids):
                for task_id in new_ids:
                    update_task_field(task_id, "status", status)
                st.session_state.refresh_key += 1
                st.rerun()
        else:
            st.info(f"No tasks in {status}")

        # Render individual task cards
        for task in column_tasks:
            with st.container(border=True):
                # Task title and description
                st.markdown(f"**{task['title']}**")
                desc = task['description'][:90] + "..." if len(task['description']) > 90 else task['description']
                st.caption(desc)
                
                # Date and Notes fields
                col1, col2 = st.columns(2)
                with col1:
                    # Date input
                    current_date = task.get('date')
                    try:
                        date_val = datetime.strptime(current_date, "%Y-%m-%d").date() if current_date else None
                    except:
                        date_val = None
                    
                    new_date = st.date_input(
                        "📅 Date", 
                        value=date_val,
                        key=f"date_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_date != date_val:
                        update_task_field(task["_id"], "date", str(new_date))
                
                with col2:
                    # Notes area
                    current_notes = task.get('notes', '')
                    new_notes = st.text_area(
                        "📝 Notes", 
                        value=current_notes,
                        height=60,
                        key=f"notes_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_notes != current_notes:
                        update_task_field(task["_id"], "notes", new_notes)
                
                # Quote popover (requires Streamlit >= 1.30.0)
                quote_display = f"💰 Quote: {task.get('quote_type', 'Not Set')}"
                with st.popover(quote_display):
                    st.caption("Configure Quote Details")
                    q_col1, q_col2 = st.columns(2)
                    with q_col1:
                        curr_type = task.get('quote_type', quote_types[0])
                        new_type = st.selectbox(
                            "Quote Type", 
                            quote_types,
                            index=quote_types.index(curr_type) if curr_type in quote_types else 0,
                            key=f"qtype_{task['_id']}_{st.session_state.refresh_key}"
                        )
                        if new_type != curr_type:
                            update_task_field(task["_id"], "quote_type", new_type)
                    
                    with q_col2:
                        curr_person = task.get('quote_assignee', quote_people[0])
                        new_person = st.selectbox(
                            "Assign To", 
                            quote_people,
                            index=quote_people.index(curr_person) if curr_person in quote_people else 0,
                            key=f"qperson_{task['_id']}_{st.session_state.refresh_key}"
                        )
                        if new_person != curr_person:
                            update_task_field(task["_id"], "quote_assignee", new_person)
                
                # Task assignment (status handled via drag-drop)
                col_a, col_b = st.columns(2)
                with col_a:
                    curr_assign = task.get('assigned_to', 'Unassigned')
                    new_assign = st.selectbox(
                        "Assign To", 
                        assignees,
                        index=assignees.index(curr_assign) if curr_assign in assignees else 0,
                        key=f"assign_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_assign != curr_assign:
                        update_task_field(task["_id"], "assigned_to", new_assign)

# Admin: View raw task data
with st.expander("🛠️ Admin - Raw Task Data"):
    if tasks:
        import pandas as pd
        df = pd.DataFrame(tasks)
        cols_order = ["_id", "title", "date", "assigned_to", "quote", "quote_type", 
                     "quote_assignee", "notes", "status", "exchange_id", "created_at"]
        df = df[cols_order] if all(c in df.columns for c in cols_order) else df
        st.dataframe(df, use_container_width=True, hide_index=True)
    else:
        st.write("No tasks in database.")

# Auto-refresh on sync
if st.session_state.get("refresh_key", 0) > 0:
    st.rerun()
