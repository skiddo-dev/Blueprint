import streamlit as st
from dotenv import load_dotenv
from datetime import datetime
import logging
import os
import pandas as pd
import requests

load_dotenv()

from db import get_tasks, insert_task, update_task_field, delete_task, save_attachment, get_attachment
from utils import fetch_recent_emails, parse_email_with_llm, get_graph_token

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)

st.set_page_config(page_title="Blueprint - Email to Task Kanban", layout="wide")
st.title("🏗️ Blueprint - Email-to-Task Kanban")
st.caption("For Grocery Construction Companies: Turn Emails into Actionable Tasks")

KANBAN_STATUSES = ["To Do", "In Progress", "Review", "Done", "On Hold", "Cancelled"]
ASSIGNEES = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom"]
QUOTE_TYPES = ["Assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
QUOTE_PEOPLE = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]

if "refresh_key" not in st.session_state:
    st.session_state.refresh_key = 0
if "syncing" not in st.session_state:
    st.session_state.syncing = False

# ========================
# SIDEBAR
# ========================
with st.sidebar:
    st.header("⚙️ Controls")
    if st.button("🔄 Sync Emails from Exchange", type="primary", width='stretch'):
        st.session_state.syncing = True
        st.rerun()
        
    st.divider()
    
    if st.button("🗑️ Clear All Tasks", type="secondary", width='stretch'):
        if st.checkbox("⚠️ I confirm deletion of all tasks", key="confirm_clear"):
            for task in get_tasks():
                delete_task(task["_id"])
            st.toast("🗑️ All tasks cleared!", icon="🗑️")
            st.session_state.refresh_key += 1
            st.rerun()
            
    st.divider()
    st.subheader("🔗 Pages")
    st.page_link("pages/quote_generator.py", label="💰 Quote Generator", icon="💰")
    
    st.divider()
    st.subheader("📊 Board Stats")
    tasks = get_tasks()
    for status in KANBAN_STATUSES:
        count = len([t for t in tasks if t.get("status") == status])
        st.metric(status, count)

# ========================
# GRAPH SYNC (MongoDB)
# ========================
if st.session_state.syncing:
    with st.spinner("🔄 Fetching emails & attachments from Microsoft 365..."):
        try:
            new_emails = fetch_recent_emails(max_results=30)
            existing_tasks = get_tasks()
            new_count = 0
            
            token = get_graph_token() 
            headers = {"Authorization": f"Bearer {token}"}
            
            for email in new_emails:
                if any(t.get("exchange_id") == email["id"] for t in existing_tasks):
                    continue
                    
                parsed = parse_email_with_llm(email)
                task = {
                    "title": email["subject"],
                    "description": email["body"],
                    "quote": parsed["quote"],
                    "assigned_to": parsed["assigned_to"] or "Unassigned",
                    "notes": "blank",
                    "date": parsed["date"],
                    "status": "To Do",
                    "exchange_id": email["id"],
                    "from": email.get("from", "Unknown Sender"),
                    "sender_name": email.get("sender_name", ""),
                    "sender_email": email.get("sender_email", ""),
                    "attachment_ids": [],
                    "created_at": datetime.utcnow().isoformat()
                }
                task_id = insert_task(task)
                
                for att in email.get("attachments", []):
                    if att.get("skipped"):
                        continue
                    dl_url = att.get("download_url")
                    if dl_url:
                        att_resp = requests.get(dl_url, headers=headers, timeout=30)
                        if att_resp.status_code == 200:
                            att_id = save_attachment(
                                task_id=task_id,
                                filename=att["filename"],
                                content=att_resp.content,
                                size=att["size"],
                                content_type=att.get("content_type", "application/octet-stream")
                            )
                            task["attachment_ids"].append(att_id)
                            update_task_field(task_id, "attachment_ids", task["attachment_ids"])
                
                new_count += 1
                
            if new_count > 0:
                st.toast(f"✅ Synced {new_count} task(s) from Microsoft 365!", icon="🎉")
            else:
                st.toast("📭 No new emails to process.", icon="📭")
                
        except Exception as e:
            logger.error(f"Graph sync failed: {e}")
            st.error(f"❌ Sync failed: {str(e)}")
        finally:
            st.session_state.syncing = False
            st.rerun()

# ========================
# KANBAN BOARD
# ========================
tasks = get_tasks()
cols = st.columns(len(KANBAN_STATUSES))

