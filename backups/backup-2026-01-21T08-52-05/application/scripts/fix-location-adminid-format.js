/**
 * Fix Location adminId format: Convert string adminId to ObjectId
 * This script fixes locations where adminId is stored as a string instead of ObjectId
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables manually
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function fixLocationAdminIdFormat() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    const locationsCollection = db.collection('locations')
    const employeesCollection = db.collection('employees')
    
    console.log('='.repeat(80))
    console.log('STEP 1: Finding locations with string adminId')
    console.log('='.repeat(80))
    
    // Find all locations
    const allLocations = await locationsCollection.find({}).toArray()
    console.log(`Found ${allLocations.length} total location(s)`)
    
    const locationsToFix = []
    
    for (const location of allLocations) {
      if (!location.adminId) {
        console.log(`⚠️  Location ${location.id} (${location.name}) has no adminId - skipping`)
        continue
      }
      
      // Check if adminId is a string (not ObjectId)
      const isString = typeof location.adminId === 'string'
      const isObjectId = location.adminId instanceof mongoose.Types.ObjectId
      
      if (isString) {
        console.log(`❌ Location ${location.id} (${location.name}) has adminId as string: "${location.adminId}"`)
        locationsToFix.push(location)
      } else if (isObjectId) {
        console.log(`✅ Location ${location.id} (${location.name}) has adminId as ObjectId: ${location.adminId}`)
      } else {
        console.log(`⚠️  Location ${location.id} (${location.name}) has adminId as unknown type: ${typeof location.adminId}`)
        locationsToFix.push(location)
      }
    }
    
    console.log(`\nFound ${locationsToFix.length} location(s) that need fixing`)
    
    if (locationsToFix.length === 0) {
      console.log('✅ All locations have correct adminId format!')
      await mongoose.disconnect()
      return
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('STEP 2: Fixing locations with incorrect adminId format')
    console.log('='.repeat(80))
    
    let fixedCount = 0
    let errorCount = 0
    
    for (const location of locationsToFix) {
      try {
        const adminIdValue = location.adminId
        
        // Try to find employee by the adminId value
        let employee = null
        
        // First, try as ObjectId string (24 hex characters)
        if (typeof adminIdValue === 'string' && adminIdValue.length === 24 && /^[0-9a-fA-F]{24}$/.test(adminIdValue)) {
          // It's a valid ObjectId string - convert to ObjectId
          try {
            const adminIdObjectId = new mongoose.Types.ObjectId(adminIdValue)
            employee = await employeesCollection.findOne({ _id: adminIdObjectId })
            
            if (employee) {
              console.log(`✅ Found employee by ObjectId string: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'} (ID: ${employee.id || 'N/A'})`)
              // Update location with ObjectId
              await locationsCollection.updateOne(
                { _id: location._id },
                { $set: { adminId: adminIdObjectId } }
              )
              console.log(`✅ Fixed location ${location.id} (${location.name}) - converted string to ObjectId`)
              fixedCount++
              continue
            } else {
              console.log(`⚠️  ObjectId "${adminIdValue}" exists but no employee found with that _id`)
              // Try to find any employee with a similar ObjectId (maybe it's a different field)
              const allEmployees = await employeesCollection.find({}).limit(100).toArray()
              const matchingEmployee = allEmployees.find(emp => emp._id.toString() === adminIdValue)
              if (matchingEmployee) {
                console.log(`✅ Found employee by matching _id string: ${matchingEmployee.firstName || 'N/A'} ${matchingEmployee.lastName || 'N/A'}`)
                await locationsCollection.updateOne(
                  { _id: location._id },
                  { $set: { adminId: matchingEmployee._id } }
                )
                console.log(`✅ Fixed location ${location.id} (${location.name}) - converted string to ObjectId`)
                fixedCount++
                continue
              }
            }
          } catch (error) {
            console.log(`⚠️  Error converting "${adminIdValue}" to ObjectId: ${error.message}`)
          }
        }
        
        // Try to find employee by employeeId (6-digit numeric string)
        if (typeof adminIdValue === 'string' && /^\d{6}$/.test(adminIdValue)) {
          employee = await employeesCollection.findOne({ employeeId: adminIdValue })
          
          if (employee) {
            console.log(`✅ Found employee by employeeId: ${employee.firstName} ${employee.lastName} (${employee.id})`)
            // Update location with employee's ObjectId
            await locationsCollection.updateOne(
              { _id: location._id },
              { $set: { adminId: employee._id } }
            )
            console.log(`✅ Fixed location ${location.id} (${location.name}) - converted employeeId to ObjectId`)
            fixedCount++
            continue
          }
        }
        
        // Try to find employee by numeric id (6-digit numeric string)
        if (typeof adminIdValue === 'string' && /^\d{6}$/.test(adminIdValue)) {
          employee = await employeesCollection.findOne({ id: adminIdValue })
          
          if (employee) {
            console.log(`✅ Found employee by id: ${employee.firstName} ${employee.lastName} (${employee.id})`)
            // Update location with employee's ObjectId
            await locationsCollection.updateOne(
              { _id: location._id },
              { $set: { adminId: employee._id } }
            )
            console.log(`✅ Fixed location ${location.id} (${location.name}) - converted id to ObjectId`)
            fixedCount++
            continue
          }
        }
        
        // If we get here, we couldn't find the employee
        console.log(`❌ Could not find employee for adminId: "${adminIdValue}" in location ${location.id} (${location.name})`)
        console.log(`   This location will need manual fixing`)
        errorCount++
        
      } catch (error) {
        console.error(`❌ Error fixing location ${location.id}:`, error.message)
        errorCount++
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('SUMMARY')
    console.log('='.repeat(80))
    console.log(`✅ Fixed: ${fixedCount} location(s)`)
    console.log(`❌ Errors: ${errorCount} location(s)`)
    console.log(`📊 Total processed: ${locationsToFix.length} location(s)`)
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some locations could not be fixed automatically.')
      console.log('   Please check these locations manually and ensure the adminId references a valid employee ObjectId.')
    }
    
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
    await mongoose.disconnect().catch(() => {})
    process.exit(1)
  }
}

fixLocationAdminIdFormat()

