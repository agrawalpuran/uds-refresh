/**
 * Script to verify admin-company linkage for a specific email
 * Checks if an employee is properly linked as a company admin
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

function encrypt(text) {
  const key = getKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return `${iv.toString('hex')}:${encrypted}`
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

async function verifyAdminCompanyLinkage(email) {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    console.log(`=== VERIFYING ADMIN-COMPANY LINKAGE FOR: ${email} ===\n`)

    // Step 1: Find employee by email
    console.log('Step 1: Finding employee by email...')
    const trimmedEmail = email.trim().toLowerCase()
    const encryptedEmail = encrypt(trimmedEmail)
    
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`Found ${allEmployees.length} total employees`)
    
    let employee = null
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decryptedEmail = decrypt(emp.email)
          if (decryptedEmail.toLowerCase() === trimmedEmail) {
            employee = emp
            console.log(`✓ Found employee: ${emp.employeeId || emp.id}`)
            console.log(`  - Employee ID: ${emp.employeeId || emp.id}`)
            console.log(`  - Name: ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'}`)
            console.log(`  - CompanyId (ObjectId): ${emp.companyId?.toString() || 'N/A'}`)
            break
          }
        } catch (error) {
          // Skip if decryption fails
          continue
        }
      }
    }

    if (!employee) {
      console.error(`✗ Employee not found for email: ${email}`)
      await mongoose.disconnect()
      return
    }

    // Step 2: Find admin record
    console.log('\nStep 2: Finding admin record...')
    const employeeIdStr = employee._id.toString()
    console.log(`Looking for admin record with employeeId: ${employeeIdStr}`)

    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`Found ${allAdmins.length} total admin records`)

    const adminRecord = allAdmins.find((a) => {
      if (!a.employeeId) return false
      return a.employeeId.toString() === employeeIdStr
    })

    if (!adminRecord) {
      console.error(`✗ No admin record found for employee: ${employeeIdStr}`)
      console.log('\nAvailable admin records:')
      allAdmins.forEach((a, idx) => {
        console.log(`  ${idx + 1}. EmployeeId: ${a.employeeId?.toString()}, CompanyId: ${a.companyId?.toString()}`)
      })
      await mongoose.disconnect()
      return
    }

    console.log(`✓ Found admin record:`)
    console.log(`  - EmployeeId: ${adminRecord.employeeId?.toString()}`)
    console.log(`  - CompanyId (ObjectId): ${adminRecord.companyId?.toString()}`)
    console.log(`  - CanApproveOrders: ${adminRecord.canApproveOrders || false}`)

    // Step 3: Find company
    console.log('\nStep 3: Finding company...')
    const companyIdStr = adminRecord.companyId.toString()
    console.log(`Looking for company with _id: ${companyIdStr}`)

    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`Found ${allCompanies.length} total companies`)

    const company = allCompanies.find((c) => c._id.toString() === companyIdStr)

    if (!company) {
      console.error(`✗ Company not found for ObjectId: ${companyIdStr}`)
      console.log('\nAvailable companies:')
      allCompanies.forEach((c, idx) => {
        console.log(`  ${idx + 1}. _id: ${c._id.toString()}, id: ${c.id}, name: ${c.name}`)
      })
      await mongoose.disconnect()
      return
    }

    console.log(`✓ Found company:`)
    console.log(`  - _id: ${company._id.toString()}`)
    console.log(`  - id (numeric): ${company.id}`)
    console.log(`  - name: ${company.name}`)

    // Step 4: Verify the linkage is correct
    console.log('\n=== VERIFICATION SUMMARY ===')
    console.log(`✓ Employee: ${employee.employeeId || employee.id}`)
    console.log(`✓ Admin Record: Found`)
    console.log(`✓ Company: ${company.name} (ID: ${company.id})`)
    console.log(`✓ Linkage Status: VALID`)
    console.log(`\nThe employee ${email} is properly linked as an admin for ${company.name} (ID: ${company.id})`)

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error during verification:', error)
    process.exit(1)
  }
}

// Get email from command line argument or use default
const email = process.argv[2] || 'amit.patel@goindigo.in'
verifyAdminCompanyLinkage(email)

