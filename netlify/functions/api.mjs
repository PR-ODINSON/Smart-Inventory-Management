/**
 * Netlify Serverless Function for Neelam Industries Inventory API
 *
 * Provides /api/health and /api/state endpoints to sync IndexedDB with MongoDB
 * on Netlify deployments.
 *
 * Set MONGODB_URI and MONGODB_DB_NAME in Netlify Environment Variables.
 */

import { MongoClient } from 'mongodb'
import {
  backupFromIndexedCollections,
  ensureEntityIndexes,
  indexBackupPayload,
} from '../../server/indexCollections.mjs'

const STATE_ID = 'current'
let cachedClient = null
let indexesReady = false

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Content-Type': 'application/json',
}

async function getDb() {
  const uri = process.env.MONGODB_URI
  const dbName = process.env.MONGODB_DB_NAME || 'inventory_db'

  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not configured in Netlify.')
  }

  if (!cachedClient) {
    cachedClient = new MongoClient(uri, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    })
    await cachedClient.connect()
  }

  const db = cachedClient.db(dbName)
  if (!indexesReady) {
    try {
      await ensureEntityIndexes(db)
      indexesReady = true
    } catch (e) {
      console.warn('Index creation warning:', e.message)
    }
  }
  return { db, dbName }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: CORS_HEADERS,
  })
}

/**
 * Standard Netlify Functions v2 handler
 */
export default async function handler(req) {
  const url = new URL(req.url)
  const pathname = url.pathname.replace(/^\/\.netlify\/functions\/api/, '').replace(/^\/api/, '')
  const method = req.method.toUpperCase()

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  // Health endpoint: /api/health or /health
  if (pathname === '/health' || pathname === '' && method === 'GET') {
    try {
      const { db, dbName } = await getDb()
      await db.command({ ping: 1 })
      const meta = await db.collection('sync_meta').findOne({ _id: STATE_ID })
      return jsonResponse({
        ok: true,
        database: dbName,
        storage: 'mongodb',
        indexedAt: meta?.indexedAt ?? null,
      })
    } catch (err) {
      return jsonResponse(
        { ok: false, error: err instanceof Error ? err.message : 'MongoDB unavailable' },
        503,
      )
    }
  }

  // State endpoint: /api/state or /state
  if (pathname === '/state') {
    if (method === 'GET') {
      try {
        const { db } = await getDb()
        const doc = await db.collection('app_state').findOne({ _id: STATE_ID })
        if (doc?.payload) {
          return jsonResponse(doc.payload)
        }
        const fromIndex = await backupFromIndexedCollections(db)
        if (!fromIndex) {
          return jsonResponse({ error: 'No cloud data yet. Push from the app or CLI first.' }, 404)
        }
        return jsonResponse(fromIndex)
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Failed to load cloud state' },
          500,
        )
      }
    }

    if (method === 'PUT') {
      try {
        const payload = await req.json()
        if (!payload || payload.version !== 1 || !Array.isArray(payload.materials)) {
          return jsonResponse({ error: 'Invalid backup payload (expected version 1).' }, 400)
        }
        const { db } = await getDb()
        const updatedAt = new Date().toISOString()
        await db.collection('app_state').replaceOne(
          { _id: STATE_ID },
          { _id: STATE_ID, payload, updatedAt },
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
        return jsonResponse({ ok: true, updatedAt, indexed: true })
      } catch (err) {
        return jsonResponse(
          { error: err instanceof Error ? err.message : 'Failed to save cloud state' },
          500,
        )
      }
    }
  }

  // Rebuild endpoint: /api/index/rebuild
  if (pathname === '/index/rebuild' && method === 'POST') {
    try {
      const { db } = await getDb()
      const doc = await db.collection('app_state').findOne({ _id: STATE_ID })
      if (!doc?.payload) {
        return jsonResponse({ error: 'No app_state snapshot to index.' }, 404)
      }
      await indexBackupPayload(db, doc.payload)
      return jsonResponse({ ok: true, indexedAt: new Date().toISOString() })
    } catch (err) {
      return jsonResponse({ error: err instanceof Error ? err.message : 'Rebuild failed' }, 500)
    }
  }

  return jsonResponse({ error: `Not found: ${method} ${pathname}` }, 404)
}
