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

function formatDuration(totalSecs) {
  if (typeof totalSecs !== 'number' || Number.isNaN(totalSecs) || totalSecs < 0) {
    return '—';
  }
  const wholeSecs = Math.floor(totalSecs);
  const m = Math.floor(wholeSecs / 60);
  const s = wholeSecs % 60;
  return `${m} min ${s} s`;
}

function resolveElapsedSeconds(doc) {
  if (typeof doc.elapsedSeconds === 'number' && !Number.isNaN(doc.elapsedSeconds)) {
    return Math.max(0, Math.floor(doc.elapsedSeconds));
  }
  const start = doc.startedAt || doc.createdAt;
  const end = doc.endedAt || doc.updatedAt;
  if (start && end) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs >= startMs) {
      return Math.floor((endMs - startMs) / 1000);
    }
  }
  return null;
}

function formatSession(doc) {
  const rawDate = doc.startedAt || doc.createdAt || doc.updatedAt || new Date();
  const dateObj = new Date(rawDate);
  const elapsedSeconds = resolveElapsedSeconds(doc);
  const durationFormatted =
    typeof doc.durationFormatted === 'string' && doc.durationFormatted.trim()
      ? doc.durationFormatted.trim()
      : elapsedSeconds !== null
        ? formatDuration(elapsedSeconds)
        : '—';

  return {
    id: doc._id,
    sessionId: doc.sessionId,
    patientName: doc.patientName || doc.userName || 'Anonymous Patient',
    exercise: doc.exercise || 'front_raises',
    reps: doc.reps ?? 0,
    elapsedSeconds,
    durationFormatted,
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
      elapsedSeconds,
      durationFormatted,
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

    const parsedElapsed =
      typeof elapsedSeconds === 'number' && !Number.isNaN(elapsedSeconds)
        ? Math.max(0, Math.floor(elapsedSeconds))
        : undefined;

    const setFields = {
      patientName: cleanName || 'Anonymous Patient',
      userName: cleanName || 'Anonymous Patient',
      exercise,
      reps,
      status,
      updatedAt: now,
    };

    if (parsedElapsed !== undefined) {
      setFields.elapsedSeconds = parsedElapsed;
      setFields.durationFormatted =
        typeof durationFormatted === 'string' && durationFormatted.trim()
          ? durationFormatted.trim()
          : formatDuration(parsedElapsed);
    }

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
        const safeExercise = String(s.exercise)
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>')
          .replace(/_/g, ' ');
        const safeTime = String(s.durationFormatted)
          .replace(/&/g, '&')
          .replace(/</g, '<')
          .replace(/>/g, '>');
        const statusLabel = s.status === 'completed' ? 'Completed' : 'Active';

        return `
          <tr>
            <td><strong>${safeName}</strong></td>
            <td class="exercise-col">${safeExercise}</td>
            <td class="reps-col">${s.reps}</td>
            <td class="time-col">${safeTime}</td>
            <td>${s.sessionDate}</td>
            <td><span class="badge ${s.status}">${statusLabel}</span></td>
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
  <title>Just Exercise! — Physiotherapist Session Log</title>
  <style>
    * {
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #FAF9F7;
      color: #1C1B1F;
      margin: 0;
      padding: 0;
    }
    .topbar {
      background: #FFFFFF;
      border-bottom: 1px solid #E5E7EB;
      padding: 0 2rem;
      height: 4rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      font-size: 1.25rem;
      font-weight: 800;
      color: #000000;
      letter-spacing: -0.02em;
    }
    .pill {
      background: #EFEBF9;
      color: #4A2E96;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
    }
    .container {
      max-width: 960px;
      margin: 2rem auto;
      padding: 0 1.5rem;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #E5E7EB;
      border-radius: 1.25rem;
      padding: 1.75rem 2rem;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
    }
    .header-row {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.5rem;
      margin-bottom: 1.25rem;
    }
    h1 {
      margin: 0;
      font-size: 1.65rem;
      font-weight: 800;
      color: #111827;
      letter-spacing: -0.02em;
    }
    p.sub {
      margin: 0.25rem 0 0;
      color: #6B7280;
      font-size: 0.85rem;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      text-align: left;
      padding: 0.85rem 0.75rem;
      border-bottom: 1px solid #F3F4F6;
      font-size: 0.9rem;
    }
    th {
      color: #6B7280;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #E5E7EB;
    }
    tbody tr:hover {
      background: #FAF9F7;
    }
    .exercise-col {
      text-transform: capitalize;
      color: #374151;
    }
    .reps-col {
      font-weight: 800;
      color: #6342B3;
    }
    .time-col {
      font-weight: 600;
      color: #1F2937;
    }
    .badge {
      display: inline-block;
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
    }
    .badge.active {
      background: #ECFDF5;
      color: #047857;
      border: 1px solid #A7F3D0;
    }
    .badge.completed {
      background: #EFEBF9;
      color: #4A2E96;
    }
    .empty {
      background: #FAF9F7;
      border: 1px dashed #D1D5DB;
      border-radius: 0.85rem;
      padding: 1.5rem;
      text-align: center;
      color: #4B5563;
      font-size: 0.9rem;
    }
  </style>
</head>
<body>
  <header class="topbar">
    <span class="brand">Just Exercise!</span>
    <span class="pill">Live • Auto-refreshing (3s)</span>
  </header>
  <main class="container">
    <div class="card">
      <div class="header-row">
        <div>
          <h1>Physiotherapist Session Log</h1>
          <p class="sub">MongoDB (user_data.front_raise_reps) • Real-time rep & duration tracking</p>
        </div>
      </div>
      ${
        rows
          ? `<table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Exercise</th>
                  <th>Reps</th>
                  <th>Time</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>`
          : `<div class="empty">No patient sessions recorded yet.</div>`
      }
    </div>
  </main>
</body>
</html>`);
  } catch (err) {
    console.error('GET / error:', err);
    res.status(500).send('Failed to load session dashboard');
  }
});

const port = process.env.PORT || 5001;
const server = app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

server.on('error', (err) => {
  console.error('Failed to start server:', err);
});