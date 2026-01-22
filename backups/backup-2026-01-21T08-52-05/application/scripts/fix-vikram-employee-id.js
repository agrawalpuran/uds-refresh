/**
 * Fix Vikram Gupta employee ID if it conflicts with Anjali Sharma
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

async function fixVikramId() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    const employees = db.collection('employees')
    const email = 'vikram.gupta6@icicibank.com'
    
    // Find Vikram
    const allEmployees = await employees.find({}).toArray()
    let vikram = null
    
    for (const emp of allEmployees) {
      if (emp.email) {
        try {
          const decrypted = decrypt(emp.email)
          if (decrypted.toLowerCase() === email.toLowerCase()) {
            vikram = emp
            break
          }
        } catch {
          continue
        }
      }
    }
    
    if (!vikram) {
      console.log('❌ Vikram Gupta not found')
      return
    }
    
    console.log(`✅ Found Vikram Gupta:`)
    console.log(`   Current ID: ${vikram.id || vikram.employeeId}`)
    console.log(`   MongoDB _id: ${vikram._id}`)
    console.log('')
    
    // Check if ID 300041 is already used by another employee
    const employeeWithId = await employees.findOne({ 
      id: '300041',
      _id: { $ne: vikram._id }
    })
    
    if (employeeWithId) {
      console.log(`⚠️  ID 300041 is already used by another employee`)
      console.log(`   Finding next available ID...`)
      
      // Find highest ID
      const lastEmployee = await employees.find({})
        .sort({ id: -1 })
        .limit(1)
        .toArray()
      
      let nextId = 300042
      if (lastEmployee.length > 0 && lastEmployee[0].id) {
        const lastId = parseInt(String(lastEmployee[0].id), 10)
        if (!isNaN(lastId) && lastId >= 300000) {
          nextId = lastId + 1
        }
      }
      
      console.log(`   Updating to ID: ${nextId}`)
      await employees.updateOne(
        { _id: vikram._id },
        { 
          $set: { 
            id: String(nextId),
            employeeId: String(nextId),
            updatedAt: new Date()
          }
        }
      )
      
      console.log(`✅ Updated Vikram's ID to ${nextId}`)
    } else {
      console.log(`✅ ID 300041 is unique, no change needed`)
    }
    
    // Verify employee can be found by email
    console.log('')
    console.log('🔍 Verifying employee lookup by email...')
    const { encrypt } = require('../lib/utils/encryption')
    const encryptedEmail = encrypt(email)
    const foundByEncrypted = await employees.findOne({ email: encryptedEmail })
    
    if (foundByEncrypted) {
      console.log('✅ Employee found by encrypted email')
    } else {
      console.log('⚠️  Employee NOT found by encrypted email (this might cause lookup issues)')
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

fixVikramId()

