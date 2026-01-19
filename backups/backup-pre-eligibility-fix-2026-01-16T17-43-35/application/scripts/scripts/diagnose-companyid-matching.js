/**
 * Diagnostic script to check companyId storage and matching for login
 * 
 * This script checks:
 * 1. How companyId is stored in employee records (should be ObjectId)
 * 2. How companyId is stored in admin records (should be ObjectId)
 * 3. Whether they match correctly
 * 4. Whether the company exists
 * 
 * Usage: node scripts/diagnose-companyid-matching.js <email>
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// Read from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function encrypt(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return ''
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return ''
    
    let iv, encrypted
    try {
      iv = Buffer.from(parts[0], 'base64')
      encrypted = Buffer.from(parts[1], 'base64')
    } catch {
      iv = Buffer.from(parts[0], 'hex')
      encrypted = Buffer.from(parts[1], 'hex')
    }
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    return ''
  }
}

async function diagnoseCompanyIdMatching(email) {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('COMPANY ID MATCHING DIAGNOSTIC')
    console.log('='.repeat(80))
    console.log(`Email: ${email}`)
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    // Step 1: Find employee
    console.log('🔍 STEP 1: Finding employee...')
    const normalizedEmail = email.trim().toLowerCase()
    const encryptedEmail = encrypt(normalizedEmail)
    
    // Try multiple methods to find employee
    let rawEmployee = await db.collection('employees').findOne({ email: encryptedEmail })
    if (!rawEmployee) {
      rawEmployee = await db.collection('employees').findOne({ email: normalizedEmail })
    }
    if (!rawEmployee) {
      // Try decryption matching
      const allEmployees = await db.collection('employees').find({}).toArray()
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decrypted = decrypt(emp.email)
            if (decrypted && decrypted.trim().toLowerCase() === normalizedEmail) {
              rawEmployee = emp
              break
            }
          } catch {}
        }
      }
    }
    
    if (!rawEmployee) {
      console.error('❌ Employee not found')
      return
    }
    
    console.log('✅ Employee found:')
    console.log(`   Employee ID: ${rawEmployee.id || rawEmployee.employeeId}`)
    console.log(`   _id: ${rawEmployee._id}`)
    console.log(`   _id type: ${rawEmployee._id instanceof require('mongodb').ObjectId ? 'ObjectId' : typeof rawEmployee._id}`)
    console.log('')
    
    // Step 2: Check employee's companyId
    console.log('🔍 STEP 2: Checking employee companyId...')
    if (!rawEmployee.companyId) {
      console.error('❌ Employee has no companyId!')
      return
    }
    
    const employeeCompanyId = rawEmployee.companyId
    const employeeCompanyIdStr = employeeCompanyId.toString()
    console.log(`   companyId: ${employeeCompanyIdStr}`)
    console.log(`   companyId type: ${employeeCompanyId instanceof require('mongodb').ObjectId ? 'ObjectId' : typeof employeeCompanyId}`)
    console.log(`   companyId is ObjectId: ${employeeCompanyId instanceof require('mongodb').ObjectId}`)
    console.log('')
    
    // Step 3: Find company from employee's companyId
    console.log('🔍 STEP 3: Finding company from employee companyId...')
    const companyFromEmployee = await db.collection('companies').findOne({
      _id: employeeCompanyId instanceof require('mongodb').ObjectId 
        ? employeeCompanyId 
        : new require('mongodb').ObjectId(employeeCompanyIdStr)
    })
    
    if (!companyFromEmployee) {
      console.error('❌ Company not found from employee companyId!')
      console.error(`   Searched ObjectId: ${employeeCompanyIdStr}`)
      
      // List all companies
      const allCompanies = await db.collection('companies').find({}).toArray()
      console.error(`   Available companies:`, allCompanies.map(c => ({
        _id: c._id.toString(),
        id: c.id,
        name: c.name
      })))
      return
    }
    
    console.log('✅ Company found from employee:')
    console.log(`   Company Name: ${companyFromEmployee.name}`)
    console.log(`   Company ID: ${companyFromEmployee.id}`)
    console.log(`   Company _id: ${companyFromEmployee._id}`)
    console.log('')
    
    // Step 4: Find admin record
    console.log('🔍 STEP 4: Finding admin record...')
    const employeeObjectId = rawEmployee._id instanceof require('mongodb').ObjectId
      ? rawEmployee._id
      : new require('mongodb').ObjectId(rawEmployee._id.toString())
    
    const adminRecord = await db.collection('companyadmins').findOne({
      employeeId: employeeObjectId
    })
    
    if (!adminRecord) {
      console.error('❌ Admin record not found!')
      console.error(`   Searched employeeId: ${employeeObjectId.toString()}`)
      
      // List all admin records
      const allAdmins = await db.collection('companyadmins').find({}).toArray()
      console.error(`   Available admin records:`, allAdmins.map(a => ({
        _id: a._id?.toString(),
        employeeId: a.employeeId?.toString(),
        companyId: a.companyId?.toString()
      })))
      return
    }
    
    console.log('✅ Admin record found:')
    console.log(`   Admin _id: ${adminRecord._id}`)
    console.log(`   employeeId: ${adminRecord.employeeId}`)
    console.log(`   employeeId type: ${adminRecord.employeeId instanceof require('mongodb').ObjectId ? 'ObjectId' : typeof adminRecord.employeeId}`)
    console.log(`   companyId: ${adminRecord.companyId}`)
    console.log(`   companyId type: ${adminRecord.companyId instanceof require('mongodb').ObjectId ? 'ObjectId' : typeof adminRecord.companyId}`)
    console.log('')
    
    // Step 5: Check if admin record companyId matches employee companyId
    console.log('🔍 STEP 5: Comparing companyIds...')
    const adminCompanyIdStr = adminRecord.companyId.toString()
    const employeeCompanyIdStr2 = employeeCompanyId.toString()
    
    console.log(`   Employee companyId: ${employeeCompanyIdStr2}`)
    console.log(`   Admin companyId: ${adminCompanyIdStr}`)
    console.log(`   Match: ${employeeCompanyIdStr2 === adminCompanyIdStr ? '✅ YES' : '❌ NO'}`)
    console.log('')
    
    if (employeeCompanyIdStr2 !== adminCompanyIdStr) {
      console.error('❌ MISMATCH: Employee companyId does not match admin record companyId!')
      console.error('   This is the problem! The employee belongs to a different company than the admin record.')
      return
    }
    
    // Step 6: Find company from admin record companyId
    console.log('🔍 STEP 6: Finding company from admin record companyId...')
    const adminCompanyObjectId = adminRecord.companyId instanceof require('mongodb').ObjectId
      ? adminRecord.companyId
      : new require('mongodb').ObjectId(adminCompanyIdStr)
    
    const companyFromAdmin = await db.collection('companies').findOne({
      _id: adminCompanyObjectId
    })
    
    if (!companyFromAdmin) {
      console.error('❌ Company not found from admin record companyId!')
      console.error(`   Searched ObjectId: ${adminCompanyIdStr}`)
      return
    }
    
    console.log('✅ Company found from admin record:')
    console.log(`   Company Name: ${companyFromAdmin.name}`)
    console.log(`   Company ID: ${companyFromAdmin.id}`)
    console.log(`   Company _id: ${companyFromAdmin._id}`)
    console.log('')
    
    // Step 7: Final verification
    console.log('🔍 STEP 7: Final verification...')
    const companyFromEmployeeId = companyFromEmployee._id.toString()
    const companyFromAdminId = companyFromAdmin._id.toString()
    
    console.log(`   Company from employee _id: ${companyFromEmployeeId}`)
    console.log(`   Company from admin _id: ${companyFromAdminId}`)
    console.log(`   Match: ${companyFromEmployeeId === companyFromAdminId ? '✅ YES' : '❌ NO'}`)
    console.log('')
    
    if (companyFromEmployeeId === companyFromAdminId) {
      console.log('✅ SUCCESS: All checks passed!')
      console.log(`   Employee: ${rawEmployee.id || rawEmployee.employeeId}`)
      console.log(`   Company: ${companyFromEmployee.name} (ID: ${companyFromEmployee.id})`)
      console.log(`   Admin record exists: Yes`)
      console.log(`   CompanyIds match: Yes`)
    } else {
      console.error('❌ FAILURE: Company mismatch!')
      console.error(`   Employee belongs to: ${companyFromEmployee.name} (${companyFromEmployee.id})`)
      console.error(`   Admin record points to: ${companyFromAdmin.name} (${companyFromAdmin.id})`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.close()
    console.log('')
    console.log('Database connection closed')
    console.log('='.repeat(80))
  }
}

// Get email from command line
const email = process.argv[2] || 'vikram.kumar10@icicibank.com'

diagnoseCompanyIdMatching(email)

