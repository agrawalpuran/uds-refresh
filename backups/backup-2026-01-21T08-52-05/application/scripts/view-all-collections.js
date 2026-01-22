/**
 * Script to view all MongoDB collections and their data
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local, using default connection string')
}

async function viewAllCollections() {
  try {
    console.log('Connecting to MongoDB...')
    console.log(`Connection string: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`)
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Get all collection names
    const collections = await db.listCollections().toArray()
    console.log(`Found ${collections.length} collections:\n`)
    console.log('='.repeat(80))

    // Iterate through each collection
    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name
      console.log(`\n📁 Collection: ${collectionName}`)
      console.log('-'.repeat(80))
      
      const collection = db.collection(collectionName)
      const count = await collection.countDocuments()
      console.log(`Total documents: ${count}`)
      
      if (count > 0) {
        // Get first 5 documents as sample
        const sampleDocs = await collection.find({}).limit(5).toArray()
        console.log(`\nSample documents (first ${Math.min(5, count)}):`)
        console.log(JSON.stringify(sampleDocs, null, 2))
        
        if (count > 5) {
          console.log(`\n... and ${count - 5} more documents`)
        }
      } else {
        console.log('(Collection is empty)')
      }
      console.log('='.repeat(80))
    }

    // Summary
    console.log(`\n\n📊 Summary:`)
    console.log(`Total collections: ${collections.length}`)
    for (const collectionInfo of collections) {
      const count = await db.collection(collectionInfo.name).countDocuments()
      console.log(`  - ${collectionInfo.name}: ${count} documents`)
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

viewAllCollections()

