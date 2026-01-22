/**
 * Script to populate companyName field for each employee based on their companyId
 * Ensures companyName is always in sync with companyId
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

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read ENCRYPTION_KEY from .env.local')
}

function decrypt(text) {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift(), 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

function encrypt(text) {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    return iv.toString('hex') + ':' + encrypted
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

async function populateCompanyNameFromCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all companies and create a map
    const companies = await Company.find({}).lean()
    console.log(`📊 Found ${companies.length} companies:`)
    const companyMap = {}
    for (const comp of companies) {
      console.log(`   - ${comp.name} (${comp.id}) - _id: ${comp._id}`)
      companyMap[comp._id.toString()] = comp
    }
    console.log('')

    // Get all employees - use raw collection to get actual companyId values
    const db = mongoose.connection.db
    const employeesCollection = db.collection('employees')
    const allEmployeesRaw = await employeesCollection.find({}).toArray()

    console.log(`📊 Found ${allEmployeesRaw.length} employees\n`)

    let updatedCount = 0
    let alreadyCorrectCount = 0
    let errorCount = 0
    const issues = []

    for (const emp of allEmployeesRaw) {
      try {
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedCompanyName = decrypt(emp.companyName || '')
        
        // Get companyId from raw document
        let companyId = null
        let company = null
        
        if (emp.companyId) {
          companyId = emp.companyId.toString()
          company = companyMap[companyId]
        }

        if (!companyId || !company) {
          console.log(`⚠️  Employee ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
          if (!companyId) {
            console.log(`   Issue: Missing companyId`)
          } else {
            console.log(`   Issue: Invalid companyId: ${companyId} (company not found)`)
          }
          errorCount++
          issues.push({
            employeeId: emp.id,
            name: `${decryptedFirstName} ${decryptedLastName}`,
            companyId: companyId || 'MISSING',
            issue: !companyId ? 'Missing companyId' : 'Invalid companyId - company not found'
          })
          continue
        }

        const correctCompanyName = company.name
        const currentCompanyName = decryptedCompanyName

        // Check if companyName needs to be updated
        if (currentCompanyName !== correctCompanyName) {
          console.log(`🔧 Updating: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
          console.log(`   Current companyName: "${currentCompanyName}"`)
          console.log(`   Correct companyName: "${correctCompanyName}"`)
          console.log(`   CompanyId: ${companyId}`)

          // Encrypt the company name before saving
          const encryptedCompanyName = encrypt(correctCompanyName)

          // Update employee using raw collection to avoid encryption hooks
          await employeesCollection.updateOne(
            { _id: emp._id },
            { 
              $set: { 
                companyName: encryptedCompanyName
              }
            }
          )

          updatedCount++
          console.log(`   ✅ Updated\n`)
        } else {
          alreadyCorrectCount++
        }
      } catch (error) {
        console.error(`❌ Error processing employee ${emp.id}:`, error.message)
        errorCount++
        issues.push({
          employeeId: emp.id,
          error: error.message
        })
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   Total employees: ${allEmployeesRaw.length}`)
    console.log(`   Already correct: ${alreadyCorrectCount}`)
    console.log(`   Updated: ${updatedCount}`)
    console.log(`   Errors: ${errorCount}`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Employees with issues:`)
      for (const issue of issues) {
        console.log(`   - ${issue.name || issue.employeeId} (${issue.employeeId})`)
        if (issue.companyId) console.log(`     CompanyId: ${issue.companyId}`)
        console.log(`     Issue: ${issue.issue || issue.error}`)
      }
    }

    if (errorCount === 0 && updatedCount === 0) {
      console.log(`\n✅ All employees already have correct companyName!`)
    } else if (errorCount === 0) {
      console.log(`\n✅ All employees have been updated with correct companyName!`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

populateCompanyNameFromCompanyId()

