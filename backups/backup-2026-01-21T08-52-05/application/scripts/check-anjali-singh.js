/**
 * Check Anjali Singh's data and location mismatch
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables
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

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText
    }
    
    if (!encryptedText.includes(':')) {
      return encryptedText
    }
    
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }
    
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = Buffer.from(parts[1], 'hex')
    const key = getKey()
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    
    return decrypted.toString('utf8')
  } catch (error) {
    return encryptedText
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    return
  }
  
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    throw error
  }
}

async function checkAnjaliSingh() {
  try {
    await connectDB()
    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Find Anjali Singh
    const employee = await db.collection('employees').findOne({ employeeId: '300032' })
    if (!employee) {
      console.log('❌ Employee 300032 not found')
      return
    }

    let firstName = employee.firstName
    let lastName = employee.lastName
    try {
      firstName = decrypt(firstName)
      lastName = decrypt(lastName)
    } catch (e) {
      // Not encrypted
    }

    console.log(`\n📊 Employee: ${firstName} ${lastName} (${employee.employeeId})`)
    console.log(`   CompanyId (ObjectId): ${employee.companyId?.toString()}`)
    console.log(`   LocationId (ObjectId): ${employee.locationId?.toString()}`)

    // Get company
    const company = await db.collection('companies').findOne({ _id: employee.companyId })
    if (company) {
      console.log(`   Company: ${company.name} (ID: ${company.id})`)
    } else {
      console.log(`   ⚠️ Company not found`)
    }

    // Get location
    const location = await db.collection('locations').findOne({ _id: employee.locationId })
    if (location) {
      console.log(`   Location: ${location.name} (ID: ${location.id})`)
      console.log(`   Location CompanyId (ObjectId): ${location.companyId?.toString()}`)
      
      // Get location's company
      const locationCompany = await db.collection('companies').findOne({ _id: location.companyId })
      if (locationCompany) {
        console.log(`   Location Company: ${locationCompany.name} (ID: ${locationCompany.id})`)
        
        // Compare
        if (company && locationCompany) {
          console.log(`\n🔍 Comparison:`)
          console.log(`   Employee Company ID: ${company.id}`)
          console.log(`   Location Company ID: ${locationCompany.id}`)
          console.log(`   Match: ${company.id === locationCompany.id ? '✅ YES' : '❌ NO'}`)
          
          if (company.id !== locationCompany.id) {
            console.log(`\n⚠️ MISMATCH DETECTED!`)
            console.log(`   This will cause the update error.`)
            console.log(`\n💡 Solution: Update employee's company to match location's company`)
            console.log(`   Employee should be in company: ${locationCompany.name} (${locationCompany.id})`)
          }
        }
      } else {
        console.log(`   ⚠️ Location company not found`)
      }
    } else {
      console.log(`   ⚠️ Location not found`)
    }

    console.log('\n✅ Check completed')
  } catch (error) {
    console.error('❌ Check failed:', error)
    throw error
  } finally {
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  }
}

// Run the script
if (require.main === module) {
  checkAnjaliSingh()
    .then(() => {
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script execution failed:', error)
      process.exit(1)
    })
}

module.exports = checkAnjaliSingh

