import 'dotenv/config';
import { MongoClient } from 'mongodb';
import express from 'express';
import cors from 'cors';

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

const app = express();
app.use(cors());
app.use(express.json());

let repsCollection;

async function getRepsCollection() {
  if (!repsCollection) {
    await client.connect();
    const db = client.db('user_data');
    repsCollection = db.collection('front_raise_reps');
  }
  return repsCollection;
}

function formatSession(doc) {
  const rawDate = doc.startedAt || doc.createdAt || doc.updatedAt || new Date();
  const dateObj = new Date(rawDate);

  return {
    id: doc._id,
    sessionId: doc.sessionId,
    patientName: doc.patientName || doc.userName || 'Anonymous Patient',
    exercise: doc.exercise || 'front_raises',
    reps: doc.reps ?? 0,
    status: doc.status || 'active',
    sessionDate: dateObj.toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }),
    startedAt: doc.startedAt || doc.createdAt || null,
    endedAt: doc.endedAt || null,
  };
}

// Save or update a patient session
app.post('/api/reps', async (req, res) => {
  try {
    const {
      sessionId,
      patientName,
      userName,
      reps,
      exercise = 'front_raises',
      status = 'active',
      endedAt = null,
    } = req.body;

    const cleanName = (patientName ?? userName ?? '').toString().trim();

    if (!sessionId || typeof reps !== 'number') {
      return res.status(400).json({ error: 'sessionId and numeric reps are required' });
    }

    const collection = await getRepsCollection();
    const now = new Date();

    const setFields = {
      patientName: cleanName || 'Anonymous Patient',
      userName: cleanName || 'Anonymous Patient',
      exercise,
      reps,
      status,
      updatedAt: now,
    };

    if (status === 'completed') {
      setFields.endedAt = endedAt ? new Date(endedAt) : now;
    } else if (status === 'active') {
      setFields.endedAt = null;
    }

    const result = await collection.findOneAndUpdate(
      { sessionId },
      {
        $set: setFields,
        $setOnInsert: {
          sessionId,
          startedAt: now,
          createdAt: now,
        },
      },
      { upsert: true, returnDocument: 'after' }
    );

    res.status(200).json(result);
  } catch (err) {
    console.error('POST /api/reps error:', err);
    res.status(500).json({ error: 'Failed to save session reps' });
  }
});

// JSON endpoint for React / API clients
app.get('/api/reps', async (req, res) => {
  try {
    const collection = await getRepsCollection();
    const records = await collection
      .find({})
      .sort({ startedAt: -1, updatedAt: -1 })
      .limit(50)
      .toArray();

    res.json(records.map(formatSession));
  } catch (err) {
    console.error('GET /api/reps error:', err);
    res.status(500).json({ error: 'Failed to fetch reps' });
  }
});

// Clean HTML dashboard for the physiotherapist at http://localhost:5001
app.get('/', async (req, res) => {
  try {
    const collection = await getRepsCollection();
    const records = await collection
      .find({})
      .sort({ startedAt: -1, updatedAt: -1 })
      .limit(50)
      .toArray();

    const rows = records
      .map((doc) => {
        const s = formatSession(doc);
        const safeName = String(s.patientName)
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>');
        return `
          <tr>
            <td>${safeName}</td>
            <td><strong>${s.reps}</strong></td>
            <td>${s.sessionDate}</td>
            <td><span class="badge ${s.status}">${s.status}</span></td>
          </tr>
        `;
      })
      .join('');

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="refresh" content="3" />
  <title>Physiotherapist Session Log</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      margin: 0;
      padding: 2rem;
    }
    .card {
      max-width: 760px;
      margin: 0 auto;
      background: #1e293b;
      border-radius: 12px;
      padding: 1.5rem 2rem;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    }
    h1 {
      margin: 0 0 0.25rem;
      font-size: 1.5rem;
    }
    p.sub {
      margin: 0 0 1.25rem;
      color: #94a3b8;
      font-size: 0.9rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 0.75rem 0.6rem;
      border-bottom: 1px solid #334155;
    }
    th {
      color: #94a3b8;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .badge {
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: capitalize;
    }
    .badge.active {
      background: rgba(34, 197, 94, 0.18);
      color: #4ade80;
    }
    .badge.completed {
      background: rgba(56, 189, 248, 0.18);
      color: #38bdf8;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Physiotherapist Session Log</h1>
    <p class="sub">Front Raises • Auto-refreshes every 3 seconds</p>
    <table>
      <thead>
        <tr>
          <th>Patient</th>
          <th>Reps</th>
          <th>Date</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4">No sessions recorded yet.</td></tr>'}
      </tbody>
    </table>
  </div>
</body>
</html>`);
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Failed to load session dashboard');
  }
});

const port = process.env.PORT || 5001;
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});