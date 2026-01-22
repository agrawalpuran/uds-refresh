/**
 * Create Anjali Sharma employee for ICICI Bank in MongoDB Atlas
 */

const { MongoClient } = require('mongodb')
const path = require('path')
const fs = require('fs')

// Load encryption function
const encryptionPath = path.join(__dirname, '../lib/utils/encryption.ts')
let encrypt

// Try to use the encryption from the compiled code or require it dynamically
try {
  // For TypeScript files, we need to use a different approach
  // Since this is a JS script, we'll use the encryption logic directly
  const crypto = require('crypto')
  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
  
  encrypt = function(text) {
    if (!text) return ''
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
  }
} catch (error) {
  console.error('Failed to load encryption:', error)
  process.exit(1)
}

const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

async function createAnjaliSharma() {
  const client = new MongoClient(MONGODB_URI_ATLAS)
  
  try {
    await client.connect()
    const db = client.db()
    const employees = db.collection('employees')
    const companies = db.collection('companies')
    
    console.log('🔍 Finding ICICI Bank company...')
    const iciciCompany = await companies.findOne({ 
      $or: [
        { id: '100004' },
        { name: { $regex: /icici/i } }
      ]
    })
    
    if (!iciciCompany) {
      console.log('❌ ICICI Bank company not found')
      return
    }
    
    console.log(`✅ Found ICICI Bank: ${iciciCompany.name} (ID: ${iciciCompany.id})`)
    console.log(`   Company ObjectId: ${iciciCompany._id}`)
    console.log('')
    
    // Check if employee already exists
    const existing = await employees.findOne({ 
      email: 'anjali.sharma@icicibank.com' 
    })
    
    if (existing) {
      console.log('⚠️  Employee already exists:')
      console.log(`   ID: ${existing.id || existing.employeeId || 'N/A'}`)
      console.log(`   Name: ${existing.firstName || ''} ${existing.lastName || ''}`)
      console.log(`   Email: ${existing.email || 'N/A'}`)
      return
    }
    
    // Get next employee ID
    const lastEmployee = await employees.find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray()
    
    let nextId = 300041 // Start from 300041 if no employees
    if (lastEmployee.length > 0 && lastEmployee[0].id) {
      const lastId = parseInt(String(lastEmployee[0].id), 10)
      if (!isNaN(lastId) && lastId >= 300000) {
        nextId = lastId + 1
      }
    }
    
    console.log(`📝 Creating employee with ID: ${nextId}`)
    console.log('')
    
    // Encrypt sensitive fields
    const encryptedFirstName = encrypt('Anjali')
    const encryptedLastName = encrypt('Sharma')
    const encryptedEmail = encrypt('anjali.sharma@icicibank.com')
    const encryptedMobile = encrypt('+91-9876543299')
    const encryptedAddress = encrypt('C-789, Bandra Kurla Complex, Mumbai, Maharashtra 400051')
    const encryptedDesignation = encrypt('Branch Manager')
    
    // Create employee document
    const employeeDoc = {
      id: nextId,
      employeeId: nextId,
      firstName: encryptedFirstName,
      lastName: encryptedLastName,
      designation: encryptedDesignation,
      gender: 'female',
      location: 'Mumbai',
      email: encryptedEmail,
      mobile: encryptedMobile,
      shirtSize: 'M',
      pantSize: '28',
      shoeSize: '7',
      address: encryptedAddress,
      companyId: iciciCompany._id,
      companyName: iciciCompany.name,
      locationId: null, // Will be set if location exists
      eligibility: {
        shirt: 6,
        pant: 4,
        shoe: 2,
        jacket: 2
      },
      cycleDuration: {
        shirt: 6,
        pant: 6,
        shoe: 6,
        jacket: 12
      },
      dispatchPreference: 'direct',
      status: 'active',
      period: '2024-2025',
      dateOfJoining: new Date('2025-10-01T00:00:00.000Z'),
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    // Try to find Mumbai location for ICICI
    const locations = db.collection('locations')
    const mumbaiLocation = await locations.findOne({ 
      companyId: iciciCompany._id,
      $or: [
        { name: { $regex: /mumbai/i } },
        { city: { $regex: /mumbai/i } }
      ]
    })
    
    if (mumbaiLocation) {
      employeeDoc.locationId = mumbaiLocation._id
      console.log(`✅ Found Mumbai location: ${mumbaiLocation.name}`)
    } else {
      console.log('⚠️  Mumbai location not found, creating employee without location')
    }
    
    // Insert employee
    const result = await employees.insertOne(employeeDoc)
    console.log('')
    console.log('✅ Employee created successfully!')
    console.log(`   MongoDB _id: ${result.insertedId}`)
    console.log(`   Employee ID: ${nextId}`)
    console.log(`   Name: Anjali Sharma`)
    console.log(`   Email: anjali.sharma@icicibank.com`)
    console.log(`   Company: ${iciciCompany.name}`)
    console.log(`   Location: ${mumbaiLocation ? mumbaiLocation.name : 'None'}`)
    console.log('')
    console.log('🎉 Anjali Sharma can now login!')
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    if (error.code === 11000) {
      console.log('⚠️  Employee already exists (duplicate key)')
    }
  } finally {
    await client.close()
  }
}

createAnjaliSharma()

