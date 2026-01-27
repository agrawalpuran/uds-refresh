/**
 * Fix employee records where id/employeeId are stored as numbers instead of strings
 */
require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  
  // Find all employees where id is a number
  const employees = await db.collection('employees').find({
    $or: [
      { id: { $type: 'number' } },
      { employeeId: { $type: 'number' } }
    ]
  }).toArray()
  
  console.log(`Found ${employees.length} employees with numeric id/employeeId`)
  
  for (const emp of employees) {
    const updates = {}
    
    if (typeof emp.id === 'number') {
      updates.id = String(emp.id)
      console.log(`  ${emp.firstName} ${emp.lastName}: id ${emp.id} (number) -> "${updates.id}" (string)`)
    }
    
    if (typeof emp.employeeId === 'number') {
      updates.employeeId = String(emp.employeeId)
      console.log(`  ${emp.firstName} ${emp.lastName}: employeeId ${emp.employeeId} (number) -> "${updates.employeeId}" (string)`)
    }
    
    if (Object.keys(updates).length > 0) {
      await db.collection('employees').updateOne(
        { _id: emp._id },
        { $set: updates }
      )
    }
  }
  
  console.log('\nDone! All employee IDs converted to strings.')
  await mongoose.disconnect()
}

fix()
