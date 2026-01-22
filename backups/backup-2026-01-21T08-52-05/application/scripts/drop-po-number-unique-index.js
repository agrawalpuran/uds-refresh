/**
 * Migration Script: Drop Unique Index on PO Number
 * 
 * BUSINESS RULE CHANGE:
 * PO Number (client_po_number) is NOT unique and must NOT be validated for uniqueness.
 * This script removes the unique constraint on (companyId, client_po_number).
 * 
 * IMPORTANT: Run this script ONCE to update the existing database.
 * After running, PO numbers can repeat without errors.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables manually (same pattern as update-pr-po-statuses.js)
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function dropUniqueIndex() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    
    const db = mongoose.connection.db
    const collection = db.collection('purchaseorders')
    
    // List all indexes to find the unique one
    console.log('\n📋 Current indexes on purchaseorders collection:')
    const indexes = await collection.indexes()
    indexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)} (unique: ${index.unique || false})`)
    })
    
    // Find the unique index on (companyId, client_po_number)
    const uniqueIndex = indexes.find(idx => 
      idx.unique === true && 
      idx.key.companyId === 1 && 
      idx.key.client_po_number === 1
    )
    
    if (!uniqueIndex) {
      console.log('\n✅ No unique index found on (companyId, client_po_number)')
      console.log('   The index may have already been removed or never existed.')
      return
    }
    
    console.log(`\n🗑️  Found unique index: ${uniqueIndex.name}`)
    console.log(`   Key: ${JSON.stringify(uniqueIndex.key)}`)
    
    // Drop the unique index
    console.log(`\n⚠️  Dropping unique index: ${uniqueIndex.name}...`)
    await collection.dropIndex(uniqueIndex.name)
    console.log(`✅ Successfully dropped unique index: ${uniqueIndex.name}`)
    
    // Verify the index is gone
    console.log('\n📋 Updated indexes on purchaseorders collection:')
    const updatedIndexes = await collection.indexes()
    updatedIndexes.forEach(index => {
      console.log(`   - ${index.name}: ${JSON.stringify(index.key)} (unique: ${index.unique || false})`)
    })
    
    // Verify no unique index remains
    const remainingUniqueIndex = updatedIndexes.find(idx => 
      idx.unique === true && 
      idx.key.companyId === 1 && 
      idx.key.client_po_number === 1
    )
    
    if (remainingUniqueIndex) {
      throw new Error(`❌ Unique index still exists: ${remainingUniqueIndex.name}`)
    }
    
    console.log('\n✅ Migration completed successfully!')
    console.log('   PO numbers can now repeat without duplicate key errors.')
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message)
    console.error('   Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the migration
dropUniqueIndex()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

