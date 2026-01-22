/**
 * Quick script to check current Indigo admins
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

async function checkIndigoAdmins() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Checking Indigo Company Admins:\n')
    
    // Find Indigo company
    const indigoCompany = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    if (!indigoCompany) {
      console.log('❌ Indigo company not found')
      await mongoose.disconnect()
      return
    }
    
    console.log(`Company: ${indigoCompany.name} (${indigoCompany.id})`)
    console.log(`Company _id: ${indigoCompany._id}\n`)
    
    // Find all admins for Indigo
    const admins = await db.collection('companyadmins').find({ 
      companyId: indigoCompany._id 
    }).toArray()
    
    console.log(`Total admins found: ${admins.length}\n`)
    
    if (admins.length > 0) {
      for (const admin of admins) {
        const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
        
        console.log(`Admin Record:`)
        console.log(`  Admin _id: ${admin._id}`)
        console.log(`  Employee _id: ${admin.employeeId}`)
        if (employee) {
          console.log(`  Employee ID: ${employee.employeeId || employee.id || 'N/A'}`)
          console.log(`  Employee Name: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'}`)
        } else {
          console.log(`  Employee: NOT FOUND (orphaned record)`)
        }
        console.log(`  Can Approve Orders: ${admin.canApproveOrders || false}`)
        console.log('')
      }
      
      // Remove IND-001 (Rakesh Sharma) if it exists
      const rakeshEmployee = await db.collection('employees').findOne({ employeeId: 'IND-001' })
      if (rakeshEmployee) {
        const rakeshAdmin = admins.find(a => 
          a.employeeId.toString() === rakeshEmployee._id.toString()
        )
        if (rakeshAdmin) {
          console.log('🗑️  Removing Rakesh Sharma (IND-001) admin record...')
          await db.collection('companyadmins').deleteOne({ _id: rakeshAdmin._id })
          console.log('✅ Rakesh Sharma admin record removed\n')
        }
      }
    } else {
      console.log('✅ No admins found for Indigo\n')
    }
    
    // Show final state
    const finalAdmins = await db.collection('companyadmins').find({ 
      companyId: indigoCompany._id 
    }).toArray()
    
    console.log(`\n📊 Final Admin Count: ${finalAdmins.length}`)
    if (finalAdmins.length > 0) {
      for (const admin of finalAdmins) {
        const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
        if (employee) {
          console.log(`  - ${employee.firstName} ${employee.lastName} (${employee.employeeId})`)
        }
      }
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkIndigoAdmins()





