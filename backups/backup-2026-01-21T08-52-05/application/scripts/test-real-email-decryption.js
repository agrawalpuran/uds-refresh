/**
 * CRITICAL: Test decryption of real employee emails from database
 * This verifies that existing encrypted data can be decrypted with current key
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

async function testRealEmailDecryption() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('REAL EMAIL DECRYPTION TEST')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    // Check key
    console.log('Encryption Key:')
    console.log(`  Loaded from env: ${!!process.env.ENCRYPTION_KEY}`)
    console.log(`  Key length: ${ENCRYPTION_KEY.length} characters`)
    console.log(`  Key prefix: ${ENCRYPTION_KEY.substring(0, 20)}...`)
    console.log('')
    
    // Get a few employees with encrypted emails
    console.log('Fetching employees with encrypted emails...')
    const employees = await db.collection('employees').find({
      email: { $exists: true, $ne: null }
    }).limit(5).toArray()
    
    console.log(`Found ${employees.length} employees`)
    console.log('')
    
    let successCount = 0
    let failCount = 0
    
    for (const emp of employees) {
      if (!emp.email || typeof emp.email !== 'string') continue
      
      const isEncrypted = emp.email.includes(':')
      console.log(`Employee ID: ${emp.id || emp.employeeId || 'N/A'}`)
      console.log(`  Email (raw): ${emp.email.substring(0, 50)}${emp.email.length > 50 ? '...' : ''}`)
      console.log(`  Is encrypted: ${isEncrypted}`)
      
      if (isEncrypted) {
        try {
          const decrypted = decrypt(emp.email)
          const isValid = decrypted && 
                         decrypted !== emp.email && 
                         !decrypted.includes(':') && 
                         decrypted.length > 0 &&
                         decrypted.length < 200 &&
                         decrypted.includes('@')
          
          if (isValid) {
            console.log(`  ✅ Decrypted: ${decrypted}`)
            successCount++
          } else {
            console.log(`  ❌ Decryption failed or invalid result`)
            console.log(`     Result: ${decrypted}`)
            failCount++
          }
        } catch (error) {
          console.log(`  ❌ Decryption error: ${error.message}`)
          failCount++
        }
      } else {
        console.log(`  ⚠️  Email is not encrypted (plain text)`)
        console.log(`  Email: ${emp.email}`)
      }
      console.log('')
    }
    
    console.log('='.repeat(80))
    console.log('Summary:')
    console.log(`  Total employees checked: ${employees.length}`)
    console.log(`  Successful decryptions: ${successCount}`)
    console.log(`  Failed decryptions: ${failCount}`)
    console.log('')
    
    if (failCount === 0 && successCount > 0) {
      console.log('✅ SUCCESS: All encrypted emails can be decrypted!')
      console.log('   The encryption key is correct and matches the database data.')
    } else if (failCount > 0) {
      console.log('❌ ERROR: Some emails cannot be decrypted!')
      console.log('   This indicates the encryption key does not match the data.')
      console.log('   Possible causes:')
      console.log('   1. Data was encrypted with a different key')
      console.log('   2. Key derivation method changed')
      console.log('   3. Key in .env.local is incorrect')
    } else {
      console.log('⚠️  WARNING: No encrypted emails found to test')
    }
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

// Run the test
testRealEmailDecryption()

