/**
 * Fix Employee Location Mapping Script
 * 
 * This script maps employees to the correct Location based on their location string field.
 * It matches employees' location string (e.g., "Delhi", "Mumbai") to Location names
 * (e.g., "ICICI Bank Delhi Branch", "ICICI Bank Mumbai Branch") and updates the locationId field.
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

async function fixEmployeeLocationMapping() {
  try {
    await connectDB()
    console.log('✅ Connected to database')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all employees from raw collection
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Found ${employees.length} employees to process`)

    // Get all locations from raw collection
    const allLocations = await db.collection('locations').find({ status: 'active' }).toArray()
    console.log(`📊 Found ${allLocations.length} active locations`)

    // Get all companies for lookup
    const allCompanies = await db.collection('companies').find({}).toArray()
    const companyMap = new Map()
    allCompanies.forEach(company => {
      companyMap.set(company._id.toString(), company)
    })

    // Populate companyId for locations
    const locations = allLocations.map(loc => {
      const company = companyMap.get(loc.companyId?.toString())
      return {
        ...loc,
        companyId: company ? { _id: company._id, id: company.id, name: company.name } : loc.companyId
      }
    })

    // Create a map of company -> locations for quick lookup
    const locationMap = new Map()
    locations.forEach((loc) => {
      const companyId = loc.companyId?.id || (loc.companyId && companyMap.get(loc.companyId.toString())?.id)
      
      if (companyId) {
        if (!locationMap.has(companyId)) {
          locationMap.set(companyId, [])
        }
        locationMap.get(companyId).push(loc)
      }
    })

    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const updates = []

    // Process each employee
    for (const emp of employees) {
      try {
        // Decrypt location field if needed
        let locationString = emp.location
        if (locationString && typeof locationString === 'string' && !locationString.includes(':')) {
          try {
            locationString = decrypt(locationString)
          } catch (e) {
            // Not encrypted, use as is
          }
        }

        // Get employee's company
        const companyIdObj = emp.companyId?.toString() || emp.companyId
        const company = companyMap.get(companyIdObj)
        
        if (!company) {
          console.warn(`⚠️ Employee ${emp.employeeId || emp.id} has no company`)
          skippedCount++
          continue
        }

        const companyId = company.id
        if (!companyId) {
          console.warn(`⚠️ Employee ${emp.employeeId || emp.id} has invalid company`)
          skippedCount++
          continue
        }

        // Get locations for this company
        const companyLocations = locationMap.get(companyId) || []
        if (companyLocations.length === 0) {
          console.warn(`⚠️ No locations found for company ${companyId}`)
          skippedCount++
          continue
        }

        // Try to match employee's location string to a Location name
        let matchedLocation = null
        
        if (locationString) {
          // Normalize location string (remove extra spaces, convert to lowercase)
          const normalizedLocation = locationString.trim().toLowerCase()
          
          // Try exact match first
          matchedLocation = companyLocations.find((loc) => 
            loc.name.toLowerCase().includes(normalizedLocation) ||
            normalizedLocation.includes(loc.name.toLowerCase().split(' ').pop() || '')
          )

          // If no match, try partial matching (e.g., "Delhi" matches "ICICI Bank Delhi Branch")
          if (!matchedLocation) {
            // Extract city name from location string (last word or common city names)
            const cityKeywords = ['delhi', 'mumbai', 'bangalore', 'chennai', 'kolkata', 'hyderabad', 'pune', 'ahmedabad']
            const locationWords = normalizedLocation.split(/\s+/)
            const lastWord = locationWords[locationWords.length - 1]
            
            for (const keyword of cityKeywords) {
              if (normalizedLocation.includes(keyword) || lastWord === keyword) {
                matchedLocation = companyLocations.find((loc) => 
                  loc.name.toLowerCase().includes(keyword)
                )
                if (matchedLocation) break
              }
            }
          }

          // If still no match, try matching by city name in Location
          if (!matchedLocation) {
            for (const loc of companyLocations) {
              if (loc.city && loc.city.toLowerCase().includes(normalizedLocation)) {
                matchedLocation = loc
                break
              }
            }
          }
        }

        // Check if employee already has correct locationId
        const currentLocationId = emp.locationId?.toString() || emp.locationId
        const matchedLocationId = matchedLocation?._id?.toString()

        if (matchedLocation) {
          if (currentLocationId !== matchedLocationId) {
            // Update employee's locationId using raw collection
            await db.collection('employees').updateOne(
              { _id: emp._id },
              { $set: { locationId: matchedLocation._id } }
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
              oldLocation: locationString || 'N/A',
              newLocationId: matchedLocation.id,
              newLocationName: matchedLocation.name
            })

            updatedCount++
            console.log(`✅ Updated ${firstName} ${lastName} (${emp.employeeId || emp.id}): "${locationString}" -> "${matchedLocation.name}" (${matchedLocation.id})`)
          } else {
            skippedCount++
          }
        } else {
          console.warn(`⚠️ Could not match location for employee ${emp.employeeId || emp.id}: "${locationString}"`)
          skippedCount++
        }
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
    console.log(`\n📋 Updated Employees:`)
    updates.forEach(update => {
      console.log(`  - ${update.employeeName} (${update.employeeId}): "${update.oldLocation}" -> "${update.newLocationName}" (${update.newLocationId})`)
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
  fixEmployeeLocationMapping()
    .then(() => {
      console.log('✅ Script execution completed')
      process.exit(0)
    })
    .catch((error) => {
      console.error('❌ Script execution failed:', error)
      process.exit(1)
    })
}

module.exports = fixEmployeeLocationMapping

