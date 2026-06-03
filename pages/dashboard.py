# Blueprint/pages/dashboard.py
import streamlit as st
from dotenv import load_dotenv
load_dotenv()

from datetime import datetime, timedelta
import logging
import os
import pandas as pd

from auth import require_role, current_user


# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

if USE_MOCK:
    def _generate_mock_tasks():
        quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair", "Inspection Fee"]
        quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Dean", "Vickie", "Sarah"]
        assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom", "Lisa"]
        statuses = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]
        templates = [
            ("Site Inspection Required", "Requires immediate attention from site supervisor", "Follow up with vendor on delivery date"),
            ("Equipment Delivery Scheduled", "Pending approval from project manager", "Schedule work within permit validity period"),
            ("Permit Application Submitted", "Awaiting client feedback before proceeding", "Notify site crew and update safety barriers"),
            ("Safety Review Completed", "Scheduled for next week's work window", "Review budget allocation for next phase"),
            ("Budget Approval Pending", "On hold due to material availability", "Coordinate with utility company for shutdown"),
            ("Vendor Meeting Scheduled", "Completed ahead of schedule", "Prepare safety briefing for tomorrow's work"),
            ("Quality Check Performed", "Requires rework due to quality issues", "Update client on progress via email"),
            ("Timeline Update Needed", "Budget variance needs explanation", "Check material specifications against approved samples"),
            ("Material Shortage Alert", "Client requested additional features", "Verify measurements before cutting"),
            ("Weather Delay Notice", "Regulatory update affects timeline", "Ensure proper disposal of waste materials"),
            ("Change Order Request", "Vendor performance review needed", "Confirm insurance certificates are current"),
            ("Invoice Dispute Resolution", "Weather contingency plan activated", "Validate measurements with architect drawings"),
            ("Staff Training Required", "Subcontractor coordination meeting", "Schedule follow-up inspection in 48 hours"),
            ("Utility Coordination", "Material delivery tracking required", "Review subcontractor qualifications"),
            ("Foundation Pour Scheduled", "Safety incident investigation", "Check for potential utility conflicts"),
            ("Electrical Rough-In Complete", "Quality assurance documentation", "Verify ADA compliance requirements"),
            ("Plumbing Inspection Passed", "Change order pricing negotiation", "Confirm fire rating specifications"),
            ("HVAC Installation", "Final inspection scheduling", "Check for moisture barrier installation"),
            ("Roofing Materials Delivered", "Client satisfaction survey", "Verify proper flashing details"),
            ("Flooring Installation Started", "Post-project cleanup coordination", "Ensure adequate ventilation during installation"),
            ("Final Walkthrough Scheduled", "Parking lot resurfacing", "Verify fire alarm connectivity"),
            ("Client Presentation Prepared", "ADA compliance upgrades", "Check refrigerant levels"),
            ("As-Built Drawings Updated", "Energy efficiency audit", "Verify irrigation system"),
            ("Warranty Registration Filed", "Fire suppression system check", "Check door hardware specifications"),
            ("Project Closeout Meeting", "Interior demolition work", "Check paint adhesion"),
        ]
        import random
        tasks = []
        for i in range(1, 36):
            title, desc, notes = random.choice(templates)
            task_date = (datetime.now() - timedelta(days=random.randint(0, 270))).strftime("%Y-%m-%d")
            created_at = (datetime.now() - timedelta(days=random.randint(0, 60))).isoformat()
            quote_type = random.choice(quote_types)
            quote_person = random.choice(quote_people)
            assignee = random.choice(assignees)
            status = random.choice(statuses)
            ranges = {"assign Quote": (8000, 75000), "T&M": (1500, 25000),
                      "Service Call": (300, 8000), "Maintenance Request": (500, 12000),
                      "Emergency Repair": (2000, 30000)}
            lo, hi = ranges.get(quote_type, (250, 5000))
            quote_amount = f"${random.randint(lo, hi):,}.00"
            tasks.append({
                "_id": f"mock_{i:02d}", "title": title, "description": desc,
                "quote": quote_amount, "quote_type": quote_type, "quote_assignee": quote_person,
                "assigned_to": assignee, "notes": notes, "date": task_date, "status": status,
                "exchange_id": f"mock_exchange_{i:03d}_{int(datetime.utcnow().timestamp())}",
                "created_at": created_at,
            })
        return tasks

    def get_tasks():
        st.session_state.mock_tasks = _generate_mock_tasks()
        return st.session_state.mock_tasks
else:
    from db import get_tasks


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ========================
# PAGE CONFIG
# ========================
st.set_page_config(
    page_title="Blueprint Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded",
)

require_role("admin")


