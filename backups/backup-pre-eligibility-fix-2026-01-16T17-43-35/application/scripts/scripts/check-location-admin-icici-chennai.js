/**
 * Check who is the location admin for ICICI Bank Chennai branch
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

// Get encryption key (32 bytes for AES-256)
const getKey = () => {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

// Decrypt function (handles both base64 and hex formats)
function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) {
    return encryptedText
  }
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }
    
    const key = getKey()
    
    // Try base64 first (current standard format)
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
        return decrypted
      }
    } catch (base64Error) {
      // Base64 failed, try hex format (legacy format)
      try {
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = parts[1]
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
          return decrypted
        }
      } catch (hexError) {
        // Both formats failed
      }
    }
    
    return encryptedText
  } catch (error) {
    return encryptedText
  }
}

async function checkLocationAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const companiesCollection = db.collection('companies')
    const locationsCollection = db.collection('locations')
    const employeesCollection = db.collection('employees')

    // Step 1: Find ICICI company
    const company = await companiesCollection.findOne({ 
      $or: [{ id: 'COMP-ICICI' }, { name: { $regex: /icici/i } }] 
    })
    if (!company) {
      throw new Error('ICICI Bank company not found')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})\n`)

    // Step 2: Find Chennai location
    const chennaiLocation = await locationsCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })

    if (!chennaiLocation) {
      console.log('❌ Chennai location not found for ICICI Bank')
      console.log('\n📋 Available locations for ICICI Bank:')
      const allLocations = await locationsCollection.find({
        $or: [
          { companyId: company._id },
          { companyId: company._id.toString() },
          { companyId: company.id }
        ]
      }).toArray()
      
      if (allLocations.length === 0) {
        console.log('   No locations found')
      } else {
        allLocations.forEach((loc, idx) => {
          console.log(`   ${idx + 1}. ${loc.name} (${loc.id || 'N/A'})`)
        })
      }
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found location: ${chennaiLocation.name}`)
    console.log(`   Location ID: ${chennaiLocation.id || chennaiLocation._id}`)
    console.log(`   City: ${chennaiLocation.city || 'N/A'}`)
    console.log(`   Address: ${chennaiLocation.address_line_1 || chennaiLocation.address || 'N/A'}\n`)

    // Step 3: Find the location admin
    if (!chennaiLocation.adminId) {
      console.log('⚠️  No location admin assigned to Chennai location')
      await mongoose.disconnect()
      return
    }

    // Handle both ObjectId and string adminId
    let adminId = chennaiLocation.adminId
    if (typeof adminId === 'object' && adminId.toString) {
      adminId = adminId.toString()
    }

    const admin = await employeesCollection.findOne({
      $or: [
        { _id: mongoose.Types.ObjectId.isValid(adminId) ? new mongoose.Types.ObjectId(adminId) : null },
        { employeeId: adminId },
        { id: adminId }
      ]
    })

    if (!admin) {
      console.log(`⚠️  Location admin ID (${adminId}) found but employee not found in database`)
      await mongoose.disconnect()
      return
    }

    // Decrypt encrypted fields
    const decryptedFirstName = admin.firstName ? decrypt(admin.firstName) : ''
    const decryptedLastName = admin.lastName ? decrypt(admin.lastName) : ''
    const decryptedEmail = admin.email ? decrypt(admin.email) : ''
    const decryptedDesignation = admin.designation ? decrypt(admin.designation) : ''

    console.log('✅ Location Admin Details:')
    console.log(`   Employee ID: ${admin.employeeId || admin.id || 'N/A'}`)
    console.log(`   Name: ${decryptedFirstName} ${decryptedLastName}`.trim() || 'N/A')
    console.log(`   Email: ${decryptedEmail || 'N/A'}`)
    console.log(`   Designation: ${decryptedDesignation || 'N/A'}`)
    console.log(`   Status: ${admin.status || 'N/A'}`)

    console.log('\n📋 Summary:')
    console.log(`   Location: ${chennaiLocation.name}`)
    const adminName = `${decryptedFirstName} ${decryptedLastName}`.trim()
    console.log(`   Location Admin: ${adminName || admin.employeeId || admin.id}`)
    console.log(`   Employee ID: ${admin.employeeId || admin.id}`)
    console.log(`   Email: ${decryptedEmail || 'N/A'}`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkLocationAdmin()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
