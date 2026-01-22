/**
 * Script to test what the API actually returns for an employee
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
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

// Import the actual function
async function testAPIResponse() {
  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Import the function directly
    const { getEmployeeByEmail } = require('../lib/db/data-access')
    
    const email = 'vikram.singh@goindigo.in'
    console.log(`🔍 Testing getEmployeeByEmail for: ${email}\n`)
    
    const employee = await getEmployeeByEmail(email)
    
    if (!employee) {
      console.log('❌ Employee not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('✅ Employee found!\n')
    console.log('📋 Employee Object Structure:')
    console.log('   Keys:', Object.keys(employee))
    console.log('   companyId:', employee.companyId)
    console.log('   companyId type:', typeof employee.companyId)
    console.log('   companyId isObject:', typeof employee.companyId === 'object')
    console.log('   companyId isNull:', employee.companyId === null)
    console.log('   companyId isUndefined:', employee.companyId === undefined)
    
    if (employee.companyId && typeof employee.companyId === 'object') {
      console.log('   companyId keys:', Object.keys(employee.companyId))
      console.log('   companyId.id:', employee.companyId.id)
      console.log('   companyId._id:', employee.companyId._id)
    }
    
    console.log('\n   companyName:', employee.companyName)
    console.log('   id:', employee.id)
    console.log('   email:', employee.email)
    
    console.log('\n📦 Full Employee Object (JSON):')
    console.log(JSON.stringify(employee, null, 2))
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testAPIResponse()

