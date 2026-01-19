/**
 * Verify vendor ObjectId in database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
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
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function verifyVendor() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    const targetObjectId = '6929b9d9a2fdaf5e8d099e3d'
    
    console.log(`🔍 Checking for vendor with _id: ${targetObjectId}\n`)
    
    // Try Mongoose findById
    const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))
    const vendorById = await Vendor.findById(targetObjectId).lean()
    
    if (vendorById) {
      console.log('✅ Found vendor via Mongoose findById:')
      console.log(`   ID: ${vendorById.id}`)
      console.log(`   Name: ${vendorById.name}`)
      console.log(`   _id: ${vendorById._id?.toString()}`)
    } else {
      console.log('❌ Vendor not found via Mongoose findById')
    }
    
    // Try raw MongoDB collection
    const rawVendor = await db.collection('vendors').findOne({ _id: new mongoose.Types.ObjectId(targetObjectId) })
    
    if (rawVendor) {
      console.log('\n✅ Found vendor via raw MongoDB collection:')
      console.log(`   ID: ${rawVendor.id}`)
      console.log(`   Name: ${rawVendor.name}`)
      console.log(`   _id: ${rawVendor._id?.toString()}`)
    } else {
      console.log('\n❌ Vendor not found via raw MongoDB collection')
    }
    
    // List all vendors
    console.log('\n📋 All vendors in database:')
    const allVendors = await db.collection('vendors').find({}).toArray()
    allVendors.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ${v.name} (ID: ${v.id}, _id: ${v._id?.toString()})`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected')
  }
}

verifyVendor()

