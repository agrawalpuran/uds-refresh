/**
 * Test script to check if employees exist for company 100004
 * Run: node scripts/test-employee-query.js
 */

// Try to load dotenv, but continue if not available
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI

// Try to read from .env.local file directly
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
      console.log('✅ Loaded MONGODB_URI from .env.local')
    }
  }
} catch (error) {
  console.log('⚠️  Could not read .env.local, trying dotenv...')
  try {
    require('dotenv').config({ path: '.env.local' })
    MONGODB_URI = process.env.MONGODB_URI
  } catch (e) {
    // dotenv not available
  }
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found!')
  console.error('Please set MONGODB_URI in .env.local file')
  process.exit(1)
}

const mongoose = require('mongoose')

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local')
  process.exit(1)
}

async function testEmployeeQuery() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log(`Database name: ${mongoose.connection.name}`)
    console.log(`Connection URI: ${MONGODB_URI.substring(0, 50)}...\n`)

    const db = mongoose.connection.db
    
    // List all collections
    console.log('📋 Available collections:')
    const collections = await db.listCollections().toArray()
    if (collections.length > 0) {
      collections.forEach(col => {
        console.log(`  - ${col.name}`)
      })
    } else {
      console.log('  No collections found (database might be empty or connection issue)')
    }
    console.log('')
    
    // Direct query to employees collection
    console.log('📋 Direct query to employees collection:')
    const employeeCount = await db.collection('employees').countDocuments({})
    console.log(`Total employees: ${employeeCount}`)
    
    if (employeeCount > 0) {
      const sampleEmployee = await db.collection('employees').findOne({})
      console.log('\nSample employee (first one found):')
      console.log(`  _id: ${sampleEmployee._id}`)
      console.log(`  id: ${sampleEmployee.id}`)
      console.log(`  employeeId: ${sampleEmployee.employeeId}`)
      console.log(`  companyId: ${sampleEmployee.companyId} (type: ${typeof sampleEmployee.companyId})`)
      console.log(`  locationId: ${sampleEmployee.locationId ? sampleEmployee.locationId : 'NOT SET'} (type: ${typeof sampleEmployee.locationId})`)
      console.log(`  location: ${sampleEmployee.location || 'N/A'}`)
      
      // Find the company for this employee
      if (sampleEmployee.companyId) {
        const empCompany = await db.collection('companies').findOne({ _id: sampleEmployee.companyId })
        if (empCompany) {
          console.log(`\n  Employee's Company: ${empCompany.name} (id: ${empCompany.id}, _id: ${empCompany._id})`)
        } else {
          console.log(`\n  Employee's companyId ObjectId not found in companies collection!`)
        }
      }
      
      // Find the location for this employee
      if (sampleEmployee.locationId) {
        const empLocation = await db.collection('locations').findOne({ _id: sampleEmployee.locationId })
        if (empLocation) {
          console.log(`  Employee's Location: ${empLocation.name} (id: ${empLocation.id}, _id: ${empLocation._id})`)
        } else {
          console.log(`  Employee's locationId ObjectId not found in locations collection!`)
        }
      }
    }
    console.log('')
    
    // Check actual companies
    console.log('📋 All Companies in database:')
    const allCompanies = await db.collection('companies').find({}).toArray()
    if (allCompanies.length > 0) {
      allCompanies.forEach(c => {
        console.log(`  - ${c.name} (id: ${c.id}, _id: ${c._id})`)
      })
    } else {
      console.log('  No companies found')
    }
    console.log('')
    
    // Check actual locations
    console.log('📋 All Locations in database:')
    const allLocations = await db.collection('locations').find({}).toArray()
    if (allLocations.length > 0) {
      allLocations.forEach(l => {
        console.log(`  - ${l.name} (id: ${l.id}, _id: ${l._id}, companyId: ${l.companyId})`)
      })
    } else {
      console.log('  No locations found')
    }
    console.log('')
    
    // Test 1: Check if company exists
    console.log('📋 Test 1: Checking if company 100004 exists...')
    const company = await db.collection('companies').findOne({ id: '100004' })
    if (company) {
      console.log(`✅ Company found: ${company.name} (ID: ${company.id}, _id: ${company._id})`)
    } else {
      console.log('❌ Company 100004 NOT FOUND!')
      console.log('Available companies:')
      const allCompanies = await db.collection('companies').find({}).toArray()
      allCompanies.forEach(c => console.log(`  - ${c.name} (ID: ${c.id})`))
    }
    
    console.log('\n📋 Test 2: Checking employees for company 100004...')
    if (company) {
      const employees = await db.collection('employees').find({ 
        companyId: company._id 
      }).toArray()
      
      console.log(`Found ${employees.length} employees for company 100004`)
      
      if (employees.length > 0) {
        console.log('\nSample employees (first 5):')
        employees.slice(0, 5).forEach((emp, idx) => {
          console.log(`\n${idx + 1}. Employee ID: ${emp.employeeId || emp.id}`)
          console.log(`   Status: ${emp.status}`)
          console.log(`   Location: ${emp.location || 'N/A'}`)
          console.log(`   LocationId: ${emp.locationId ? 'SET' : 'NOT SET'}`)
          if (emp.locationId) {
            console.log(`   LocationId value: ${emp.locationId}`)
          }
        })
      } else {
        console.log('❌ No employees found for company 100004!')
        console.log('\nChecking all employees in database...')
        const allEmployees = await db.collection('employees').find({}).limit(5).toArray()
        console.log(`Total employees in database: ${await db.collection('employees').countDocuments({})}`)
        if (allEmployees.length > 0) {
          console.log('\nSample employees (any company):')
          allEmployees.forEach((emp, idx) => {
            const empCompanyId = emp.companyId?.toString() || emp.companyId
            console.log(`${idx + 1}. Employee: ${emp.employeeId || emp.id}, CompanyId: ${empCompanyId}`)
          })
        }
      }
    }
    
    console.log('\n📋 Test 3: Checking location 400006...')
    const location = await db.collection('locations').findOne({ id: '400006' })
    if (location) {
      console.log(`✅ Location found: ${location.name} (ID: ${location.id})`)
      console.log(`   CompanyId: ${location.companyId}`)
      console.log(`   CompanyId type: ${typeof location.companyId}`)
    } else {
      console.log('❌ Location 400006 NOT FOUND!')
      console.log('\nAvailable locations:')
      const allLocations = await db.collection('locations').find({}).toArray()
      if (allLocations.length > 0) {
        allLocations.forEach(l => {
          console.log(`  - ${l.name} (ID: ${l.id}, CompanyId: ${l.companyId})`)
        })
      } else {
        console.log('  No locations found in database!')
      }
    }
    
    console.log('\n📋 Test 4: Checking all employees...')
    const totalEmployees = await db.collection('employees').countDocuments({})
    console.log(`Total employees in database: ${totalEmployees}`)
    if (totalEmployees > 0) {
      const sampleEmployees = await db.collection('employees').find({}).limit(10).toArray()
      console.log('\nSample employees (showing companyId):')
      for (const emp of sampleEmployees) {
        let companyInfo = 'Unknown'
        if (emp.companyId) {
          const empCompany = await db.collection('companies').findOne({ _id: emp.companyId })
          if (empCompany) {
            companyInfo = `${empCompany.name} (ID: ${empCompany.id})`
          } else {
            companyInfo = `ObjectId: ${emp.companyId} (company not found)`
          }
        }
        console.log(`  - Employee: ${emp.employeeId || emp.id}, Company: ${companyInfo}, Status: ${emp.status || 'N/A'}`)
      }
    }
    
    await mongoose.connection.close()
    console.log('\n✅ Test complete')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

testEmployeeQuery()

