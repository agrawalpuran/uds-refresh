/**
 * Fix Employee Addresses by Location Script
 * 
 * This script updates employee addresses to match their location's city.
 * It creates dummy addresses with the correct city based on their locationId.
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

function encrypt(text) {
  try {
    if (!text || typeof text !== 'string') {
      return text
    }
    
    // Check if already encrypted
    if (text.includes(':')) {
      return text
    }
    
    const key = getKey()
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8')
    encrypted = Buffer.concat([encrypted, cipher.final()])
    
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`
  } catch (error) {
    return text
  }
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

async function fixEmployeeAddressesByLocation() {
  try {
    await connectDB()
    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all employees with locationId
    const employees = await db.collection('employees').find({ 
      locationId: { $exists: true, $ne: null } 
    }).toArray()
    
    console.log(`📊 Found ${employees.length} employees with locationId to process`)

    // Get all locations
    const allLocations = await db.collection('locations').find({}).toArray()
    const locationMap = new Map()
    allLocations.forEach(location => {
      locationMap.set(location._id.toString(), location)
    })

    console.log(`📊 Found ${allLocations.length} locations`)

    // City mapping for dummy addresses
    const cityAddressMap = {
      'Chennai': '69, Chennai Street, Chennai',
      'Delhi': '123, Delhi Street, Delhi',
      'Mumbai': '456, Mumbai Street, Mumbai',
      'Bangalore': '789, Bangalore Street, Bangalore',
      'Hyderabad': '321, Hyderabad Street, Hyderabad',
      'Pune': '654, Pune Street, Pune',
      'Kolkata': '987, Kolkata Street, Kolkata',
      'Ahmedabad': '147, Ahmedabad Street, Ahmedabad'
    }

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []

    // Process each employee
    for (const emp of employees) {
      try {
        if (!emp.locationId) {
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

        // Determine city from location name or city field
        let city = location.city || ''
        
        // If no city field, extract from location name
        if (!city) {
          const locationName = location.name || ''
          const cityKeywords = ['Chennai', 'Delhi', 'Mumbai', 'Bangalore', 'Hyderabad', 'Pune', 'Kolkata', 'Ahmedabad']
          
          for (const keyword of cityKeywords) {
            if (locationName.includes(keyword)) {
              city = keyword
              break
            }
          }
        }

        if (!city) {
          console.warn(`⚠️ Could not determine city for location ${location.name} (${location.id})`)
          skippedCount++
          continue
        }

        // Get dummy address for this city
        const newAddress = cityAddressMap[city] || `${Math.floor(Math.random() * 999) + 1}, ${city} Street, ${city}`
        
        // Decrypt current address to check if it needs updating
        let currentAddress = emp.address || ''
        try {
          currentAddress = decrypt(currentAddress)
        } catch (e) {
          // Not encrypted or decryption failed
        }

        // Check if address already has correct city
        if (currentAddress && currentAddress.includes(city)) {
          console.log(`⏭️  Employee ${emp.employeeId || emp.id} already has correct city in address`)
          skippedCount++
          continue
        }

        // Encrypt the new address
        const encryptedAddress = encrypt(newAddress)

        // Update employee's address
        await db.collection('employees').updateOne(
          { _id: emp._id },
          { $set: { address: encryptedAddress } }
        )

        // Decrypt employee name for logging
        let firstName = emp.firstName
        let lastName = emp.lastName
        try {
          firstName = decrypt(firstName)
          lastName = decrypt(lastName)
        } catch (e) {
          // Not encrypted
        }

        updates.push({
          employeeId: emp.employeeId || emp.id,
          employeeName: `${firstName} ${lastName}`,
          location: location.name,
          city: city,
          oldAddress: currentAddress || 'N/A',
          newAddress: newAddress
        })

        updatedCount++
        console.log(`✅ Updated ${firstName} ${lastName} (${emp.employeeId || emp.id}): "${currentAddress || 'N/A'}" -> "${newAddress}" (${city})`)

      } catch (error) {
        console.error(`❌ Error processing employee ${emp.employeeId || emp.id}:`, error.message)
        errorCount++
      }
    }

    // Summary
    console.log('\n📊 SUMMARY:')
    console.log(`✅ Updated: ${updatedCount} employees`)
    console.log(`⏭️  Skipped: ${skippedCount} employees`)
    console.log(`❌ Errors: ${errorCount} employees`)
    
    // Group by city
    const cityGroups = {}
    updates.forEach(update => {
      if (!cityGroups[update.city]) {
        cityGroups[update.city] = []
      }
      cityGroups[update.city].push(update)
    })
    
    console.log(`\n📋 Updated Employees by City:`)
    Object.entries(cityGroups).forEach(([city, cityUpdates]) => {
      console.log(`\n  ${city} (${cityUpdates.length} employees):`)
      cityUpdates.forEach(update => {
        console.log(`    - ${update.employeeName} (${update.employeeId}): ${update.newAddress}`)
      })
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
  fixEmployeeAddressesByLocation()
    .then(() => {
      console.log('✅ Script execution completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script execution failed:', error)
      process.exit(1)
    })
}

module.exports = fixEmployeeAddressesByLocation

