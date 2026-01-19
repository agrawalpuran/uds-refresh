/**
 * Script to verify all employees have valid companyId associations
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

async function verifyAllEmployees() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all companies
    const companies = await Company.find({}).lean()
    const companyMap: Record<string, any> = {}
    for (const comp of companies) {
      companyMap[comp._id.toString()] = comp
    }

    // Get all employees
    const allEmployees = await Employee.find({})
      .populate('companyId', 'id name')
      .lean()
      .sort({ id: 1 })

    console.log(`📊 Verifying ${allEmployees.length} employees:\n`)

    let validCount = 0
    let invalidCount = 0

    for (const emp of allEmployees) {
      try {
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedEmail = decrypt(emp.email || '')
        const decryptedCompanyName = decrypt(emp.companyName || '')
        
        let isValid = false
        let companyInfo = ''

        if (emp.companyId) {
          if (typeof emp.companyId === 'object' && emp.companyId !== null) {
            const companyId = emp.companyId._id || emp.companyId.id
            if (companyId && companyMap[companyId.toString()]) {
              isValid = true
              const company = companyMap[companyId.toString()]
              companyInfo = `${company.name} (${company.id})`
            } else {
              companyInfo = 'Invalid companyId reference'
            }
          } else if (emp.companyId) {
            const companyIdStr = emp.companyId.toString()
            if (companyMap[companyIdStr]) {
              isValid = true
              const company = companyMap[companyIdStr]
              companyInfo = `${company.name} (${company.id})`
            } else {
              companyInfo = `Unknown companyId: ${companyIdStr}`
            }
          }
        } else {
          companyInfo = 'NULL/UNDEFINED'
        }

        if (isValid) {
          validCount++
          console.log(`✅ ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
          console.log(`   Email: ${decryptedEmail}`)
          console.log(`   Company: ${companyInfo}`)
        } else {
          invalidCount++
          console.log(`❌ ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
          console.log(`   Email: ${decryptedEmail}`)
          console.log(`   Company Name: ${decryptedCompanyName}`)
          console.log(`   Issue: ${companyInfo}`)
        }
        console.log('')
      } catch (error: any) {
        console.error(`❌ Error processing employee ${emp.id}:`, error.message)
        invalidCount++
        console.log('')
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   Total employees: ${allEmployees.length}`)
    console.log(`   Valid companyId: ${validCount}`)
    console.log(`   Invalid/Missing: ${invalidCount}`)

    if (invalidCount === 0) {
      console.log(`\n✅ All employees have valid companyId associations!`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyAllEmployees()

