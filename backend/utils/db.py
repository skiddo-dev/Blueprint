# backend/utils/db.py
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv("MONGO_URI", "mongodb://localhost:27017")
DB_NAME = os.getenv("MONGO_DB_NAME", "blueprint")

# Global connection (This fixes the generator error)
client = AsyncIOMotorClient(MONGO_URI, serverSelectionTimeoutMS=5000)
db = client[DB_NAME]
tasks_collection = db["tasks"]