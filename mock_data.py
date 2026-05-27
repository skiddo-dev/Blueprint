# mock_data.py (PLACE THIS IN YOUR PROJECT ROOT)
import random
from datetime import datetime, timedelta

def generate_mock_tasks(statuses):
    """Generate mock tasks for development/testing"""
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
    
    tasks = []
    for i in range(25):
        title = random.choice(task_titles)
        description = random.choice(task_descriptions)
        quote_type = random.choice(quote_types)
        quote_person = random.choice(quote_people)
        assignee = random.choice(assignees)
        status = random.choice(statuses)
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
    return tasks