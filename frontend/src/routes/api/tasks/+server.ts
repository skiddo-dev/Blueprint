import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { MongoClient } from 'mongodb';

const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
const dbName = process.env.MONGO_DB_NAME || 'blueprint';

export const GET: RequestHandler = async ({ url }) => {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    const tasks = await db.collection('tasks').find().toArray();
    return json(tasks);
  } finally {
    await client.close();
  }
};

export const PATCH: RequestHandler = async ({ request, params }) => {
  const { field, value } = await request.json();
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db(dbName);
    await db.collection('tasks').updateOne(
      { _id: params.id },
      { $set: { [field]: value, updated_at: new Date().toISOString() } }
    );
    return json({ success: true });
  } finally {
    await client.close();
  }
};