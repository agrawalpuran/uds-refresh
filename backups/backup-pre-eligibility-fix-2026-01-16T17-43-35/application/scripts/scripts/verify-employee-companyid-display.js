/**
 * Script to verify employee companyId is properly set and can be retrieved
 * This helps debug why the UI is showing "Company ID: Not found"
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

async function verifyEmployeeCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    const companyMap = {}
    for (const comp of companies) {
      companyMap[comp._id.toString()] = comp
      console.log(`Company: ${comp.name} (${comp.id}) - _id: ${comp._id}`)
    }
    console.log('')

    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Found ${employees.length} employees\n`)

    for (const emp of employees) {
      const decryptedEmail = decrypt(emp.email || '')
      const decryptedFirstName = decrypt(emp.firstName || '')
      const decryptedLastName = decrypt(emp.lastName || '')
      const decryptedCompanyName = decrypt(emp.companyName || '')
      
      console.log(`\n👤 Employee: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
      console.log(`   Email: ${decryptedEmail}`)
      console.log(`   Raw companyId in DB: ${emp.companyId ? (typeof emp.companyId === 'object' ? emp.companyId.toString() : emp.companyId) : 'NULL'}`)
      console.log(`   Company Name: ${decryptedCompanyName}`)
      
      if (emp.companyId) {
        const companyIdStr = typeof emp.companyId === 'object' ? emp.companyId.toString() : emp.companyId.toString()
        const company = companyMap[companyIdStr]
        
        if (company) {
          console.log(`   ✅ CompanyId is valid`)
          console.log(`   Company: ${company.name} (${company.id})`)
          console.log(`   Company _id: ${company._id}`)
        } else {
          console.log(`   ❌ CompanyId ${companyIdStr} not found in companies collection`)
        }
      } else {
        console.log(`   ❌ CompanyId is NULL or missing`)
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyEmployeeCompanyId()

