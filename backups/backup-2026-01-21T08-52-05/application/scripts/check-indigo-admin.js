/**
 * Script to check Indigo admin and fix if needed
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

async function checkIndigoAdmin() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find Indigo company
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found company: ${indigo.name} (ID: ${indigo.id})\n`)

    // Find all admins for Indigo
    const indigoAdmins = await CompanyAdmin.find({ companyId: indigo._id })
      .populate('employeeId')
      .lean()

    console.log(`📊 Indigo admins found: ${indigoAdmins.length}\n`)

    if (indigoAdmins.length === 0) {
      console.log('❌ No admins found for Indigo Airlines\n')
      
      // Check if amit.patel@goindigo.in employee exists
      const allEmployees = await Employee.find({}).lean()
      let amitEmployee = null
      
      for (const emp of allEmployees) {
        try {
          const email = decrypt(emp.email || '')
          if (email && email.toLowerCase().includes('amit') && email.toLowerCase().includes('patel')) {
            amitEmployee = emp
            console.log(`✅ Found potential Amit employee: ${email} (ID: ${emp.id || emp._id})`)
            break
          }
        } catch (e) {
          // Skip
        }
      }
      
      if (!amitEmployee) {
        console.log('\n⚠️  Employee amit.patel@goindigo.in does not exist')
        console.log('   You need to either:')
        console.log('   1. Create the employee first')
        console.log('   2. Or use an existing employee email')
      } else {
        console.log('\n💡 Would you like to set this employee as Indigo admin?')
      }
    } else {
      for (const admin of indigoAdmins) {
        try {
          const email = decrypt(admin.employeeId?.email || '')
          console.log(`   Admin: ${email || '[Could not decrypt]'}`)
          console.log(`   Employee ID: ${admin.employeeId?.id || admin.employeeId?._id}`)
          console.log(`   Can Approve Orders: ${admin.canApproveOrders || false}\n`)
        } catch (e) {
          console.log(`   Admin: [Could not decrypt email]`)
          console.log(`   Employee ID: ${admin.employeeId?.id || admin.employeeId?._id}\n`)
        }
      }
    }

    // Check if amit.patel@goindigo.in exists
    console.log('\n🔍 Checking for amit.patel@goindigo.in...')
    const allEmployees = await Employee.find({}).lean()
    let foundAmit = false
    
    for (const emp of allEmployees) {
      try {
        const email = decrypt(emp.email || '')
        if (email && email.toLowerCase() === 'amit.patel@goindigo.in') {
          foundAmit = true
          console.log(`✅ Found employee: ${email} (ID: ${emp.id || emp._id})`)
          
          // Check if they're an admin
          const isAdmin = await CompanyAdmin.findOne({ employeeId: emp._id })
          if (isAdmin) {
            const adminCompany = await Company.findById(isAdmin.companyId)
            console.log(`   ✅ Is admin for: ${adminCompany?.name || 'Unknown'}`)
          } else {
            console.log(`   ❌ Is NOT set as admin`)
          }
          break
        }
      } catch (e) {
        // Skip
      }
    }
    
    if (!foundAmit) {
      console.log('❌ Employee amit.patel@goindigo.in does not exist in database')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkIndigoAdmin()


