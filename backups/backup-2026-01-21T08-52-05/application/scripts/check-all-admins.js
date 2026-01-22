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

async function checkAllAdmins() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n📊 All Company Admins in Database:\n')
    
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`Total admins: ${allAdmins.length}\n`)
    
    if (allAdmins.length > 0) {
      for (const admin of allAdmins) {
        const company = await db.collection('companies').findOne({ _id: admin.companyId })
        const employee = await db.collection('employees').findOne({ _id: admin.employeeId })
        
        console.log(`Admin Record:`)
        console.log(`  _id: ${admin._id}`)
        console.log(`  Company: ${company ? company.name : 'NOT FOUND'} (${company ? company.id : 'N/A'})`)
        console.log(`  Employee: ${employee ? (employee.employeeId || employee.id) : 'NOT FOUND'}`)
        if (employee) {
          console.log(`  Employee Name: ${employee.firstName || 'N/A'} ${employee.lastName || 'N/A'}`)
        }
        console.log(`  Can Approve Orders: ${admin.canApproveOrders || false}`)
        console.log('')
      }
      
      // Remove all admins
      console.log('🗑️  Removing all admin records...\n')
      await db.collection('companyadmins').deleteMany({})
      console.log('✅ All admins removed\n')
    } else {
      console.log('✅ No admins found in database\n')
    }
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkAllAdmins()





