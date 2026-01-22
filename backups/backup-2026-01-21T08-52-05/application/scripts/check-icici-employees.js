/**
 * Check ICICI Bank employees
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
    return text
  }
}

async function checkEmployees() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    // Find ICICI Bank
    const companies = db.collection('companies')
    const icici = await companies.findOne({ 
      $or: [
        { id: '100004' },
        { name: { $regex: /icici/i } }
      ]
    })
    
    if (!icici) {
      console.log('❌ ICICI Bank not found')
      return
    }
    
    console.log(`✅ Found ICICI Bank: ${icici.name} (ID: ${icici.id})`)
    console.log('')
    
    // Find all employees for ICICI
    const employees = db.collection('employees')
    const iciciEmployees = await employees.find({ companyId: icici._id }).toArray()
    
    console.log(`📊 Found ${iciciEmployees.length} employees for ICICI Bank:`)
    console.log('')
    
    for (const emp of iciciEmployees) {
      const firstName = emp.firstName ? decrypt(emp.firstName) : 'N/A'
      const lastName = emp.lastName ? decrypt(emp.lastName) : 'N/A'
      const email = emp.email ? decrypt(emp.email) : 'N/A'
      console.log(`   ${emp.id || emp.employeeId || 'N/A'}: ${firstName} ${lastName} (${email})`)
    }
    
    // Check for vikram.gupta6
    console.log('')
    console.log('🔍 Searching for vikram.gupta6@icicibank.com...')
    const vikram = iciciEmployees.find(emp => {
      if (emp.email) {
        try {
          const decrypted = decrypt(emp.email)
          return decrypted.toLowerCase().includes('vikram') && decrypted.toLowerCase().includes('gupta')
        } catch {
          return false
        }
      }
      return false
    })
    
    if (vikram) {
      console.log(`✅ Found: ${decrypt(vikram.firstName)} ${decrypt(vikram.lastName)} (${decrypt(vikram.email)})`)
    } else {
      console.log('❌ vikram.gupta6@icicibank.com not found')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

checkEmployees()
