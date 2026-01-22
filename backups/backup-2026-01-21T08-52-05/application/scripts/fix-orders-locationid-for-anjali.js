/**
 * Fix orders to appear in Anjali Singh's "My PRs" tab
 * This script ensures:
 * 1. Anjali Singh (300032) is set as admin for Chennai location
 * 2. Employees 300011 and 300012 have the correct locationId
 * 3. Orders are linked to employees with the correct locationId
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function fixOrdersLocationId() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const employeesCollection = db.collection('employees')
    const locationsCollection = db.collection('locations')
    const ordersCollection = db.collection('orders')
    const companiesCollection = db.collection('companies')
    const branchesCollection = db.collection('branches')

    // Step 1: Find ICICI company
    const company = await companiesCollection.findOne({ 
      $or: [{ id: 'COMP-ICICI' }, { name: { $regex: /icici/i } }] 
    })
    if (!company) {
      throw new Error('ICICI Bank company not found')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})\n`)

    // Step 2: Find Chennai branch
    const chennaiBranch = await branchesCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })
    if (!chennaiBranch) {
      throw new Error('Chennai branch not found')
    }
    console.log(`✅ Found branch: ${chennaiBranch.name}\n`)

    // Step 3: Find Anjali Singh (300032)
    const anjali = await employeesCollection.findOne({
      $or: [{ employeeId: '300032' }, { id: '300032' }]
    })
    if (!anjali) {
      throw new Error('Anjali Singh (300032) not found')
    }
    console.log(`✅ Found Anjali Singh: ${anjali.employeeId || anjali.id}\n`)

    // Step 4: Find or create Chennai location with Anjali as admin
    let chennaiLocation = await locationsCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })

    if (!chennaiLocation) {
      console.log('   Creating Chennai location...')
      const locationResult = await locationsCollection.insertOne({
        id: `LOC-${Date.now()}`,
        name: 'ICICI Bank Chennai Branch',
        companyId: company._id,
        adminId: anjali._id,
        address: chennaiBranch.address_line_1 || 'ICICI Bank, T Nagar',
        city: chennaiBranch.city || 'Chennai',
        state: chennaiBranch.state || 'Tamil Nadu',
        pincode: chennaiBranch.pincode || '600017',
        country: chennaiBranch.country || 'India',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      chennaiLocation = await locationsCollection.findOne({ _id: locationResult.insertedId })
      console.log(`   ✅ Created location: ${chennaiLocation.name} (${chennaiLocation.id})\n`)
    } else {
      // Update location to ensure Anjali is admin
      await locationsCollection.updateOne(
        { _id: chennaiLocation._id },
        { $set: { adminId: anjali._id } }
      )
      console.log(`✅ Found location: ${chennaiLocation.name} (${chennaiLocation.id})`)
      console.log(`   ✅ Updated location admin to Anjali Singh\n`)
    }

    // Step 5: Update employees 300011 and 300012 to have correct locationId
    const employees = await employeesCollection.find({
      $or: [
        { employeeId: { $in: ['300011', '300012'] } },
        { id: { $in: ['300011', '300012'] } }
      ]
    }).toArray()

    console.log(`📝 Updating ${employees.length} employees with locationId...`)
    for (const emp of employees) {
      await employeesCollection.updateOne(
        { _id: emp._id },
        { 
          $set: { 
            locationId: chennaiLocation._id,
            branchId: chennaiBranch._id
          } 
        }
      )
      console.log(`   ✅ Updated employee ${emp.employeeId || emp.id} with locationId`)
    }
    console.log()

    // Step 6: Verify orders are linked to these employees
    const employeeIds = employees.map(e => e._id)
    const orders = await ordersCollection.find({
      employeeId: { $in: employeeIds },
      pr_status: 'SITE_ADMIN_APPROVED'
    }).toArray()

    console.log(`📦 Found ${orders.length} orders for these employees:`)
    orders.forEach((order, idx) => {
      console.log(`   ${idx + 1}. Order ${order.id} - Employee: ${order.employeeIdNum}`)
      console.log(`      PR Number: ${order.pr_number || 'N/A'}`)
      console.log(`      PR Status: ${order.pr_status}`)
    })
    console.log()

    // Step 7: Verify the query will work
    console.log('🔍 Verifying query will work for Anjali Singh...')
    const testEmployees = await employeesCollection.find({
      locationId: chennaiLocation._id
    }).toArray()
    
    console.log(`   ✅ Found ${testEmployees.length} employees with locationId matching Chennai location`)
    testEmployees.forEach((emp, idx) => {
      console.log(`      ${idx + 1}. ${emp.employeeId || emp.id}`)
    })

    const testEmployeeIds = testEmployees.map(e => e._id)
    const testOrders = await ordersCollection.find({
      employeeId: { $in: testEmployeeIds },
      pr_status: 'SITE_ADMIN_APPROVED'
    }).toArray()

    console.log(`\n   ✅ Found ${testOrders.length} orders that will appear in "My PRs":`)
    testOrders.forEach((order, idx) => {
      console.log(`      ${idx + 1}. Order ${order.id} - PR: ${order.pr_number || 'N/A'}`)
    })

    console.log('\n🎉 Fix completed successfully!')
    console.log('\n📋 Summary:')
    console.log(`   - Location: ${chennaiLocation.name} (${chennaiLocation.id})`)
    console.log(`   - Location Admin: Anjali Singh (300032)`)
    console.log(`   - Employees updated: ${employees.length}`)
    console.log(`   - Orders visible in "My PRs": ${testOrders.length}`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

fixOrdersLocationId()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

