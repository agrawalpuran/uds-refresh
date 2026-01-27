/**
 * Fix Akasa Air employees with missing locationId
 */
require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

async function fix() {
  await mongoose.connect(process.env.MONGODB_URI)
  const db = mongoose.connection.db
  
  // Update old Akasa employees with missing locationId
  const updates = [
    { id: '300004', locationId: 'LOC-AKASA-MUMBAI-531483', location: 'Mumbai Hub' },
    { id: '300005', locationId: 'LOC-AKASA-DELHI-531494', location: 'Delhi Hub' },
    { id: '300009', locationId: 'LOC-AKASA-BANGALORE-531489', location: 'Bangalore Hub' },
    { id: '300010', locationId: 'LOC-AKASA-BANGALORE-531489', location: 'Bangalore Hub' },
  ]
  
  for (const upd of updates) {
    const result = await db.collection('employees').updateOne(
      { id: upd.id },
      { $set: { locationId: upd.locationId, location: upd.location } }
    )
    console.log('Updated', upd.id, '-> locationId:', upd.locationId, '| modified:', result.modifiedCount)
  }
  
  await mongoose.disconnect()
  console.log('Done!')
}

fix()
