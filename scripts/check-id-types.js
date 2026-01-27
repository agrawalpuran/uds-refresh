require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function check() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  
  // Find a sample Akasa employee
  const employees = await db.collection('employees').find({ 
    companyId: '100002'
  }).limit(10).toArray()
  
  console.log('Sample Akasa Air employees:')
  for (const emp of employees) {
    console.log(`\n${emp.firstName} ${emp.lastName}:`)
    console.log('  _id:', emp._id, '| type:', typeof emp._id)
    console.log('  id:', emp.id, '| type:', typeof emp.id)
    console.log('  employeeId:', emp.employeeId, '| type:', typeof emp.employeeId)
  }
  
  // Test findOne with string ID "300004"
  console.log('\n\n--- Testing findOne queries ---')
  console.log('\nTest findOne with string id "300004":')
  const byStringId = await db.collection('employees').findOne({ id: '300004' })
  console.log('  Found:', byStringId ? `${byStringId.firstName} ${byStringId.lastName}` : 'NOT FOUND')
  
  // Test findOne with number ID
  console.log('\nTest findOne with number id 300004:')
  const byNumberId = await db.collection('employees').findOne({ id: 300004 })
  console.log('  Found:', byNumberId ? `${byNumberId.firstName} ${byNumberId.lastName}` : 'NOT FOUND')
  
  await mongoose.disconnect()
}
check()
