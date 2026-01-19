/**
 * Script to verify that amit.patel@goindigo.in can log in as company admin
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

async function verifyAmitLogin() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const email = 'amit.patel@goindigo.in'
    const trimmedEmail = email.trim()
    const encryptedEmail = encrypt(trimmedEmail)

    console.log(`🔍 Testing login for: ${email}`)
    console.log(`   Encrypted email: ${encryptedEmail}\n`)

    // Simulate the getCompanyByAdminEmail function logic
    // Try finding with encrypted email first
    let employee = await Employee.findOne({ email: encryptedEmail }).lean()
    
    // If not found, try decrypting all emails
    if (!employee) {
      console.log('⚠️  Employee not found by encrypted email, searching all employees...')
      const allEmployees = await Employee.find({}).lean()
      
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decryptedEmail = decrypt(emp.email)
            if (decryptedEmail.toLowerCase() === trimmedEmail.toLowerCase()) {
              employee = emp
              console.log(`✅ Found employee by decrypting email`)
              break
            }
          } catch (error) {
            continue
          }
        }
      }
    } else {
      console.log('✅ Found employee by encrypted email')
    }

    if (!employee) {
      console.log('❌ Employee not found')
      await mongoose.disconnect()
      return
    }

    console.log(`   Employee ID: ${employee.id || employee._id}`)
    console.log(`   Employee _id: ${employee._id}\n`)

    // Find company where this employee is an admin
    const employeeId = employee._id || employee.id
    if (!employeeId) {
      console.log('❌ Could not determine employee ID')
      await mongoose.disconnect()
      return
    }

    const admin = await CompanyAdmin.findOne({ employeeId: employeeId })
      .populate('companyId')
      .lean()

    if (!admin || !admin.companyId) {
      console.log('❌ Employee is NOT set as a company admin')
      await mongoose.disconnect()
      return
    }

    console.log('✅ Employee IS set as a company admin')
    console.log(`   Company: ${admin.companyId?.name || 'Unknown'}`)
    console.log(`   Company ID: ${admin.companyId?.id || admin.companyId?._id}`)
    console.log(`   Can Approve Orders: ${admin.canApproveOrders || false}\n`)

    const companyId = typeof admin.companyId === 'object' && admin.companyId._id
      ? admin.companyId._id
      : admin.companyId

    const company = await Company.findById(companyId).lean()

    if (company) {
      console.log('✅ Company found:')
      console.log(`   Name: ${company.name}`)
      console.log(`   ID: ${company.id}\n`)
      console.log('🎉 Login should work! The employee can access the company admin portal.')
    } else {
      console.log('❌ Company not found')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

verifyAmitLogin()


