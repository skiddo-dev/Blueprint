# Blueprint/pages/dashboard.py
import streamlit as st
from dotenv import load_dotenv
load_dotenv()                  
import streamlit as st
from datetime import datetime, timedelta
import logging
from typing import List, Dict, Any
import os
import pandas as pd
import numpy as np

from auth import require_role


# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"


if USE_MOCK:
    # Shared mock data generation function
    def _generate_mock_tasks():
        # Configuration arrays
        quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair", "Inspection Fee"]
        quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Dean", "Vickie", "Sarah"]
        assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom", "Lisa"]
        statuses = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]
        
        # Task templates (25 unique titles, descriptions, notes)
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
            ("Painting Prep Work", "Exterior lighting installation", "Check electrical grounding"),
            ("Final Walkthrough Scheduled", "Parking lot resurfacing", "Verify fire alarm connectivity"),
            ("Client Presentation Prepared", "ADA compliance upgrades", "Check refrigerant levels"),
            ("As-Built Drawings Updated", "Energy efficiency audit", "Verify irrigation system"),
            ("Warranty Registration Filed", "Fire suppression system check", "Check door hardware specifications"),
            ("Final Invoice Generated", "Roof membrane replacement", "Verify insulation R-values"),
            ("Project Closeout Meeting", "Interior demolition work", "Check paint adhesion"),
            ("Safety Audit Conducted", "Structural engineering review", "Verify concrete slump test"),
            ("Environmental Compliance Check", "Plumbing fixture upgrades", "Check electrical conduit fill"),
            ("Accessibility Review", "Electrical load calculation", "Verify HVAC airflow measurements")
        ]
        
        # Generate 35 tasks with varied data
        import random
        tasks = []
        for i in range(1, 36):
            # Select random template (with repetition to get 35 tasks)
            title, desc, notes = random.choice(templates)
            
            # Random dates
            task_date = (datetime.now() - timedelta(days=random.randint(0, 270))).strftime("%Y-%m-%d")
            created_at = (datetime.now() - timedelta(days=random.randint(0, 60))).isoformat()
            
            # Random selections
            quote_type = random.choice(quote_types)
            quote_person = random.choice(quote_people)
            assignee = random.choice(assignees)
            status = random.choice(statuses)
            
            # Quote amount by type
            if quote_type == "assign Quote":
                quote_amount = f"${random.randint(8000, 75000):,}.00"
            elif quote_type == "T&M":
                quote_amount = f"${random.randint(1500, 25000):,}.00"
            elif quote_type == "Service Call":
                quote_amount = f"${random.randint(300, 8000):,}.00"
            elif quote_type == "Maintenance Request":
                quote_amount = f"${random.randint(500, 12000):,}.00"
            elif quote_type == "Emergency Repair":
                quote_amount = f"${random.randint(2000, 30000):,}.00"
            else:  # Inspection Fee
                quote_amount = f"${random.randint(250, 5000):,}.00"
            
            tasks.append({
                "_id": f"mock_{i:02d}",
                "title": title,
                "description": desc,
                "quote": quote_amount,
                "quote_type": quote_type,
                "quote_assignee": quote_person,
                "assigned_to": assignee,
                "notes": notes,
                "date": task_date,
                "status": status,
                "exchange_id": f"mock_exchange_{i:03d}_{int(datetime.utcnow().timestamp())}",
                "created_at": created_at
            })
        return tasks

    def get_tasks():
        # Always generate fresh mock data in mock mode
        st.session_state.mock_tasks = _generate_mock_tasks()
        return st.session_state.mock_tasks


else:
    # Real mode: Import actual implementations
    from db import get_tasks


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# Page config
st.set_page_config(
    page_title="Blueprint Dashboard",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Admin-only page: hiding the nav link isn't enough, so block direct-URL access.
require_role("admin")

# Theme-adaptive CSS for metric values (blue)
st.markdown(
    """
    <style>
    div[data-testid="stMetric"] > div:nth-child(2) {
        color: var(--primary-color) !important;
        font-weight: 600 !important;
    }
    div[data-testid="stMetric"] > div:nth-child(1) {
        opacity: 0.8 !important;
    }
    </style>
    """,
    unsafe_allow_html=True
)

st.title("📊 Blueprint Task Dashboard")
st.caption("View and analyze raw task data with theme-adaptive quote analytics")


# Sidebar controls
with st.sidebar:
    st.header("🔧 Dashboard Controls")
    if st.button("🔄 Refresh Data", use_container_width=True):
        st.rerun()
    st.divider()
    st.subheader("📊 Stats")
    tasks = get_tasks()
    statuses = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]
    status_colors = {
        "To Do": "var(--primary-color)",
        "In Progress": "orange", 
        "Review": "gold",
        "Approval": "#ff8c00",
        "Done": "green",
        "On Hold": "gray",
        "Cancelled": "red"
    }
    for status in statuses:
        count = len([t for t in tasks if t["status"] == status])
        color = status_colors[status]
        st.markdown(f'<p style="margin: 5px 0; display: flex; align-items: center;"><span style="color: var(--primary-color); margin-right: 8px;">●</span> <strong>{status}:</strong> <span style="color: {color}; font-weight: 500;">{count}</span></p>', 
                   unsafe_allow_html=True)


# Helper function to convert quote string to float
def parse_quote(quote_str):
    if not isinstance(quote_str, str):
        return 0.0
    cleaned = quote_str.replace('$', '').replace(',', '')
    try:
        return float(cleaned)
    except ValueError:
        return 0.0


# Main dashboard content
tasks = get_tasks()

if not tasks:
    st.warning("No tasks found in the database.")
    st.info("Try syncing emails from the main Kanban board to generate some tasks.")
