const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim()
      }
    }
  } catch (error) {}
}

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection.db
  const companies = await db.collection('companies').find({}).toArray()
  console.log('Companies in database:')
  companies.forEach(c => {
    console.log(`  - ${c.name}: _id=${c._id}, id=${c.id}`)
  })
  await mongoose.disconnect()
  process.exit(0)
}).catch(err => {
  console.error('Error:', err)
  process.exit(1)
})

