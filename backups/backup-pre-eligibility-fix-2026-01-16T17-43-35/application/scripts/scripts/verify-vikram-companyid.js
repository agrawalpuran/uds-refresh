/**
 * Script to verify Vikram Singh's companyId in the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

// Encryption utility
const crypto = require('crypto')

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read ENCRYPTION_KEY from .env.local')
}

const IV_LENGTH = 16

function decrypt(text) {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift(), 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

async function verifyVikramCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Find Vikram Singh by email or ID
    const employees = await db.collection('employees').find({
      $or: [
        { id: 'IND-011' },
        { employeeId: 'IND-011' }
      ]
    }).toArray()
    
    if (employees.length === 0) {
      console.log('❌ Employee not found')
      await mongoose.disconnect()
      return
    }
    
    const emp = employees[0]
    console.log('📋 Raw Employee Document from DB:')
    console.log('   _id:', emp._id)
    console.log('   id:', emp.id)
    console.log('   employeeId:', emp.employeeId)
    console.log('   companyId (raw):', emp.companyId)
    console.log('   companyId type:', typeof emp.companyId)
    console.log('   companyId isObject:', typeof emp.companyId === 'object')
    console.log('   companyId isNull:', emp.companyId === null)
    console.log('   companyId isUndefined:', emp.companyId === undefined)
    
    if (emp.companyId) {
      if (typeof emp.companyId === 'object') {
        console.log('   companyId._id:', emp.companyId._id)
        console.log('   companyId.toString():', emp.companyId.toString())
      } else {
        console.log('   companyId string:', emp.companyId)
      }
    }
    
    console.log('   companyName (raw):', emp.companyName)
    if (emp.companyName) {
      const decryptedCompanyName = decrypt(emp.companyName)
      console.log('   companyName (decrypted):', decryptedCompanyName)
    }
    
    // Get companyId as string
    let companyIdStr = null
    if (emp.companyId) {
      if (typeof emp.companyId === 'object' && emp.companyId._id) {
        companyIdStr = emp.companyId._id.toString()
      } else if (typeof emp.companyId === 'object' && emp.companyId.toString) {
        companyIdStr = emp.companyId.toString()
      } else {
        companyIdStr = emp.companyId.toString()
      }
    }
    
    console.log('\n🔍 Looking up company with ObjectId:', companyIdStr)
    
    if (companyIdStr) {
      const companies = await db.collection('companies').find({}).toArray()
      console.log(`\n📊 Found ${companies.length} companies in database:`)
      
      for (const comp of companies) {
        console.log(`   - ${comp.name} (${comp.id}) - _id: ${comp._id}`)
        if (comp._id.toString() === companyIdStr) {
          console.log(`   ✅ MATCH! This is the company for Vikram Singh`)
          console.log(`      Company String ID: ${comp.id}`)
          console.log(`      Company Name: ${comp.name}`)
        }
      }
      
      const matchingCompany = companies.find(c => c._id.toString() === companyIdStr)
      if (matchingCompany) {
        console.log(`\n✅ CompanyId is correctly set!`)
        console.log(`   Employee companyId ObjectId: ${companyIdStr}`)
        console.log(`   Maps to Company: ${matchingCompany.name} (${matchingCompany.id})`)
      } else {
        console.log(`\n❌ CompanyId ObjectId ${companyIdStr} does not match any company!`)
      }
    } else {
      console.log('\n❌ Employee has NO companyId set!')
      console.log('   This is the problem - companyId is null/undefined')
      
      // Try to find company by name
      const decryptedCompanyName = emp.companyName ? decrypt(emp.companyName) : null
      if (decryptedCompanyName) {
        console.log(`\n🔍 Trying to find company by name: "${decryptedCompanyName}"`)
        const companies = await db.collection('companies').find({}).toArray()
        const matchingCompany = companies.find(c => 
          c.name.toLowerCase() === decryptedCompanyName.toLowerCase()
        )
        
        if (matchingCompany) {
          console.log(`✅ Found company: ${matchingCompany.name} (${matchingCompany.id})`)
          console.log(`   Company _id: ${matchingCompany._id}`)
          console.log(`\n🔧 Updating employee with correct companyId...`)
          
          await db.collection('employees').updateOne(
            { _id: emp._id },
            { 
              $set: { 
                companyId: matchingCompany._id,
                companyName: matchingCompany.name
              }
            }
          )
          
          console.log(`✅ Updated employee ${emp.id} with companyId: ${matchingCompany._id} (${matchingCompany.id})`)
        } else {
          console.log(`❌ Could not find company with name: "${decryptedCompanyName}"`)
        }
      }
    }
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyVikramCompanyId()

