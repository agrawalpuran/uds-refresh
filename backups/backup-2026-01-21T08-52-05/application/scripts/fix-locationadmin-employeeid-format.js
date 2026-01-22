/**
 * Fix LocationAdmin employeeId format: Convert ObjectId employeeId to string (6-digit numeric)
 * This script fixes locationadmins where employeeId is stored as ObjectId instead of string
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

async function fixLocationAdminEmployeeIdFormat() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    const locationAdminsCollection = db.collection('locationadmins')
    const employeesCollection = db.collection('employees')
    
    console.log('='.repeat(80))
    console.log('STEP 1: Finding locationadmins with ObjectId employeeId')
    console.log('='.repeat(80))
    
    // Find all locationadmins
    const allLocationAdmins = await locationAdminsCollection.find({}).toArray()
    console.log(`Found ${allLocationAdmins.length} total locationadmin record(s)`)
    
    const recordsToFix = []
    
    for (const record of allLocationAdmins) {
      if (!record.employeeId) {
        console.log(`⚠️  LocationAdmin ${record._id} has no employeeId - skipping`)
        continue
      }
      
      // Check if employeeId is an ObjectId (not string)
      const isObjectId = record.employeeId instanceof mongoose.Types.ObjectId
      const isString = typeof record.employeeId === 'string'
      const isStringObjectId = isString && record.employeeId.length === 24 && /^[0-9a-fA-F]{24}$/.test(record.employeeId)
      
      if (isObjectId || isStringObjectId) {
        console.log(`❌ LocationAdmin ${record._id} has employeeId as ObjectId: ${record.employeeId}`)
        recordsToFix.push(record)
      } else if (isString && /^\d{6}$/.test(record.employeeId)) {
        console.log(`✅ LocationAdmin ${record._id} has employeeId as string: "${record.employeeId}"`)
      } else {
        console.log(`⚠️  LocationAdmin ${record._id} has employeeId as unknown format: ${typeof record.employeeId} - "${record.employeeId}"`)
        recordsToFix.push(record)
      }
    }
    
    console.log(`\nFound ${recordsToFix.length} record(s) that need fixing`)
    
    if (recordsToFix.length === 0) {
      console.log('✅ All locationadmins have correct employeeId format!')
      await mongoose.disconnect()
      return
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('STEP 2: Fixing locationadmins with incorrect employeeId format')
    console.log('='.repeat(80))
    
    let fixedCount = 0
    let errorCount = 0
    
    for (const record of recordsToFix) {
      try {
        const employeeIdValue = record.employeeId
        
        // Try to find employee by the employeeId value
        let employee = null
        let employeeIdString = null
        
        // First, try as ObjectId (either ObjectId instance or string)
        let employeeObjectId = null
        if (employeeIdValue instanceof mongoose.Types.ObjectId) {
          employeeObjectId = employeeIdValue
        } else if (typeof employeeIdValue === 'string' && employeeIdValue.length === 24 && /^[0-9a-fA-F]{24}$/.test(employeeIdValue)) {
          employeeObjectId = new mongoose.Types.ObjectId(employeeIdValue)
        }
        
        if (employeeObjectId) {
          // Find employee by _id (ObjectId)
          employee = await employeesCollection.findOne({ _id: employeeObjectId })
          
          if (employee) {
            // Get the employee's numeric ID (6-digit string)
            employeeIdString = employee.id || employee.employeeId
            console.log(`✅ Found employee by ObjectId: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'} (ID: ${employeeIdString})`)
          } else {
            console.log(`⚠️  ObjectId "${employeeObjectId}" exists but no employee found with that _id`)
            // Try to find any employee with a matching ObjectId (maybe it's a different field)
            const allEmployees = await employeesCollection.find({}).limit(100).toArray()
            const matchingEmployee = allEmployees.find(emp => emp._id.toString() === employeeObjectId.toString())
            if (matchingEmployee) {
              employee = matchingEmployee
              employeeIdString = employee.id || employee.employeeId
              console.log(`✅ Found employee by matching _id string: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'} (ID: ${employeeIdString})`)
            }
          }
        }
        
        // If we found an employee, update the record
        if (employee && employeeIdString) {
          await locationAdminsCollection.updateOne(
            { _id: record._id },
            { $set: { employeeId: employeeIdString } }
          )
          console.log(`✅ Fixed LocationAdmin ${record._id} - converted ObjectId to string: "${employeeIdString}"`)
          fixedCount++
          continue
        }
        
        // If we get here, we couldn't find the employee
        console.log(`❌ Could not find employee for employeeId: "${employeeIdValue}" in LocationAdmin ${record._id}`)
        console.log(`   This record will need manual fixing`)
        errorCount++
        
      } catch (error) {
        console.error(`❌ Error fixing LocationAdmin ${record._id}:`, error.message)
        errorCount++
      }
    }
    
    console.log('\n' + '='.repeat(80))
    console.log('SUMMARY')
    console.log('='.repeat(80))
    console.log(`✅ Fixed: ${fixedCount} record(s)`)
    console.log(`❌ Errors: ${errorCount} record(s)`)
    console.log(`📊 Total processed: ${recordsToFix.length} record(s)`)
    
    if (errorCount > 0) {
      console.log('\n⚠️  Some records could not be fixed automatically.')
      console.log('   Please check these records manually and ensure the employeeId references a valid employee numeric ID (6-digit string).')
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

fixLocationAdminEmployeeIdFormat()

