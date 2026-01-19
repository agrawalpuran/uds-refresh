/**
 * Check all admin records in detail
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function checkAllAdminRecords() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Checking ALL admin records in detail...\n')
    
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`Total admin records: ${allAdmins.length}\n`)
    
    for (const admin of allAdmins) {
      console.log(`Admin Record:`)
      console.log(`  _id: ${admin._id}`)
      console.log(`  companyId: ${admin.companyId} (type: ${typeof admin.companyId})`)
      console.log(`  employeeId: ${admin.employeeId} (type: ${typeof admin.employeeId})`)
      console.log(`  employeeId is null: ${admin.employeeId === null}`)
      console.log(`  employeeId is undefined: ${admin.employeeId === undefined}`)
      console.log(`  canApproveOrders: ${admin.canApproveOrders || false}`)
      
      // Check if company exists
      const company = await db.collection('companies').findOne({ _id: admin.companyId })
      console.log(`  Company: ${company ? company.name : 'NOT FOUND'} (${company ? company.id : 'N/A'})`)
      
      // Check if employee exists
      if (admin.employeeId) {
        const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
        console.log(`  Employee: ${employee ? (employee.employeeId || employee.id) : 'NOT FOUND'}`)
        if (employee) {
          console.log(`  Employee Name: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'}`)
        }
      } else {
        console.log(`  Employee: NULL/UNDEFINED - ORPHANED RECORD`)
      }
      
      console.log('')
    }
    
    // Delete all orphaned records
    const orphanedCount = allAdmins.filter(a => !a.employeeId).length
    if (orphanedCount > 0) {
      console.log(`\n🗑️  Deleting ${orphanedCount} orphaned admin records...\n`)
      await db.collection('companyadmins').deleteMany({ employeeId: null })
      await db.collection('companyadmins').deleteMany({ employeeId: { $exists: false } })
      console.log('✅ Orphaned records deleted\n')
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkAllAdminRecords()





