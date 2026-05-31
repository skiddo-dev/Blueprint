import os
import asyncio
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any
from datetime import datetime
from utils.db import tasks_collection, db
from utils.graph import acquire_graph_token, fetch_emails
from utils.llm import parse_email_with_llm

# 🟢 MOCK DATA FOR UI TESTING & FALLBACK
MOCK_TASKS = [
    {
        "_id": "mock_1",
        "title": "Kitchen Renovation Quote",
        "description": "Client needs estimate for new countertops and backsplash. Budget around $15k.",
        "full_body": "Full email body here...",
        "from": "John Doe",
        "sender_name": "John Doe",
        "sender_email": "john@example.com",
        "date": "2024-05-28",
        "assigned_to": "Mike",
        "quote": "$15,000",
        "notes": "",
        "status": "To Do",
        "exchange_id": "mock_1",
        "attachment_ids": [],
        "created_at": "2024-05-28T10:00:00Z"
    },
    {
        "_id": "mock_2",
        "title": "Bathroom Tile Repair",
        "description": "Cracked tiles in master bath. Needs immediate attention before inspection.",
        "full_body": "Full email body here...",
        "from": "Jane Smith",
        "sender_name": "Jane Smith",
        "sender_email": "jane@example.com",
        "date": "2024-05-29",
        "assigned_to": "Andrew",
        "quote": "$3,200",
        "notes": "",
        "status": "In Progress",
        "exchange_id": "mock_2",
        "attachment_ids": [],
        "created_at": "2024-05-29T14:30:00Z"
    }
]

app = FastAPI(title="Blueprint API", version="1.0.0")

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Vercel URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class TaskUpdate(BaseModel):
    field: str
    value: Any

@app.get("/api/tasks")
async def get_tasks(mock: bool = Query(False)):
    # 🟢 Return mock data if requested or if DB fails
    if mock:
        return MOCK_TASKS
    
    try:
        tasks = await tasks_collection.find().sort("created_at", -1).to_list(1000)
        return tasks
    except Exception as e:
        print(f"⚠️ DB error, falling back to mock: {e}")
        return MOCK_TASKS

@app.patch("/api/tasks/{task_id}")
async def update_task(task_id: str, update: TaskUpdate):
    try:
        result = await db.tasks.update_one(
            {"_id": task_id},
            {"$set": {update.field: update.value, "updated_at": datetime.utcnow().isoformat()}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/sync")
async def sync_emails():
    asyncio.create_task(background_sync())
    return {"status": "sync_started"}

async def background_sync():
    try:
        token = await acquire_graph_token()
        emails = await fetch_emails(token)
        synced = 0
        for email in emails:
            exists = await db.tasks.find_one({"exchange_id": email["id"]})
            if not exists:
                parsed = await parse_email_with_llm(email)
                new_task = {
                    "_id": str(datetime.utcnow().timestamp() * 1000)[:20] + email["id"][-8:],
                    "title": email.get("subject", "(no subject)"),
                    "description": parsed.get("summary", ""),
                    "full_body": email.get("body", {}).get("content", "") or email.get("bodyPreview", ""),
                    "from": email.get("from", {}).get("emailAddress", {}).get("name", "Unknown"),
                    "sender_name": email.get("from", {}).get("emailAddress", {}).get("name", ""),
                    "sender_email": email.get("from", {}).get("emailAddress", {}).get("address", ""),
                    "date": parsed.get("date"),
                    "assigned_to": parsed.get("assigned_to") or "Unassigned",
                    "quote": parsed.get("quote"),
                    "notes": "",
                    "status": "To Do",
                    "exchange_id": email["id"],
                    "attachment_ids": [],
                    "created_at": datetime.utcnow().isoformat()
                }
                await db.tasks.insert_one(new_task)
                synced += 1
        print(f"✅ Synced {synced} tasks")
    except Exception as e:
        print(f"❌ Sync error: {e}")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)