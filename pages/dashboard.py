# Blueprint/pages/dashboard.py
import streamlit as st
from dotenv import load_dotenv
load_dotenv()                  
import streamlit as st
from datetime import datetime, timedelta
import logging
from typing import List, Dict
import os
import pandas as pd
import numpy as np


# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"


if USE_MOCK:
    # Mock database functions (using Streamlit session state)
    def get_tasks():
        if 'mock_tasks' not in st.session_state:
            # Enhanced mock data with more variety for colorful charts
            quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair", "Inspection Fee"]
            quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Dean", "Vickie", "Sarah"]
            assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom", "Lisa"]
            statuses = ["To Do", "In Progress", "Done", "On Hold", "Cancelled"]
            task_titles = [
                "Site Inspection Required", "Equipment Delivery Scheduled", "Permit Application Submitted",
                "Safety Review Completed", "Budget Approval Pending", "Vendor Meeting Scheduled",
                "Quality Check Performed", "Timeline Update Needed", "Material Shortage Alert",
                "Weather Delay Notice", "Change Order Request", "Invoice Dispute Resolution",
                "Staff Training Required", "Utility Coordination", "Foundation Pour Scheduled",
                "Electrical Rough-In Complete", "Plumbing Inspection Passed", "HVAC Installation",
                "Roofing Materials Delivered", "Flooring Installation Started", "Painting Prep Work",
                "Final Walkthrough Scheduled", "Client Presentation Prepared", "As-Built Drawings Updated",
                "Warranty Registration Filed", "Final Invoice Generated", "Project Closeout Meeting",
                "Safety Audit Conducted", "Environmental Compliance Check", "Accessibility Review"
            ]
            
            descriptions = [
                "Requires immediate attention from site supervisor",
                "Pending approval from project manager",
                "Awaiting client feedback before proceeding",
                "Scheduled for next week's work window",
                "On hold due to material availability",
                "Completed ahead of schedule",
                "Requires rework due to quality issues",
                "Budget variance needs explanation",
                "Client requested additional features",
                "Regulatory update affects timeline",
                "Vendor performance review needed",
                "Weather contingency plan activated",
                "Subcontractor coordination meeting",
                "Material delivery tracking required",
                "Safety incident investigation",
                "Quality assurance documentation",
                "Change order pricing negotiation",
                "Final inspection scheduling",
                "Client satisfaction survey",
                "Post-project cleanup coordination"
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
            
            # Generate 35 varied tasks for rich visualizations
            import random
            tasks = []
            for i in range(1, 36):
                # Random date within last 9 months for better time distribution
                days_ago = random.randint(0, 270)
                task_date = (datetime.now() - timedelta(days=days_ago)).strftime("%Y-%m-%d")
                
                # Random creation date within last 2 months
                created_days_ago = random.randint(0, 60)
                created_at = (datetime.now() - timedelta(days=created_days_ago)).isoformat()
                
                # Select random elements
                title = random.choice(task_titles)
                description = random.choice(descriptions)
                quote_type = random.choice(quote_types)
                quote_person = random.choice(quote_people)
                assignee = random.choice(assignees)
                status = random.choice(statuses)
                notes = random.choice(notes_templates)
                
                # Generate quote amount based on type with realistic ranges
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
                    "exchange_id": f"mock_exchange_{i:03d}_{int(datetime.utcnow().timestamp())}",
                    "created_at": created_at
                }
                tasks.append(task)
            
            st.session_state.mock_tasks = tasks
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
    layout="wide"
)

st.title("📊 Blueprint Task Dashboard")
st.caption("View and analyze raw task data with enhanced quote analytics")


# Sidebar navigation (auto-generated by Streamlit for multi-page apps)
# We'll add a refresh button here instead
with st.sidebar:
    st.header("🔧 Dashboard Controls")
    if st.button("🔄 Refresh Data", use_container_width=True):
        st.rerun()
    st.divider()
    st.subheader("📊 Stats")
    tasks = get_tasks()
    st.metric("Total Tasks", len(tasks))
    st.metric("To Do", len([t for t in tasks if t["status"] == "To Do"]))
    st.metric("In Progress", len([t for t in tasks if t["status"] == "In Progress"]))
    st.metric("Done", len([t for t in tasks if t["status"] == "Done"]))
    st.metric("On Hold", len([t for t in tasks if t["status"] == "On Hold"]))
    st.metric("Cancelled", len([t for t in tasks if t["status"] == "Cancelled"]))