for idx, status in enumerate(KANBAN_STATUSES):
    with cols[idx]:
        task_count = len([t for t in tasks if t.get("status") == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()
        
        column_tasks = [t for t in tasks if t.get("status") == status]
        for task in column_tasks:
            with st.container(border=True):
                st.markdown(f"**{task.get('title', 'Untitled')}**")
                
                sender_display = task.get('from') or task.get('sender_name') or task.get('sender_email') or "Unknown Sender"
                st.caption(f"📩 From: {sender_display}")
                
                # ✅ UPDATED: 4-line preview + Expandable full body
                desc = task.get('description', '')
                if desc:
                    # Show first ~4 lines as compact preview
                    preview = desc.replace('\n', ' ')[:250] + ("..." if len(desc) > 250 else "")
                    st.caption(preview)
                    
                    with st.expander("📄 View Full Email Body", expanded=False):
                        st.markdown(desc, unsafe_allow_html=True)
                else:
                    st.caption("No body content")
                
                new_status = st.selectbox(
                    "Status", KANBAN_STATUSES,
                    index=KANBAN_STATUSES.index(task.get("status", "To Do")),
                    key=f"status_{task['_id']}_{st.session_state.refresh_key}",
                    label_visibility="collapsed"
                )
                if new_status != task.get("status"):
                    update_task_field(task["_id"], "status", new_status)
                    st.session_state.refresh_key += 1
                    st.rerun()
                    
                quote_display = f"💰 {task.get('quote', 'Not Set')}"
                with st.popover(quote_display):
                    st.caption("Configure Quote Details")
                    q_col1, q_col2 = st.columns(2)
                    with q_col1:
                        curr_type = task.get('quote_type', QUOTE_TYPES[0])
                        new_type = st.selectbox(
                            "Type", QUOTE_TYPES,
                            index=QUOTE_TYPES.index(curr_type) if curr_type in QUOTE_TYPES else 0,
                            key=f"qtype_{task['_id']}_{st.session_state.refresh_key}"
                        )
                        if new_type != curr_type:
                            update_task_field(task["_id"], "quote_type", new_type)
                            st.session_state.refresh_key += 1
                            st.rerun()
                    with q_col2:
                        curr_person = task.get('quote_assignee', QUOTE_PEOPLE[0])
                        new_person = st.selectbox(
                            "Assign", QUOTE_PEOPLE,
                            index=QUOTE_PEOPLE.index(curr_person) if curr_person in QUOTE_PEOPLE else 0,
                            key=f"qperson_{task['_id']}_{st.session_state.refresh_key}"
                        )
                        if new_person != curr_person:
                            update_task_field(task["_id"], "quote_assignee", new_person)
                            st.session_state.refresh_key += 1
                            st.rerun()
                            
                if task.get("attachment_ids"):
                    st.divider()
                    st.caption("📎 Attachments:")
                    for att_id in task["attachment_ids"]:
                        att_data = get_attachment(att_id)
                        if att_data:
                            st.download_button(
                                label=f"⬇️ {att_data['filename']} ({att_data['size'] / 1024:.1f} KB)",
                                data=att_data["data"],
                                file_name=att_data["filename"],
                                width='stretch',
                                key=f"dl_{task['_id']}_{att_id}_{st.session_state.refresh_key}"
                            )
                        else:
                            st.warning(f"⚠️ {att_id} (Missing from DB)")
                                
                col1, col2 = st.columns(2)
                with col1:
                    current_date = task.get('date')
                    try:
                        date_val = datetime.strptime(current_date, "%Y-%m-%d").date() if current_date else None
                    except:
                        date_val = None
                    new_date = st.date_input(
                        "📅 Date", value=date_val,
                        key=f"date_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_date != date_val:
                        update_task_field(task["_id"], "date", str(new_date))
                        st.session_state.refresh_key += 1
                        st.rerun()
                        
                with col2:
                    current_notes = task.get('notes', '')
                    new_notes = st.text_area(
                        "📝 Notes", value=current_notes, height=60,
                        key=f"notes_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_notes != current_notes:
                        update_task_field(task["_id"], "notes", new_notes)
                        st.session_state.refresh_key += 1
                        st.rerun()
                        
                col_a, col_b = st.columns(2)
                with col_a:
                    curr_assign = task.get('assigned_to', 'Unassigned')
                    new_assign = st.selectbox(
                        "Assign To", ASSIGNEES,
                        index=ASSIGNEES.index(curr_assign) if curr_assign in ASSIGNEES else 0,
                        key=f"assign_{task['_id']}_{st.session_state.refresh_key}"
                    )
                    if new_assign != curr_assign:
                        update_task_field(task["_id"], "assigned_to", new_assign)
                        st.session_state.refresh_key += 1
                        st.rerun()

# ========================
# ADMIN
# ========================
with st.expander("🛠️ Admin - Raw Task Data"):
    if tasks:
        df = pd.DataFrame(tasks)
        cols_order = ["_id", "title", "sender_name", "sender_email", "date", "assigned_to", "quote", "quote_type", 
                      "quote_assignee", "notes", "status", "exchange_id", "attachment_ids", "created_at"]
        available_cols = [c for c in cols_order if c in df.columns]
        df = df[available_cols] if available_cols else df
        st.dataframe(df, width='stretch', hide_index=True)
    else:
        st.write("No tasks in database.")