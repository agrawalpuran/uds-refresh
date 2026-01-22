/**
 * Check for invalid vendorId references in uniforms collection
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

async function checkInvalidVendorReferences() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CHECKING INVALID VENDOR REFERENCES IN UNIFORMS')
    console.log('='.repeat(80))
    console.log()

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    const validVendorIds = new Set()
    vendors.forEach(v => {
      validVendorIds.add(v._id.toString())
      console.log(`Valid Vendor: ${v.name} (${v.id}) - _id: ${v._id}`)
    })
    console.log()

    // Get all uniforms
    const uniforms = await db.collection('uniforms').find({}).toArray()
    console.log(`Found ${uniforms.length} uniforms\n`)

    console.log('='.repeat(80))
    console.log('CHECKING UNIFORMS FOR INVALID vendorId:')
    console.log('='.repeat(80))
    console.log()

    let invalidCount = 0
    let validCount = 0
    let noVendorIdCount = 0

    uniforms.forEach((uniform, index) => {
      console.log(`\nUniform ${index + 1}: ${uniform.name || 'N/A'}`)
      console.log(`   ID: ${uniform.id || 'N/A'}`)
      console.log(`   Category: ${uniform.category || 'N/A'}`)
      console.log(`   Gender: ${uniform.gender || 'N/A'}`)
      
      if (uniform.vendorId) {
        const vendorIdStr = uniform.vendorId.toString ? uniform.vendorId.toString() : String(uniform.vendorId)
        console.log(`   vendorId: ${vendorIdStr}`)
        
        if (validVendorIds.has(vendorIdStr)) {
          const vendor = vendors.find(v => v._id.toString() === vendorIdStr)
          console.log(`   ✅ VALID - References: ${vendor ? vendor.name : 'Unknown'}`)
          validCount++
        } else {
          console.log(`   ❌ INVALID - This vendorId does NOT exist in vendors collection!`)
          invalidCount++
        }
      } else {
        console.log(`   ⚠️  No vendorId field`)
        noVendorIdCount++
      }
    })

    console.log('\n' + '='.repeat(80))
    console.log('SUMMARY:')
    console.log('='.repeat(80))
    console.log(`   Total uniforms: ${uniforms.length}`)
    console.log(`   ✅ Valid vendorId: ${validCount}`)
    console.log(`   ❌ Invalid vendorId: ${invalidCount}`)
    console.log(`   ⚠️  No vendorId: ${noVendorIdCount}`)

    if (invalidCount > 0) {
      console.log('\n' + '='.repeat(80))
      console.log('⚠️  ISSUE FOUND:')
      console.log('='.repeat(80))
      console.log('Some uniforms have vendorId values that don\'t exist in the vendors collection.')
      console.log('This can happen if:')
      console.log('  1. Vendors were deleted but uniforms weren\'t updated')
      console.log('  2. Data was migrated and vendorId references weren\'t updated')
      console.log('  3. vendorId was set incorrectly during product creation')
      console.log('\nRECOMMENDATION:')
      console.log('  - Remove invalid vendorId from uniforms (or set to null)')
      console.log('  - Use ProductVendor collection for vendor relationships instead')
      console.log('  - The vendorId field in Uniform is optional/legacy')
    }

    // Check the specific uniform mentioned
    console.log('\n' + '='.repeat(80))
    console.log('CHECKING SPECIFIC UNIFORM: "Formal Shirt - Male"')
    console.log('='.repeat(80))
    const formalShirt = uniforms.find(u => u.name === 'Formal Shirt - Male' || u.id === 1)
    if (formalShirt) {
      console.log(`Found: ${formalShirt.name}`)
      console.log(`   ID: ${formalShirt.id}`)
      console.log(`   vendorId: ${formalShirt.vendorId ? formalShirt.vendorId.toString() : 'NONE'}`)
      
      if (formalShirt.vendorId) {
        const vendorIdStr = formalShirt.vendorId.toString()
        if (validVendorIds.has(vendorIdStr)) {
          const vendor = vendors.find(v => v._id.toString() === vendorIdStr)
          console.log(`   ✅ vendorId is VALID - References: ${vendor ? vendor.name : 'Unknown'}`)
        } else {
          console.log(`   ❌ vendorId is INVALID - Does not exist in vendors collection`)
          console.log(`   This vendorId (${vendorIdStr}) is from an old/deleted vendor`)
        }
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkInvalidVendorReferences()

