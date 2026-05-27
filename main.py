# Blueprint/main.py
import streamlit as st
from dotenv import load_dotenv
load_dotenv()                  
import streamlit as st
from datetime import datetime, timedelta
import logging
from typing import List, Dict
import os
import random


# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"


# ======================
# KANBAN BOARD CONFIGURATION
# ======================
# ADD YOUR NEW STATUSES HERE - Modify this list to add/remove columns
KANBAN_STATUSES = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]


if USE_MOCK:
    # Mock database functions (using Streamlit session state)
    def get_tasks():
        if 'mock_tasks' not in st.session_state:
            # Enhanced mock data with variety for all statuses
            task_titles = [
                "Quote for Freezer Units", 
                "Permit Approved", 
                "Concrete Pour Delayed", 
                "Site Inspection Required", 
                "Equipment Delivery Scheduled",
                "Safety Review Completed",
                "Budget Approval Pending",
                "Vendor Meeting Scheduled",
                "Quality Check Performed",
                "Timeline Update Needed",
                "Material Shortage Alert",
                "Weather Delay Notice",
                "Change Order Request",
                "Invoice Dispute Resolution",
                "Staff Training Required",
                "Utility Coordination",
                "Foundation Pour Scheduled",
                "Electrical Rough-In Complete",
                "Plumbing Inspection Passed",
                "HVAC Installation"
            ]
            task_descriptions = [
                "Attached is the final quote for 12 walk-in freezer units. Installation & calibration included.",
                "Your electrical permit for the downtown location has been approved. Valid for 6 months from issuance.",
                "Due to heavy rain, the scheduled pour for Aisle 3 is pushed to next Tuesday. Please adjust site fencing.",
                "Requires immediate attention from site supervisor",
                "Pending approval from project manager",
                "Awaiting client feedback before proceeding",
                "Scheduled for next week's work window",
                "On hold due to material availability",
                "Completed ahead of schedule",
                "Requires rework due to quality issues",
                "Critical materials delayed - impact assessment needed",
                "Severe weather forecasted for next 3 days",
                "Client requesting additional features mid-project",
                "Vendor billing discrepancy requiring resolution",
                "OSHA compliance training needed for new equipment",
                "Coordinate with water/gas/electric companies",
                "Concrete foundation pour for Phase 2",
                "Rough-in electrical inspection passed",
                "All plumbing rough-in approved by inspector",
                "HVAC units installation in progress"
            ]
            notes_templates = [
                "Follow up with vendor on delivery date",
                "Schedule work within permit validity period",
                "Notify site crew and update safety barriers",
                "Review budget allocation for next phase",
                "Coordinate with utility company for shutdown",
                "Prepare safety briefing for tomorrow's work",
                "Update client on progress via email",
                "Check material specifications against approved samples",
                "Verify measurements before cutting",
                "Ensure proper disposal of waste materials",
                "Confirm insurance certificates are current",
                "Validate measurements with architect drawings",
                "Schedule follow-up inspection in 48 hours",
                "Review subcontractor qualifications",
                "Check for potential utility conflicts",
                "Verify ADA compliance requirements",
                "Confirm fire rating specifications",
                "Check for moisture barrier installation",
                "Verify proper flashing details",
                "Ensure adequate ventilation during installation"
            ]
            quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
            quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]
            assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom"]
            # Generate 25 varied tasks
            tasks = []
            for i in range(25):
                title = random.choice(task_titles)
                description = random.choice(task_descriptions)
                quote_type = random.choice(quote_types)
                quote_person = random.choice(quote_people)
                assignee = random.choice(assignees)
                status = random.choice(KANBAN_STATUSES)  # Use our Kanban statuses
                notes = random.choice(notes_templates)
                # Generate quote amount based on type
                if quote_type == "assign Quote":
                    quote_amount = f"${random.randint(5000, 50000):,}.00"
                elif quote_type == "T&M":
                    quote_amount = f"${random.randint(2000, 20000):,}.00"
                elif quote_type == "Service Call":
                    quote_amount = f"${random.randint(500, 5000):,}.00"
                elif quote_type == "Maintenance Request":
                    quote_amount = f"${random.randint(1000, 10000):,}.00"
                else:  # Emergency Repair
                    quote_amount = f"${random.randint(3000, 30000):,}.00"
                # Random date within next 3 months or past month
                days_offset = random.randint(-30, 90)
                task_date = (datetime.now() + timedelta(days=days_offset)).strftime("%Y-%m-%d")
                task = {
                    "_id": f"mock_{i:02d}",
                    "title": title,
                    "description": description,
                    "quote": quote_amount,
                    "quote_type": quote_type,
                    "quote_assignee": quote_person,
                    "assigned_to": assignee,
                    "notes": notes,
                    "date": task_date,
                    "status": status,
                    "exchange_id": f"mock_exchange_{i:03d}",
                    "created_at": (datetime.now() - timedelta(days=random.randint(0, 15))).isoformat()
                }
                tasks.append(task)
            st.session_state.mock_tasks = tasks
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
        # Show stats for ALL Kanban statuses
        for status in KANBAN_STATUSES:
            count = len([t for t in tasks if t["status"] == status])
            st.metric(status, count)


# Main Kanban Board
# Use our configured statuses list
statuses = KANBAN_STATUSES
assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom"]
quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]


# Fetch fresh tasks from MongoDB (or mock)
tasks = get_tasks()


# Create columns for Kanban - ONE COLUMN PER STATUS
cols = st.columns(len(statuses))


# Process each column
for idx, status in enumerate(statuses):
    with cols[idx]:
        # Column header with task count
        task_count = len([t for t in tasks if t["status"] == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()
        # Get tasks for this column
        column_tasks = [t for t in tasks if t["status"] == status]
        # Render individual task cards
        for task in column_tasks:
            with st.container(border=True):
                # Task title and description
                st.markdown(f"**{task['title']}**")
                desc = task['description'][:90] + "..." if len(task['description']) > 90 else task['description']
                st.caption(desc)
                
                # QUOTE AMOUNT DISPLAY (NEW: Shows the actual quote value)
                quote_display = f"💰 Quote: {task.get('quote', 'Not Set')}"
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
                
                # Task assignment (status handled via dropdown above)
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
