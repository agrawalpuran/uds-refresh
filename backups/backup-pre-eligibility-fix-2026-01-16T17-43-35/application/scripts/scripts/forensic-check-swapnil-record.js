/**
 * FORENSIC: Check the actual database record for swapnil.jain@diageo.com
 * This will show EXACTLY what's stored and why login fails
 */

const { MongoClient, ObjectId } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
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

async function checkSwapnilRecord() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('FORENSIC: Checking swapnil.jain@diageo.com Database Record')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    // Find employee by various methods
    const testEmail = 'swapnil.jain@diageo.com'
    const normalizedEmail = testEmail.trim().toLowerCase()
    
    console.log('Test Email:')
    console.log(`  Original: "${testEmail}"`)
    console.log(`  Normalized: "${normalizedEmail}"`)
    console.log('')
    
    // Method 1: Find by plain text (if user manually replaced it)
    console.log('🔍 Method 1: Searching by plain text email...')
    let employee = await db.collection('employees').findOne({ email: normalizedEmail })
    if (employee) {
      console.log('  ✅ FOUND with plain text email')
      console.log(`  Email stored as: "${employee.email}"`)
      console.log(`  Is encrypted: ${employee.email.includes(':') ? 'YES' : 'NO'}`)
    } else {
      console.log('  ❌ NOT FOUND with plain text email')
    }
    console.log('')
    
    // Method 2: Find by encrypted email (what login tries)
    console.log('🔍 Method 2: Searching by encrypted email (login method)...')
    const encryptedEmail = encrypt(normalizedEmail)
    console.log(`  Encrypted email: ${encryptedEmail.substring(0, 50)}...`)
    employee = await db.collection('employees').findOne({ email: encryptedEmail })
    if (employee) {
      console.log('  ✅ FOUND with encrypted email')
    } else {
      console.log('  ❌ NOT FOUND with encrypted email')
      console.log('  This is why login fails!')
    }
    console.log('')
    
    // Method 3: Find all employees with "swapnil" or "diageo" and check
    console.log('🔍 Method 3: Searching all employees for swapnil/diageo...')
    const allEmployees = await db.collection('employees').find({
      $or: [
        { email: { $regex: /swapnil/i } },
        { email: { $regex: /diageo/i } },
        { 'companyName': { $regex: /diageo/i } }
      ]
    }).toArray()
    
    console.log(`  Found ${allEmployees.length} potential matches`)
    console.log('')
    
    for (const emp of allEmployees) {
      console.log(`  Employee ID: ${emp.id || emp.employeeId}`)
      console.log(`  Email (raw): ${emp.email ? emp.email.substring(0, 60) + (emp.email.length > 60 ? '...' : '') : 'N/A'}`)
      console.log(`  Email is encrypted: ${emp.email && emp.email.includes(':') ? 'YES' : 'NO'}`)
      
      if (emp.email && emp.email.includes(':')) {
        try {
          const decrypted = decrypt(emp.email)
          console.log(`  Decrypted email: ${decrypted}`)
          console.log(`  Matches test email: ${decrypted.toLowerCase() === normalizedEmail ? '✅ YES' : '❌ NO'}`)
          
          if (decrypted.toLowerCase() === normalizedEmail) {
            console.log('  ✅ THIS IS THE RECORD!')
            employee = emp
          }
        } catch (error) {
          console.log(`  ❌ Decryption failed: ${error.message}`)
        }
      } else if (emp.email && emp.email.toLowerCase() === normalizedEmail) {
        console.log('  ✅ THIS IS THE RECORD (plain text)!')
        employee = emp
      }
      console.log('')
    }
    
    if (employee) {
      console.log('='.repeat(80))
      console.log('RECORD FOUND:')
      console.log(`  Employee ID: ${employee.id || employee.employeeId}`)
      console.log(`  Email stored: ${employee.email}`)
      console.log(`  Email format: ${employee.email.includes(':') ? 'ENCRYPTED' : 'PLAIN TEXT'}`)
      
      if (employee.email.includes(':')) {
        const decrypted = decrypt(employee.email)
        console.log(`  Decrypted email: ${decrypted}`)
        console.log(`  Matches normalized: ${decrypted.toLowerCase() === normalizedEmail ? '✅ YES' : '❌ NO'}`)
      }
      
      // Check admin record
      console.log('')
      console.log('Checking admin record...')
      const adminRecord = await db.collection('companyadmins').findOne({
        employeeId: employee._id instanceof ObjectId ? employee._id : new ObjectId(employee._id.toString())
      })
      
      if (adminRecord) {
        console.log('  ✅ Admin record exists')
        console.log(`  Company ID: ${adminRecord.companyId}`)
      } else {
        console.log('  ❌ Admin record NOT found')
      }
      
      console.log('='.repeat(80))
    } else {
      console.log('='.repeat(80))
      console.log('❌ RECORD NOT FOUND')
      console.log('='.repeat(80))
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

checkSwapnilRecord()

