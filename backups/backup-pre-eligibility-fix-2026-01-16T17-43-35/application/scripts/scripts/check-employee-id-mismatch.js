/**
 * Check for employees with mismatched id and employeeId fields
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
  console.log('CHECKING EMPLOYEE ID MISMATCHES')
  console.log('='.repeat(80))
  console.log()
  
  // Get all employees
  const employees = await db.collection('employees').find({}).toArray()
  console.log(`Total employees: ${employees.length}`)
  console.log()
  
  // Find employees with mismatched id and employeeId
  const mismatched = employees.filter(emp => {
    const id = emp.id
    const employeeId = emp.employeeId
    return id && employeeId && id !== employeeId
  })
  
  console.log(`Employees with mismatched id and employeeId: ${mismatched.length}`)
  console.log()
  
  if (mismatched.length > 0) {
    console.log('Mismatched employees:')
    mismatched.forEach((emp, i) => {
      console.log(`  ${i + 1}. Name: ${emp.firstName} ${emp.lastName}`)
      console.log(`     id: ${emp.id}`)
      console.log(`     employeeId: ${emp.employeeId}`)
      console.log(`     email: ${emp.email}`)
      console.log(`     companyId: ${emp.companyId}`)
      console.log()
    })
    
    // Check for Rohit Gupta specifically
    const rohit = employees.find(e => 
      (e.firstName && e.firstName.toLowerCase().includes('rohit')) ||
      (e.lastName && e.lastName.toLowerCase().includes('gupta')) ||
      (e.email && e.email.toLowerCase().includes('rohit'))
    )
    
    if (rohit) {
      console.log('='.repeat(80))
      console.log('ROHIT GUPTA DETAILS:')
      console.log('='.repeat(80))
      console.log(`  id: ${rohit.id}`)
      console.log(`  employeeId: ${rohit.employeeId}`)
      console.log(`  firstName: ${rohit.firstName}`)
      console.log(`  lastName: ${rohit.lastName}`)
      console.log(`  email: ${rohit.email}`)
      console.log(`  companyId: ${rohit.companyId}`)
      console.log()
    }
  } else {
    console.log('✓ No mismatched employees found')
  }
  
  // Also check for employees with missing employeeId
  const missingEmployeeId = employees.filter(emp => !emp.employeeId)
  if (missingEmployeeId.length > 0) {
    console.log(`Employees missing employeeId: ${missingEmployeeId.length}`)
    missingEmployeeId.forEach((emp, i) => {
      console.log(`  ${i + 1}. Name: ${emp.firstName} ${emp.lastName}, id: ${emp.id}`)
    })
    console.log()
  }
  
  // Check for employees with missing id
  const missingId = employees.filter(emp => !emp.id)
  if (missingId.length > 0) {
    console.log(`Employees missing id: ${missingId.length}`)
    missingId.forEach((emp, i) => {
      console.log(`  ${i + 1}. Name: ${emp.firstName} ${emp.lastName}, employeeId: ${emp.employeeId}`)
    })
    console.log()
  }
  
  await mongoose.disconnect()
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

