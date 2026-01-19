/**
 * Script to list all employees and their emails (decrypted)
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

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      throw new Error('Invalid encrypted format')
    }
    const key = getKey()
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`)
  }
}

async function listAllEmployees() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`Found ${allEmployees.length} employees\n`)

    console.log('=== ALL EMPLOYEES ===\n')
    for (let i = 0; i < allEmployees.length; i++) {
      const emp = allEmployees[i]
      let email = 'N/A'
      if (emp.email && typeof emp.email === 'string') {
        try {
          email = decrypt(emp.email)
        } catch (error) {
          email = `[Decryption failed: ${emp.email.substring(0, 20)}...]`
        }
      }
      
      console.log(`${i + 1}. ${emp.employeeId || emp.id}`)
      console.log(`   Email: ${email}`)
      console.log(`   CompanyId: ${emp.companyId?.toString() || 'N/A'}`)
      console.log(`   CompanyName: ${emp.companyName || 'N/A'}`)
      console.log('')
    }

    // Also check for admin records
    console.log('\n=== COMPANY ADMINS ===\n')
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`Found ${allAdmins.length} admin records\n`)

    for (let i = 0; i < allAdmins.length; i++) {
      const admin = allAdmins[i]
      const employeeIdStr = admin.employeeId?.toString()
      
      // Find employee
      const employee = allEmployees.find((e) => e._id.toString() === employeeIdStr)
      let email = 'N/A'
      if (employee && employee.email) {
        try {
          email = decrypt(employee.email)
        } catch (error) {
          email = '[Decryption failed]'
        }
      }

      // Find company
      const allCompanies = await db.collection('companies').find({}).toArray()
      const company = allCompanies.find((c) => c._id.toString() === admin.companyId?.toString())

      console.log(`${i + 1}. Admin Record`)
      console.log(`   EmployeeId: ${employeeIdStr}`)
      console.log(`   Employee Email: ${email}`)
      console.log(`   CompanyId (ObjectId): ${admin.companyId?.toString()}`)
      console.log(`   Company: ${company ? `${company.name} (ID: ${company.id})` : 'NOT FOUND'}`)
      console.log(`   CanApproveOrders: ${admin.canApproveOrders || false}`)
      console.log('')
    }

    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

listAllEmployees()
