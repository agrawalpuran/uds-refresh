/**
 * Script to check if amit.patel@goindigo.in is set as a company admin
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

// Import encryption utility
const crypto = require('crypto')

// Encryption key (should match the one in the app)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.scryptSync('default-key-change-in-production', 'salt', 32)
const IV_LENGTH = 16

function encrypt(text) {
  if (!text) return text
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text) {
  if (!text || typeof text !== 'string' || !text.includes(':')) return text
  const parts = text.split(':')
  if (parts.length !== 2) return text
  const iv = Buffer.from(parts[0], 'hex')
  const encryptedText = parts[1]
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
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

async function checkAmitAdminStatus() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const email = 'amit.patel@goindigo.in'
    const encryptedEmail = encrypt(email)

    console.log(`🔍 Checking admin status for: ${email}`)
    console.log(`   Encrypted email: ${encryptedEmail}\n`)

    // Try to find employee by encrypted email
    let employee = await Employee.findOne({ email: encryptedEmail }).lean()
    
    if (!employee) {
      // Try plain text (in case encryption wasn't applied)
      employee = await Employee.findOne({ email: email }).lean()
    }

    if (!employee) {
      // Try to find by decrypting all emails
      console.log('⚠️  Employee not found by direct email match. Searching all employees...\n')
      const allEmployees = await Employee.find({}).lean()
      
      for (const emp of allEmployees) {
        try {
          const decryptedEmail = decrypt(emp.email || '')
          if (decryptedEmail && decryptedEmail.toLowerCase() === email.toLowerCase()) {
            employee = emp
            console.log(`✅ Found employee by decrypting email`)
            break
          }
        } catch (e) {
          // Skip if decryption fails
        }
      }
    }

    if (!employee) {
      console.log('❌ Employee not found in database')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found employee:`)
    console.log(`   ID: ${employee.id || employee._id}`)
    console.log(`   Email (encrypted): ${employee.email}`)
    try {
      const decryptedEmail = decrypt(employee.email || '')
      console.log(`   Email (decrypted): ${decryptedEmail}`)
    } catch (e) {
      console.log(`   Email (decrypted): [decryption failed]`)
    }
    console.log(`   Name: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'}\n`)

    // Check if employee is a company admin
    const admin = await CompanyAdmin.findOne({ employeeId: employee._id })
      .populate('companyId')
      .lean()

    if (!admin) {
      console.log('❌ Employee is NOT set as a company admin')
      console.log('   No CompanyAdmin record found for this employee\n')
      
      // Check all company admins to see what's in the database
      const allAdmins = await CompanyAdmin.find({}).populate('employeeId').populate('companyId').lean()
      console.log(`📊 Total company admins in database: ${allAdmins.length}`)
      if (allAdmins.length > 0) {
        console.log('\n   Existing admins:')
        for (const adm of allAdmins) {
          try {
            const empEmail = decrypt(adm.employeeId?.email || '')
            const companyName = adm.companyId?.name || 'Unknown'
            console.log(`      - ${empEmail} (Company: ${companyName})`)
          } catch (e) {
            console.log(`      - [Could not decrypt email] (Company: ${adm.companyId?.name || 'Unknown'})`)
          }
        }
      }
      
      await mongoose.disconnect()
      return
    }

    console.log('✅ Employee IS set as a company admin')
    console.log(`   Company: ${admin.companyId?.name || 'Unknown'}`)
    console.log(`   Company ID: ${admin.companyId?.id || admin.companyId?._id}`)
    console.log(`   Can Approve Orders: ${admin.canApproveOrders || false}\n`)

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkAmitAdminStatus()


