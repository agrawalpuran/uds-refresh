const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function verifyDatabase() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n📊 Database Status:\n')
    
    const collections = [
      'companies', 
      'employees', 
      'vendors', 
      'uniforms', 
      'productcompanies', 
      'productvendors', 
      'vendorcompanies', 
      'orders', 
      'companyadmins'
    ]
    
    for (const colName of collections) {
      try {
        const count = await db.collection(colName).countDocuments()
        console.log(`   ${colName}: ${count} documents`)
      } catch (e) {
        console.log(`   ${colName}: 0 documents`)
      }
    }
    
    // Check relationships
    console.log('\n🔗 Relationships:\n')
    const productCompanies = await db.collection('productcompanies').find({}).toArray()
    const productVendors = await db.collection('productvendors').find({}).toArray()
    const vendorCompanies = await db.collection('vendorcompanies').find({}).toArray()
    
    console.log(`   Product-Company links: ${productCompanies.length}`)
    console.log(`   Product-Vendor links: ${productVendors.length}`)
    console.log(`   Vendor-Company links: ${vendorCompanies.length}`)
    
    // Check employees
    console.log('\n👥 Employees:\n')
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`   Total: ${employees.length}`)
    const indigoEmployees = employees.filter(e => e.companyName === 'Indigo' || (e.companyId && e.companyId.toString() === '6929b9d9a2fdaf5e8d099e3a'))
    const akasaEmployees = employees.filter(e => e.companyName === 'Akasa Air' || (e.companyId && e.companyId.toString() === '6929b9d9a2fdaf5e8d099e3b'))
    console.log(`   Indigo: ${indigoEmployees.length}`)
    console.log(`   Akasa Air: ${akasaEmployees.length}`)
    
    await mongoose.disconnect()
    console.log('\n✅ Verification complete\n')
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

verifyDatabase()