# Helper function to convert quote string to float
def parse_quote(quote_str):
    if not isinstance(quote_str, str):
        return 0.0
    # Remove $ and commas, then convert to float
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
    
    # Ensure quote_type and quote_assignee exist with defaults (for compatibility)
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
    
    # Only include columns that exist in the data
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
    
    # Enhanced quote analytics section with more visualizations
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
    
    # Charts section - 2x2 grid for better organization
    chart_row1_col1, chart_row1_col2 = st.columns(2)
    chart_row2_col1, chart_row2_col2 = st.columns(2)
    
    with chart_row1_col1:
        # Quote Value by Type (Horizontal Bar Chart for better readability)
        st.write("**💰 Total Quote Value by Type**")
        quote_type_data = df.groupby('quote_type')['quote_value'].sum().reset_index()
        quote_type_data = quote_type_data.sort_values('quote_value', ascending=True)  # Ascending for horizontal bar
        st.bar_chart(quote_type_data.set_index('quote_type')['quote_value'])
        
    with chart_row1_col2:
        # Task Count by Quote Type (Pie Chart Alternative)
        st.write("**📊 Task Distribution by Quote Type**")
        type_counts = df['quote_type'].value_counts()
        st.bar_chart(type_counts)  # Using bar chart as Streamlit doesn't have native pie
        
    with chart_row2_col1:
        # Quote Value Trend Over Time (Area Chart)
        st.write("**📈 Quote Value Trend Over Time**")
        # Convert date to datetime for sorting
        df_temp = df.copy()
        df_temp['date_dt'] = pd.to_datetime(df_temp['date'])
        df_temp = df_temp.sort_values('date_dt')
        # Create time series
        time_series = df_temp.set_index('date_dt')['quote_value']
        st.area_chart(time_series)
        
    with chart_row2_col2:
        # Top Assignees by Quote Value
        st.write("**👥 Top 7 Assignees by Quote Value**")
        assignee_quote = df.groupby('assigned_to')['quote_value'].sum().reset_index()
        assignee_quote = assignee_quote.sort_values('quote_value', ascending=False).head(7)
        st.bar_chart(assignee_quote.set_index('assigned_to')['quote_value'])
    
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
        st.bar_chart(status_quote.set_index('status')['quote_value'])
    
    with insight_row1_col2:
        # Quote Assignee Popularity
        st.write("**👤 Most Active Quote Assignees**")
        assignee_counts = df['quote_assignee'].value_counts().head(6)
        st.bar_chart(assignee_counts)
    
    with insight_row2_col1:
        # Quote Value Distribution (Histogram Alternative)
        st.write("**📊 Quote Value Distribution**")
        # Create bins for quote values
        df['quote_bin'] = pd.cut(df['quote_value'], 
                                bins=[0, 1000, 5000, 10000, 25000, 50000, 100000],
                                labels=['$0-1K', '$1K-5K', '$5K-10K', '$10K-25K', '$25K-50K', '$50K+'])
        bin_counts = df['quote_bin'].value_counts().sort_index()
        st.bar_chart(bin_counts)
    
    with insight_row2_col2:
        # Status vs Quote Type Heatmap Alternative
        st.write("**🔥 Status vs Quote Type Matrix**")
        # Create pivot table for heatmap-like view
        pivot_data = df.groupby(['status', 'quote_type']).size().reset_index(name='count')
        # Show as dataframe since Streamlit doesn't have native heatmap
        st.dataframe(
            pivot_data.pivot(index='status', columns='quote_type', values='count').fillna(0).astype(int),
            use_container_width=True
        )
    
    # Download button for CSV
    csv = df.to_csv(index=False).encode('utf-8')
    st.download_button(
        label="📥 Download Data as CSV",
        data=csv,
        file_name="blueprint_tasks.csv",
        mime="text/csv",
        use_container_width=True
    )
