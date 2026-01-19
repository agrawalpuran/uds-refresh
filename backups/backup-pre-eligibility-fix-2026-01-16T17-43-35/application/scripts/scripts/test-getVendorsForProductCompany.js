/**
 * Direct test of getVendorsForProductCompany function
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

async function testFunction() {
  try {
    console.log('='.repeat(80))
    console.log('TESTING getVendorsForProductCompany FUNCTION')
    console.log('='.repeat(80))
    console.log()

    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB\n')

    // Import the function
    const { getVendorsForProductCompany } = require('../lib/db/data-access')
    
    // Test with the exact parameters from the error
    const productId = '5'
    const companyId = '3'
    
    console.log(`Testing with productId="${productId}", companyId="${companyId}"`)
    console.log('-'.repeat(80))
    
    const result = await getVendorsForProductCompany(productId, companyId, false)
    
    console.log('\nResult:', result)
    console.log(`Found ${result.length} vendor(s)`)
    
    if (result.length === 0) {
      console.error('\n❌ FUNCTION RETURNED EMPTY ARRAY - THIS IS THE PROBLEM!')
    } else {
      console.log('\n✓ FUNCTION WORKED! Vendors found:')
      result.forEach((v, i) => {
        console.log(`  ${i + 1}. ${v.vendorId} - ${v.vendorName}`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✓ Disconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testFunction()

