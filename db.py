# Blueprint/db.py
from pymongo import MongoClient
from bson import ObjectId
import os
from dotenv import load_dotenv
import logging

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB = os.getenv("MONGO_DB", "blueprint")
MONGO_COLLECTION = os.getenv("MONGO_COLLECTION", "tasks")

_client = MongoClient(MONGO_URI)
_db = _client[MONGO_DB]
_collection = _db[MONGO_COLLECTION]

def _task_document(task: dict) -> dict:
    doc = task.copy()
    if "_id" in doc and isinstance(doc["_id"], str):
        doc["_id"] = ObjectId(doc["_id"])
    return doc

def insert_task(task: dict) -> str:
    doc = _task_document(task)
    result = _collection.insert_one(doc)
    logger.info(f"Inserted task {result.inserted_id}")
    return str(result.inserted_id)

def get_tasks() -> list[dict]:
    tasks = []
    for doc in _collection.find():
        doc["_id"] = str(doc["_id"])
        tasks.append(doc)
    return tasks

def update_task_field(task_id: str, field: str, value) -> bool:
    result = _collection.update_one(
        {"_id": ObjectId(task_id)},
        {"$set": {field: value}}
    )
    logger.info(f"Updated task {task_id} field {field}: {result.modified_count} doc(s)")
    return result.modified_count > 0

def delete_task(task_id: str) -> bool:
    result = _collection.delete_one({"_id": ObjectId(task_id)})
    logger.info(f"Deleted task {task_id}: {result.deleted_count} doc(s)")
    return result.deleted_count > 0
