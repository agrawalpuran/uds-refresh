/**
 * Script to test admin company lookup
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

const IV_LENGTH = 16

function encrypt(text) {
  if (!text) return text
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

async function testAdminCompanyLookup() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all company admins
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`📊 Found ${allAdmins.length} admin records in companyadmins collection:\n`)
    
    for (const admin of allAdmins) {
      console.log(`Admin Record:`)
      console.log(`   _id: ${admin._id}`)
      console.log(`   companyId: ${admin.companyId} (type: ${typeof admin.companyId})`)
      console.log(`   employeeId: ${admin.employeeId} (type: ${typeof admin.employeeId})`)
      console.log(`   canApproveOrders: ${admin.canApproveOrders}`)
      
      // Find the company
      const companyIdStr = admin.companyId.toString()
      const companies = await db.collection('companies').find({}).toArray()
      const company = companies.find((c) => c._id.toString() === companyIdStr)
      
      if (company) {
        console.log(`   ✅ Company: ${company.name} (${company.id})`)
      } else {
        console.log(`   ❌ Company not found for companyId: ${companyIdStr}`)
      }
      
      // Find the employee
      const employeeIdStr = admin.employeeId.toString()
      const employees = await db.collection('employees').find({}).toArray()
      const employee = employees.find((e) => e._id.toString() === employeeIdStr)
      
      if (employee) {
        // Decrypt email
        let email = employee.email
        if (email && typeof email === 'string' && email.includes(':')) {
          try {
            const parts = email.split(':')
            const iv = Buffer.from(parts.shift(), 'hex')
            const encryptedText = parts.join(':')
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
            let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
            decrypted += decipher.final('utf8')
            email = decrypted
          } catch (error) {
            console.log(`   ⚠️  Could not decrypt email`)
          }
        }
        console.log(`   ✅ Employee: ${employee.id || employee.employeeId} - Email: ${email}`)
        console.log(`   Employee companyId: ${employee.companyId} (type: ${typeof employee.companyId})`)
        
        // Check if employee's companyId matches admin's companyId
        const empCompanyIdStr = employee.companyId ? employee.companyId.toString() : null
        if (empCompanyIdStr === companyIdStr) {
          console.log(`   ✅ Employee companyId matches admin companyId`)
        } else {
          console.log(`   ⚠️  Employee companyId (${empCompanyIdStr}) does NOT match admin companyId (${companyIdStr})`)
        }
      } else {
        console.log(`   ❌ Employee not found for employeeId: ${employeeIdStr}`)
      }
      
      console.log('')
    }
    
    await mongoose.disconnect()
    console.log('✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testAdminCompanyLookup()

