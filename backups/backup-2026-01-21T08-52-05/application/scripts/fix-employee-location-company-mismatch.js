/**
 * Fix Employee-Location Company Mismatch Script
 * 
 * This script identifies and fixes employees whose locationId doesn't match their company.
 * It will either:
 * 1. Update the employee's companyId to match the location's company, OR
 * 2. Update the location's companyId to match the employee's company (if location has no other employees)
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
    
    // Check if it's encrypted (contains ':')
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

async function fixEmployeeLocationCompanyMismatch() {
  try {
    await connectDB()
    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all employees with locationId
    const employees = await db.collection('employees').find({ locationId: { $exists: true, $ne: null } }).toArray()
    console.log(`📊 Found ${employees.length} employees with locationId to check`)

    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    const companyMap = new Map()
    allCompanies.forEach(company => {
      companyMap.set(company._id.toString(), company)
    })

    // Get all locations
    const allLocations = await db.collection('locations').find({}).toArray()
    const locationMap = new Map()
    allLocations.forEach(location => {
      locationMap.set(location._id.toString(), location)
    })

    let fixedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const fixes = []

    // Process each employee
    for (const emp of employees) {
      try {
        if (!emp.locationId) {
          skippedCount++
          continue
        }

        // Get employee's company
        const employeeCompany = companyMap.get(emp.companyId?.toString())
        if (!employeeCompany) {
          console.warn(`⚠️ Employee ${emp.employeeId || emp.id} has no company`)
          skippedCount++
          continue
        }

        // Get location
        const location = locationMap.get(emp.locationId.toString())
        if (!location) {
          console.warn(`⚠️ Employee ${emp.employeeId || emp.id} has invalid locationId: ${emp.locationId}`)
          skippedCount++
          continue
        }

        // Get location's company
        const locationCompany = companyMap.get(location.companyId?.toString())
        if (!locationCompany) {
          console.warn(`⚠️ Location ${location.id || location._id} has no company`)
          skippedCount++
          continue
        }

        // Check if companies match
        const employeeCompanyId = employeeCompany.id
        const locationCompanyId = locationCompany.id

        if (employeeCompanyId === locationCompanyId) {
          // Already correct
          skippedCount++
          continue
        }

        // Mismatch found - decide how to fix
        // Strategy: Update employee's company to match location's company
        // (This is safer because locations are more authoritative)
        
        // Decrypt employee name for logging
        let firstName = emp.firstName
        let lastName = emp.lastName
        try {
          firstName = decrypt(firstName)
          lastName = decrypt(lastName)
        } catch (e) {
          // Not encrypted
        }

        console.log(`\n🔍 Mismatch found for ${firstName} ${lastName} (${emp.employeeId || emp.id}):`)
        console.log(`   Employee Company: ${employeeCompany.name} (${employeeCompanyId})`)
        console.log(`   Location Company: ${locationCompany.name} (${locationCompanyId})`)
        console.log(`   Location: ${location.name} (${location.id})`)

        // Update employee's company to match location's company
        await db.collection('employees').updateOne(
          { _id: emp._id },
          { 
            $set: { 
              companyId: locationCompany._id,
              companyName: locationCompany.name
            } 
          }
        )

        fixes.push({
          employeeId: emp.employeeId || emp.id,
          employeeName: `${firstName} ${lastName}`,
          oldCompany: `${employeeCompany.name} (${employeeCompanyId})`,
          newCompany: `${locationCompany.name} (${locationCompanyId})`,
          location: `${location.name} (${location.id})`
        })

        fixedCount++
        console.log(`✅ Fixed: Updated ${firstName} ${lastName} company from ${employeeCompany.name} to ${locationCompany.name}`)

      } catch (error) {
        console.error(`❌ Error processing employee ${emp.employeeId || emp.id}:`, error.message)
        errorCount++
      }
    }

    // Summary
    console.log('\n📊 SUMMARY:')
    console.log(`✅ Fixed: ${fixedCount} employees`)
    console.log(`⏭️  Skipped: ${skippedCount} employees`)
    console.log(`❌ Errors: ${errorCount} employees`)
    console.log(`\n📋 Fixed Employees:`)
    fixes.forEach(fix => {
      console.log(`  - ${fix.employeeName} (${fix.employeeId}):`)
      console.log(`    Company: ${fix.oldCompany} -> ${fix.newCompany}`)
      console.log(`    Location: ${fix.location}`)
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
  fixEmployeeLocationCompanyMismatch()
    .then(() => {
      console.log('✅ Script execution completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script execution failed:', error)
      process.exit(1)
    })
}

module.exports = fixEmployeeLocationCompanyMismatch

