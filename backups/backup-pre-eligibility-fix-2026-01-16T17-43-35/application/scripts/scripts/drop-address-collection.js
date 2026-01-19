/**
 * Drop Address Collection
 * 
 * This script drops the Address collection after all addresses have been
 * migrated to embedded format in their respective entity tables.
 */

const mongoose = require('mongoose')

// MongoDB connection URI
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function dropAddressCollection() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    console.log(`📍 URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`)
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB Connected Successfully')
    console.log(`📊 Database: ${mongoose.connection.db.databaseName}`)
    console.log('✅ Connected to database\n')
    
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    // Check if collection exists
    const collections = await db.listCollections().toArray()
    const addressCollectionExists = collections.some(col => col.name === 'addresses')
    
    if (!addressCollectionExists) {
      console.log('ℹ️  Address collection does not exist (may have already been dropped)')
      return
    }
    
    // Get count before dropping
    const count = await db.collection('addresses').countDocuments()
    console.log(`📊 Found ${count} documents in addresses collection`)
    
    if (count > 0) {
      console.log('⚠️  Warning: Collection still contains documents. Are you sure all addresses have been migrated?')
      console.log('   Dropping collection anyway...')
    }
    
    // Drop the collection
    await db.collection('addresses').drop()
    console.log('✅ Address collection dropped successfully')
    
  } catch (error) {
    if (error.message.includes('not found')) {
      console.log('ℹ️  Address collection does not exist (may have already been dropped)')
    } else {
      console.error('❌ Error dropping Address collection:', error.message)
      process.exit(1)
    }
  } finally {
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  }
}

dropAddressCollection()

