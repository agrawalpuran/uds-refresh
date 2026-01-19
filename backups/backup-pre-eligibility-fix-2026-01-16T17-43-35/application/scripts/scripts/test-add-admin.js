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

// Import the Employee and Company models
const Employee = require('../lib/models/Employee').default || require('../lib/models/Employee')
const Company = require('../lib/models/Company').default || require('../lib/models/Company')
const CompanyAdmin = require('../lib/models/CompanyAdmin').default || require('../lib/models/CompanyAdmin')

async function testAddAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected\n')

    const Employee = mongoose.model('Employee')
    const Company = mongoose.model('Company')
    const CompanyAdmin = mongoose.model('CompanyAdmin')
    
    const companyId = 'COMP-INDIGO'
    const employeeId = 'IND-003'
    
    // Find company
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      console.log('❌ Company not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('Company found:')
    console.log(`  _id: ${company._id}`)
    console.log(`  id: ${company.id}`)
    console.log(`  name: ${company.name}\n`)
    
    // Try to find employee by different methods
    let employee = await Employee.findOne({ id: employeeId }).populate('companyId')
    if (!employee) {
      employee = await Employee.findOne({ employeeId: employeeId }).populate('companyId')
    }
    
    if (!employee) {
      console.log('❌ Employee not found')
      await mongoose.disconnect()
      return
    }
    
    console.log('Employee found:')
    console.log(`  _id: ${employee._id}`)
    console.log(`  id: ${employee.id}`)
    console.log(`  employeeId: ${employee.employeeId}`)
    console.log(`  companyId type: ${typeof employee.companyId}`)
    console.log(`  companyId value: ${employee.companyId}`)
    
    if (typeof employee.companyId === 'object' && employee.companyId !== null) {
      console.log(`  companyId._id: ${employee.companyId._id}`)
      console.log(`  companyId.id: ${employee.companyId.id}`)
    }
    console.log('')
    
    // Check company match
    let employeeCompanyId = null
    if (typeof employee.companyId === 'object' && employee.companyId !== null) {
      employeeCompanyId = employee.companyId._id || employee.companyId
    } else {
      employeeCompanyId = employee.companyId
    }
    
    const employeeCompanyIdStr = employeeCompanyId ? employeeCompanyId.toString() : null
    const companyIdStr = company._id.toString()
    
    console.log('Comparison:')
    console.log(`  Employee companyId: ${employeeCompanyIdStr}`)
    console.log(`  Company _id: ${companyIdStr}`)
    console.log(`  Match: ${employeeCompanyIdStr === companyIdStr ? '✅ YES' : '❌ NO'}\n`)
    
    if (employeeCompanyIdStr === companyIdStr) {
      console.log('✅ Company match is correct. Creating admin record...')
      
      await CompanyAdmin.findOneAndUpdate(
        { companyId: company._id, employeeId: employee._id },
        { canApproveOrders: false },
        { upsert: true, new: true }
      )
      
      console.log('✅ Admin record created successfully!')
    } else {
      console.log('❌ Company mismatch detected. Fixing...')
      
      // Fix the companyId
      await Employee.findOneAndUpdate(
        { _id: employee._id },
        { 
          $set: { 
            companyId: company._id,
            companyName: company.name
          }
        }
      )
      
      console.log('✅ Fixed employee companyId. Retrying admin creation...')
      
      await CompanyAdmin.findOneAndUpdate(
        { companyId: company._id, employeeId: employee._id },
        { canApproveOrders: false },
        { upsert: true, new: true }
      )
      
      console.log('✅ Admin record created successfully!')
    }

    await mongoose.disconnect()
    console.log('\n✅ Done')
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

testAddAdmin()

