/**
 * Test if we can decrypt Vikram's email correctly
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

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
    console.error('Decryption error:', error.message)
    return null
  }
}

async function testDecryption() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    const employees = db.collection('employees')
    const employee = await employees.findOne({ id: '300041' })
    
    if (!employee) {
      console.log('❌ Employee 300041 not found')
      return
    }
    
    console.log('✅ Found employee 300041')
    console.log(`   Encrypted email: ${employee.email.substring(0, 80)}...`)
    console.log('')
    
    console.log('🔓 Attempting decryption...')
    const decrypted = decrypt(employee.email)
    
    if (decrypted) {
      console.log(`✅ Decryption successful!`)
      console.log(`   Decrypted email: ${decrypted}`)
      console.log(`   Matches vikram.gupta6@icicibank.com: ${decrypted.toLowerCase() === 'vikram.gupta6@icicibank.com'.toLowerCase()}`)
      console.log('')
      
      // Check validation
      const isDecrypted = decrypted !== employee.email && 
                         !decrypted.includes(':') && 
                         decrypted.length < 200 &&
                         decrypted.includes('@')
      console.log('Validation checks:')
      console.log(`   Different from encrypted: ${decrypted !== employee.email}`)
      console.log(`   Doesn't contain ':': ${!decrypted.includes(':')}`)
      console.log(`   Length < 200: ${decrypted.length < 200} (length: ${decrypted.length})`)
      console.log(`   Contains '@': ${decrypted.includes('@')}`)
      console.log(`   Overall valid: ${isDecrypted}`)
    } else {
      console.log('❌ Decryption failed!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

testDecryption()

