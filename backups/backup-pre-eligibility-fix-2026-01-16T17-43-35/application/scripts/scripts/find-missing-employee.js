/**
 * Find the missing employee and fix the admin record
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

async function findMissingEmployee() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Finding missing employee and fixing admin record...\n')
    
    // Get the admin record
    const admin = await db.collection('companyadmins').findOne({})
    if (!admin) {
      console.log('No admin records found')
      await mongoose.disconnect()
      return
    }
    
    console.log(`Admin record employeeId: ${admin.employeeId}`)
    console.log(`Admin record companyId: ${admin.companyId}\n`)
    
    // Find Indigo company
    const indigoCompany = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    if (!indigoCompany) {
      console.log('❌ Indigo company not found')
      await mongoose.disconnect()
      return
    }
    
    console.log(`Indigo company _id: ${indigoCompany._id}`)
    console.log(`Admin companyId matches: ${admin.companyId.toString() === indigoCompany._id.toString()}\n`)
    
    // Find all Indigo employees
    const indigoEmployees = await db.collection('employees').find({ 
      companyId: indigoCompany._id 
    }).toArray()
    
    console.log(`Indigo employees found: ${indigoEmployees.length}\n`)
    
    for (const emp of indigoEmployees) {
      console.log(`Employee:`)
      console.log(`  _id: ${emp._id}`)
      console.log(`  id: ${emp.id}`)
      console.log(`  employeeId: ${emp.employeeId}`)
      console.log(`  Name: ${emp.firstName} ${emp.lastName}`)
      console.log(`  Matches admin employeeId: ${emp._id.toString() === admin.employeeId.toString()}`)
      console.log('')
    }
    
    // Find Amit Patel (IND-003)
    const amit = indigoEmployees.find(e => e.employeeId === 'IND-003')
    if (amit) {
      console.log(`\n✅ Found Amit Patel (IND-003)`)
      console.log(`   _id: ${amit._id}`)
      console.log(`   Current admin employeeId: ${admin.employeeId}`)
      console.log(`   Should be: ${amit._id}`)
      
      if (amit._id.toString() !== admin.employeeId.toString()) {
        console.log(`\n🔧 Fixing admin record...`)
        await db.collection('companyadmins').updateOne(
          { _id: admin._id },
          { $set: { employeeId: amit._id } }
        )
        console.log(`✅ Fixed admin record to point to Amit Patel\n`)
      }
    } else {
      console.log(`\n❌ Amit Patel (IND-003) not found in Indigo employees`)
    }
    
    // Delete the orphaned admin if employee doesn't exist
    const employeeExists = await db.collection('employees').findOne({ _id: admin.employeeId })
    if (!employeeExists && !amit) {
      console.log(`\n🗑️  Deleting orphaned admin record...`)
      await db.collection('companyadmins').deleteOne({ _id: admin._id })
      console.log(`✅ Deleted orphaned admin record\n`)
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

findMissingEmployee()





