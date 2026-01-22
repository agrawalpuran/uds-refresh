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

async function fixAmitPatel() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const db = mongoose.connection.db
    
    // Find Amit Patel by employeeId
    const employee = await db.collection('employees').findOne({ 
      $or: [
        { employeeId: 'IND-003' },
        { id: 'IND-003' },
        { employeeId: 'EMP-000003' }
      ]
    })
    
    if (!employee) {
      console.log('❌ Employee IND-003 not found')
      await mongoose.disconnect()
      return
    }
    
    // Find Indigo company
    const company = await db.collection('companies').findOne({ id: 'COMP-INDIGO' })
    
    if (!company) {
      console.log('❌ Company COMP-INDIGO not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('Employee found:')
    console.log(`  employeeId: ${employee.employeeId}`)
    console.log(`  id: ${employee.id}`)
    console.log(`  companyId: ${employee.companyId ? employee.companyId.toString() : 'MISSING'}`)
    console.log(`  companyName: ${employee.companyName || 'N/A'}`)
    console.log('')
    console.log('Company found:')
    console.log(`  _id: ${company._id.toString()}`)
    console.log(`  id: ${company.id}`)
    console.log(`  name: ${company.name}`)
    console.log('')
    
    // Check if companyId matches
    const currentCompanyId = employee.companyId ? employee.companyId.toString() : null
    const targetCompanyId = company._id.toString()
    const match = currentCompanyId === targetCompanyId
    
    console.log(`Match: ${match ? '✅ YES' : '❌ NO'}`)
    
    if (!match) {
      console.log('\n🔧 Fixing companyId...')
      await db.collection('employees').updateOne(
        { _id: employee._id },
        { 
          $set: { 
            companyId: company._id,
            companyName: company.name
          }
        }
      )
      console.log('✅ Fixed companyId')
    }
    
    // Ensure employeeId is IND-003
    if (employee.employeeId !== 'IND-003') {
      console.log('\n🔧 Fixing employeeId...')
      await db.collection('employees').updateOne(
        { _id: employee._id },
        { $set: { employeeId: 'IND-003' } }
      )
      console.log('✅ Fixed employeeId to IND-003')
    }
    
    // Verify final state
    const updated = await db.collection('employees').findOne({ _id: employee._id })
    console.log('\n✅ Final state:')
    console.log(`  employeeId: ${updated.employeeId}`)
    console.log(`  companyId: ${updated.companyId.toString()}`)
    console.log(`  companyName: ${updated.companyName}`)
    console.log(`  Match: ${updated.companyId.toString() === company._id.toString() ? '✅ YES' : '❌ NO'}`)

    await mongoose.disconnect()
    console.log('\n✅ Done')
  } catch (error) {
    console.error('❌ Error:', error.message)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixAmitPatel()