# ========================
# DESIGN SYSTEM
# ========================
STATUS_META = {
    "To Do":       {"color": "#6366f1", "bg": "#eef2ff", "text": "#4338ca"},
    "In Progress": {"color": "#f59e0b", "bg": "#fffbeb", "text": "#b45309"},
    "Review":      {"color": "#3b82f6", "bg": "#dbeafe", "text": "#1d4ed8"},
    "Approval":    {"color": "#f59e0b", "bg": "#fffbeb", "text": "#b45309"},
    "Done":        {"color": "#10b981", "bg": "#d1fae5", "text": "#047857"},
    "On Hold":     {"color": "#94a3b8", "bg": "#f1f5f9", "text": "#475569"},
    "Cancelled":   {"color": "#f87171", "bg": "#fee2e2", "text": "#dc2626"},
}

KANBAN_STATUSES = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]


def inject_css():
    st.markdown("""
    <style>
    html, body, [class*="css"], .stApp {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue',
                     Arial, system-ui, sans-serif;
    }
    #MainMenu { display: none !important; }
    footer    { display: none !important; }
    .stDeployButton { display: none !important; }
    [data-testid="stStatusWidget"] { display: none !important; }
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
    .stButton > button {
        border-radius: 7px !important;
        font-weight: 500 !important;
        font-size: 13px !important;
        transition: all 0.15s ease !important;
    }
    .stButton > button[kind="primary"] {
        background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%) !important;
        box-shadow: 0 2px 8px rgba(99,102,241,0.35) !important;
    }
    .stButton > button[kind="secondary"] {
        background: #ffffff !important;
        border: 1px solid #e2e8f0 !important;
        color: #374151 !important;
    }
    [data-testid="stAlert"] { border-radius: 8px !important; font-size: 13px !important; }
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: #f1f5f9; }
    ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }

    /* Metric card tweaks */
    div[data-testid="stMetric"] > div:nth-child(2) {
        color: #6366f1 !important;
        font-weight: 700 !important;
    }
    div[data-testid="stMetric"] {
        background: #ffffff;
        border: 1px solid #e8ecf1;
        border-radius: 10px;
        padding: 14px 16px;
        box-shadow: 0 1px 4px rgba(15,23,42,0.05);
    }

    /* Page-link nav buttons in sidebar */
    [data-testid="stPageLink"] a {
        display: flex !important;
        align-items: center !important;
        border-radius: 7px !important;
        padding: 8px 10px !important;
        font-size: 13px !important;
        font-weight: 500 !important;
        color: #374151 !important;
        text-decoration: none !important;
        border: 1px solid #e2e8f0 !important;
        background: #f8fafc !important;
        transition: background 0.15s ease, border-color 0.15s ease !important;
        margin-bottom: 4px !important;
    }
    [data-testid="stPageLink"] a:hover {
        background: #eef2ff !important;
        border-color: #c7d2fe !important;
        color: #4338ca !important;
    }
    </style>
    """, unsafe_allow_html=True)


def sidebar_stat_row(status: str, count: int):
    m = STATUS_META.get(status, STATUS_META["To Do"])
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


def parse_quote(quote_str):
    if not isinstance(quote_str, str):
        return 0.0
    try:
        return float(quote_str.replace('$', '').replace(',', ''))
    except ValueError:
        return 0.0


inject_css()
user = current_user()
user_name = user["name"]


# ========================
# SIDEBAR
# ========================
with st.sidebar:
    st.markdown(f"""
    <div style="padding:12px 4px 8px 4px">
        <div style="font-size:13px;font-weight:600;color:#1e293b">{user_name}</div>
        <div style="font-size:11px;color:#64748b;margin-top:2px">
            <span style="background:#e0e7ff;color:#4338ca;padding:1px 7px;
                         border-radius:10px;font-weight:600">Admin</span>
        </div>
    </div>
    """, unsafe_allow_html=True)
    st.button("Log out", on_click=st.logout, use_container_width=True)

    st.divider()

    st.markdown('<p style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.06em;'
                'text-transform:uppercase;margin-bottom:6px">Navigation</p>',
                unsafe_allow_html=True)
    st.page_link("main.py", label="🏗️ Kanban Board", use_container_width=True)
    st.page_link("pages/quote_generator.py", label="💰 Quote Generator", use_container_width=True)

    st.divider()

    if st.button("🔄 Refresh Data", use_container_width=True):
        st.rerun()

    st.divider()

    tasks = get_tasks()
    st.markdown('<p style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:0.06em;'
                'text-transform:uppercase;margin-bottom:8px">Board Stats</p>',
                unsafe_allow_html=True)
    for status in KANBAN_STATUSES:
        sidebar_stat_row(status, len([t for t in tasks if t.get("status") == status]))

    total = len(tasks)
    done  = len([t for t in tasks if t.get("status") == "Done"])
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
# PAGE HEADER
# ========================
st.markdown(
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">'
    '<span style="font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-0.02em">'
    '📊 Dashboard</span></div>',
    unsafe_allow_html=True,
)
st.caption("Quote analytics & raw task data · Admin only")
st.divider()


