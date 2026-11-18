import 'dotenv/config';
import { MongoClient } from 'mongodb';
import express from 'express';
import cors from 'cors';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

const app = express();
app.use(cors());
app.use(expresss.json());

let messagesCollection;
async function getMessagesCollection() {
  if (!messagesCollection) {
    await client.connect();
    const db = client.db('user_data');
    messagesCollection = db.collection('messages');
  }
  return messagesCollection;
}

// 1. Receive user input and save it to MongoDB
app.post('/api/messages', async (req, res) => {
  try {
    const { sender, text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const collection = await getMessagesCollection();
    const doc = {
      sender: sender?.trim() || 'Anonymous',
      text: text.trim(),
      createdAt: new Date(),
    };

    const result = await collection.insertOne(doc);
    res.status(201).json({ _id: result.insertedId, ...doc });
  } catch (err) {
    console.error('POST /api/messages error:', err);
    res.status(500).json({ error: 'Failed to save message' });
  }
});

// 2. Fetch saved messages so another user can see them
app.get('/api/messages', async (req, res) => {
  try {
    const collection = await getMessagesCollection();
    const messages = await collection
      .find({})
      .sort({ createdAt: -1 }) // newest first
      .limit(50)
      .toArray();

    res.json(messages);
  } catch (err) {
    console.error('GET /api/messages error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});