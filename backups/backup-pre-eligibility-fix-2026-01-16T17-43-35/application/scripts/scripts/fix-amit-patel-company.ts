/**
 * Script to check and fix Amit Patel's employee record
 * Ensures companyId is properly set
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

// Encryption utility
const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(text: string): string {
  const parts = text.split(':')
  const iv = Buffer.from(parts.shift()!, 'hex')
  const encryptedText = parts.join(':')
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  location: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  mobile: { type: String, required: true },
  shirtSize: { type: String, required: true },
  pantSize: { type: String, required: true },
  shoeSize: { type: String, required: true },
  address: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  branchName: { type: String },
  eligibility: {
    shirt: { type: Number, required: true, default: 0 },
    pant: { type: Number, required: true, default: 0 },
    shoe: { type: Number, required: true, default: 0 },
    jacket: { type: Number, required: true, default: 0 },
  },
  cycleDuration: {
    shirt: { type: Number, required: true, default: 6 },
    pant: { type: Number, required: true, default: 6 },
    shoe: { type: Number, required: true, default: 6 },
    jacket: { type: Number, required: true, default: 12 },
  },
  dispatchPreference: { type: String, enum: ['direct', 'central', 'regional'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  period: { type: String, required: true },
  dateOfJoining: { type: Date, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  secondaryColor: { type: String, default: '#f76b1c' },
  showPrices: { type: Boolean, default: true },
  allowPersonalPayments: { type: Boolean, default: false },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function fixAmitPatelCompany() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const email = 'amit.patel@goindigo.in'
    const trimmedEmail = email.trim()
    const encryptedEmail = encrypt(trimmedEmail)

    console.log(`🔍 Checking employee: ${email}`)
    console.log(`   Encrypted email: ${encryptedEmail}\n`)

    // Find employee by encrypted email
    let employee = await Employee.findOne({ email: encryptedEmail })
      .populate('companyId', 'id name')
      .lean()

    // If not found, try decrypting all emails
    if (!employee) {
      console.log('⚠️  Employee not found by encrypted email, searching all employees...')
      const allEmployees = await Employee.find({}).populate('companyId', 'id name').lean()
      
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
      console.log('❌ Employee not found in database')
      await mongoose.disconnect()
      return
    }

    console.log(`\n📋 Current Employee Data:`)
    console.log(`   ID: ${employee.id || employee._id}`)
    console.log(`   Employee ID: ${employee.employeeId}`)
    console.log(`   Name: ${employee.firstName} ${employee.lastName}`)
    console.log(`   Company ID (raw): ${employee.companyId}`)
    console.log(`   Company ID (type): ${typeof employee.companyId}`)
    
    if (employee.companyId) {
      if (typeof employee.companyId === 'object' && employee.companyId !== null) {
        console.log(`   Company ID (object): ${employee.companyId._id || employee.companyId.id}`)
        console.log(`   Company Name: ${employee.companyId.name || 'N/A'}`)
      } else {
        console.log(`   Company ID (string/ObjectId): ${employee.companyId}`)
      }
    } else {
      console.log(`   ⚠️  Company ID is NULL or UNDEFINED!`)
    }

    // Find Indigo Airlines company
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('\n❌ Indigo Airlines company not found')
      await mongoose.disconnect()
      return
    }

    console.log(`\n🏢 Indigo Airlines:`)
    console.log(`   ID: ${indigo.id}`)
    console.log(`   Name: ${indigo.name}`)
    console.log(`   _id: ${indigo._id}`)

    // Check if companyId needs to be fixed
    let needsFix = false
    let companyIdValue: any = null

    if (!employee.companyId) {
      needsFix = true
      companyIdValue = indigo._id
      console.log(`\n⚠️  Employee has no companyId - will set to Indigo Airlines`)
    } else if (typeof employee.companyId === 'object' && employee.companyId !== null) {
      const currentCompanyId = employee.companyId._id || employee.companyId.id
      if (!currentCompanyId || currentCompanyId.toString() !== indigo._id.toString()) {
        needsFix = true
        companyIdValue = indigo._id
        console.log(`\n⚠️  Employee companyId doesn't match Indigo - will update`)
      }
    } else {
      // It's a string or ObjectId
      const currentCompanyId = employee.companyId.toString()
      if (currentCompanyId !== indigo._id.toString()) {
        needsFix = true
        companyIdValue = indigo._id
        console.log(`\n⚠️  Employee companyId doesn't match Indigo - will update`)
      }
    }

    if (needsFix) {
      console.log(`\n🔧 Fixing employee record...`)
      
      // Use findOneAndUpdate to update the companyId
      const updated = await Employee.findOneAndUpdate(
        { _id: employee._id },
        { 
          $set: { 
            companyId: indigo._id,
            companyName: indigo.name
          }
        },
        { new: true }
      ).populate('companyId', 'id name')

      if (updated) {
        console.log(`✅ Successfully updated employee record`)
        console.log(`   New Company ID: ${updated.companyId}`)
        console.log(`   New Company Name: ${updated.companyName}`)
      } else {
        console.log(`❌ Failed to update employee record`)
      }
    } else {
      console.log(`\n✅ Employee record is correct - no fix needed`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixAmitPatelCompany()

