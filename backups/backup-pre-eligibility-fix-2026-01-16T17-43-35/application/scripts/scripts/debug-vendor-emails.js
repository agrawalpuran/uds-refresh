/**
 * Debug script to check vendor emails and their IDs
 * This will help identify if there's an email mismatch causing wrong vendorId
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
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

async function debugVendorEmails() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')
    
    const db = mongoose.connection.db
    
    // Get all vendors
    console.log('📋 Checking all vendors and their emails...')
    const vendors = await db.collection('vendors').find({}).toArray()
    
    console.log(`✅ Found ${vendors.length} vendor(s):\n`)
    vendors.forEach((v, idx) => {
      console.log(`   ${idx + 1}. ${v.name}`)
      console.log(`      ID: ${v.id}`)
      console.log(`      _id: ${v._id?.toString()}`)
      console.log(`      Email: ${v.email || 'N/A'}`)
      console.log(`      Email (lowercase): ${v.email ? v.email.toLowerCase() : 'N/A'}`)
      console.log(`      Email (trimmed): ${v.email ? v.email.trim() : 'N/A'}`)
      console.log('')
    })
    
    // Test email lookups
    console.log('📋 Testing email lookups...\n')
    
    const testEmails = [
      'contact@footwearplus.com',
      'contact@footwearplus',
      'contact@eliteuniforms.com',
      'contact@eliteuniforms',
      'footwearplus',
      'eliteuniforms'
    ]
    
    for (const testEmail of testEmails) {
      console.log(`🔍 Testing email: "${testEmail}"`)
      const normalizedEmail = testEmail.trim().toLowerCase()
      
      // Try regex search
      const regexVendor = await db.collection('vendors').findOne({
        email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      })
      
      if (regexVendor) {
        console.log(`   ✅ Found via regex: ${regexVendor.name} (id: ${regexVendor.id})`)
      } else {
        console.log(`   ❌ Not found via regex`)
        
        // Try manual comparison
        const allVendors = await db.collection('vendors').find({}).toArray()
        const manualMatch = allVendors.find(v => 
          v.email && v.email.trim().toLowerCase() === normalizedEmail
        )
        
        if (manualMatch) {
          console.log(`   ✅ Found via manual comparison: ${manualMatch.name} (id: ${manualMatch.id})`)
        } else {
          console.log(`   ❌ Not found via manual comparison`)
        }
      }
      console.log('')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected')
  }
}

debugVendorEmails()

