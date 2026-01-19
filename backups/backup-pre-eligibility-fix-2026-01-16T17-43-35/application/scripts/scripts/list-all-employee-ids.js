/**
 * List all employees with their id and employeeId
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

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection.db
  
  console.log('='.repeat(80))
  console.log('ALL EMPLOYEES - ID AND EMPLOYEEID')
  console.log('='.repeat(80))
  console.log()
  
  // Get all employees, sorted by employeeId
  const employees = await db.collection('employees').find({}).sort({ employeeId: 1 }).toArray()
  
  console.log(`Total employees: ${employees.length}`)
  console.log()
  
  // Create a table-like output
  console.log('┌─────────────┬─────────────┬─────────────────────────────┬────────────────────────────┐')
  console.log('│     id      │ employeeId  │          Name                │         Email               │')
  console.log('├─────────────┼─────────────┼─────────────────────────────┼────────────────────────────┤')
  
  employees.forEach((emp, i) => {
    const id = emp.id || 'MISSING'
    const employeeId = emp.employeeId || 'MISSING'
    const name = `${emp.firstName || ''} ${emp.lastName || ''}`.trim() || 'N/A'
    const email = emp.email || 'N/A'
    
    // Truncate long values
    const idDisplay = id.length > 11 ? id.substring(0, 8) + '...' : id.padEnd(11)
    const employeeIdDisplay = employeeId.length > 11 ? employeeId.substring(0, 8) + '...' : employeeId.padEnd(11)
    const nameDisplay = name.length > 27 ? name.substring(0, 24) + '...' : name.padEnd(27)
    const emailDisplay = email.length > 28 ? email.substring(0, 25) + '...' : email.padEnd(28)
    
    // Check if they match
    const match = id === employeeId ? '✓' : '❌'
    
    console.log(`│ ${idDisplay} │ ${employeeIdDisplay} │ ${nameDisplay} │ ${emailDisplay} │ ${match}`)
  })
  
  console.log('└─────────────┴─────────────┴─────────────────────────────┴────────────────────────────┘')
  console.log()
  
  // Summary
  const matched = employees.filter(emp => emp.id === emp.employeeId).length
  const mismatched = employees.filter(emp => emp.id && emp.employeeId && emp.id !== emp.employeeId).length
  const missingId = employees.filter(emp => !emp.id).length
  const missingEmployeeId = employees.filter(emp => !emp.employeeId).length
  
  console.log('Summary:')
  console.log(`  ✓ Matching id and employeeId: ${matched}`)
  if (mismatched > 0) {
    console.log(`  ❌ Mismatched id and employeeId: ${mismatched}`)
  }
  if (missingId > 0) {
    console.log(`  ⚠️  Missing id field: ${missingId}`)
  }
  if (missingEmployeeId > 0) {
    console.log(`  ⚠️  Missing employeeId field: ${missingEmployeeId}`)
  }
  console.log()
  
  // Get all companies for lookup
  const companies = await db.collection('companies').find({}).toArray()
  const companyMap = new Map()
  companies.forEach(c => companyMap.set(c._id.toString(), c))
  
  // Detailed list
  console.log('Detailed List:')
  employees.forEach((emp, i) => {
    const id = emp.id || 'MISSING'
    const employeeId = emp.employeeId || 'MISSING'
    const match = id === employeeId ? '✓' : '❌'
    
    console.log(`  ${i + 1}. ${emp.firstName || ''} ${emp.lastName || ''}`)
    console.log(`     id: ${id}`)
    console.log(`     employeeId: ${employeeId}`)
    console.log(`     Match: ${match}`)
    if (emp.companyId) {
      const company = companyMap.get(emp.companyId.toString())
      console.log(`     Company: ${company ? company.name : 'Unknown'}`)
    }
    console.log()
  })
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