# ========================
# MAIN CONTENT
# ========================
tasks = get_tasks()

if not tasks:
    st.warning("No tasks found in the database.")
    st.info("Sync flagged emails from the Kanban board to generate tasks.")
else:
    df = pd.DataFrame(tasks)

    if 'quote_type' not in df.columns:
        df['quote_type'] = 'Not Set'
    if 'quote_assignee' not in df.columns:
        df['quote_assignee'] = 'Unassigned'

    df['quote_value'] = df['quote'].apply(parse_quote)

    # ── Summary metrics ──────────────────────────────────────────────────
    st.subheader("💰 Quote Summary")
    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("Total Value", f"${df['quote_value'].sum():,.0f}")
    with col2:
        st.metric("Average Quote", f"${df['quote_value'].mean():,.0f}")
    with col3:
        st.metric("Highest Quote", f"${df['quote_value'].max():,.0f}")
    with col4:
        st.metric("Lowest Quote", f"${df['quote_value'].min():,.0f}")
    with col5:
        st.metric("Quoted Tasks", f"{len(df[df['quote_value'] > 0])}")

    # ── Charts: row 1 ────────────────────────────────────────────────────
    st.divider()
    st.subheader("📈 Analytics")
    r1c1, r1c2 = st.columns(2)

    with r1c1:
        st.markdown("**💰 Total Quote Value by Type**")
        st.bar_chart(df.groupby('quote_type')['quote_value'].sum().to_frame().T)

    with r1c2:
        st.markdown("**📊 Task Distribution by Quote Type**")
        st.bar_chart(df['quote_type'].value_counts().to_frame().T)

    # ── Charts: row 2 ────────────────────────────────────────────────────
    r2c1, r2c2 = st.columns(2)

    with r2c1:
        st.markdown("**📈 Quote Value Trend Over Time (by Type)**")
        df_temp = df.copy()
        df_temp['date_dt'] = pd.to_datetime(df_temp['date'])
        pivot_df = (
            df_temp.pivot_table(index='date_dt', columns='quote_type',
                                values='quote_value', aggfunc='sum', fill_value=0)
            .sort_index()
        )
        st.line_chart(pivot_df)

    with r2c2:
        st.markdown("**👥 Top 7 Assignees by Quote Value**")
        top_assignees = (
            df.groupby('assigned_to')['quote_value'].sum()
            .sort_values(ascending=False).head(7)
            .to_frame().T
        )
        st.bar_chart(top_assignees)

    # ── Charts: row 3 ────────────────────────────────────────────────────
    r3c1, r3c2 = st.columns(2)

    with r3c1:
        st.markdown("**📊 Average Quote by Status**")
        status_avg = (
            df.groupby('status')['quote_value'].mean()
            .sort_values(ascending=False)
            .to_frame().T
        )
        st.bar_chart(status_avg)

    with r3c2:
        st.markdown("**🔵 Task Status Distribution**")
        ordered = [s for s in KANBAN_STATUSES if s in df['status'].values]
        st.bar_chart(df['status'].value_counts().reindex(ordered).to_frame().T)

    # ── Charts: row 4 ────────────────────────────────────────────────────
    r4c1, r4c2 = st.columns(2)

    with r4c1:
        st.markdown("**📊 Quote Value Distribution**")
        df['quote_bin'] = pd.cut(
            df['quote_value'],
            bins=[0, 1000, 5000, 10000, 25000, 50000, 100000],
            labels=['$0–1K', '$1K–5K', '$5K–10K', '$10K–25K', '$25K–50K', '$50K+'],
        )
        st.bar_chart(df['quote_bin'].value_counts().sort_index().to_frame().T)

    with r4c2:
        st.markdown("**👤 Most Active Quote Assignees**")
        st.bar_chart(df['quote_assignee'].value_counts().head(6).to_frame().T)

    # ── Raw data table ───────────────────────────────────────────────────
    st.divider()
    st.subheader("📋 Raw Task Data")

    cols_order = ["_id", "title", "date", "assigned_to", "quote", "quote_value",
                  "quote_type", "quote_assignee", "notes", "status", "exchange_id", "created_at"]
    existing_cols = [c for c in cols_order if c in df.columns]
    st.dataframe(
        df[existing_cols],
        use_container_width=True,
        hide_index=True,
        column_config={
            "_id": "Task ID", "title": "Task Title", "date": "Due Date",
            "assigned_to": "Assigned To", "quote": "Quote Amount",
            "quote_value": "Quote Value ($)", "quote_type": "Quote Type",
            "quote_assignee": "Quote Assignee", "notes": "Notes",
            "status": "Status", "exchange_id": "Exchange ID", "created_at": "Created At",
        },
    )

    st.divider()
    csv = df[existing_cols].to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Download as CSV",
        data=csv,
        file_name="blueprint_tasks.csv",
        mime="text/csv",
        use_container_width=True,
    )
