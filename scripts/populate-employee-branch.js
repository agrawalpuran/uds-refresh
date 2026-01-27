/**
 * Script: Populate Employee Branch/Location
 * 
 * This script assigns locationId to employees based on matching their
 * 'location' field (city name) with Location records.
 * 
 * USAGE:
 *   node scripts/populate-employee-branch.js
 * 
 * What it does:
 *   1. Gets all employees for a company
 *   2. Gets all locations for that company
 *   3. Matches employee's location (city) with Location's city or name
 *   4. Updates employee with the matching locationId
 */

const mongoose = require('mongoose')
const crypto = require('crypto')

// Try to load environment variables
try {
  require('dotenv').config({ path: '.env.local' })
} catch (error) {
  console.log('ℹ️  dotenv not found, using process.env directly')
}

const MONGODB_URI = process.env.MONGODB_URI
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || process.env.NEXT_PUBLIC_ENCRYPTION_KEY

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Already connected to MongoDB')
      return mongoose.connection.db
    }
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    return mongoose.connection.db
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

// Helper to decrypt employee location field (if encrypted)
function tryDecrypt(value) {
  if (!value) return ''
  if (typeof value !== 'string') return String(value)
  
  // Check if encrypted (contains ':' separator for iv:encrypted format)
  if (value.includes(':') && ENCRYPTION_KEY) {
    try {
      const [ivHex, encryptedHex] = value.split(':')
      if (!ivHex || !encryptedHex) return value
      
      const iv = Buffer.from(ivHex, 'hex')
      const encrypted = Buffer.from(encryptedHex, 'hex')
      const key = Buffer.from(ENCRYPTION_KEY, 'hex')
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
      let decrypted = decipher.update(encrypted)
      decrypted = Buffer.concat([decrypted, decipher.final()])
      return decrypted.toString('utf8')
    } catch (e) {
      return value
    }
  }
  return value
}

async function populateEmployeeBranch() {
  const db = await connectDB()
  
  // Use native MongoDB collections
  const employeesCollection = db.collection('employees')
  const locationsCollection = db.collection('locations')
  const companiesCollection = db.collection('companies')
  
  console.log('\n🔧 Populating Employee Branch/LocationId\n')
  
  // Get all companies
  const companies = await companiesCollection.find({}).toArray()
  console.log(`Found ${companies.length} companies\n`)
  
  let totalUpdated = 0
  let totalSkipped = 0
  let totalNoMatch = 0
  
  for (const company of companies) {
    const companyId = company.id
    const companyName = company.name || companyId
    
    console.log(`\n📦 Processing: ${companyName} (${companyId})`)
    
    // Get all locations for this company
    const locations = await locationsCollection.find({ companyId }).toArray()
    console.log(`   Locations found: ${locations.length}`)
    
    if (locations.length === 0) {
      console.log(`   ⚠️  No locations for this company - skipping`)
      continue
    }
    
    // Show available locations
    for (const loc of locations) {
      console.log(`      - ${loc.id}: ${loc.name} (City: ${loc.city})`)
    }
    
    // Get employees without locationId for this company
    const employees = await employeesCollection.find({ 
      companyId,
      $or: [
        { locationId: { $exists: false } },
        { locationId: null },
        { locationId: '' }
      ]
    }).toArray()
    
    console.log(`   Employees without locationId: ${employees.length}`)
    
    for (const emp of employees) {
      // Try to decrypt the employee's location field
      const empLocationRaw = emp.location || ''
      const empLocation = tryDecrypt(empLocationRaw).trim().toLowerCase()
      
      if (!empLocation) {
        console.log(`      ⚠️  Employee ${emp.employeeId || emp.id}: No location field`)
        totalNoMatch++
        continue
      }
      
      // Find matching location by city or name
      let matchedLocation = null
      
      for (const loc of locations) {
        const locCity = (loc.city || '').toLowerCase()
        const locName = (loc.name || '').toLowerCase()
        
        // Match by city name
        if (locCity === empLocation || locCity.includes(empLocation) || empLocation.includes(locCity)) {
          matchedLocation = loc
          break
        }
        
        // Match by location name
        if (locName.includes(empLocation) || empLocation.includes(locName)) {
          matchedLocation = loc
          break
        }
      }
      
      if (matchedLocation) {
        // Update employee with locationId
        await employeesCollection.updateOne(
          { _id: emp._id },
          { $set: { locationId: matchedLocation.id } }
        )
        console.log(`      ✅ ${emp.employeeId || emp.id}: Assigned to ${matchedLocation.name} (${matchedLocation.id})`)
        totalUpdated++
      } else {
        console.log(`      ❌ ${emp.employeeId || emp.id}: No matching location for "${empLocation}"`)
        totalNoMatch++
        
        // If there's only one location, assign it anyway (default location)
        if (locations.length === 1) {
          const defaultLoc = locations[0]
          await employeesCollection.updateOne(
            { _id: emp._id },
            { $set: { locationId: defaultLoc.id } }
          )
          console.log(`         → Assigned to default: ${defaultLoc.name} (${defaultLoc.id})`)
          totalUpdated++
          totalNoMatch--
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(50))
  console.log('📊 Summary:')
  console.log(`   Total updated: ${totalUpdated}`)
  console.log(`   No match found: ${totalNoMatch}`)
  console.log('='.repeat(50))
  
  await mongoose.connection.close()
  console.log('\n✅ Done!')
}

// Run the script
populateEmployeeBranch().catch(error => {
  console.error('❌ Script error:', error)
  process.exit(1)
})
