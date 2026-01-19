/**
 * Script to remove 'stock' field from all Uniform documents in the database
 * This field is no longer used - inventory is now tracked in VendorInventory collection
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      const value = valueParts.join('=').trim()
      if (key && value) {
        process.env[key.trim()] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/uniform-distribution'

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function removeStockField() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db
    const uniformsCollection = db.collection('uniforms')

    // Get count of documents with stock field
    const totalDocs = await uniformsCollection.countDocuments({})
    const docsWithStock = await uniformsCollection.countDocuments({ stock: { $exists: true } })
    
    console.log(`\n📊 Statistics:`)
    console.log(`   Total Uniform documents: ${totalDocs}`)
    console.log(`   Documents with 'stock' field: ${docsWithStock}`)

    if (docsWithStock === 0) {
      console.log('\n✅ No documents have the stock field. Nothing to remove.')
      await mongoose.connection.close()
      return
    }

    console.log(`\n🗑️  Removing 'stock' field from ${docsWithStock} documents...`)

    // Remove stock field from all documents
    const result = await uniformsCollection.updateMany(
      { stock: { $exists: true } },
      { $unset: { stock: '' } }
    )

    console.log(`\n✅ Successfully removed 'stock' field:`)
    console.log(`   Matched documents: ${result.matchedCount}`)
    console.log(`   Modified documents: ${result.modifiedCount}`)

    // Verify removal
    const remainingWithStock = await uniformsCollection.countDocuments({ stock: { $exists: true } })
    if (remainingWithStock === 0) {
      console.log('\n✅ Verification: All stock fields have been removed successfully!')
    } else {
      console.warn(`\n⚠️  Warning: ${remainingWithStock} documents still have the stock field`)
    }

    await mongoose.connection.close()
    console.log('\n✅ Database connection closed')
    console.log('\n✨ Script completed successfully!')

  } catch (error) {
    console.error('\n❌ Error removing stock field:', error)
    await mongoose.connection.close()
    process.exit(1)
  }
}

// Run the script
removeStockField()

