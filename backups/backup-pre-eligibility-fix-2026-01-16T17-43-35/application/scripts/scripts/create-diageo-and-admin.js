/**
 * Script to create Diageo company and add Swapnil.jain@diageo.com as company admin
 * 
 * Usage: node scripts/create-diageo-and-admin.js
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// Read from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

// Get encryption key - same logic as lib/utils/encryption.ts
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  // If key is not 32 bytes, hash it to get 32 bytes (same as utility)
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encrypt(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const key = getKey()
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return ''
    
    const key = getKey()
    let iv, encrypted
    try {
      iv = Buffer.from(parts[0], 'base64')
      encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    } catch {
      // Try hex encoding for legacy data
      iv = Buffer.from(parts[0], 'hex')
      encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      return decrypted
    }
  } catch (error) {
    return ''
  }
}

async function createDiageoAndAdmin() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('Connecting to MongoDB...')
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Step 1: Check if Diageo company already exists
    console.log('🔍 Step 1: Checking if Diageo company exists...')
    let diageoCompany = await db.collection('companies').findOne({
      name: { $regex: /^diageo$/i }
    })

    if (diageoCompany) {
      console.log(`✅ Diageo company already exists: ${diageoCompany.name} (id: ${diageoCompany.id}, _id: ${diageoCompany._id})`)
    } else {
      // Create Diageo company
      console.log('📝 Creating Diageo company...')
      
      // Get next company ID
      const lastCompany = await db.collection('companies').find({})
        .sort({ id: -1 })
        .limit(1)
        .toArray()
      
      let nextCompanyId = 100005 // Start from 100005 (assuming 100001-100004 are taken)
      if (lastCompany.length > 0 && lastCompany[0].id) {
        const lastId = parseInt(String(lastCompany[0].id), 10)
        if (!isNaN(lastId) && lastId >= 100001) {
          nextCompanyId = lastId + 1
        }
      }
      
      const companyDoc = {
        id: String(nextCompanyId),
        name: 'Diageo',
        logo: 'https://via.placeholder.com/200x100?text=Diageo',
        website: 'https://www.diageo.com',
        primaryColor: '#1a1a1a',
        secondaryColor: '#f76b1c',
        showPrices: false,
        allowPersonalPayments: false,
        enableEmployeeOrder: true,
        allowPersonalAddressDelivery: false,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const companyResult = await db.collection('companies').insertOne(companyDoc)
      diageoCompany = companyDoc
      diageoCompany._id = companyResult.insertedId
      
      console.log(`✅ Diageo company created!`)
      console.log(`   Company ID: ${nextCompanyId}`)
      console.log(`   Company Name: Diageo`)
      console.log(`   _id: ${diageoCompany._id}`)
      console.log('')
    }

    // Step 2: Find or create employee Swapnil.jain@diageo.com
    console.log('🔍 Step 2: Finding employee Swapnil.jain@diageo.com...')
    const normalizedEmail = 'swapnil.jain@diageo.com'.trim().toLowerCase()
    const encryptedEmail = encrypt(normalizedEmail)
    
    // Try multiple methods to find employee
    let employee = await db.collection('employees').findOne({ email: encryptedEmail })
    
    if (!employee) {
      employee = await db.collection('employees').findOne({ email: normalizedEmail })
    }
    
    if (!employee) {
      employee = await db.collection('employees').findOne({
        email: { $regex: new RegExp(`^${normalizedEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
      })
    }
    
    // Try decryption matching
    if (!employee) {
      const allEmployees = await db.collection('employees').find({ companyId: diageoCompany._id }).toArray()
      console.log(`Checking ${allEmployees.length} employees via decryption...`)
      
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decryptedEmail = decrypt(emp.email)
            if (decryptedEmail && decryptedEmail.trim().toLowerCase() === normalizedEmail) {
              employee = emp
              console.log(`✅ Found employee via decryption: ${decryptedEmail}`)
              break
            }
          } catch (error) {
            continue
          }
        }
      }
    }

    if (!employee) {
      // Employee doesn't exist - create it
      console.log(`📝 Employee not found. Creating new employee: ${normalizedEmail}...`)
      
      // Get next employee ID
      const lastEmployee = await db.collection('employees').find({})
        .sort({ id: -1 })
        .limit(1)
        .toArray()
      
      let nextId = 300043 // Start from 300043
      if (lastEmployee.length > 0 && lastEmployee[0].id) {
        const lastId = parseInt(String(lastEmployee[0].id), 10)
        if (!isNaN(lastId) && lastId >= 300000) {
          nextId = lastId + 1
        }
      }
      
      // Find or create a default location for Diageo (Mumbai)
      let mumbaiLocation = await db.collection('locations').findOne({
        companyId: diageoCompany._id,
        $or: [
          { name: { $regex: /mumbai/i } },
          { city: { $regex: /mumbai/i } }
        ]
      })
      
      // If no location exists, create one
      if (!mumbaiLocation) {
        console.log('📝 Creating default Mumbai location for Diageo...')
        const locationDoc = {
          id: String(400000 + parseInt(diageoCompany.id)),
          name: 'Mumbai Office',
          companyId: diageoCompany._id,
          address: encrypt('Diageo India, Mumbai'),
          city: 'Mumbai',
          state: 'Maharashtra',
          pincode: '400001',
          phone: encrypt('+91-22-12345678'),
          email: encrypt('mumbai@diageo.com'),
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        }
        const locationResult = await db.collection('locations').insertOne(locationDoc)
        mumbaiLocation = locationDoc
        mumbaiLocation._id = locationResult.insertedId
        console.log(`✅ Created location: ${mumbaiLocation.name}`)
      }
      
      // Create employee document
      const employeeDoc = {
        id: String(nextId),
        employeeId: String(nextId),
        firstName: encrypt('Swapnil'),
        lastName: encrypt('Jain'),
        designation: encrypt('Company Administrator'),
        gender: 'male',
        location: 'Mumbai',
        email: encryptedEmail,
        mobile: encrypt('+91-9876543210'),
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '9',
        address: encrypt('Diageo India, Mumbai, Maharashtra 400001'),
        companyId: diageoCompany._id,
        companyName: diageoCompany.name,
        locationId: mumbaiLocation ? mumbaiLocation._id : null,
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
        dateOfJoining: new Date('2025-01-01T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const result = await db.collection('employees').insertOne(employeeDoc)
      employee = employeeDoc
      employee._id = result.insertedId
      
      console.log(`✅ Employee created!`)
      console.log(`   ID: ${nextId}`)
      console.log(`   Name: Swapnil Jain`)
      console.log(`   Email: ${normalizedEmail}`)
      console.log('')
    } else {
      console.log(`✅ Employee already exists: ${employee.id || employee.employeeId}`)
      console.log('')
    }

    console.log(`✅ Found employee: ${employee.id || employee.employeeId} (_id: ${employee._id})`)

    // Step 3: Check if already an admin
    console.log('🔍 Step 3: Checking if already an admin...')
    const existingAdmin = await db.collection('companyadmins').findOne({
      companyId: diageoCompany._id,
      employeeId: employee._id
    })

    if (existingAdmin) {
      console.log('⚠️ Employee is already a company admin!')
      console.log('Admin record:', {
        _id: existingAdmin._id,
        companyId: existingAdmin.companyId?.toString(),
        employeeId: existingAdmin.employeeId?.toString(),
        canApproveOrders: existingAdmin.canApproveOrders
      })
      console.log('\n✅ Script completed - employee is already an admin')
      await client.close()
      return
    }

    // Step 4: Add as company admin
    console.log('➕ Step 4: Adding employee as company admin...')
    
    // Ensure ObjectIds are used (not strings)
    const { ObjectId } = require('mongodb')
    const companyIdObjectId = diageoCompany._id instanceof ObjectId 
      ? diageoCompany._id 
      : new ObjectId(diageoCompany._id)
    const employeeIdObjectId = employee._id instanceof ObjectId
      ? employee._id
      : new ObjectId(employee._id)
    
    console.log(`   Using companyId: ${companyIdObjectId} (ObjectId)`)
    console.log(`   Using employeeId: ${employeeIdObjectId} (ObjectId)`)
    
    const adminRecord = await db.collection('companyadmins').insertOne({
      companyId: companyIdObjectId,
      employeeId: employeeIdObjectId,
      canApproveOrders: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    if (!adminRecord.insertedId) {
      throw new Error('Failed to create admin record')
    }

    console.log('✅ Admin record created:', {
      adminId: adminRecord.insertedId,
      companyId: diageoCompany._id.toString(),
      employeeId: employee._id.toString(),
      canApproveOrders: true
    })

    // Step 5: Verify the record
    console.log('\n🔍 Step 5: Verifying admin record...')
    const verifyRecord = await db.collection('companyadmins').findOne({
      _id: adminRecord.insertedId
    })

    if (!verifyRecord) {
      throw new Error('Admin record was created but cannot be found')
    }

    console.log('✅ Admin record verified:', {
      _id: verifyRecord._id.toString(),
      companyId: verifyRecord.companyId?.toString(),
      employeeId: verifyRecord.employeeId?.toString(),
      canApproveOrders: verifyRecord.canApproveOrders
    })

    console.log('\n✅ SUCCESS: Diageo company and admin setup complete!')
    console.log(`   Company: Diageo (ID: ${diageoCompany.id})`)
    console.log(`   Admin: Swapnil Jain (${normalizedEmail})`)
    console.log(`   Employee ID: ${employee.id || employee.employeeId}`)
    console.log('\nThe admin can now log in to the company admin portal at:')
    console.log('   http://localhost:3001/login/company')

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    await client.close()
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

// Run the script
createDiageoAndAdmin()

