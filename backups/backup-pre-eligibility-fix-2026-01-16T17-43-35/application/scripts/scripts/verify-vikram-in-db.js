/**
 * Verify Vikram Gupta exists in database and check encryption format
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function encrypt(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

async function verifyVikram() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    const email = 'vikram.gupta6@icicibank.com'
    const employees = db.collection('employees')
    
    console.log(`🔍 Looking for employee: ${email}`)
    console.log('')
    
    // Try different search methods
    console.log('1. Searching with encrypted email (base64)...')
    const encryptedEmail = encrypt(email)
    console.log(`   Encrypted: ${encryptedEmail.substring(0, 50)}...`)
    let employee = await employees.findOne({ email: encryptedEmail })
    
    if (employee) {
      console.log('   ✅ Found with encrypted email!')
    } else {
      console.log('   ❌ Not found with encrypted email')
    }
    
    console.log('')
    console.log('2. Searching with plain text email...')
    employee = await employees.findOne({ email: email })
    
    if (employee) {
      console.log('   ✅ Found with plain text email!')
    } else {
      console.log('   ❌ Not found with plain text email')
    }
    
    console.log('')
    console.log('3. Searching all employees and decrypting...')
    const allEmployees = await employees.find({}).toArray()
    console.log(`   Total employees: ${allEmployees.length}`)
    
    let found = false
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decrypted = decrypt(emp.email)
          if (decrypted.toLowerCase() === email.toLowerCase()) {
            found = true
            employee = emp
            console.log(`   ✅ Found by decryption!`)
            console.log(`   Employee ID: ${emp.id || emp.employeeId}`)
            console.log(`   Email format: ${emp.email.substring(0, 50)}...`)
            console.log(`   Email contains ':' (encrypted): ${emp.email.includes(':')}`)
            break
          }
        } catch (error) {
          continue
        }
      }
    }
    
    if (!found) {
      console.log('   ❌ Not found by decryption')
    }
    
    if (employee) {
      console.log('')
      console.log('✅ Employee found in database!')
      console.log(`   ID: ${employee.id || employee.employeeId}`)
      console.log(`   MongoDB _id: ${employee._id}`)
      console.log(`   Email stored as: ${employee.email.substring(0, 80)}...`)
      console.log(`   Email format: ${employee.email.includes(':') ? 'Encrypted (base64)' : 'Plain text'}`)
      
      // Check admin record
      console.log('')
      console.log('4. Checking company admin record...')
      const companyadmins = db.collection('companyadmins')
      const admin = await companyadmins.findOne({ employeeId: employee._id })
      
      if (admin) {
        console.log('   ✅ Admin record found!')
        console.log(`   CompanyId: ${admin.companyId}`)
        console.log(`   Can approve orders: ${admin.canApproveOrders || false}`)
      } else {
        console.log('   ❌ Admin record NOT found!')
        console.log('   This is the problem - employee exists but no admin record')
      }
    } else {
      console.log('')
      console.log('❌ Employee NOT found in database at all!')
      console.log('   The employee creation script may have failed.')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

verifyVikram()

