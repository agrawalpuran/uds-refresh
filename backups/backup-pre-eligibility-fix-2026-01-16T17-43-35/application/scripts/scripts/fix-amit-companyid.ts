/**
 * Script to fix Amit Patel's companyId
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function fixAmitCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find Amit Patel by ID
    const employee = await Employee.findOne({ id: 'IND-003' })
    if (!employee) {
      console.log('❌ Employee IND-003 (Amit Patel) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found employee: ${employee.id}`)
    console.log(`   Current companyId: ${employee.companyId}`)
    console.log(`   Current companyName: ${employee.companyName}`)

    // Find Indigo Airlines
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines company not found')
      await mongoose.disconnect()
      return
    }

    console.log(`\n✅ Found company: ${indigo.name} (${indigo.id})`)
    console.log(`   Company _id: ${indigo._id}`)

    // Update employee
    employee.companyId = indigo._id
    employee.companyName = indigo.name
    await employee.save()

    console.log(`\n✅ Successfully updated employee:`)
    console.log(`   New companyId: ${employee.companyId}`)
    console.log(`   New companyName: ${employee.companyName}`)

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixAmitCompanyId()

