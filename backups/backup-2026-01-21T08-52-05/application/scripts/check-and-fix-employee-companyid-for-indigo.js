/**
 * Check and fix employee companyId assignments for Indigo
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
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function checkAndFixEmployees() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Checking employees for Indigo...\n')
    
    // Get Indigo company
    const indigoCompany = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    if (!indigoCompany) {
      console.log('❌ Indigo company not found')
      await mongoose.disconnect()
      return
    }
    
    console.log(`✅ Found Indigo company: ${indigoCompany.name} (${indigoCompany._id})\n`)
    
    // Get all employees
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`Total employees in database: ${allEmployees.length}\n`)
    
    // Find employees that should belong to Indigo
    const indigoEmployeeIds = ['IND-001', 'IND-002', 'IND-003', 'IND-004', 'IND-005']
    const indigoEmployees = []
    
    for (const emp of allEmployees) {
      const empId = emp.employeeId || emp.id
      const companyId = emp.companyId
      const companyName = emp.companyName || ''
      
      // Check if employee should belong to Indigo
      const shouldBeIndigo = 
        indigoEmployeeIds.includes(empId) ||
        empId?.startsWith('IND-') ||
        companyName.toLowerCase().includes('indigo') ||
        (emp.email && emp.email.includes('goindigo.in'))
      
      if (shouldBeIndigo) {
        indigoEmployees.push({
          _id: emp._id,
          employeeId: empId,
          companyId: companyId,
          companyName: companyName,
          email: emp.email
        })
      }
    }
    
    console.log(`Found ${indigoEmployees.length} employees that should belong to Indigo:\n`)
    
    let fixed = 0
    for (const emp of indigoEmployees) {
      const currentCompanyId = emp.companyId ? (emp.companyId.toString ? emp.companyId.toString() : String(emp.companyId)) : 'none'
      const targetCompanyId = indigoCompany._id.toString()
      
      if (currentCompanyId !== targetCompanyId) {
        console.log(`  Fixing ${emp.employeeId}:`)
        console.log(`    Current companyId: ${currentCompanyId}`)
        console.log(`    Setting to: ${targetCompanyId}`)
        
        await db.collection('employees').updateOne(
          { _id: emp._id },
          { 
            $set: { 
              companyId: indigoCompany._id,
              companyName: 'Indigo'
            }
          }
        )
        fixed++
        console.log(`    ✅ Fixed\n`)
      } else {
        console.log(`  ✓ ${emp.employeeId} already has correct companyId\n`)
      }
    }
    
    console.log(`\n✅ Fixed ${fixed} employees`)
    
    // Verify
    const verifyEmployees = await db.collection('employees').find({ 
      companyId: indigoCompany._id 
    }).toArray()
    
    console.log(`\n📊 Verification: Found ${verifyEmployees.length} employees with companyId = Indigo _id`)
    verifyEmployees.forEach(emp => {
      console.log(`  - ${emp.employeeId || emp.id}`)
    })
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkAndFixEmployees()





