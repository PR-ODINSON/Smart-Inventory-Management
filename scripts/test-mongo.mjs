/**
 * MongoDB Connection Tester
 *
 * Usage:
 *   node --env-file=.env scripts/test-mongo.mjs
 *   node scripts/test-mongo.mjs "<mongodb_connection_string>"
 */

import { MongoClient } from 'mongodb'

// Check CLI arguments first, then environment variable, fallback to default in .env
const uri =
  process.argv[2] ||
  process.env.MONGODB_URI ||
  'mongodb+srv://prithraj120_db_user:ycq05nHqmnSXPQm6@cluster0.n6eevrz.mongodb.net/'

const dbName = process.env.MONGODB_DB_NAME || 'neelam_inventory'

// Mask credentials for display
const maskedUri = uri.replace(/\/\/(.*?)@/, (_, creds) => {
  const [user] = creds.split(':')
  return `//${user}:****@`
})

console.log('='.repeat(60))
console.log(' Neelam Industries — MongoDB Atlas Connection Tester')
console.log('='.repeat(60))
console.log(`Connecting to: ${maskedUri}`)
console.log(`Target database: ${dbName}`)
console.log('-'.repeat(60))

const startTime = Date.now()
const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 8000,
  connectTimeoutMS: 10000,
})

try {
  console.log('1. Initiating connection to cluster...')
  await client.connect()
  const connectMs = Date.now() - startTime
  console.log(`   [SUCCESS] Connected to MongoDB cluster in ${connectMs} ms!`)

  console.log('\n2. Testing server ping...')
  const pingResult = await client.db().admin().command({ ping: 1 })
  console.log(`   [SUCCESS] Ping response:`, pingResult)

  console.log('\n3. Listing cluster databases...')
  const dbs = await client.db().admin().listDatabases()
  console.log(`   Databases found (${dbs.databases.length}):`)
  for (const d of dbs.databases) {
    const sizeMb = (d.sizeOnDisk / 1024 / 1024).toFixed(2)
    console.log(`     - ${d.name} (${sizeMb} MB)`)
  }

  console.log(`\n4. Inspecting target database: "${dbName}"...`)
  const db = client.db(dbName)
  const collections = await db.listCollections().toArray()
  console.log(`   Collections found (${collections.length}):`)
  if (collections.length === 0) {
    console.log('     (No collections yet - run "npm run mongo:push" to seed data)')
  } else {
    for (const c of collections) {
      const count = await db.collection(c.name).countDocuments()
      console.log(`     - ${c.name}: ${count} document(s)`)
    }
  }

  // Check app_state snapshot
  const appStateDoc = await db.collection('app_state').findOne({ _id: 'current' })
  if (appStateDoc?.payload) {
    console.log('\n5. Cloud snapshot check:')
    console.log(`   [FOUND] Cloud app_state snapshot exists!`)
    console.log(`   - Version: ${appStateDoc.payload.version}`)
    console.log(`   - Materials: ${appStateDoc.payload.materials?.length ?? 0}`)
    console.log(`   - Balances: ${appStateDoc.payload.balances?.length ?? 0}`)
    console.log(`   - Locations: ${appStateDoc.payload.locations?.length ?? 0}`)
    console.log(`   - Updated at: ${appStateDoc.updatedAt}`)
  } else {
    console.log('\n5. Cloud snapshot check:')
    console.log('   [INFO] No cloud snapshot in app_state yet.')
    console.log('   Run: npm run mongo:push to upload the 36 foundry materials snapshot.')
  }

  console.log('\n' + '='.repeat(60))
  console.log(' RESULT: MongoDB connection test PASSED successfully!')
  console.log('='.repeat(60))
  await client.close()
  process.exit(0)
} catch (err) {
  console.error('\n' + '!'.repeat(60))
  console.error(' RESULT: MongoDB connection test FAILED')
  console.error('!'.repeat(60))
  console.error('Error message:', err.message)
  if (err.name) console.error('Error name:', err.name)

  if (err.message.includes('bad auth') || err.message.includes('Authentication failed')) {
    console.error('\n--> Hint: Check your username and password in the connection string.')
  } else if (
    err.message.includes('ETIMEDOUT') ||
    err.message.includes('ENOTFOUND') ||
    err.message.includes('queryTxt') ||
    err.message.includes('Server selection timed out')
  ) {
    console.error('\n--> Hint: Check if your IP address is whitelisted in MongoDB Atlas:')
    console.error('    1. Open MongoDB Atlas (https://cloud.mongodb.com/)')
    console.error('    2. Go to "Network Access" in Security settings')
    console.error('    3. Click "Add IP Address" and select "Allow Access From Anywhere" (0.0.0.0/0)')
    console.error('       or add your current public IP.')
  }
  await client.close().catch(() => {})
  process.exit(1)
}
