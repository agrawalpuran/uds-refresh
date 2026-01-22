/**
 * Fix Anjali Sharma's email encryption to use base64 format (matching system standard)
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
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
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText
  try {
    const parts = encryptedText.split(':')
    if (parts.length !== 2) return encryptedText
    
    const key = getKey()
    
    // Try base64 first
    try {
      const iv = Buffer.from(parts[0], 'base64')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'base64', 'utf8')
      decrypted += decipher.final('utf8')
      if (decrypted && decrypted !== encryptedText) return decrypted
    } catch (e) {}
    
    // Try hex
    try {
      const iv = Buffer.from(parts[0], 'hex')
      const encrypted = parts[1]
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted, 'hex', 'utf8')
      decrypted += decipher.final('utf8')
      if (decrypted && decrypted !== encryptedText) return decrypted
    } catch (e) {}
    
    return encryptedText
  } catch (error) {
    return encryptedText
  }
}

async function fixAnjaliEmail() {
  const client = new MongoClient(MONGODB_URI_ATLAS)
  
  try {
    await client.connect()
    const db = client.db()
    const employees = db.collection('employees')
    
    console.log('🔍 Finding Anjali Sharma employee...')
    const employee = await employees.findOne({ id: 300041 })
    
    if (!employee) {
      console.log('❌ Employee 300041 not found')
      return
    }
    
    console.log('✅ Found employee')
    console.log('Current email (encrypted):', employee.email.substring(0, 60) + '...')
    
    // Try to decrypt current email
    const currentDecrypted = decrypt(employee.email)
    console.log('Current email (decrypted):', currentDecrypted)
    
    if (currentDecrypted === 'anjali.sharma@icicibank.com') {
      console.log('✅ Email is already correct, re-encrypting with base64 format...')
    }
    
    // Re-encrypt with base64 format (system standard)
    const correctEmail = 'anjali.sharma@icicibank.com'
    const newEncryptedEmail = encrypt(correctEmail)
    console.log('New email (encrypted, base64):', newEncryptedEmail.substring(0, 60) + '...')
    
    // Verify it decrypts correctly
    const verifyDecrypt = decrypt(newEncryptedEmail)
    console.log('Verification (decrypted):', verifyDecrypt)
    
    if (verifyDecrypt !== correctEmail) {
      console.log('❌ Encryption/decryption verification failed!')
      return
    }
    
    // Update employee with correct encryption format
    console.log('')
    console.log('📝 Updating employee email with base64 encryption...')
    await employees.updateOne(
      { id: 300041 },
      { 
        $set: { 
          email: newEncryptedEmail,
          updatedAt: new Date()
        }
      }
    )
    
    console.log('✅ Employee email updated successfully!')
    console.log('')
    console.log('🔍 Verifying update...')
    const updated = await employees.findOne({ id: 300041 })
    const finalDecrypt = decrypt(updated.email)
    console.log('Final email (decrypted):', finalDecrypt)
    console.log('Match:', finalDecrypt === correctEmail)
    
    if (finalDecrypt === correctEmail) {
      console.log('')
      console.log('🎉 Email encryption fixed! Anjali Sharma can now login!')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

fixAnjaliEmail()

