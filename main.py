import streamlit as st
from dotenv import load_dotenv
from datetime import datetime
import logging
import os
import pandas as pd
import requests

load_dotenv()

from db import (
    get_tasks, get_tasks_for_user, get_tasks_signature, insert_task,
    update_task_field, delete_task, save_attachment, get_attachment,
    list_users, list_users_by_role, upsert_user, delete_user,
)
from utils import fetch_recent_emails, parse_email_with_llm, get_graph_token
from auth import current_user, SUPERVISORS

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)

st.set_page_config(page_title="Blueprint - Email to Task Kanban", layout="wide")

# Auth + role gate. Returns {email, role, name}. Stops with sign-in screen if not logged in/provisioned.
user = current_user()
role = user["role"]
user_name = user["name"]

st.title("🏗️ Blueprint - Email-to-Task Kanban")
st.caption("For Grocery Construction Companies: Turn Emails into Actionable Tasks")

KANBAN_STATUSES = ["To Do", "In Progress", "Review", "Done", "On Hold", "Cancelled"]
QUOTE_TYPES = ["Assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
QUOTE_PEOPLE = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]

# Build PM names from DB so the admin's assignee list stays in sync with provisioned users.
_pm_users_db = list_users_by_role("pm") + list_users_by_role("viewer")
PM_NAMES = [u["name"] for u in _pm_users_db if u.get("name")]

# Assignee options are role-scoped:
#   admin → can assign to PMs and supervisors
#   pm    → can only delegate to supervisors
if role == "admin":
    ASSIGNEES = ["Unassigned"] + PM_NAMES + SUPERVISORS
else:
    ASSIGNEES = ["Unassigned"] + SUPERVISORS

# Session state
for _k, _v in [("refresh_key", 0), ("syncing", False), ("board_sig", None), ("view_as_user", None)]:
    if _k not in st.session_state:
        st.session_state[_k] = _v
if st.session_state.board_sig is None:
    st.session_state.board_sig = get_tasks_signature()

# Live cross-session updates: polls a cheap DB signature every 2s and triggers a
# full rerun ONLY when a task was added/edited/deleted in any session.
@st.fragment(run_every="2s")
def live_board_watch():
    if st.session_state.get("syncing"):
        return
    sig = get_tasks_signature()
    if sig != st.session_state.board_sig:
        st.session_state.board_sig = sig
        st.rerun()

live_board_watch()


# ========================
# NEW TASK DIALOG
# ========================
@st.dialog("Create New Task")
def show_new_task_dialog():
    title = st.text_input("Title *")
    assigned_to = st.selectbox("Assign to", ASSIGNEES)
    task_status = st.selectbox("Status", KANBAN_STATUSES)
    date_val = st.date_input("Date", value=None)
    notes = st.text_area("Notes", height=80)

    if st.button("Create Task", type="primary"):
        if not title.strip():
            st.error("Title is required.")
        else:
            insert_task({
                "title": title.strip(),
                "description": "",
                "quote": None,
                "assigned_to": assigned_to,
                "notes": notes,
                "date": str(date_val) if date_val else None,
                "status": task_status,
                "exchange_id": None,
                "created_by": user_name,
                "attachment_ids": [],
                "created_at": datetime.utcnow().isoformat(),
            })
            st.toast("✅ Task created!")
            st.session_state.refresh_key += 1
            st.rerun()


