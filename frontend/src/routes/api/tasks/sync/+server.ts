import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import axios from 'axios';
import OpenAI from 'openai';
import { MongoClient } from 'mongodb';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const POST: RequestHandler = async () => {
  const client = new MongoClient(process.env.MONGO_URI || 'mongodb://localhost:27017');
  try {
    await client.connect();
    const db = client.db(process.env.MONGO_DB_NAME || 'blueprint');
    
    // 1. Fetch from Graph API (reuse your logic)
    const token = await acquireGraphToken(); // Your auth logic here
    const messages = await axios.get('https://graph.microsoft.com/v1.0/me/messages', {
      headers: { Authorization: `Bearer ${token}` },
      params: { $top: 30, $orderby: 'receivedDateTime DESC' }
    });

    // 2. Parse & insert
    for (const msg of messages.data.value) {
      const exists = await db.collection('tasks').findOne({ exchange_id: msg.id });
      if (!exists) {
        const summary = await parseWithLLM(msg);
        await db.collection('tasks').insertOne({
          ...msg,
          description: summary,
          full_body: msg.body?.content || '',
          status: 'To Do',
          attachment_ids: [],
          notes: '',
          created_at: new Date().toISOString()
        });
      }
    }
    return json({ synced: messages.data.value.length });
  } finally {
    await client.close();
  }
};

async function acquireGraphToken() { /* Your MSAL logic */ }
async function parseWithLLM(msg: any) { /* Your OpenAI logic */ }