/**
 * Fix employees with mismatched id and employeeId fields
 * Sets id to match employeeId (since employeeId is the primary identifier)
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
  console.log('FIXING EMPLOYEE ID MISMATCHES')
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
  
  console.log(`Found ${mismatched.length} employees with mismatched id and employeeId`)
  console.log()
  
  if (mismatched.length === 0) {
    console.log('✓ No mismatched employees found - nothing to fix')
    await mongoose.disconnect()
    return
  }
  
  let fixedCount = 0
  let errorCount = 0
  
  for (const emp of mismatched) {
    const oldId = emp.id
    const employeeId = emp.employeeId
    
    console.log(`Fixing: ${emp.firstName} ${emp.lastName}`)
    console.log(`  - Old id: ${oldId}`)
    console.log(`  - employeeId: ${employeeId}`)
    console.log(`  - Setting id to match employeeId...`)
    
    try {
      // Check if another employee already has this id
      const existingWithId = await db.collection('employees').findOne({
        id: employeeId,
        _id: { $ne: emp._id }
      })
      
      if (existingWithId) {
        console.log(`  ⚠️  Another employee already has id="${employeeId}" - skipping`)
        console.log(`     Existing employee: ${existingWithId.firstName} ${existingWithId.lastName}`)
        errorCount++
      } else {
        // Update the id to match employeeId
        await db.collection('employees').updateOne(
          { _id: emp._id },
          { $set: { id: employeeId } }
        )
        console.log(`  ✓ Updated id from "${oldId}" to "${employeeId}"`)
        fixedCount++
      }
    } catch (error) {
      console.log(`  ❌ Error updating: ${error.message}`)
      errorCount++
    }
    console.log()
  }
  
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`✓ Fixed: ${fixedCount} employee(s)`)
  console.log(`⚠️  Skipped (conflicts): ${errorCount} employee(s)`)
  console.log()
  
  // Verify the fix
  const remainingMismatched = await db.collection('employees').find({
    $expr: {
      $and: [
        { $ne: ['$id', null] },
        { $ne: ['$employeeId', null] },
        { $ne: ['$id', '$employeeId'] }
      ]
    }
  }).toArray()
  
  console.log('Verification:')
  console.log(`  - Remaining mismatched: ${remainingMismatched.length} ${remainingMismatched.length === 0 ? '✓' : '❌'}`)
  
  if (remainingMismatched.length > 0) {
    console.log('  Remaining mismatched employees:')
    remainingMismatched.forEach((emp, i) => {
      console.log(`    ${i + 1}. ${emp.firstName} ${emp.lastName}: id=${emp.id}, employeeId=${emp.employeeId}`)
    })
  }
  
  await mongoose.disconnect()
  console.log()
  console.log('✓ Done!')
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