else:
    # Convert to DataFrame for better display
    df = pd.DataFrame(tasks)
    
    # Ensure quote_type and quote_assignee exist with defaults
    if 'quote_type' not in df.columns:
        df['quote_type'] = 'Not Set'
    if 'quote_assignee' not in df.columns:
        df['quote_assignee'] = 'Unassigned'
    
    # Add quote value column for charts
    df['quote_value'] = df['quote'].apply(parse_quote)
    
    # Reorder columns for clarity
    cols_order = [
        "_id", "title", "date", "assigned_to", "quote", "quote_value",
        "quote_type", "quote_assignee", "notes", "status", 
        "exchange_id", "created_at"
    ]
    existing_cols = [col for col in cols_order if col in df.columns]
    df = df[existing_cols]
    
    # Display the dataframe
    st.subheader("📋 Raw Task Data")
    st.dataframe(
        df,
        use_container_width=True,
        hide_index=True,
        column_config={
            "_id": "Task ID",
            "title": "Task Title",
            "date": "Due Date",
            "assigned_to": "Assigned To",
            "quote": "Quote Amount",
            "quote_value": "Quote Value ($)",
            "quote_type": "Quote Type",
            "quote_assignee": "Quote Assignee",
            "notes": "Notes",
            "status": "Status",
            "exchange_id": "Exchange ID",
            "created_at": "Created At"
        }
    )
    
    # Enhanced quote analytics section
    st.divider()
    st.subheader("💰 Quote Analytics Dashboard")
    
    # Summary statistics
    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("Total Quote Value", f"${df['quote_value'].sum():,.2f}")
    with col2:
        st.metric("Average Quote", f"${df['quote_value'].mean():,.2f}")
    with col3:
        st.metric("Highest Quote", f"${df['quote_value'].max():,.2f}")
    with col4:
        st.metric("Lowest Quote", f"${df['quote_value'].min():,.2f}")
    with col5:
        st.metric("Quote Tasks", f"{len(df[df['quote_value'] > 0])}")
    
    # Charts section - 2x2 grid
    chart_row1_col1, chart_row1_col2 = st.columns(2)
    chart_row2_col1, chart_row2_col2 = st.columns(2)
    
    with chart_row1_col1:
        # Quote Value by Type
        st.write("**💰 Total Quote Value by Type**")
        quote_type_data = df.groupby('quote_type')['quote_value'].sum()
        quote_type_df = quote_type_data.to_frame().T
        st.bar_chart(quote_type_df)
        
    with chart_row1_col2:
        # Task Count by Quote Type
        st.write("**📊 Task Distribution by Quote Type**")
        type_counts = df['quote_type'].value_counts()
        type_df = type_counts.to_frame().T
        st.bar_chart(type_df)
        
    with chart_row2_col1:
        # Quote Value Trend Over Time by Quote Type
        st.write("**📈 Quote Value Trend Over Time (by Type)**")
        df_temp = df.copy()
        df_temp['date_dt'] = pd.to_datetime(df_temp['date'])
        df_temp = df_temp.sort_values('date_dt')
        pivot_df = df_temp.pivot_table(
            index='date_dt', 
            columns='quote_type', 
            values='quote_value', 
            aggfunc='sum',
            fill_value=0
        )
        pivot_df = pivot_df.sort_index()
        st.line_chart(pivot_df)
        
    with chart_row2_col2:
        # Top Assignees by Quote Value
        st.write("**👥 Top 7 Assignees by Quote Value**")
        assignee_quote = df.groupby('assigned_to')['quote_value'].sum().reset_index()
        assignee_quote = assignee_quote.sort_values('quote_value', ascending=False).head(7)
        assignee_df = assignee_quote.set_index('assigned_to')['quote_value'].to_frame().T
        st.bar_chart(assignee_df)
    
    # Additional insights section
    st.divider()
    st.subheader("📈 Advanced Quote Insights")
    
    insight_row1_col1, insight_row1_col2 = st.columns(2)
    insight_row2_col1, insight_row2_col2 = st.columns(2)
    
    with insight_row1_col1:
        # Average Quote by Status
        st.write("**📊 Average Quote by Status**")
        status_quote = df.groupby('status')['quote_value'].mean().reset_index()
        status_quote = status_quote.sort_values('quote_value', ascending=False)
        status_df = status_quote.set_index('status')['quote_value'].to_frame().T
        st.bar_chart(status_df)
    
    with insight_row1_col2:
        # Quote Assignee Popularity
        st.write("**👤 Most Active Quote Assignees**")
        assignee_counts = df['quote_assignee'].value_counts().head(6)
        assignee_count_df = assignee_counts.to_frame().T
        st.bar_chart(assignee_count_df)
    
    with insight_row2_col1:
        # Quote Value Distribution
        st.write("**📊 Quote Value Distribution**")
        df['quote_bin'] = pd.cut(df['quote_value'], 
                                bins=[0, 1000, 5000, 10000, 25000, 50000, 100000],
                                labels=['$0-1K', '$1K-5K', '$5K-10K', '$10K-25K', '$25K-50K', '$50K+'])
        bin_counts = df['quote_bin'].value_counts().sort_index()
        bin_df = bin_counts.to_frame().T
        st.bar_chart(bin_df)
    
    with insight_row2_col2:
        # Status Distribution
        st.write("**🔵 Task Status Distribution**")
        status_counts = df['status'].value_counts()
        status_order = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]
        status_counts_ordered = status_counts.reindex([s for s in status_order if s in status_counts])
        status_chart_df = status_counts_ordered.to_frame().T
        st.bar_chart(status_chart_df)
    
    # Download button for CSV
    st.divider()
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Download Data as CSV",
        data=csv,
        file_name="blueprint_tasks.csv",
        mime="text/csv",
        use_container_width=True
    )
