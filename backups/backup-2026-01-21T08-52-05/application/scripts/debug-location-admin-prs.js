/**
 * Debug script to diagnose Location Admin PR visibility issues
 * Uses direct MongoDB queries to avoid module resolution issues
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

// Simple encryption/decryption (matching lib/utils/encryption.js)
function simpleEncrypt(text) {
  // This is a simplified version - actual encryption might be different
  // For debugging, we'll try to match encrypted emails
  return Buffer.from(text).toString('base64')
}

async function debugLocationAdminPRs() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Find Anjali Singh employee record
    console.log('='.repeat(80))
    console.log('STEP 1: Finding Anjali Singh employee record')
    console.log('='.repeat(80))
    
    const employeesCollection = db.collection('employees')
    
    // Try to find employee by name
    const employeesByName = await employeesCollection.find({
      $or: [
        { firstName: /anjali/i },
        { lastName: /singh/i },
        { firstName: /Anjali/i },
        { lastName: /Singh/i }
      ]
    }).toArray()
    
    console.log(`Found ${employeesByName.length} employee(s) matching "Anjali Singh"`)
    
    let employee = null
    if (employeesByName.length > 0) {
      employee = employeesByName[0]
      console.log(`✅ Found employee: ${employee.firstName} ${employee.lastName}`)
      console.log(`   Employee ID: ${employee.id}`)
      console.log(`   Employee ObjectId: ${employee._id}`)
      console.log(`   Employee Email (raw): ${employee.email ? employee.email.substring(0, 20) + '...' : 'N/A'}`)
      console.log(`   Employee locationId: ${employee.locationId}`)
      console.log(`   Employee locationId type: ${typeof employee.locationId}`)
      if (employee.locationId) {
        console.log(`   Employee locationId ObjectId: ${employee.locationId.toString()}`)
      }
    } else {
      console.log('❌ Could not find Anjali Singh employee record')
      console.log('   Searching all employees...')
      const allEmployees = await employeesCollection.find({}).limit(10).toArray()
      console.log(`   Sample employees (first 10):`)
      allEmployees.forEach((emp, idx) => {
        console.log(`     ${idx + 1}. ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'} (ID: ${emp.id || 'N/A'})`)
      })
      return
    }
    
    console.log()
    
    // Step 2: Find location where this employee is admin
    console.log('='.repeat(80))
    console.log('STEP 2: Finding location where Anjali is admin')
    console.log('='.repeat(80))
    
    const locationsCollection = db.collection('locations')
    const location = await locationsCollection.findOne({ adminId: employee._id })
    
    if (!location) {
      console.log('❌ No location found with adminId = employee._id')
      console.log(`   Searching for location with adminId = ${employee._id}`)
      
      // Try to find location by adminId as string
      const locationByString = await locationsCollection.findOne({ 
        adminId: employee._id.toString() 
      })
      
      if (locationByString) {
        console.log('✅ Found location using string adminId')
        location = locationByString
      } else {
        console.log('❌ Still not found. Checking all locations...')
        const allLocations = await locationsCollection.find({}).toArray()
        console.log(`Total locations: ${allLocations.length}`)
        for (const loc of allLocations) {
          if (loc.adminId) {
            const adminIdStr = loc.adminId.toString()
            const employeeIdStr = employee._id.toString()
            if (adminIdStr === employeeIdStr) {
              console.log(`✅ Found location: ${loc.id} - ${loc.name}`)
              location = loc
              break
            }
          }
        }
      }
    } else {
      console.log(`✅ Found location: ${location.id} - ${location.name}`)
      console.log(`Location ObjectId: ${location._id}`)
      console.log(`Location adminId: ${location.adminId}`)
      console.log(`Location adminId type: ${typeof location.adminId}`)
    }
    
    if (!location) {
      console.log('❌ Could not find location for Anjali Singh')
      return
    }
    
    console.log()
    
    // Step 3: Find employees at this location
    console.log('='.repeat(80))
    console.log('STEP 3: Finding employees at this location')
    console.log('='.repeat(80))
    
    let locationId = location._id
    if (!(locationId instanceof mongoose.Types.ObjectId)) {
      locationId = new mongoose.Types.ObjectId(locationId)
    }
    
    console.log(`Location ID (numeric): ${location.id}`)
    console.log(`Location ObjectId: ${locationId}`)
    console.log(`Location ObjectId type: ${locationId.constructor.name}`)
    
    const employees = await employeesCollection.find({ locationId: locationId }).toArray()
    
    console.log(`Found ${employees.length} employee(s) at location ${location.id}`)
    if (employees.length > 0) {
      employees.forEach((emp, idx) => {
        console.log(`  ${idx + 1}. ${emp.firstName} ${emp.lastName} (ID: ${emp.id}, EmployeeID: ${emp.employeeId})`)
        console.log(`     ObjectId: ${emp._id}`)
        console.log(`     locationId: ${emp.locationId} (type: ${typeof emp.locationId})`)
        if (emp.locationId) {
          console.log(`     locationId ObjectId: ${emp.locationId.toString()}`)
        }
      })
    } else {
      console.log('❌ No employees found at this location!')
      console.log('   This is the root cause - no employees means no PRs will be found')
      console.log('   Checking if locationId matches...')
      
      // Try different locationId formats
      const locationIdStr = locationId.toString()
      const locationIdHex = locationId.toHexString()
      console.log(`   Trying locationId as string: ${locationIdStr}`)
      const employeesByString = await employeesCollection.find({ locationId: locationIdStr }).toArray()
      console.log(`   Found ${employeesByString.length} employee(s) with locationId as string`)
      
      console.log(`   Trying locationId as ObjectId: ${locationIdHex}`)
      const employeesByHex = await employeesCollection.find({ locationId: locationIdHex }).toArray()
      console.log(`   Found ${employeesByHex.length} employee(s) with locationId as hex string`)
    }
    
    console.log()
    
    // Step 4: Check for PRs/Orders for these employees
    console.log('='.repeat(80))
    console.log('STEP 4: Checking for PRs/Orders for employees at this location')
    console.log('='.repeat(80))
    
    if (employees.length === 0) {
      console.log('⚠️  Skipping PR check - no employees found')
      return
    }
    
    const employeeIds = employees.map((e) => e._id)
    const ordersCollection = db.collection('orders')
    
    // Check all orders (no status filter)
    const allOrders = await ordersCollection.find({
      employeeId: { $in: employeeIds }
    }).toArray()
    
    console.log(`Total orders for employees at location: ${allOrders.length}`)
    
    if (allOrders.length > 0) {
      console.log('\nOrder breakdown by pr_status:')
      const statusCounts = {}
      allOrders.forEach(order => {
        const status = order.pr_status || 'NO_PR_STATUS'
        statusCounts[status] = (statusCounts[status] || 0) + 1
      })
      Object.entries(statusCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count}`)
      })
      
      console.log('\nSample orders:')
      allOrders.slice(0, 5).forEach((order, idx) => {
        console.log(`  ${idx + 1}. Order ID: ${order.id}`)
        console.log(`     PR Status: ${order.pr_status || 'N/A'}`)
        console.log(`     PR Number: ${order.pr_number || 'N/A'}`)
        console.log(`     Created: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : 'N/A'}`)
      })
      
      // Check what should show in "My PRs" tab
      console.log('\nOrders that should appear in "My PRs" tab:')
      const myPRsStatuses = [
        'COMPANY_ADMIN_APPROVED',
        'PO_CREATED',
        'REJECTED_BY_SITE_ADMIN',
        'REJECTED_BY_COMPANY_ADMIN',
        'DRAFT',
        'SUBMITTED',
        'SITE_ADMIN_APPROVED'
      ]
      const myPRsOrders = allOrders.filter(o => 
        o.pr_status && myPRsStatuses.includes(o.pr_status)
      )
      console.log(`  Count: ${myPRsOrders.length}`)
      myPRsOrders.slice(0, 5).forEach((order, idx) => {
        console.log(`  ${idx + 1}. Order ID: ${order.id}, PR Status: ${order.pr_status}`)
      })
    } else {
      console.log('❌ No orders found for employees at this location')
    }
    
    console.log()
    
    // Step 5: Test the actual query used by getAllPRsForSiteAdmin
    console.log('='.repeat(80))
    console.log('STEP 5: Testing getAllPRsForSiteAdmin query logic')
    console.log('='.repeat(80))
    
    if (employees.length > 0 && locationId) {
      const queryFilter = {
        employeeId: { $in: employeeIds },
        pr_status: { 
          $in: [
            'COMPANY_ADMIN_APPROVED',
            'PO_CREATED',
            'REJECTED_BY_SITE_ADMIN',
            'REJECTED_BY_COMPANY_ADMIN',
            'DRAFT',
            'SUBMITTED',
            'SITE_ADMIN_APPROVED'
          ]
        }
      }
      
      console.log('Query filter:', JSON.stringify(queryFilter, null, 2))
      
      const testOrders = await ordersCollection.find(queryFilter)
        .project({ id: 1, employeeId: 1, pr_status: 1, pr_number: 1, createdAt: 1 })
        .limit(10)
        .toArray()
      
      console.log(`Query returned ${testOrders.length} order(s)`)
      if (testOrders.length > 0) {
        testOrders.forEach((order, idx) => {
          console.log(`  ${idx + 1}. ${order.id} - ${order.pr_status}`)
        })
      } else {
        console.log('❌ Query returned 0 orders - this is the issue!')
        console.log('   Checking if any orders match employeeIds but have different pr_status...')
        
        const ordersWithDifferentStatus = await ordersCollection.find({
          employeeId: { $in: employeeIds }
        })
          .project({ id: 1, pr_status: 1 })
          .toArray()
        
        console.log(`   Found ${ordersWithDifferentStatus.length} total orders`)
        if (ordersWithDifferentStatus.length > 0) {
          const statuses = [...new Set(ordersWithDifferentStatus.map(o => o.pr_status || 'NULL'))]
          console.log(`   PR Statuses found: ${statuses.join(', ')}`)
          console.log('   ⚠️  These statuses are NOT in the "My PRs" filter list!')
        }
      }
    }
    
    console.log()
    console.log('='.repeat(80))
    console.log('ROOT CAUSE ANALYSIS SUMMARY')
    console.log('='.repeat(80))
    
    if (employees.length === 0) {
      console.log('❌ ROOT CAUSE: No employees are linked to the location')
      console.log('   Fix: Ensure employees have locationId set to the location ObjectId')
    } else if (allOrders.length === 0) {
      console.log('❌ ROOT CAUSE: No orders exist for employees at this location')
      console.log('   This is a data issue - no PRs have been created yet')
    } else {
      const myPRsCount = allOrders.filter(o => 
        o.pr_status && [
          'COMPANY_ADMIN_APPROVED',
          'PO_CREATED',
          'REJECTED_BY_SITE_ADMIN',
          'REJECTED_BY_COMPANY_ADMIN',
          'DRAFT',
          'SUBMITTED',
          'SITE_ADMIN_APPROVED'
        ].includes(o.pr_status)
      ).length
      
      if (myPRsCount === 0) {
        console.log('❌ ROOT CAUSE: Orders exist but none match "My PRs" status filter')
        console.log('   All orders have statuses that are excluded from "My PRs" tab')
        const actualStatuses = [...new Set(allOrders.map(o => o.pr_status || 'NULL'))]
        console.log(`   Actual PR statuses: ${actualStatuses.join(', ')}`)
      } else {
        console.log(`✅ Found ${myPRsCount} order(s) that should appear in "My PRs"`)
        console.log('   Issue might be in date filtering or query execution')
      }
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

debugLocationAdminPRs()
