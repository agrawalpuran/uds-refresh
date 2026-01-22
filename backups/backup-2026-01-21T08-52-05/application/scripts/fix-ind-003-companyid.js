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

async function fixInd003() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    const employee = await db.collection('employees').findOne({ employeeId: 'IND-003' })
    const company = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    
    if (!employee) {
      console.log('❌ Employee IND-003 not found')
      await mongoose.disconnect()
      return
    }
    
    if (!company) {
      console.log('❌ Company COMP-INDIGO not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('Employee IND-003:')
    console.log('  _id:', employee._id.toString())
    console.log('  employeeId:', employee.employeeId)
    console.log('  companyId:', employee.companyId ? employee.companyId.toString() : 'MISSING')
    console.log('  companyName:', employee.companyName || 'N/A')
    console.log('')
    console.log('Company COMP-INDIGO:')
    console.log('  _id:', company._id.toString())
    console.log('  id:', company.id)
    console.log('  name:', company.name)
    console.log('')
    
    const match = employee.companyId && employee.companyId.toString() === company._id.toString()
    console.log('Match:', match ? '✅ YES' : '❌ NO')
    
    if (!match) {
      console.log('')
      console.log('🔧 Fixing companyId...')
      await db.collection('employees').updateOne(
        { _id: employee._id },
        { 
          $set: { 
            companyId: company._id,
            companyName: company.name
          }
        }
      )
      console.log('✅ Fixed! Employee IND-003 now belongs to COMP-INDIGO')
    } else {
      console.log('✅ Employee already has correct companyId')
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixInd003()



