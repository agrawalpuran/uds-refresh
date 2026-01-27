require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function check() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  
  // Find employees with email containing akasaair
  const employees = await db.collection('employees').find({ 
    email: { $regex: /akasaair/i }
  }).limit(5).toArray()
  
  console.log('Sample employee records:')
  for (const emp of employees) {
    console.log('---')
    console.log('  _id:', emp._id)
    console.log('  id:', emp.id)
    console.log('  employeeId:', emp.employeeId)
    console.log('  firstName:', emp.firstName, emp.lastName)
    console.log('  email:', emp.email)
  }
  
  await mongoose.disconnect()
}
check()
