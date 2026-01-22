/**
 * Script to create employee amit.patel@goindigo.in and set them as Indigo admin
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

// Import encryption utility (using the same method as the app)
const crypto = require('crypto')

// Get encryption key from environment variable (same as app)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
const ALGORITHM = 'aes-256-cbc'
const IV_LENGTH = 16

// Ensure encryption key is 32 bytes (256 bits) for AES-256
const getKey = () => {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encrypt(text) {
  if (!text) return text
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = getKey()
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return `${iv.toString('base64')}:${encrypted}`
}

function decrypt(text) {
  if (!text || typeof text !== 'string' || !text.includes(':')) return text
  const parts = text.split(':')
  if (parts.length !== 2) return text
  const iv = Buffer.from(parts[0], 'base64')
  const encrypted = parts[1]
  const key = getKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  let decrypted = decipher.update(encrypted, 'base64', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Schema definitions
const EmployeeSchema = new mongoose.Schema({}, { strict: false, collection: 'employees', strictPopulate: false })
const CompanyAdminSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
  canApproveOrders: Boolean
}, { strict: false, collection: 'companyadmins', strictPopulate: false })
const CompanySchema = new mongoose.Schema({}, { strict: false, collection: 'companies', strictPopulate: false })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const CompanyAdmin = mongoose.models.CompanyAdmin || mongoose.model('CompanyAdmin', CompanyAdminSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function createAmitAdmin() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const email = 'amit.patel@goindigo.in'
    const encryptedEmail = encrypt(email)

    // Check if employee already exists
    console.log(`🔍 Checking if employee ${email} exists...`)
    let employee = await Employee.findOne({ email: encryptedEmail }).lean()
    
    if (!employee) {
      // Try to find by decrypting all emails
      const allEmployees = await Employee.find({}).lean()
      for (const emp of allEmployees) {
        try {
          const decryptedEmail = decrypt(emp.email || '')
          if (decryptedEmail && decryptedEmail.toLowerCase() === email.toLowerCase()) {
            employee = emp
            console.log(`✅ Found existing employee with email ${email}`)
            break
          }
        } catch (e) {
          // Skip
        }
      }
    } else {
      console.log(`✅ Found existing employee with email ${email}`)
    }

    // Find Indigo company
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found company: ${indigo.name} (ID: ${indigo.id})\n`)

    if (!employee) {
      // Create new employee
      console.log('📝 Creating new employee...')
      
      // Generate employee ID
      const existingEmployees = await Employee.find({ companyId: indigo._id })
        .sort({ id: -1 })
        .limit(1)
        .lean()
      
      let nextIdNumber = 1
      if (existingEmployees.length > 0) {
        const lastId = existingEmployees[0].id
        const match = lastId.match(/(\d+)$/)
        if (match) {
          nextIdNumber = parseInt(match[1], 10) + 1
        }
      }
      
      const employeeId = `IND-${String(nextIdNumber).padStart(3, '0')}`
      console.log(`   Generated employee ID: ${employeeId}`)

      // Create employee (fields will be encrypted by pre-save hook)
      const newEmployee = new Employee({
        id: employeeId,
        employeeId: employeeId,
        firstName: 'Amit',
        lastName: 'Patel',
        designation: 'Admin',
        gender: 'male',
        location: 'Mumbai',
        email: email, // Will be encrypted by pre-save hook
        mobile: '+91-9876543210',
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '9',
        address: 'Mumbai, Maharashtra',
        companyId: indigo._id,
        companyName: indigo.name,
        eligibility: { shirt: 0, pant: 0, shoe: 0, jacket: 0 },
        cycleDuration: { shirt: 6, pant: 6, shoe: 6, jacket: 12 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date(),
      })

      await newEmployee.save()
      console.log(`✅ Created employee: ${employeeId}\n`)
      
      // Fetch the created employee (need to get _id)
      const createdEmployee = await Employee.findOne({ id: employeeId })
      if (createdEmployee) {
        employee = {
          _id: createdEmployee._id,
          id: createdEmployee.id,
          email: createdEmployee.email
        }
      } else {
        throw new Error('Failed to fetch created employee')
      }
    } else {
      console.log(`✅ Using existing employee: ${employee.id || employee._id}\n`)
    }

    // Check if already an admin
    const existingAdmin = await CompanyAdmin.findOne({ 
      employeeId: employee._id,
      companyId: indigo._id
    })

    if (existingAdmin) {
      console.log('✅ Employee is already set as an admin for Indigo Airlines')
      console.log(`   Can Approve Orders: ${existingAdmin.canApproveOrders || false}`)
    } else {
      // Create admin record
      await CompanyAdmin.create({
        employeeId: employee._id,
        companyId: indigo._id,
        canApproveOrders: true
      })
      console.log('✅ Set employee as Indigo Airlines admin')
      console.log('   Can Approve Orders: true')
    }

    // Verify
    const verifyAdmin = await CompanyAdmin.findOne({ 
      employeeId: employee._id,
      companyId: indigo._id
    })
      .populate('companyId')
      .lean()

    if (verifyAdmin) {
      console.log('\n✅ Verification successful!')
      console.log(`   Employee: ${employee.id || employee._id}`)
      console.log(`   Email: ${email}`)
      console.log(`   Company: ${verifyAdmin.companyId?.name || 'Indigo'}`)
      console.log(`   Can Approve Orders: ${verifyAdmin.canApproveOrders || false}`)
    } else {
      console.log('\n❌ Verification failed - admin record not found')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

createAmitAdmin()

