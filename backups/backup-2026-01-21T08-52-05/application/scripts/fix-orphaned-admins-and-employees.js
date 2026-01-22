/**
 * Fix orphaned admin records and verify employee-company mappings
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

async function fixOrphanedAdminsAndEmployees() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Checking for orphaned admin records...\n')
    
    // Find all admin records
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`Total admin records: ${allAdmins.length}\n`)
    
    // Find orphaned admins (null employeeId or employeeId that doesn't exist)
    const orphanedAdmins = []
    const validAdmins = []
    
    for (const admin of allAdmins) {
      if (!admin.employeeId) {
        orphanedAdmins.push(admin)
        console.log(`❌ Orphaned admin (null employeeId):`)
        console.log(`   Admin _id: ${admin._id}`)
        console.log(`   Company _id: ${admin.companyId}`)
        console.log('')
      } else {
        // Check if employee exists
        const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
        if (!employee) {
          orphanedAdmins.push(admin)
          console.log(`❌ Orphaned admin (employee not found):`)
          console.log(`   Admin _id: ${admin._id}`)
          console.log(`   Employee _id: ${admin.employeeId}`)
          console.log(`   Company _id: ${admin.companyId}`)
          console.log('')
        } else {
          validAdmins.push(admin)
        }
      }
    }
    
    // Delete orphaned admins
    if (orphanedAdmins.length > 0) {
      console.log(`\n🗑️  Deleting ${orphanedAdmins.length} orphaned admin records...\n`)
      for (const admin of orphanedAdmins) {
        await db.collection('companyadmins').deleteOne({ _id: admin._id })
        console.log(`✅ Deleted orphaned admin: ${admin._id}`)
      }
    } else {
      console.log('✅ No orphaned admin records found\n')
    }
    
    // Now verify employee-company mappings
    console.log('\n🔍 Verifying employee-company mappings...\n')
    
    const companies = await db.collection('companies').find({}).toArray()
    const companyMap = new Map()
    companies.forEach(c => {
      companyMap.set(c._id.toString(), c)
      companyMap.set(c.id, c)
    })
    
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`Total employees: ${employees.length}\n`)
    
    let fixedCount = 0
    let issuesFound = 0
    
    for (const employee of employees) {
      const issues = []
      
      // Check if employee has companyId
      if (!employee.companyId) {
        issues.push('Missing companyId')
      } else {
        // Check if companyId references a valid company
        const companyIdStr = employee.companyId.toString()
        const company = companyMap.get(companyIdStr)
        if (!company) {
          issues.push(`Invalid companyId: ${companyIdStr}`)
        }
      }
      
      // Check if employeeId matches company prefix
      if (employee.employeeId) {
        const empId = employee.employeeId
        if (empId.startsWith('IND-') && employee.companyId) {
          const company = companyMap.get(employee.companyId.toString())
          if (company && company.id !== 'COMP-INDIGO') {
            issues.push(`Employee ID ${empId} suggests Indigo but companyId is ${company.id}`)
          }
        } else if (empId.startsWith('AKA-') && employee.companyId) {
          const company = companyMap.get(employee.companyId.toString())
          if (company && company.id !== 'COMP-AKASA') {
            issues.push(`Employee ID ${empId} suggests Akasa but companyId is ${company.id}`)
          }
        } else if (empId.startsWith('AIR-') && employee.companyId) {
          const company = companyMap.get(employee.companyId.toString())
          if (company && company.id !== 'COMP-AIRINDIA') {
            issues.push(`Employee ID ${empId} suggests Air India but companyId is ${company.id}`)
          }
        }
      }
      
      if (issues.length > 0) {
        issuesFound++
        console.log(`⚠️  Employee ${employee.employeeId || employee.id || employee._id}:`)
        console.log(`   Issues: ${issues.join(', ')}`)
        
        // Try to fix based on employeeId prefix
        if (employee.employeeId) {
          let targetCompany = null
          if (employee.employeeId.startsWith('IND-')) {
            targetCompany = companies.find(c => c.id === 'COMP-INDIGO')
          } else if (employee.employeeId.startsWith('AKA-')) {
            targetCompany = companies.find(c => c.id === 'COMP-AKASA')
          } else if (employee.employeeId.startsWith('AIR-')) {
            targetCompany = companies.find(c => c.id === 'COMP-AIRINDIA')
          }
          
          if (targetCompany && (!employee.companyId || employee.companyId.toString() !== targetCompany._id.toString())) {
            await db.collection('employees').updateOne(
              { _id: employee._id },
              { 
                $set: { 
                  companyId: targetCompany._id,
                  companyName: targetCompany.name
                }
              }
            )
            console.log(`   ✅ Fixed: Set companyId to ${targetCompany.id} (${targetCompany.name})`)
            fixedCount++
          }
        }
        console.log('')
      }
    }
    
    if (issuesFound === 0) {
      console.log('✅ All employees are correctly mapped to companies\n')
    } else {
      console.log(`\n📊 Summary:`)
      console.log(`   Issues found: ${issuesFound}`)
      console.log(`   Fixed: ${fixedCount}`)
      console.log(`   Remaining: ${issuesFound - fixedCount}\n`)
    }
    
    // Show final admin count
    const finalAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`\n📊 Final Admin Records: ${finalAdmins.length}`)
    for (const admin of finalAdmins) {
      const company = await db.collection('companies').findOne({ _id: admin.companyId })
      const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
      console.log(`   - ${company ? company.name : 'Unknown'} -> ${employee ? (employee.employeeId || employee.id) : 'Unknown'}`)
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixOrphanedAdminsAndEmployees()





