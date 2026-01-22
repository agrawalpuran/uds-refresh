/**
 * Script to verify and forcefully delete all ProductVendor mappings
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function verifyAndDelete() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Check using direct collection access
    const collection = db.collection('productvendors')
    const count = await collection.countDocuments()
    console.log(`📊 ProductVendor mappings in database: ${count}`)

    if (count > 0) {
      console.log('\n🗑️  Deleting all ProductVendor mappings...')
      const result = await collection.deleteMany({})
      console.log(`✅ Deleted ${result.deletedCount} mappings`)
    } else {
      console.log('✅ Database is already clean - no ProductVendor mappings found')
    }

    // Verify deletion
    const finalCount = await collection.countDocuments()
    console.log(`\n📊 Final count: ${finalCount} mappings`)
    
    if (finalCount === 0) {
      console.log('✅ Database is clean!')
    } else {
      console.log(`⚠️  Warning: ${finalCount} mappings still exist`)
    }

    // Also check for any variations in collection name
    const collections = await db.listCollections().toArray()
    const productVendorCollections = collections.filter(c => 
      c.name.toLowerCase().includes('productvendor') || 
      c.name.toLowerCase().includes('product-vendor')
    )
    
    if (productVendorCollections.length > 0) {
      console.log('\n📋 Found related collections:')
      for (const coll of productVendorCollections) {
        const collCount = await db.collection(coll.name).countDocuments()
        console.log(`  - ${coll.name}: ${collCount} documents`)
        if (collCount > 0 && coll.name !== 'productvendors') {
          console.log(`    ⚠️  This collection also has data!`)
        }
      }
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

verifyAndDelete()



