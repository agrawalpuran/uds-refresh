/**
 * Fix employee records where _id is stored as string instead of ObjectId
 */
require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  
  // Find all employees where _id is a string (not an ObjectId)
  const employees = await db.collection('employees').find({}).toArray()
  
  let fixedCount = 0
  for (const emp of employees) {
    // Check if _id is a string (24 hex chars) instead of ObjectId
    if (typeof emp._id === 'string') {
      console.log(`Fixing ${emp.firstName} ${emp.lastName} (${emp.id}): _id is string "${emp._id}"`)
      
      // Create a new document with proper ObjectId
      const newId = new mongoose.Types.ObjectId(emp._id)
      const newDoc = { ...emp, _id: newId }
      
      // Delete old document
      await db.collection('employees').deleteOne({ _id: emp._id })
      
      // Insert new document with proper ObjectId
      await db.collection('employees').insertOne(newDoc)
      
      console.log(`  -> Fixed: _id is now ObjectId("${newId}")`)
      fixedCount++
    }
  }
  
  console.log(`\nFixed ${fixedCount} employee records.`)
  await mongoose.disconnect()
}

fix()
