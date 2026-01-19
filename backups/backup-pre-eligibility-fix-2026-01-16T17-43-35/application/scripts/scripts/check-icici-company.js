const mongoose = require('mongoose')
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

mongoose.connect(MONGODB_URI).then(async () => {
  const companies = await mongoose.connection.db.collection('companies').find({ name: { $regex: /icici/i } }).toArray()
  console.log('ICICI Companies found:')
  companies.forEach(c => console.log(`  - ${c.name} (ID: ${c.id})`))
  await mongoose.disconnect()
})

