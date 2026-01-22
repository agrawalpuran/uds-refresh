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

async function forceRemoveIndigoAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    
    // Find Indigo company
    const company = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    if (!company) {
      console.log('❌ Company COMP-INDIGO not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('Company found:')
    console.log(`  _id: ${company._id}`)
    console.log(`  id: ${company.id}\n`)
    
    // Find all admins for Indigo
    const admins = await db.collection('companyadmins').find({ 
      companyId: company._id 
    }).toArray()
    
    console.log(`Found ${admins.length} admin(s) for Indigo:\n`)
    
    if (admins.length === 0) {
      console.log('✅ No admins found - nothing to remove')
      await mongoose.disconnect()
      return
    }
    
    // Remove all admins
    for (const admin of admins) {
      console.log(`Removing admin:`)
      console.log(`  _id: ${admin._id}`)
      console.log(`  companyId: ${admin.companyId}`)
      console.log(`  employeeId: ${admin.employeeId}`)
      
      // Get employee info
      const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
      if (employee) {
        console.log(`  Employee: ${employee.employeeId || employee.id} - ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'}`)
      }
      
      // Delete the admin record
      await db.collection('companyadmins').deleteOne({ _id: admin._id })
      console.log(`  ✅ Removed\n`)
    }
    
    // Verify removal
    const remainingAdmins = await db.collection('companyadmins').find({ 
      companyId: company._id 
    }).toArray()
    
    console.log(`✅ Removal complete!`)
    console.log(`   Remaining admins for Indigo: ${remainingAdmins.length}`)

    await mongoose.disconnect()
    console.log('\n✅ Done')
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

forceRemoveIndigoAdmin()





