/**
 * Script to list all employees and check for Amit Patel
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

function decrypt(text: string): string {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift()!, 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function listAllEmployees() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const allEmployees = await Employee.find({})
      .populate('companyId', 'id name')
      .lean()

    console.log(`📊 Total employees: ${allEmployees.length}\n`)

    let foundAmit = false

    for (const emp of allEmployees) {
      try {
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedEmail = decrypt(emp.email || '')
        
        const fullName = `${decryptedFirstName} ${decryptedLastName}`.toLowerCase()
        
        if (fullName.includes('amit') && fullName.includes('patel')) {
          foundAmit = true
          console.log(`\n✅ FOUND AMIT PATEL:`)
          console.log(`   ID: ${emp.id}`)
          console.log(`   Employee ID: ${emp.employeeId}`)
          console.log(`   Name: ${decryptedFirstName} ${decryptedLastName}`)
          console.log(`   Email: ${decryptedEmail}`)
          console.log(`   Company ID (raw): ${emp.companyId}`)
          console.log(`   Company ID (type): ${typeof emp.companyId}`)
          
          if (emp.companyId) {
            if (typeof emp.companyId === 'object' && emp.companyId !== null) {
              console.log(`   Company ID: ${emp.companyId._id || emp.companyId.id}`)
              console.log(`   Company Name: ${emp.companyId.name || 'N/A'}`)
            } else {
              console.log(`   Company ID: ${emp.companyId}`)
            }
          } else {
            console.log(`   ⚠️  Company ID is NULL or UNDEFINED!`)
          }
        }
      } catch (error) {
        // Skip if decryption fails
      }
    }

    if (!foundAmit) {
      console.log('\n❌ Amit Patel not found in database')
      console.log('\n📋 All employees:')
      for (const emp of allEmployees.slice(0, 10)) {
        try {
          const decryptedFirstName = decrypt(emp.firstName || '')
          const decryptedLastName = decrypt(emp.lastName || '')
          const decryptedEmail = decrypt(emp.email || '')
          console.log(`   - ${decryptedFirstName} ${decryptedLastName} (${decryptedEmail})`)
        } catch (error) {
          console.log(`   - [Could not decrypt]`)
        }
      }
      if (allEmployees.length > 10) {
        console.log(`   ... and ${allEmployees.length - 10} more`)
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

listAllEmployees()

