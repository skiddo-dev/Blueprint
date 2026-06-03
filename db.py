import os
import uuid
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure

logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGODB_URI") or os.getenv("MONGO_URI", "mongodb://localhost:27017/")
DB_NAME = os.getenv("MONGO_DB_NAME", "blueprint")

client = None
db = None


def _get_db():
    global client, db
    if client is None:
        try:
            client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
            client.admin.command('ping')
            db = client[DB_NAME]
            logger.info("✅ Successfully connected to MongoDB")
        except Exception as e:
            logger.error(f"❌ MongoDB connection failed: {e}")
            client = None  # reset so the next call retries instead of returning None
            raise
    return db


def get_tasks() -> List[Dict[str, Any]]:
    db = _get_db()
    tasks = list(db.tasks.find().sort("created_at", -1))
    for task in tasks:
        task["_id"] = str(task["_id"])
        task["attachment_ids"] = [str(aid) for aid in task.get("attachment_ids", [])]
    return tasks


def get_tasks_for_user(user_name: str) -> List[Dict[str, Any]]:
    """Tasks visible to a PM: those assigned to them or created by them."""
    db = _get_db()
    tasks = list(db.tasks.find({
        "$or": [{"assigned_to": user_name}, {"created_by": user_name}]
    }).sort("created_at", -1))
    for task in tasks:
        task["_id"] = str(task["_id"])
        task["attachment_ids"] = [str(aid) for aid in task.get("attachment_ids", [])]
    return tasks


def get_tasks_signature() -> tuple:
    """(count, latest updated_at) — a cheap change-detector so a watcher can tell if
    any session inserted/edited/deleted a task without fetching every document.
    update_task_field/insert_task already stamp updated_at; delete changes count."""
    db = _get_db()
    count = db.tasks.count_documents({})
    latest = db.tasks.find_one(sort=[("updated_at", -1)], projection={"updated_at": 1})
    return (count, latest.get("updated_at") if latest else None)


def insert_task(task: Dict[str, Any]) -> str:
    db = _get_db()
    if "_id" not in task:
        task["_id"] = str(uuid.uuid4())
    task.setdefault("created_at", datetime.utcnow().isoformat())
    task["updated_at"] = datetime.utcnow().isoformat()
    task["attachment_ids"] = task.get("attachment_ids", [])
    db.tasks.insert_one(task)
    return task["_id"]


def update_task_field(task_id: str, field: str, value: Any) -> bool:
    db = _get_db()
    result = db.tasks.update_one(
        {"_id": task_id},
        {"$set": {field: value, "updated_at": datetime.utcnow().isoformat()}}
    )
    return result.modified_count > 0


def delete_task(task_id: str) -> bool:
    db = _get_db()
    db.attachments.delete_many({"task_id": task_id})
    result = db.tasks.delete_one({"_id": task_id})
    return result.deleted_count > 0


def save_attachment(task_id: str, filename: str, content: bytes, size: int, content_type: str) -> str:
    db = _get_db()
    att_id = str(uuid.uuid4())
    db.attachments.insert_one({
        "_id": att_id,
        "task_id": task_id,
        "filename": filename,
        "size": size,
        "content_type": content_type,
        "data": content
    })
    db.tasks.update_one(
        {"_id": task_id},
        {"$push": {"attachment_ids": att_id}}
    )
    return att_id


def get_attachment(attachment_id: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    att = db.attachments.find_one({"_id": attachment_id})
    if att:
        att["_id"] = str(att["_id"])
    return att


def delete_attachment(attachment_id: str) -> bool:
    db = _get_db()
    result = db.attachments.delete_one({"_id": attachment_id})
    return result.deleted_count > 0


# ========================
# USERS / ROLES
# ========================
# Email (lowercased) is the natural unique key, so it's used as _id.

def get_user(email: str) -> Optional[Dict[str, Any]]:
    db = _get_db()
    return db.users.find_one({"_id": email.lower()})


def get_user_role(email: str) -> Optional[str]:
    doc = get_user(email)
    return doc.get("role") if doc else None


def list_users() -> List[Dict[str, Any]]:
    db = _get_db()
    return list(db.users.find().sort("_id", 1))


def list_users_by_role(role: str) -> List[Dict[str, Any]]:
    db = _get_db()
    return list(db.users.find({"role": role}).sort("name", 1))


def upsert_user(email: str, role: str, name: str = "") -> None:
    db = _get_db()
    db.users.update_one(
        {"_id": email.lower()},
        {"$set": {"role": role, "name": name, "updated_at": datetime.utcnow().isoformat()}},
        upsert=True,
    )


def delete_user(email: str) -> bool:
    db = _get_db()
    result = db.users.delete_one({"_id": email.lower()})
    return result.deleted_count > 0
