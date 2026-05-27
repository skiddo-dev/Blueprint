# Blueprint/db.py
import streamlit as st
from pymongo import MongoClient
from pymongo.errors import ServerSelectionTimeoutError, ConnectionFailure
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta  # FIXED: Added timedelta import
import logging

# Load environment variables (safe to call multiple times)
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ======================
# MOCK DATA MODE SETUP
# ======================
USE_MOCK = os.getenv("USE_MOCK_DATA", "false").lower() == "true"

# First, define placeholder functions at module level
# This guarantees they exist regardless of which code path executes
def get_tasks(): 
    """Placeholder - will be overridden based on mode"""
    pass

def insert_task(task): 
    """Placeholder - will be overridden based on mode"""
    pass

def update_task_field(task_id, field, value): 
    """Placeholder - will be overridden based on mode"""
    pass

def delete_task(task_id): 
    """Placeholder - will be overridden based on mode"""
    pass

# Mock data generation function (shared between modes when needed)
def _generate_mock_tasks():
    """Generate consistent 35-task mock data"""
    import random
    
    # Configuration arrays
    quote_types = ["assign Quote", "T&M", "Service Call", "Maintenance Request", "Emergency Repair", "Inspection Fee"]
    quote_people = ["Bob", "Ben", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Dean", "Vickie", "Sarah"]
    assignees = ["Unassigned", "Andrew", "Mike", "Riley", "Kris", "Bogdan", "Ady", "Frank Crew", "Bob", "Dean", "Vickie", "Sarah", "Tom", "Lisa"]
    statuses = ["To Do", "In Progress", "Review", "Approval", "Done", "On Hold", "Cancelled"]
    
    # Task templates (25 unique combinations)
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
        ("Final Invoice Generated", "Roof membrane replacement", "Verify paint adhesion"),
        ("Project Closeout Meeting", "Interior demolition work", "Verify concrete slump test"),
        ("Safety Audit Conducted", "Structural engineering review", "Check electrical conduit fill"),
        ("Environmental Compliance Check", "Plumbing fixture upgrades", "Verify HVAC airflow measurements")
    ]
    
    # Generate 35 tasks with varied data
    tasks = []
    for i in range(1, 36):
        # Select random template (with repetition to get 35 tasks)
        title, desc, notes = random.choice(templates)
        
        # Random dates - FIXED: Using imported timedelta
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

# ======================
# MODE-SPECIFIC IMPLEMENTATIONS
# ======================
if USE_MOCK:
    # Mock database functions (using Streamlit session state)
    def get_tasks():
        if 'mock_tasks' not in st.session_state:
            st.session_state.mock_tasks = _generate_mock_tasks()
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
    # Real mode: Attempt MongoDB connection
    try:
        # Get MongoDB URI from environment (with fallback for local development)
        MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017/")
        DB_NAME = os.getenv("MONGODB_DB_NAME", "blueprint")
        COLLECTION_NAME = os.getenv("MONGODB_COLLECTION", "tasks")
        
        # Initialize MongoDB client with timeout settings
        client = MongoClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,  # 5 second timeout for server selection
            connectTimeoutMS=10000,         # 10 second connection timeout
            socketTimeoutMS=20000           # 20 second socket timeout
        )
        
        # Verify connection
        client.admin.command('ismaster')
        db = client[DB_NAME]
        collection = db[COLLECTION_NAME]
        logger.info(f"Successfully connected to MongoDB: {MONGODB_URI}")
        
        # Real database functions
        def get_tasks():
            try:
                tasks = list(collection.find({}, {"_id": 1, "title": 1, "description": 1, "quote": 1, 
                                              "assigned_to": 1, "notes": 1, "date": 1, "status": 1, 
                                              "exchange_id": 1, "created_at": 1}))
                # Convert ObjectId to string for JSON serialization
                for task in tasks:
                    task["_id"] = str(task["_id"])
                return tasks
            except Exception as e:
                logger.error(f"Error fetching tasks: {str(e)}")
                st.error(f"❌ Database error: {str(e)}")
                return []

        def insert_task(task):
            try:
                # Remove _id if present (let MongoDB generate it)
                if "_id" in task:
                    del task["_id"]
                result = collection.insert_one(task)
                return str(result.inserted_id)
            except Exception as e:
                logger.error(f"Error inserting task: {str(e)}")
                st.error(f"❌ Database error: {str(e)}")
                return None

        def update_task_field(task_id, field, value):
            try:
                from bson import ObjectId
                result = collection.update_one(
                    {"_id": ObjectId(task_id)},
                    {"$set": {field: value}}
                )
                return result.modified_count > 0
            except Exception as e:
                logger.error(f"Error updating task: {str(e)}")
                st.error(f"❌ Database error: {str(e)}")
                return False

        def delete_task(task_id):
            try:
                from bson import ObjectId
                result = collection.delete_one({"_id": ObjectId(task_id)})
                return result.deleted_count > 0
            except Exception as e:
                logger.error(f"Error deleting task: {str(e)}")
                st.error(f"❌ Database error: {str(e)}")
                return False
                
    except Exception as e:  # Catch ANY error during MongoDB setup
        logger.error(f"Failed to set up MongoDB: {str(e)}")
        st.error(f"❌ Cannot connect to MongoDB: {str(e)}")
        st.info("💡 Tip: For local testing without MongoDB, set USE_MOCK=true in Streamlit Secrets or .env")
        
        # Fallback to mock data (overrides the placeholder functions)
        def get_tasks():
            if 'mock_tasks' not in st.session_state:
                st.session_state.mock_tasks = _generate_mock_tasks()
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
