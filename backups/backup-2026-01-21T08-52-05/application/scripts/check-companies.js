/**
 * Script to check all companies and their IDs
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

async function checkCompanies() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const companies = await db.collection('companies').find({}).toArray()
    
    console.log(`📊 Found ${companies.length} companies:\n`)
    
    for (const comp of companies) {
      console.log(`Company: ${comp.name}`)
      console.log(`   ID (string): ${comp.id}`)
      console.log(`   _id (ObjectId): ${comp._id}`)
      console.log(`   _id (string): ${comp._id.toString()}`)
      console.log('')
    }
    
    // Check the specific ObjectId from the employee
    const targetObjectId = '6929b9d9a2fdaf5e8d099e3a'
    console.log(`\n🔍 Looking for company with _id: ${targetObjectId}`)
    
    const targetCompany = companies.find(c => c._id.toString() === targetObjectId)
    if (targetCompany) {
      console.log(`✅ Found matching company:`)
      console.log(`   Name: ${targetCompany.name}`)
      console.log(`   ID: ${targetCompany.id}`)
    } else {
      console.log(`❌ No company found with that _id`)
      console.log(`\nAvailable _id values:`)
      companies.forEach(c => {
        console.log(`   ${c._id.toString()} - ${c.name} (${c.id})`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkCompanies()

