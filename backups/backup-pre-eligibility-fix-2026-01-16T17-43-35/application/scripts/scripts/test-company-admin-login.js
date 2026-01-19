/**
 * Test script to verify company admin login flow
 * Tests the complete flow: email → employee → admin record → company
 */

const { MongoClient, ObjectId } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Get encryption key (same as lib/utils/encryption.ts)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encrypt(text) {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(16)
    const key = getKey()
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    throw new Error('Failed to encrypt data')
  }
}

function decrypt(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string') return encryptedText
  if (!encryptedText.includes(':')) return encryptedText
  
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    
    const key = getKey()
    
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
        return decrypted
      }
    } catch (base64Error) {
      try {
        const iv = Buffer.from(parts[0], 'hex')
        const encrypted = parts[1]
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
        let decrypted = decipher.update(encrypted, 'hex', 'utf8')
        decrypted += decipher.final('utf8')
        if (decrypted && decrypted !== encryptedText && !decrypted.includes(':')) {
          return decrypted
        }
      } catch (hexError) {
        return encryptedText
      }
    }
    return encryptedText
  } catch (error) {
    return encryptedText
  }
}

async function testCompanyAdminLogin(testEmail) {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('COMPANY ADMIN LOGIN TEST')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    // Normalize email (same as login flow)
    const normalizedEmail = testEmail.trim().toLowerCase()
    console.log(`Test email: "${testEmail}"`)
    console.log(`Normalized email: "${normalizedEmail}"`)
    console.log('')
    
    // Step 1: Find employee by email
    console.log('🔍 Step 1: Finding employee by email...')
    
    // Try encrypted lookup first
    const encryptedEmail = encrypt(normalizedEmail)
    console.log(`   Encrypted email: ${encryptedEmail.substring(0, 50)}...`)
    
    let employee = await db.collection('employees').findOne({ email: encryptedEmail })
    
    if (!employee) {
      console.log('   ⚠️  Not found with encrypted lookup, trying decryption fallback...')
      const allEmployees = await db.collection('employees').find({}).toArray()
      console.log(`   Checking ${allEmployees.length} employees...`)
      
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string' && emp.email.includes(':')) {
          try {
            const decrypted = decrypt(emp.email)
            if (decrypted && 
                decrypted !== emp.email && 
                !decrypted.includes(':') && 
                decrypted.toLowerCase() === normalizedEmail) {
              console.log(`   ✅ Found via decryption: ${decrypted}`)
              employee = emp
              break
            }
          } catch (error) {
            continue
          }
        }
      }
    } else {
      console.log('   ✅ Found via encrypted lookup')
    }
    
    if (!employee) {
      console.log('   ❌ Employee not found')
      return
    }
    
    console.log(`   Employee ID: ${employee.id || employee.employeeId}`)
    console.log(`   Employee _id: ${employee._id}`)
    console.log('')
    
    // Step 2: Find admin record
    console.log('🔍 Step 2: Finding admin record...')
    const employeeObjectId = employee._id instanceof ObjectId 
      ? employee._id 
      : new ObjectId(employee._id.toString())
    
    console.log(`   Employee _id (ObjectId): ${employeeObjectId}`)
    
    const adminRecord = await db.collection('companyadmins').findOne({
      employeeId: employeeObjectId
    })
    
    if (!adminRecord) {
      console.log('   ❌ Admin record not found')
      console.log('   Checking all admin records...')
      const allAdmins = await db.collection('companyadmins').find({}).toArray()
      console.log(`   Found ${allAdmins.length} total admin records`)
      for (const admin of allAdmins) {
        console.log(`     Admin: employeeId=${admin.employeeId?.toString()}, matches=${admin.employeeId?.toString() === employeeObjectId.toString() ? 'YES' : 'NO'}`)
      }
      return
    }
    
    console.log('   ✅ Admin record found')
    console.log(`   Company ID: ${adminRecord.companyId}`)
    console.log('')
    
    // Step 3: Find company
    console.log('🔍 Step 3: Finding company...')
    const company = await db.collection('companies').findOne({
      _id: adminRecord.companyId instanceof ObjectId 
        ? adminRecord.companyId 
        : new ObjectId(adminRecord.companyId.toString())
    })
    
    if (!company) {
      console.log('   ❌ Company not found')
      return
    }
    
    console.log('   ✅ Company found')
    console.log(`   Company ID: ${company.id}`)
    console.log(`   Company Name: ${company.name}`)
    console.log('')
    
    console.log('='.repeat(80))
    console.log('✅ SUCCESS: Complete login flow works!')
    console.log(`   Email: ${normalizedEmail}`)
    console.log(`   Employee: ${employee.id || employee.employeeId}`)
    console.log(`   Company: ${company.id} (${company.name})`)
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

// Test with a known admin email
const testEmail = process.argv[2] || 'vikram.kumar10@icicibank.com'
testCompanyAdminLogin(testEmail)

