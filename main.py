import re
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

st.set_page_config(
    page_title="Blueprint",
    page_icon="🏗️",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ========================
# DESIGN SYSTEM
# ========================
STATUS_META = {
    "To Do":       {"color": "#6366f1", "bg": "#eef2ff", "text": "#4338ca", "icon": "○"},
    "In Progress": {"color": "#f59e0b", "bg": "#fffbeb", "text": "#b45309", "icon": "◑"},
    "Review":      {"color": "#3b82f6", "bg": "#dbeafe", "text": "#1d4ed8", "icon": "◎"},
    "Done":        {"color": "#10b981", "bg": "#d1fae5", "text": "#047857", "icon": "●"},
    "On Hold":     {"color": "#94a3b8", "bg": "#f1f5f9", "text": "#475569", "icon": "⊘"},
    "Cancelled":   {"color": "#f87171", "bg": "#fee2e2", "text": "#dc2626", "icon": "✕"},
}

def inject_css():
    st.markdown("""
    <style>
    /* System font stack — no external request, no layout shift on load */
    html, body, [class*="css"], .stApp {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue',
                     Arial, system-ui, sans-serif;
    }
    /* Hide chrome we don't want — but NOT the toolbar container,
       which houses the sidebar toggle button on mobile */
    #MainMenu { display: none !important; }
    footer    { display: none !important; }
    .stDeployButton { display: none !important; }
    [data-testid="stStatusWidget"] { display: none !important; }

    /* Always keep the sidebar collapse/expand control visible */
    [data-testid="collapsedControl"],
    [data-testid="stSidebarCollapsedControl"] {
        display: flex !important;
        visibility: visible !important;
    }
    .stApp { background: #f8fafc; }
    .main .block-container { padding-top: 1.2rem !important; max-width: 100% !important; }
    [data-testid="stSidebar"] {
        background: #ffffff !important;
        border-right: 1px solid #e2e8f0 !important;
    }
    [data-testid="stVerticalBlockBorderWrapper"] {
        background: #ffffff !important;
        border: 1px solid #e8ecf1 !important;
        border-radius: 10px !important;
        box-shadow: 0 1px 4px rgba(15,23,42,0.06) !important;
        transition: box-shadow 0.18s ease, transform 0.18s ease !important;
        overflow: hidden !important;
        margin-bottom: 10px !important;
    }
    [data-testid="stVerticalBlockBorderWrapper"]:hover {
        box-shadow: 0 6px 20px rgba(15,23,42,0.11) !important;
        transform: translateY(-2px) !important;
    }
    .stButton > button {
        border-radius: 7px !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        transition: all 0.15s ease !important;
        border: 1px solid transparent !important;
    }
    .stButton > button[kind="primary"] {
        background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%) !important;
        box-shadow: 0 2px 8px rgba(99,102,241,0.35) !important;
    }
    .stButton > button[kind="primary"]:hover {
        box-shadow: 0 4px 14px rgba(99,102,241,0.45) !important;
        transform: translateY(-1px) !important;
    }
    .stButton > button[kind="secondary"] {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #374151 !important;
    }
    [data-testid="stSelectbox"] > div > div {
        border-radius: 7px !important;
        border: 1px solid #e2e8f0 !important;
        font-size: 13px !important;
        background: #ffffff !important;
    }
    .stTextArea textarea {
        border-radius: 7px !important;
        border: 1px solid #e2e8f0 !important;
        font-size: 13px !important;
        background: #fafafa !important;
    }
    .stTextArea textarea:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
    }
    .stTextInput input {
        border-radius: 7px !important;
        border: 1px solid #e2e8f0 !important;
        font-size: 13px !important;
    }
    .stTextInput input:focus {
        border-color: #6366f1 !important;
        box-shadow: 0 0 0 3px rgba(99,102,241,0.12) !important;
    }
    .stDateInput input { border-radius: 7px !important; font-size: 12px !important; }
    .stPopover > button {
        border-radius: 7px !important;
        border: 1px solid #e2e8f0 !important;
        font-size: 12px !important;
        background: #fafafa !important;
        color: #374151 !important;
    }
    .stExpander {
        border: 1px solid #e2e8f0 !important;
        border-radius: 8px !important;
        background: #ffffff !important;
    }
    hr { border-color: #f1f5f9 !important; margin: 8px 0 !important; }
    [data-testid="stCaptionContainer"] p { color: #64748b !important; font-size: 12px !important; }
    .stDownloadButton > button {
        border-radius: 7px !important;
        font-size: 12px !important;
        border: 1px solid #e2e8f0 !important;
        background: #f8fafc !important;
    }
    [data-testid="stAlert"] { border-radius: 8px !important; font-size: 13px !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

    /* ── Tighten inter-widget gaps inside cards ── */
    [data-testid="stVerticalBlockBorderWrapper"]
        [data-testid="stVerticalBlock"] > div { gap: 0.25rem !important; }

    /* ═══════════════════════════════════════════════════
       MOBILE  (primary use case — phones ≤ 768 px)
    ═══════════════════════════════════════════════════ */
    @media (max-width: 768px) {

        /* Stack every horizontal layout: kanban columns + card internals */
        [data-testid="stHorizontalBlock"] {
            flex-direction: column !important;
            gap: 0 !important;
        }
        [data-testid="column"] {
            width: 100% !important;
            min-width: 100% !important;
            flex: none !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
        }

        /* Disable hover lift on touch — causes glitches */
        [data-testid="stVerticalBlockBorderWrapper"]:hover {
            transform: none !important;
            box-shadow: 0 1px 4px rgba(15,23,42,0.06) !important;
        }

        /* ≥ 16 px stops iOS Safari auto-zoom on input focus */
        .stTextArea textarea,
        .stTextInput input,
        .stDateInput input,
        [data-testid="stSelectbox"] input,
        [data-testid="stSelectbox"] select { font-size: 16px !important; }

        /* Apple HIG: 44 pt minimum touch target */
        .stButton > button { min-height: 44px !important; }
        [data-testid="stSelectbox"] > div > div { min-height: 44px !important; }
        .stPopover > button {
            min-height: 44px !important;
            width: 100% !important;
        }

        /* Tighter page margins */
        .main .block-container {
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
            padding-top: 0.5rem !important;
        }
    }
    </style>
    """, unsafe_allow_html=True)


def col_header(status: str, count: int):
    m = STATUS_META.get(status, STATUS_META["To Do"])
    st.markdown(f"""
    <div style="background:{m['bg']};border-radius:10px;padding:10px 14px;margin-bottom:12px;
                display:flex;justify-content:space-between;align-items:center;
                border-left:4px solid {m['color']}">
        <span style="font-size:14px;font-weight:700;color:{m['text']};letter-spacing:0.01em">
            {m['icon']}&nbsp; {status}
        </span>
        <span style="background:{m['color']};color:white;border-radius:20px;padding:2px 11px;
                     font-size:12px;font-weight:700;min-width:28px;text-align:center">{count}</span>
    </div>
    """, unsafe_allow_html=True)


def card_accent(status: str):
    color = STATUS_META.get(status, STATUS_META["To Do"])["color"]
    st.markdown(f'<div style="height:3px;background:{color};border-radius:3px;margin-bottom:10px"></div>',
                unsafe_allow_html=True)


def assignee_chip(name: str):
    if not name or name == "Unassigned":
        return '<span style="color:#94a3b8;font-size:11px">Unassigned</span>'
    return (f'<span style="display:inline-block;background:#e0e7ff;color:#4338ca;'
            f'padding:2px 9px;border-radius:20px;font-size:11px;font-weight:500">👤 {name}</span>')


def find_store_numbers(text: str) -> list:
    """Return unique Kroger store numbers (3-digit) found in text.
    Handles formats: 630, D-704, D685.
    Excludes numbers that are part of dollar amounts (preceded by $ or ,)."""
    if not text:
        return []
    found = set()
    # D-prefixed: D-704, D704, D 704
    for m in re.finditer(r'\bD[-\s]?(\d{3})\b', text, re.IGNORECASE):
        found.add(m.group(1))
    # Standalone 3-digit numbers not adjacent to $ , or other digits
    for m in re.finditer(r'(?<![,$\d])(\d{3})(?![,\d])', text):
        found.add(m.group(1))
    return sorted(found)


def store_tags_html(numbers: list) -> str:
    if not numbers:
        return ""
    tags = "".join(
        f'<span style="display:inline-block;background:#1e3a8a;color:#ffffff;'
        f'padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;'
        f'letter-spacing:0.04em;margin-right:4px">#{n}</span>'
        for n in numbers
    )
    return f'<div style="margin-bottom:6px">{tags}</div>'


def sidebar_stat_row(status: str, count: int):
    m = STATUS_META[status]
    st.markdown(f"""
    <div style="display:flex;justify-content:space-between;align-items:center;
                padding:7px 10px;border-radius:7px;margin-bottom:4px;
                background:#ffffff;border:1px solid #f1f5f9">
        <span style="font-size:13px;color:#374151;display:flex;align-items:center;gap:7px">
            <span style="width:8px;height:8px;border-radius:50%;background:{m['color']};
                         display:inline-block;flex-shrink:0"></span>
            {status}
        </span>
        <span style="font-size:13px;font-weight:700;color:{m['color']}">{count}</span>
    </div>
    """, unsafe_allow_html=True)


# ========================
# PERFORMANCE LAYER
# ========================

@st.cache_data(ttl=60, show_spinner=False)
def _fetch_pm_users():
    """PM user list — cached 60 s, shared across sessions."""
    return list_users_by_role("pm") + list_users_by_role("viewer")


@st.cache_data(ttl=300, show_spinner=False)
def _fetch_attachment(att_id: str):
    """Attachment binary data — cached 5 min, shared across sessions."""
    return get_attachment(att_id)


# Cross-session task cache (ttl=4s). Makes the very first cold page load fast for
# every user. TTL is short so live edits are never stale for more than 4 seconds.
@st.cache_data(ttl=4, show_spinner=False)
def _db_get_tasks():
    return get_tasks()

@st.cache_data(ttl=4, show_spinner=False)
def _db_get_tasks_for_user(name: str):
    return get_tasks_for_user(name)


def _get_board_tasks(filter_name=None):
    """Two-level task cache:
      1. @st.cache_data (4 s TTL, cross-session) — cold first-load is fast.
      2. session_state (keyed to board_sig) — every widget interaction is instant.
    Re-queries only when board_sig changes (real mutation) or cross-session cache expires."""
    sig = st.session_state.board_sig
    ck = f"_tc_{'all' if filter_name is None else filter_name}"
    if st.session_state.get(ck + "_sig") != sig:
        st.session_state[ck] = (
            _db_get_tasks() if filter_name is None else _db_get_tasks_for_user(filter_name)
        )
        st.session_state[ck + "_sig"] = sig
    return st.session_state[ck]


def _after_mutation():
    """After any DB write: clear both cache layers, sync board_sig, rerun."""
    _db_get_tasks.clear()
    _db_get_tasks_for_user.clear()
    for k in [k for k in st.session_state if k.startswith("_tc_")]:
        del st.session_state[k]
    st.session_state.board_sig = get_tasks_signature()
    st.session_state.refresh_key += 1
    st.rerun()


# ========================
# INIT
# ========================
inject_css()

user = current_user()
role = user["role"]
user_name = user["name"]

KANBAN_STATUSES = ["To Do", "In Progress", "Review", "Done", "On Hold", "Cancelled"]
QUOTE_TYPES = ["Assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"]
QUOTE_PEOPLE = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"]

_pm_users_db = _fetch_pm_users()
PM_NAMES = [u["name"] for u in _pm_users_db if u.get("name")]

ASSIGNEES = (["Unassigned"] + PM_NAMES + SUPERVISORS
             if role == "admin"
             else ["Unassigned"] + SUPERVISORS)

for _k, _v in [("refresh_key", 0), ("syncing", False), ("board_sig", None),
               ("view_as_user", None), ("board_ready", False)]:
    if _k not in st.session_state:
        st.session_state[_k] = _v
if st.session_state.board_sig is None:
    st.session_state.board_sig = get_tasks_signature()

# ── Preload tasks before any UI renders ──────────────────────────────────────
# Warms the session cache once per session (instant on reruns, one DB hit on
# cold load). Both the sidebar stats and the board read from this cache.
_prefetch_filter = (
    None if (role == "admin" and not st.session_state.get("view_as_user"))
    else (st.session_state.get("view_as_user") or user_name)
)
_get_board_tasks(_prefetch_filter)   # ← populates session cache now


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
@st.dialog("✏️ Create New Task")
def show_new_task_dialog():
    title = st.text_input("Title *", placeholder="What needs to get done?")
    c1, c2 = st.columns(2)
    with c1:
        assigned_to = st.selectbox("Assign to", ASSIGNEES)
    with c2:
        task_status = st.selectbox("Status", KANBAN_STATUSES)
    c3, c4 = st.columns(2)
    with c3:
        date_val = st.date_input("Due Date", value=None)
    with c4:
        quote_val = st.text_input("Quote", placeholder="e.g. $12,000")
    notes = st.text_area("Notes", height=90, placeholder="Any additional context...")
    st.markdown("<br>", unsafe_allow_html=True)
    if st.button("Create Task", type="primary", use_container_width=True):
        if not title.strip():
            st.error("Title is required.")
        else:
            insert_task({
                "title": title.strip(),
                "description": "",
                "quote": quote_val.strip() or None,
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
            _after_mutation()


# ========================
# SIDEBAR
# ========================
with st.sidebar:
    role_label = "Admin" if role == "admin" else "PM"
    st.markdown(f"""
    <div style="padding:12px 4px 8px 4px">
        <div style="font-size:13px;font-weight:600;color:#1e293b">{user_name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">
            <span style="background:#e0e7ff;color:#4338ca;padding:1px 7px;
                         border-radius:10px;font-weight:600">{role_label}</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.button("Log out", on_click=st.logout, use_container_width=True)
    st.divider()

    if role == "admin":
        if st.button("🔄 Sync Flagged Emails", type="primary", use_container_width=True):
            st.session_state.syncing = True
            st.rerun()

    if st.button("✏️ New Task",
                 type="primary" if role != "admin" else "secondary",
                 use_container_width=True):
        show_new_task_dialog()

    if role == "admin":
        st.divider()
        c1, c2 = st.columns(2)
        with c1:
            st.page_link("pages/quote_generator.py", label="💰 Quotes")
        with c2:
            st.page_link("pages/dashboard.py", label="📊 Dashboard")

        st.divider()

        with st.expander("👁️ View User Activity"):
            _view_opts = ["All tasks"] + [u["name"] for u in _pm_users_db if u.get("name")]
            _view_choice = st.selectbox("View board as:", _view_opts, key="view_as_selector",
                                        label_visibility="collapsed")
            st.session_state.view_as_user = None if _view_choice == "All tasks" else _view_choice

        with st.expander("👥 User Access"):
            st.caption("Display Name must exactly match the 'Assign to' dropdown.")
            for u in list_users():
                uc1, uc2, uc3 = st.columns([4, 3, 1])
                uc1.caption(u.get("name") or u["_id"])
                uc2.caption(u.get("role", "pm"))
                if uc3.button("✕", key=f"deluser_{u['_id']}"):
                    delete_user(u["_id"])
                    _fetch_pm_users.clear()
                    st.rerun()
            st.divider()
            new_email    = st.text_input("Email",        key="new_user_email", placeholder="person@ravesinc.com")
            new_name     = st.text_input("Display Name", key="new_user_name",  placeholder="Andrew")
            new_role_sel = st.selectbox("Role", ["pm", "admin"], key="new_user_role")
            if st.button("➕ Add / Update", use_container_width=True):
                if new_email.strip():
                    upsert_user(new_email.strip(), new_role_sel, new_name.strip())
                    _fetch_pm_users.clear()
                    st.toast(f"✅ Saved {new_name.strip() or new_email.strip()} as {new_role_sel}")
                    st.rerun()
                else:
                    st.warning("Enter an email address.")

        with st.expander("⚠️ Danger Zone"):
            if st.button("🗑️ Clear All Tasks", type="secondary", use_container_width=True):
                if st.checkbox("I confirm deletion of ALL tasks"):
                    for task in get_tasks():
                        delete_task(task["_id"])
                    st.toast("🗑️ All tasks cleared.")
                    _after_mutation()

    st.divider()
    st.markdown('<p style="font-size:12px;font-weight:600;color:#94a3b8;letter-spacing:0.06em;'
                'text-transform:uppercase;margin-bottom:8px">Board Stats</p>',
                unsafe_allow_html=True)

    _view_as = st.session_state.get("view_as_user")
    _stats_tasks = _get_board_tasks(
        None if (role == "admin" and not _view_as)
        else (_view_as if (role == "admin" and _view_as) else user_name)
    )
    for status in KANBAN_STATUSES:
        sidebar_stat_row(status, len([t for t in _stats_tasks if t.get("status") == status]))

    total = len(_stats_tasks)
    done  = len([t for t in _stats_tasks if t.get("status") == "Done"])
    if total > 0:
        pct = int(done / total * 100)
        st.markdown(f"""
        <div style="margin-top:10px">
            <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-size:11px;color:#94a3b8">Completion</span>
                <span style="font-size:11px;font-weight:600;color:#10b981">{pct}%</span>
            </div>
            <div style="background:#e2e8f0;border-radius:4px;height:5px">
                <div style="background:#10b981;border-radius:4px;height:5px;width:{pct}%"></div>
            </div>
        </div>
        """, unsafe_allow_html=True)


# ========================
# GRAPH SYNC
# ========================
if st.session_state.syncing and role == "admin":
    with st.spinner("🔄 Fetching flagged emails from Microsoft 365..."):
        try:
            new_emails     = fetch_recent_emails(max_results=30)
            existing_tasks = get_tasks()
            new_count      = 0
            token          = get_graph_token()
            headers        = {"Authorization": f"Bearer {token}"}

            for email in new_emails:
                if any(t.get("exchange_id") == email["id"] for t in existing_tasks):
                    continue
                parsed = parse_email_with_llm(email)
                task = {
                    "title":        email["subject"],
                    "description":  parsed.get("summary") or "",
                    "full_body":    email["body"],
                    "quote":        parsed["quote"],
                    "assigned_to":  parsed["assigned_to"] or "Unassigned",
                    "notes":        "",
                    "date":         parsed["date"],
                    "status":       "To Do",
                    "exchange_id":  email["id"],
                    "from":         email.get("from", "Unknown Sender"),
                    "sender_name":  email.get("sender_name", ""),
                    "sender_email": email.get("sender_email", ""),
                    "created_by":   user_name,
                    "attachment_ids": [],
                    "created_at":   datetime.utcnow().isoformat(),
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
                                att["size"], att.get("content_type", "application/octet-stream"),
                            )
                            task["attachment_ids"].append(att_id)
                            update_task_field(task_id, "attachment_ids", task["attachment_ids"])
                new_count += 1

            st.toast(
                f"✅ Synced {new_count} new flagged email(s)!" if new_count else "📭 No new flagged emails.",
                icon="🎉" if new_count else "📭",
            )
        except Exception as e:
            logger.error(f"Graph sync failed: {e}")
            st.error(f"❌ Sync failed: {e}")
        finally:
            st.session_state.syncing = False
            _after_mutation()


# ========================
# PAGE HEADER
# ========================
view_as = st.session_state.get("view_as_user")
hcol1, _ = st.columns([3, 1])
with hcol1:
    badge = (f' <span style="background:#fef3c7;color:#92400e;padding:3px 10px;'
             f'border-radius:20px;font-size:12px;font-weight:600;border:1px solid #fcd34d">'
             f'👁️ Viewing as {view_as}</span>'
             if (role == "admin" and view_as) else "")
    st.markdown(
        f'<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">'
        f'<span style="font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-0.02em">'
        f'🏗️ Blueprint</span>{badge}</div>',
        unsafe_allow_html=True,
    )
    st.caption("Email-to-Task Kanban · Grocery Construction")


# ========================
# KANBAN BOARD
# ========================
filter_name = None if (role == "admin" and not view_as) else (
    view_as if (role == "admin" and view_as) else user_name
)

# Tasks are already in the session cache (pre-fetched before any rendering above).
# This call returns instantly from session state — no DB hit.
tasks = _get_board_tasks(filter_name)

cols = st.columns(len(KANBAN_STATUSES), gap="small")

for idx, status in enumerate(KANBAN_STATUSES):
    column_tasks = [t for t in tasks if t.get("status") == status]
    with cols[idx]:
        col_header(status, len(column_tasks))

        if not column_tasks:
            st.markdown("""
            <div style="text-align:center;padding:24px 8px;color:#cbd5e1;
                        border:2px dashed #e2e8f0;border-radius:8px;font-size:12px">
                No tasks
            </div>
            """, unsafe_allow_html=True)

        for task in column_tasks:
            with st.container(border=True):
                card_accent(task.get("status", "To Do"))

                # Title + Kroger store-number tags
                title_text = task.get("title", "Untitled")
                store_nums = find_store_numbers(title_text)
                tags_html  = store_tags_html(store_nums)
                st.markdown(
                    f'<div style="font-size:13px;font-weight:600;color:#1e293b;'
                    f'line-height:1.4;margin-bottom:6px">{title_text}</div>'
                    f'{tags_html}',
                    unsafe_allow_html=True,
                )

                curr_assign = task.get("assigned_to", "Unassigned")
                source = ("📩 " + (task.get("sender_name") or task.get("sender_email") or "Email")
                          if task.get("exchange_id")
                          else f"✏️ {task.get('created_by','Manual')}")
                st.markdown(
                    f'<div style="font-size:11px;color:#94a3b8;margin-bottom:4px">{source}</div>'
                    f'<div style="margin-bottom:8px">{assignee_chip(curr_assign)}</div>',
                    unsafe_allow_html=True,
                )

                desc = task.get("description", "")
                if desc:
                    st.caption(desc.replace("\n", " ")[:200] + ("…" if len(desc) > 200 else ""))
                    if task.get("full_body"):
                        with st.expander("📄 Full Email", expanded=False):
                            st.markdown(task.get("full_body", ""), unsafe_allow_html=True)

                # Status & Assignee
                sc, ac = st.columns(2)
                rk = st.session_state.refresh_key
                uid = f"{task['_id']}_{task.get('updated_at','')}"
                with sc:
                    new_status = st.selectbox(
                        "Status", KANBAN_STATUSES,
                        index=KANBAN_STATUSES.index(task.get("status", "To Do")),
                        key=f"status_{uid}_{rk}", label_visibility="collapsed",
                    )
                    if new_status != task.get("status"):
                        update_task_field(task["_id"], "status", new_status)
                        _after_mutation()
                with ac:
                    assign_idx = ASSIGNEES.index(curr_assign) if curr_assign in ASSIGNEES else 0
                    new_assign = st.selectbox(
                        "Assigned to", ASSIGNEES, index=assign_idx,
                        key=f"assign_{uid}_{rk}", label_visibility="collapsed",
                    )
                    if new_assign != curr_assign:
                        update_task_field(task["_id"], "assigned_to", new_assign)
                        _after_mutation()

                # Date (always shown) + Quote (only when a value exists)
                has_quote = bool(task.get("quote"))
                date_col, quote_col = st.columns(2) if has_quote else (st.columns(1)[0], None)

                with date_col:
                    current_date = task.get("date")
                    try:
                        date_val = datetime.strptime(current_date, "%Y-%m-%d").date() if current_date else None
                    except Exception:
                        date_val = None
                    new_date = st.date_input(
                        "Date", value=date_val, label_visibility="collapsed",
                        key=f"date_{uid}_{rk}",
                    )
                    if new_date != date_val:
                        update_task_field(task["_id"], "date", str(new_date))
                        _after_mutation()

                if has_quote and quote_col:
                    with quote_col:
                        with st.popover(f"💰 {task['quote']}", use_container_width=True):
                            qt, qa = st.columns(2)
                            with qt:
                                curr_type = task.get("quote_type", QUOTE_TYPES[0])
                                new_type = st.selectbox(
                                    "Type", QUOTE_TYPES,
                                    index=QUOTE_TYPES.index(curr_type) if curr_type in QUOTE_TYPES else 0,
                                    key=f"qtype_{uid}_{rk}",
                                )
                                if new_type != curr_type:
                                    update_task_field(task["_id"], "quote_type", new_type)
                                    _after_mutation()
                            with qa:
                                curr_person = task.get("quote_assignee", QUOTE_PEOPLE[0])
                                new_person = st.selectbox(
                                    "Person", QUOTE_PEOPLE,
                                    index=QUOTE_PEOPLE.index(curr_person) if curr_person in QUOTE_PEOPLE else 0,
                                    key=f"qperson_{uid}_{rk}",
                                )
                                if new_person != curr_person:
                                    update_task_field(task["_id"], "quote_assignee", new_person)
                                    _after_mutation()
                            curr_amount = task.get("quote", "")
                            new_amount = st.text_input("Amount", value=curr_amount or "",
                                                       key=f"qamt_{uid}_{rk}")
                            if new_amount != curr_amount:
                                update_task_field(task["_id"], "quote", new_amount)
                                _after_mutation()

                # Notes — full textarea when content exists, compact expander when empty
                current_notes = task.get("notes", "")
                if current_notes:
                    new_notes = st.text_area(
                        "Notes", value=current_notes, height=64, placeholder="Add notes…",
                        key=f"notes_{uid}_{rk}", label_visibility="collapsed",
                    )
                    if new_notes != current_notes:
                        update_task_field(task["_id"], "notes", new_notes)
                        _after_mutation()
                else:
                    with st.expander("📝 Add note", expanded=False):
                        new_notes = st.text_area(
                            "Notes", value="", height=64, placeholder="Type a note…",
                            key=f"notes_{uid}_{rk}", label_visibility="collapsed",
                        )
                        if new_notes:
                            update_task_field(task["_id"], "notes", new_notes)
                            _after_mutation()

                # Attachments — binary data loaded via cache, not on every raw DB hit
                att_ids = task.get("attachment_ids", [])
                if att_ids:
                    st.markdown(
                        f'<div style="font-size:11px;color:#94a3b8;margin-top:4px">'
                        f'📎 {len(att_ids)} attachment(s)</div>',
                        unsafe_allow_html=True,
                    )
                    with st.expander("", expanded=False):
                        for att_id in att_ids:
                            att_data = _fetch_attachment(att_id)   # ← cached, no repeated DB hit
                            if att_data:
                                st.download_button(
                                    label=f"⬇️ {att_data['filename']} ({att_data['size']/1024:.1f} KB)",
                                    data=att_data["data"],
                                    file_name=att_data["filename"],
                                    use_container_width=True,
                                    key=f"dl_{task['_id']}_{att_id}_{rk}",
                                )
                            else:
                                st.caption(f"⚠️ Missing: {att_id}")


# ========================
# ADMIN — raw data
# ========================
if role == "admin":
    st.divider()
    with st.expander("🛠️ Admin — Raw Task Data"):
        all_tasks = get_tasks()
        if all_tasks:
            df = pd.DataFrame(all_tasks)
            cols_order = ["_id", "title", "created_by", "description", "sender_name",
                          "sender_email", "date", "assigned_to", "quote", "quote_type",
                          "quote_assignee", "notes", "status", "exchange_id", "created_at"]
            avail = [c for c in cols_order if c in df.columns]
            st.dataframe(df[avail] if avail else df, use_container_width=True, hide_index=True)
        else:
            st.info("No tasks in database.")