# ========================
# SIDEBAR
# ========================
with st.sidebar:
    st.caption(f"👤 {user_name} · {role}")
    st.button("Log out", on_click=st.logout, width='stretch')
    st.divider()

    if role == "admin":
        st.header("⚙️ Controls")
        if st.button("🔄 Sync Flagged Emails from Exchange", type="primary", width='stretch'):
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
        st.page_link("pages/dashboard.py", label="📊 Dashboard", icon="📊")

        st.divider()

        with st.expander("👥 User Access"):
            st.caption(
                "Provision PM users below. Display Name must match the name you'll use "
                "in the 'Assign to' dropdown. Supervisors (Kris, Vlad, Bogdan, Frank Crew) "
                "need no login — they're assignment targets only."
            )
            for u in list_users():
                uc1, uc2, uc3, uc4 = st.columns([3, 2, 2, 1])
                uc1.caption(u["_id"])
                uc2.write(u.get("name", ""))
                uc3.write(u.get("role", "pm"))
                if uc4.button("🗑️", key=f"deluser_{u['_id']}"):
                    delete_user(u["_id"])
                    st.rerun()
            st.divider()
            new_email = st.text_input("Email", key="new_user_email", placeholder="person@ravesinc.com")
            new_name = st.text_input("Display Name", key="new_user_name", placeholder="Andrew")
            new_role_sel = st.selectbox("Role", ["pm", "admin"], key="new_user_role")
            if st.button("➕ Add / Update user", width='stretch'):
                if new_email.strip():
                    upsert_user(new_email.strip(), new_role_sel, new_name.strip())
                    st.toast(f"Saved {new_email.strip()} ({new_name.strip()}) as {new_role_sel}")
                    st.rerun()
                else:
                    st.warning("Enter an email address.")

        st.divider()

        with st.expander("👁️ View User Activity"):
            st.caption("See the board exactly as a PM user sees it.")
            _view_opts = ["All tasks (Ben's view)"] + [u["name"] for u in _pm_users_db if u.get("name")]
            _view_choice = st.selectbox("View board as:", _view_opts, key="view_as_selector")
            st.session_state.view_as_user = None if _view_choice == "All tasks (Ben's view)" else _view_choice

        st.divider()

    # New Task button — available to both admin and PM
    if st.button("➕ New Task", type="primary", width='stretch'):
        show_new_task_dialog()

    st.divider()
    st.subheader("📊 Board Stats")

    # Stats are scoped to the same view as the board
    _view_as = st.session_state.get("view_as_user")
    if role == "admin" and not _view_as:
        _stats_tasks = get_tasks()
    else:
        _stats_name = _view_as if (role == "admin" and _view_as) else user_name
        _stats_tasks = get_tasks_for_user(_stats_name)

    for status in KANBAN_STATUSES:
        count = len([t for t in _stats_tasks if t.get("status") == status])
        st.metric(status, count)


# ========================
# GRAPH SYNC (MongoDB)
# ========================
if st.session_state.syncing and role == "admin":
    with st.spinner("🔄 Fetching flagged emails & attachments from Microsoft 365..."):
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
                    "description": parsed.get("summary") or "",
                    "full_body": email["body"],
                    "quote": parsed["quote"],
                    "assigned_to": parsed["assigned_to"] or "Unassigned",
                    "notes": "",
                    "date": parsed["date"],
                    "status": "To Do",
                    "exchange_id": email["id"],
                    "from": email.get("from", "Unknown Sender"),
                    "sender_name": email.get("sender_name", ""),
                    "sender_email": email.get("sender_email", ""),
                    "created_by": user_name,  # always Ben — only admin can sync
                    "attachment_ids": [],
                    "created_at": datetime.utcnow().isoformat(),
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
                                task_id, att["filename"], att_resp.content,
                                att["size"], att.get("content_type", "application/octet-stream")
                            )
                            task["attachment_ids"].append(att_id)
                            update_task_field(task_id, "attachment_ids", task["attachment_ids"])

                new_count += 1

            if new_count > 0:
                st.toast(f"✅ Synced {new_count} flagged email(s) from Microsoft 365!", icon="🎉")
            else:
                st.toast("📭 No new flagged emails to process.", icon="📭")

        except Exception as e:
            logger.error(f"Graph sync failed: {e}")
            st.error(f"❌ Sync failed: {str(e)}")
        finally:
            st.session_state.syncing = False
            st.rerun()


# ========================
# VIEW-AS BANNER
# ========================
view_as = st.session_state.get("view_as_user")
if role == "admin" and view_as:
    st.info(f"👁️ Viewing board as **{view_as}** — showing only their tasks.", icon="👁️")


# ========================
# KANBAN BOARD
# ========================
if role == "admin" and not view_as:
    tasks = get_tasks()
else:
    _filter_name = view_as if (role == "admin" and view_as) else user_name
    tasks = get_tasks_for_user(_filter_name)

cols = st.columns(len(KANBAN_STATUSES))

