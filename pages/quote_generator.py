import streamlit as st
import os
from datetime import datetime
import random

# Configure page
st.set_page_config(page_title="Quote Generator", page_icon="💰", layout="centered")
st.title("💰 Quote Generator")
st.caption("Create new quote tasks for testing")

# Check if we're in mock mode (quote generation only works in mock mode)
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"
if not USE_MOCK:
    st.error("⚠️ Quote generation is only available in mock mode. Set USE_MOCK_DATA=true in your environment.")
    st.stop()

# Quote generation form
with st.form("quote_generator_form"):
    col1, col2 = st.columns(2)
    
    with col1:
        quote_type = st.selectbox(
            "Quote Type",
            ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair"],
            help="Select the type of quote to generate"
        )
        quote_person = st.selectbox(
            "Quote Person",
            ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady"],
            help="Select who is responsible for the quote"
        )
        assignee = st.selectbox(
            "Assignee",
            ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom"],
            help="Select who the task should be assigned to"
        )
    
    with col2:
        title = st.text_input(
            "Task Title",
            value="New Quote Task",
            help="Title for the generated task"
        )
        description = st.text_area(
            "Description",
            value="Generated quote task via Quote Generator",
            height=100,
            help="Description of the task"
        )
        notes = st.text_area(
            "Notes (Optional)",
            height=100,
            help="Additional notes for the task"
        )
    
    submitted = st.form_submit_button("✨ Generate Quote Task", type="primary", use_container_width=True)
    
    if submitted:
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
        
        # Set date to today
        task_date = datetime.now().strftime("%Y-%m-%d")
        
        # Create task object
        new_task = {
            "title": title,
            "description": description,
            "quote": quote_amount,
            "quote_type": quote_type,
            "quote_assignee": quote_person,
            "assigned_to": assignee,
            "notes": notes,
            "date": task_date,
            "status": "To Do",  # Default status for new tasks
            "exchange_id": f"quote_gen_{int(datetime.utcnow().timestamp())}",
            "created_at": datetime.utcnow().isoformat()
        }
        
        # Initialize session state if needed
        if 'mock_tasks' not in st.session_state:
            st.session_state.mock_tasks = []
        
        # Add task to session state
        new_task["_id"] = f"mock_{len(st.session_state.mock_tasks) + 1}_{int(datetime.utcnow().timestamp())}"
        st.session_state.mock_tasks.append(new_task)
        
        st.success("✅ Quote task generated successfully!")
        st.balloons()
        st.info("💡 Navigate back to the main Kanban board to see your new task")

# Add helpful information
with st.expander("ℹ️ How Quote Generation Works"):
    st.markdown("""
    - **Quote Types**: Different types generate different price ranges:
      - *assign Quote*: $5,000 - $50,000
      - *T&M*: $2,000 - $20,000
      - *Service Call*: $500 - $5,000
      - *Maintenance Request*: $1,000 - $10,000
      - *Emergency Repair*: $3,000 - $30,000
    - All generated tasks default to "To Do" status
    - Tasks appear immediately in the Kanban board when you return to the main page
    - Uses the same mock data system as the main application
    """)