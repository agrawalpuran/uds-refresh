/**
 * Check actual fields in uniform documents
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

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
  console.warn('Could not read .env.local')
}

async function checkUniformFields() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CHECKING ACTUAL FIELDS IN UNIFORM DOCUMENTS')
    console.log('='.repeat(80))
    console.log()

    // Get all uniforms
    const uniforms = await db.collection('uniforms').find({}).toArray()
    
    console.log(`Found ${uniforms.length} uniforms\n`)

    let hasVendorIdCount = 0
    
    uniforms.forEach((uniform, index) => {
      const hasVendorId = uniform.hasOwnProperty('vendorId')
      const fields = Object.keys(uniform)
      
      console.log(`Uniform ${index + 1}: ${uniform.name || 'N/A'} (ID: ${uniform.id})`)
      console.log(`   Fields: ${fields.join(', ')}`)
      
      if (hasVendorId) {
        console.log(`   ❌ HAS vendorId: ${uniform.vendorId}`)
        hasVendorIdCount++
      } else {
        console.log(`   ✅ NO vendorId field`)
      }
      console.log()
    })

    console.log('='.repeat(80))
    console.log('SUMMARY:')
    console.log('='.repeat(80))
    console.log(`   Total uniforms: ${uniforms.length}`)
    console.log(`   With vendorId: ${hasVendorIdCount}`)
    console.log(`   Without vendorId: ${uniforms.length - hasVendorIdCount}`)

    if (hasVendorIdCount > 0) {
      console.log('\n⚠️  Found uniforms with vendorId - will remove them now...\n')
      
      // Remove vendorId from all documents
      const result = await db.collection('uniforms').updateMany(
        {},
        { $unset: { vendorId: "" } }
      )
      
      console.log(`✅ Removed vendorId from ${result.modifiedCount} document(s)`)
      
      // Verify again
      const uniformsAfter = await db.collection('uniforms').find({}).toArray()
      const stillHasVendorId = uniformsAfter.filter(u => u.hasOwnProperty('vendorId')).length
      
      if (stillHasVendorId === 0) {
        console.log('✅ Verification: All vendorId fields removed!')
      } else {
        console.log(`⚠️  Warning: ${stillHasVendorId} documents still have vendorId`)
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkUniformFields()

