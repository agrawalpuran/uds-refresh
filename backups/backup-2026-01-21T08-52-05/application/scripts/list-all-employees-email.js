const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  companyName: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)

async function listAllEmployees() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const employees = await Employee.find({})
      .select('id employeeId firstName lastName email companyName')
      .lean()
      .sort({ email: 1 })

    console.log(`📊 Total Employees: ${employees.length}\n`)
    
    if (employees.length === 0) {
      console.log('❌ No employees found in database.')
    } else {
      console.log('📧 All Employee Emails:')
      console.log('='.repeat(100))
      
      employees.forEach((emp, index) => {
        console.log(`${String(index + 1).padStart(3, ' ')}. ${(emp.firstName + ' ' + emp.lastName).padEnd(30, ' ')} | ${emp.email.padEnd(40, ' ')} | ${emp.employeeId || emp.id}`)
      })
      
      console.log('='.repeat(100))
      
      // Check for any email containing "sarika" or "jain"
      console.log('\n🔍 Searching for emails containing "sarika" or "jain"...')
      const sarikaMatches = employees.filter(emp => 
        emp.email && (emp.email.toLowerCase().includes('sarika') || emp.email.toLowerCase().includes('jain'))
      )
      
      if (sarikaMatches.length > 0) {
        console.log(`\n✅ Found ${sarikaMatches.length} employee(s) with matching pattern:`)
        sarikaMatches.forEach((emp, index) => {
          console.log(`\n${index + 1}. ${emp.firstName} ${emp.lastName}`)
          console.log(`   Email: ${emp.email}`)
          console.log(`   Employee ID: ${emp.employeeId || emp.id}`)
          console.log(`   Company: ${emp.companyName}`)
        })
      } else {
        console.log('❌ No employees found with "sarika" or "jain" in email.')
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

listAllEmployees()


