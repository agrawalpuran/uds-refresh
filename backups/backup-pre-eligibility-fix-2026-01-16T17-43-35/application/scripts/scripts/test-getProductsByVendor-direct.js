/**
 * Test getProductsByVendor function directly
 * This simulates what the API does
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment
let MONGODB_URI = process.env.MONGODB_URI
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('⚠️  Could not read .env.local')
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

// Import the actual function
async function testFunction() {
  try {
    // Connect first
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Import models
    require('../lib/models/Vendor')
    require('../lib/models/Relationship')
    require('../lib/models/Uniform')
    
    // Import the function
    const { getProductsByVendor } = require('../lib/db/data-access')
    
    console.log('=== Testing getProductsByVendor("100001") ===\n')
    
    const result = await getProductsByVendor('100001')
    
    console.log(`\n=== RESULT ===`)
    console.log(`Products returned: ${result.length}`)
    if (result.length > 0) {
      result.forEach((p, i) => {
        console.log(`  ${i + 1}. ${p.name} (ID: ${p.id})`)
      })
    } else {
      console.log('❌ No products returned!')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
    process.exit(1)
  }
}

testFunction()

