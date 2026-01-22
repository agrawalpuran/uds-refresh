/**
 * Verify Anjali Sharma employee exists in Atlas
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function encrypt(text) {
  if (!text) return ''
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  const keyHash = key.length !== 32 ? crypto.createHash('sha256').update(ENCRYPTION_KEY).digest() : key
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', keyHash, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText
  try {
    const parts = encryptedText.split(':')
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = parts[1]
    const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
    const keyHash = key.length !== 32 ? crypto.createHash('sha256').update(ENCRYPTION_KEY).digest() : key
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv)
    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return encryptedText
  }
}

async function verifyAnjali() {
  const client = new MongoClient(MONGODB_URI_ATLAS)
  
  try {
    await client.connect()
    const db = client.db()
    const employees = db.collection('employees')
    
    const email = 'anjali.sharma@icicibank.com'
    console.log(`🔍 Verifying employee: ${email}`)
    console.log('')
    
    // Try with encrypted email
    const encryptedEmail = encrypt(email)
    console.log(`Encrypted email: ${encryptedEmail.substring(0, 50)}...`)
    console.log('')
    
    const employee = await employees.findOne({ email: encryptedEmail })
    
    if (employee) {
      console.log('✅ Employee found with encrypted email!')
      console.log(`   ID: ${employee.id || employee.employeeId || 'N/A'}`)
      console.log(`   Email (encrypted): ${employee.email.substring(0, 50)}...`)
      
      // Try to decrypt
      try {
        const decryptedEmail = decrypt(employee.email)
        const decryptedFirstName = decrypt(employee.firstName)
        const decryptedLastName = decrypt(employee.lastName)
        console.log(`   Email (decrypted): ${decryptedEmail}`)
        console.log(`   Name: ${decryptedFirstName} ${decryptedLastName}`)
      } catch (e) {
        console.log('   (Could not decrypt - may be plain text)')
      }
      
      console.log(`   CompanyId: ${employee.companyId}`)
      console.log(`   LocationId: ${employee.locationId || 'None'}`)
    } else {
      console.log('❌ Employee NOT found with encrypted email')
      console.log('')
      console.log('Checking all employees with ID 300041...')
      const empById = await employees.findOne({ id: 300041 })
      if (empById) {
        console.log('✅ Found employee with ID 300041!')
        console.log(`   Email field: ${empById.email ? empById.email.substring(0, 50) + '...' : 'N/A'}`)
      } else {
        console.log('❌ Employee with ID 300041 not found')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

verifyAnjali()