for idx, status in enumerate(KANBAN_STATUSES):
    with cols[idx]:
        task_count = len([t for t in tasks if t.get("status") == status])
        st.subheader(f"{status} ({task_count})")
        st.divider()

        for task in [t for t in tasks if t.get("status") == status]:
            with st.container(border=True):
                st.markdown(f"**{task.get('title', 'Untitled')}**")

                if task.get("exchange_id"):
                    sender_display = (
                        task.get("from") or task.get("sender_name")
                        or task.get("sender_email") or "Unknown Sender"
                    )
                    st.caption(f"📩 From: {sender_display}")
                elif task.get("created_by"):
                    st.caption(f"✏️ Created by: {task['created_by']}")

                desc = task.get("description", "")
                if desc:
                    preview = desc.replace("\n", " ")[:250] + ("..." if len(desc) > 250 else "")
                    st.caption(preview)
                    with st.expander("📄 View Full Email Body", expanded=False):
                        st.markdown(task.get("full_body", ""), unsafe_allow_html=True)
                else:
                    st.caption("No body content")

                st.divider()

                # Status & assignee
                sc, ac = st.columns(2)
                with sc:
                    new_status = st.selectbox(
                        "Status", KANBAN_STATUSES,
                        index=KANBAN_STATUSES.index(task.get("status", "To Do")),
                        key=f"status_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                    )
                    if new_status != task.get("status"):
                        update_task_field(task["_id"], "status", new_status)
                        st.session_state.refresh_key += 1
                        st.rerun()
                with ac:
                    curr_assign = task.get("assigned_to", "Unassigned")
                    assign_idx = ASSIGNEES.index(curr_assign) if curr_assign in ASSIGNEES else 0
                    new_assign = st.selectbox(
                        "Assigned to", ASSIGNEES, index=assign_idx,
                        key=f"assign_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                    )
                    if new_assign != curr_assign:
                        update_task_field(task["_id"], "assigned_to", new_assign)
                        st.session_state.refresh_key += 1
                        st.rerun()

                # Date & quote
                dc, qc = st.columns(2)
                with dc:
                    st.caption("📅 Date")
                    current_date = task.get("date")
                    try:
                        date_val = datetime.strptime(current_date, "%Y-%m-%d").date() if current_date else None
                    except Exception:
                        date_val = None
                    new_date = st.date_input(
                        "Date", value=date_val, label_visibility="collapsed",
                        key=f"date_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                    )
                    if new_date != date_val:
                        update_task_field(task["_id"], "date", str(new_date))
                        st.session_state.refresh_key += 1
                        st.rerun()
                with qc:
                    st.caption("💰 Quote")
                    with st.popover(task.get("quote") or "Not set", width='stretch'):
                        qt, qa = st.columns(2)
                        with qt:
                            curr_type = task.get("quote_type", QUOTE_TYPES[0])
                            new_type = st.selectbox(
                                "Type", QUOTE_TYPES,
                                index=QUOTE_TYPES.index(curr_type) if curr_type in QUOTE_TYPES else 0,
                                key=f"qtype_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                            )
                            if new_type != curr_type:
                                update_task_field(task["_id"], "quote_type", new_type)
                                st.session_state.refresh_key += 1
                                st.rerun()
                        with qa:
                            curr_person = task.get("quote_assignee", QUOTE_PEOPLE[0])
                            new_person = st.selectbox(
                                "Assign", QUOTE_PEOPLE,
                                index=QUOTE_PEOPLE.index(curr_person) if curr_person in QUOTE_PEOPLE else 0,
                                key=f"qperson_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                            )
                            if new_person != curr_person:
                                update_task_field(task["_id"], "quote_assignee", new_person)
                                st.session_state.refresh_key += 1
                                st.rerun()

                # Notes
                current_notes = task.get("notes", "")
                new_notes = st.text_area(
                    "📝 Notes", value=current_notes, height=68,
                    key=f"notes_{task['_id']}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                )
                if new_notes != current_notes:
                    update_task_field(task["_id"], "notes", new_notes)
                    st.session_state.refresh_key += 1
                    st.rerun()

                # Attachments
                if task.get("attachment_ids"):
                    st.divider()
                    st.caption("📎 Attachments")
                    for att_id in task["attachment_ids"]:
                        att_data = get_attachment(att_id)
                        if att_data:
                            st.download_button(
                                label=f"⬇️ {att_data['filename']} ({att_data['size'] / 1024:.1f} KB)",
                                data=att_data["data"], file_name=att_data["filename"], width='stretch',
                                key=f"dl_{task['_id']}_{att_id}_{task.get('updated_at', '')}_{st.session_state.refresh_key}",
                            )
                        else:
                            st.warning(f"⚠️ {att_id} (Missing from DB)")


# ========================
# ADMIN — raw data view (all tasks, regardless of view-as filter)
# ========================
if role == "admin":
    with st.expander("🛠️ Admin - Raw Task Data"):
        all_tasks = get_tasks()
        if all_tasks:
            df = pd.DataFrame(all_tasks)
            cols_order = [
                "_id", "title", "created_by", "description", "full_body",
                "sender_name", "sender_email", "date", "assigned_to", "quote",
                "quote_type", "quote_assignee", "notes", "status",
                "exchange_id", "attachment_ids", "created_at",
            ]
            available_cols = [c for c in cols_order if c in df.columns]
            st.dataframe(df[available_cols] if available_cols else df, width='stretch', hide_index=True)
        else:
            st.write("No tasks in database.")
