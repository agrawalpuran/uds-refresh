/**
 * Script to fetch companyId for a specific employee by email
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

async function fetchEmployeeCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const email = 'vikram.singh@goindigo.in'
    const encryptedEmail = encrypt(email)
    
    console.log(`🔍 Searching for employee with email: ${email}`)
    console.log(`   Encrypted email: ${encryptedEmail.substring(0, 50)}...\n`)

    // Try to find by encrypted email first
    let employee = await db.collection('employees').findOne({ email: encryptedEmail })
    
    // If not found, search through all employees and decrypt
    if (!employee) {
      console.log('⚠️  Not found with encrypted email, searching all employees...\n')
      const allEmployees = await db.collection('employees').find({}).toArray()
      
      for (const emp of allEmployees) {
        if (emp.email) {
          try {
            const decryptedEmail = decrypt(emp.email)
            if (decryptedEmail.toLowerCase() === email.toLowerCase()) {
              employee = emp
              break
            }
          } catch (error) {
            // Skip employees with decryption errors
            continue
          }
        }
      }
    }

    if (!employee) {
      console.log('❌ Employee not found with email:', email)
      await mongoose.disconnect()
      return
    }

    console.log('✅ Employee found!\n')
    console.log('📋 Employee Details:')
    console.log(`   ID: ${employee.id || employee.employeeId || employee._id}`)
    console.log(`   First Name: ${decrypt(employee.firstName || '')}`)
    console.log(`   Last Name: ${decrypt(employee.lastName || '')}`)
    console.log(`   Email: ${decrypt(employee.email || '')}`)
    console.log(`   Company Name: ${decrypt(employee.companyName || '')}`)
    console.log(`   CompanyId (raw): ${employee.companyId}`)
    console.log(`   CompanyId type: ${typeof employee.companyId}`)
    
    if (employee.companyId) {
      const companyIdStr = employee.companyId.toString()
      console.log(`   CompanyId (string): ${companyIdStr}`)
      
      // Check if it's an ObjectId (24 hex characters)
      if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
        console.log(`   ⚠️  CompanyId is an ObjectId, looking up company...`)
        
        // Find the company by ObjectId - try multiple methods
        let company = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(companyIdStr) })
        
        // If not found, try finding all and matching by string
        if (!company) {
          const allCompanies = await db.collection('companies').find({}).toArray()
          company = allCompanies.find(c => c._id.toString() === companyIdStr)
        }
        
        if (company) {
          console.log(`\n✅ Company found:`)
          console.log(`   Company ID (string): ${company.id}`)
          console.log(`   Company Name: ${company.name}`)
          console.log(`   Company _id: ${company._id}`)
          console.log(`\n📌 Final CompanyId for employee: ${company.id}`)
        } else {
          console.log(`\n❌ Company not found for ObjectId: ${companyIdStr}`)
          console.log(`   Available companies:`)
          const allCompanies = await db.collection('companies').find({}).toArray()
          allCompanies.forEach(c => {
            console.log(`     ${c._id.toString()} - ${c.name} (${c.id})`)
          })
        }
      } else {
        console.log(`\n✅ CompanyId is already a string ID: ${companyIdStr}`)
        console.log(`\n📌 Final CompanyId for employee: ${companyIdStr}`)
      }
    } else {
      console.log(`\n❌ Employee has no companyId!`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fetchEmployeeCompanyId()

