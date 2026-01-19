/**
 * Create Vikram Gupta employee and add as Company Admin for ICICI Bank
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function encrypt(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

async function createVikramAndAddAdmin() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    console.log('🔍 Finding ICICI Bank company...')
    const companies = db.collection('companies')
    const icici = await companies.findOne({ 
      $or: [
        { id: '100004' },
        { name: { $regex: /icici/i } }
      ]
    })
    
    if (!icici) {
      console.error('❌ ICICI Bank not found')
      await client.close()
      process.exit(1)
    }
    
    console.log(`✅ Found ICICI Bank: ${icici.name} (ID: ${icici.id})`)
    console.log('')
    
    // Check if employee already exists
    const employees = db.collection('employees')
    const email = 'vikram.gupta6@icicibank.com'
    const encryptedEmail = encrypt(email)
    
    let employee = await employees.findOne({ email: encryptedEmail })
    
    // If not found, try plain text
    if (!employee) {
      employee = await employees.findOne({ email: email })
    }
    
    // If still not found, create the employee
    if (!employee) {
      console.log('📝 Creating employee: Vikram Gupta')
      
      // Get next employee ID
      const lastEmployee = await employees.find({})
        .sort({ id: -1 })
        .limit(1)
        .toArray()
      
      let nextId = 300042 // Start from 300042
      if (lastEmployee.length > 0 && lastEmployee[0].id) {
        const lastId = parseInt(String(lastEmployee[0].id), 10)
        if (!isNaN(lastId) && lastId >= 300000) {
          nextId = lastId + 1
        }
      }
      
      // Find Mumbai location
      const locations = db.collection('locations')
      const mumbaiLocation = await locations.findOne({ 
        companyId: icici._id,
        $or: [
          { name: { $regex: /mumbai/i } },
          { city: { $regex: /mumbai/i } }
        ]
      })
      
      // Create employee document
      const employeeDoc = {
        id: String(nextId),
        employeeId: String(nextId),
        firstName: encrypt('Vikram'),
        lastName: encrypt('Gupta'),
        designation: encrypt('Company Administrator'),
        gender: 'male',
        location: 'Mumbai',
        email: encryptedEmail,
        mobile: encrypt('+91-9876543298'),
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '9',
        address: encrypt('D-456, Bandra Kurla Complex, Mumbai, Maharashtra 400051'),
        companyId: icici._id,
        companyName: icici.name,
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
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z'),
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const result = await employees.insertOne(employeeDoc)
      employee = employeeDoc
      employee._id = result.insertedId
      
      console.log(`✅ Employee created!`)
      console.log(`   ID: ${nextId}`)
      console.log(`   Name: Vikram Gupta`)
      console.log(`   Email: ${email}`)
      console.log('')
    } else {
      console.log(`✅ Employee already exists:`)
      console.log(`   ID: ${employee.id || employee.employeeId}`)
      console.log('')
    }
    
    // Now add as company admin
    console.log('➕ Adding as company admin...')
    const companyadmins = db.collection('companyadmins')
    
    // Check if already an admin
    const existingAdmin = await companyadmins.findOne({
      employeeId: employee._id,
      companyId: icici._id
    })
    
    if (existingAdmin) {
      console.log(`⚠️  Employee is already a company admin`)
      console.log(`   Admin record ID: ${existingAdmin._id}`)
      console.log(`   Can approve orders: ${existingAdmin.canApproveOrders || false}`)
      await client.close()
      process.exit(0)
    }
    
    // Add as company admin
    const adminRecord = await companyadmins.insertOne({
      companyId: icici._id,
      employeeId: employee._id,
      canApproveOrders: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    
    console.log(`✅ Successfully added as company admin!`)
    console.log(`   Admin record ID: ${adminRecord.insertedId}`)
    console.log(`   Can approve orders: true`)
    console.log('')
    console.log(`🎉 ${email} can now login as company admin!`)
    
  } catch (error) {
    console.error(`❌ Error:`, error.message)
    console.error('')
    console.error('Error details:', error)
    await client.close()
    process.exit(1)
  } finally {
    await client.close()
  }
}

createVikramAndAddAdmin()
  .then(() => {
    console.log('')
    console.log('✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Script failed:', error)
    process.exit(1)
  })

