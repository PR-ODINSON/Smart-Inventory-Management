import cors from 'cors'
import express from 'express'
import { MongoClient } from 'mongodb'
import {
  backupFromIndexedCollections,
  ensureEntityIndexes,
  indexBackupPayload,
} from './indexCollections.mjs'

const PORT = Number(process.env.PORT || 3001)
const uri = process.env.MONGODB_URI
const dbName = process.env.MONGODB_DB_NAME || 'neelam_inventory'
const STATE_ID = 'current'

if (!uri) {
  console.error('MONGODB_URI is not set. Add it to .env (server-only, never VITE_).')
  process.exit(1)
}

const client = new MongoClient(uri)
let connected = false
let indexesReady = false

async function getDb() {
  if (!connected) {
    await client.connect()
    connected = true
  }
  const db = client.db(dbName)
  if (!indexesReady) {
    await ensureEntityIndexes(db)
    indexesReady = true
    console.log('MongoDB entity indexes ensured.')
  }
  return db
}

const app = express()
app.use(cors())
app.use(express.json({ limit: '25mb' }))

app.get('/api/health', async (_req, res) => {
  try {
    const db = await getDb()
    await db.command({ ping: 1 })
    const meta = await db.collection('sync_meta').findOne({ _id: 'current' })
    res.json({
      ok: true,
      database: dbName,
      storage: 'mongodb',
      indexedAt: meta?.indexedAt ?? null,
    })
  } catch (err) {
    res.status(503).json({
      ok: false,
      error: err instanceof Error ? err.message : 'MongoDB unavailable',
    })
  }
})

app.get('/api/state', async (_req, res) => {
  try {
    const db = await getDb()
    const doc = await db.collection('app_state').findOne({ _id: STATE_ID })
    if (doc?.payload) {
      return res.json(doc.payload)
    }
    const fromIndex = await backupFromIndexedCollections(db)
    if (!fromIndex) {
      return res.status(404).json({ error: 'No cloud data yet. Push from the app first.' })
    }
    res.json(fromIndex)
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load state',
    })
  }
})

app.put('/api/state', async (req, res) => {
  try {
    const payload = req.body
    if (!payload || payload.version !== 1 || !Array.isArray(payload.materials)) {
      return res.status(400).json({ error: 'Invalid backup payload (expected version 1).' })
    }
    const db = await getDb()
    const updatedAt = new Date().toISOString()
    await db.collection('app_state').replaceOne(
      { _id: STATE_ID },
      {
        _id: STATE_ID,
        payload,
        updatedAt,
      },
      { upsert: true },
    )
    if (payload.settings) {
      await db.collection('app_settings').replaceOne(
        { _id: 'app' },
        { _id: 'app', payload: payload.settings, updatedAt },
        { upsert: true },
      )
    }
    await indexBackupPayload(db, payload)
    res.json({ ok: true, updatedAt, indexed: true })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to save state',
    })
  }
})

app.post('/api/index/rebuild', async (_req, res) => {
  try {
    const db = await getDb()
    const doc = await db.collection('app_state').findOne({ _id: STATE_ID })
    if (!doc?.payload) {
      return res.status(404).json({ error: 'No app_state snapshot to index.' })
    }
    await indexBackupPayload(db, doc.payload)
    res.json({ ok: true, indexedAt: new Date().toISOString() })
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Rebuild failed',
    })
  }
})

app.listen(PORT, () => {
  console.log(`Neelam inventory API listening on http://localhost:${PORT}`)
})

process.on('SIGINT', async () => {
  await client.close().catch(() => {})
  process.exit(0)
})
