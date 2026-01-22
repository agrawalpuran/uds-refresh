/**
 * Update Employees to ICICI Bank Chennai Branch
 * 
 * This script updates the locationId for all specified employees to ICICI Bank Chennai Branch
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

async function updateEmployeesToChennaiBranch() {
  try {
    await connectDB()
    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Employee IDs to update (from the image)
    const employeeIds = [
      '300031',
      '300032', // Anjali Singh
      '300033',
      '300034',
      '300035',
      '300036',
      '300037',
      '300038',
      '300039',
      '300040'
    ]

    console.log(`📊 Updating ${employeeIds.length} employees to ICICI Bank Chennai Branch`)

    // Find the Chennai location
    // Try both "ICICI Bank Chennai Branch" and "ICICI Chennai Branch"
    let chennaiLocation = await db.collection('locations').findOne({ 
      $or: [
        { name: 'ICICI Bank Chennai Branch' },
        { name: 'ICICI Chennai Branch' },
        { id: '400006' } // Known ID from earlier
      ]
    })

    if (!chennaiLocation) {
      // List all locations to help debug
      const allLocations = await db.collection('locations').find({}).toArray()
      console.log('\n⚠️ Chennai location not found. Available locations:')
      allLocations.forEach(loc => {
        console.log(`   - ${loc.name} (ID: ${loc.id})`)
      })
      throw new Error('ICICI Bank Chennai Branch location not found')
    }

    console.log(`\n📍 Found location: ${chennaiLocation.name} (ID: ${chennaiLocation.id})`)

    // Get all employees
    const employees = await db.collection('employees').find({
      employeeId: { $in: employeeIds }
    }).toArray()

    console.log(`\n📊 Found ${employees.length} employees to update`)

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []

    // Update each employee
    for (const emp of employees) {
      try {
        // Decrypt employee name for logging
        let firstName = emp.firstName
        let lastName = emp.lastName
        try {
          firstName = decrypt(firstName)
          lastName = decrypt(lastName)
        } catch (e) {
          // Not encrypted
        }

        const currentLocationId = emp.locationId?.toString()
        const newLocationId = chennaiLocation._id.toString()

        if (currentLocationId === newLocationId) {
          console.log(`⏭️  ${firstName} ${lastName} (${emp.employeeId}) already has correct location`)
          skippedCount++
          continue
        }

        // Update employee's locationId
        await db.collection('employees').updateOne(
          { _id: emp._id },
          { $set: { locationId: chennaiLocation._id } }
        )

        updates.push({
          employeeId: emp.employeeId,
          employeeName: `${firstName} ${lastName}`,
          oldLocationId: currentLocationId || 'none',
          newLocationId: chennaiLocation.id
        })

        updatedCount++
        console.log(`✅ Updated ${firstName} ${lastName} (${emp.employeeId}) -> ${chennaiLocation.name}`)

      } catch (error) {
        console.error(`❌ Error updating employee ${emp.employeeId}:`, error.message)
        errorCount++
      }
    }

    // Check for missing employees
    const foundEmployeeIds = employees.map(e => e.employeeId)
    const missingEmployeeIds = employeeIds.filter(id => !foundEmployeeIds.includes(id))
    if (missingEmployeeIds.length > 0) {
      console.log(`\n⚠️ Could not find ${missingEmployeeIds.length} employees:`, missingEmployeeIds)
    }

    // Summary
    console.log('\n📊 SUMMARY:')
    console.log(`✅ Updated: ${updatedCount} employees`)
    console.log(`⏭️  Skipped: ${skippedCount} employees`)
    console.log(`❌ Errors: ${errorCount} employees`)
    if (missingEmployeeIds.length > 0) {
      console.log(`⚠️  Missing: ${missingEmployeeIds.length} employees`)
    }
    
    console.log(`\n📋 Updated Employees:`)
    updates.forEach(update => {
      console.log(`  - ${update.employeeName} (${update.employeeId}) -> Location ID: ${update.newLocationId}`)
    })

    console.log('\n✅ Script completed successfully')
  } catch (error) {
    console.error('❌ Script failed:', error)
    throw error
  } finally {
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  }
}

// Run the script
if (require.main === module) {
  updateEmployeesToChennaiBranch()
    .then(() => {
      console.log('✅ Script execution completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script execution failed:', error)
      process.exit(1)
    })
}

module.exports = updateEmployeesToChennaiBranch

