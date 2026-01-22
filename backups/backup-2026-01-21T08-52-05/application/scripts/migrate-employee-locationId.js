/**
 * Migration Script: Add locationId to Employee records
 * 
 * This script helps migrate existing employee records to include locationId.
 * Since locationId is optional for backward compatibility, existing employees
 * may not have this field set.
 * 
 * USAGE:
 *   node scripts/migrate-employee-locationId.js
 * 
 * OPTIONS:
 *   - Set locationId for all employees in a company to a specific location
 *   - Set locationId based on employee's existing "location" field (string match)
 *   - Leave locationId unset (for backward compatibility)
 * 
 * NOTE: This script does NOT automatically assign locationId. You need to:
 *   1. Create Locations first (via Company Admin UI or API)
 *   2. Manually assign locationId to employees via updateEmployee API
 *   3. Or modify this script to implement your assignment logic
 */

// Use the same connection pattern as the application
const mongoose = require('mongoose')

// Try to load environment variables (dotenv is optional)
try {
  require('dotenv').config({ path: '.env.local' })
} catch (error) {
  // dotenv not installed, use process.env directly
  console.log('ℹ️  dotenv not found, using process.env directly')
}

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Already connected to MongoDB')
      return
    }
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error)
    process.exit(1)
  }
}

async function checkEmployeeLocationIds() {
  await connectDB()
  
  const Employee = require('../lib/models/Employee').default
  const Location = require('../lib/models/Location').default
  
  console.log('\n📊 Employee LocationId Status Report\n')
  
  // Get all employees
  const employees = await Employee.find({}).lean()
  console.log(`Total employees: ${employees.length}`)
  
  // Count employees with and without locationId
  let withLocationId = 0
  let withoutLocationId = 0
  
  const employeesByCompany = new Map()
  
  for (const emp of employees) {
    const companyId = emp.companyId?.toString() || 'unknown'
    
    if (!employeesByCompany.has(companyId)) {
      employeesByCompany.set(companyId, { total: 0, withLocationId: 0, withoutLocationId: 0 })
    }
    
    const companyStats = employeesByCompany.get(companyId)
    companyStats.total++
    
    if (emp.locationId) {
      withLocationId++
      companyStats.withLocationId++
    } else {
      withoutLocationId++
      companyStats.withoutLocationId++
    }
  }
  
  console.log(`\nEmployees WITH locationId: ${withLocationId}`)
  console.log(`Employees WITHOUT locationId: ${withoutLocationId}`)
  
  // Get all locations
  const locations = await Location.find({}).lean()
  console.log(`\nTotal locations: ${locations.length}`)
  
  if (locations.length > 0) {
    console.log('\nAvailable Locations:')
    for (const loc of locations) {
      const companyId = loc.companyId?.toString() || 'unknown'
      console.log(`  - ${loc.id}: ${loc.name} (Company: ${companyId})`)
    }
  }
  
  // Show company-wise breakdown
  if (employeesByCompany.size > 0) {
    console.log('\n📋 Company-wise Breakdown:')
    const Company = require('../lib/models/Company').default
    
    for (const [companyId, stats] of employeesByCompany.entries()) {
      let companyName = 'Unknown'
      try {
        const company = await Company.findById(companyId).lean()
        if (company) {
          companyName = company.name || company.id || 'Unknown'
        }
      } catch (error) {
        // Ignore
      }
      
      console.log(`\n  Company: ${companyName} (${companyId})`)
      console.log(`    Total employees: ${stats.total}`)
      console.log(`    With locationId: ${stats.withLocationId}`)
      console.log(`    Without locationId: ${stats.withoutLocationId}`)
    }
  }
  
  console.log('\n✅ Status check complete!')
  console.log('\n💡 Next Steps:')
  console.log('   1. Create Locations for each Company (via Company Admin UI)')
  console.log('   2. Assign locationId to employees via updateEmployee API')
  console.log('   3. Or use bulk update to assign locationId based on business rules')
  
  await mongoose.connection.close()
  process.exit(0)
}

// Run the check
checkEmployeeLocationIds().catch(error => {
  console.error('❌ Migration script error:', error)
  process.exit(1)
})

