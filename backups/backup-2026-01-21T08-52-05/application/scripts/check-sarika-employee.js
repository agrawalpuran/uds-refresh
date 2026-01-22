const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  location: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  mobile: { type: String, required: true },
  shirtSize: { type: String, required: true },
  pantSize: { type: String, required: true },
  shoeSize: { type: String, required: true },
  address: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  branchName: { type: String },
  eligibility: {
    shirt: { type: Number, required: true, default: 0 },
    pant: { type: Number, required: true, default: 0 },
    shoe: { type: Number, required: true, default: 0 },
    jacket: { type: Number, required: true, default: 0 },
  },
  cycleDuration: {
    shirt: { type: Number, required: true, default: 6 },
    pant: { type: Number, required: true, default: 6 },
    shoe: { type: Number, required: true, default: 6 },
    jacket: { type: Number, required: true, default: 12 },
  },
  dispatchPreference: { type: String, enum: ['direct', 'central', 'regional'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  period: { type: String, required: true },
  dateOfJoining: { type: Date, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
}, { timestamps: true })

// Branch Schema
const BranchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema)

async function checkSarikaEmployee() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const searchEmail = 'sarika.jain@goindigo.in'
    console.log(`🔍 Searching for employee with email: ${searchEmail}\n`)

    // Try exact match first
    let employee = await Employee.findOne({ email: searchEmail })
      .populate('companyId', 'id name')
      .populate('branchId', 'id name address city')
      .lean()

    // If not found, try case-insensitive search
    if (!employee) {
      employee = await Employee.findOne({ 
        email: { $regex: new RegExp(`^${searchEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } 
      })
        .populate('companyId', 'id name')
        .populate('branchId', 'id name address city')
        .lean()
    }

    if (employee) {
      console.log('✅ Employee Found!')
      console.log('='.repeat(80))
      console.log(JSON.stringify(employee, null, 2))
      console.log('='.repeat(80))
      console.log('\n📋 Employee Summary:')
      console.log('─'.repeat(80))
      console.log(`👤 Name: ${employee.firstName} ${employee.lastName}`)
      console.log(`📧 Email: ${employee.email}`)
      console.log(`🆔 Employee ID: ${employee.employeeId || employee.id}`)
      console.log(`💼 Designation: ${employee.designation}`)
      console.log(`⚧️  Gender: ${employee.gender}`)
      console.log(`📍 Location: ${employee.location}`)
      console.log(`📱 Mobile: ${employee.mobile}`)
      console.log(`🏢 Company: ${employee.companyName} (ID: ${employee.companyId?.id || employee.companyId})`)
      if (employee.branchId) {
        console.log(`🏛️  Branch: ${employee.branchName || employee.branchId?.name || 'N/A'} (ID: ${employee.branchId?.id || employee.branchId})`)
      } else {
        console.log(`🏛️  Branch: Not assigned`)
      }
      console.log(`👕 Shirt Size: ${employee.shirtSize}`)
      console.log(`👖 Pant Size: ${employee.pantSize}`)
      console.log(`👟 Shoe Size: ${employee.shoeSize}`)
      console.log(`📦 Address: ${employee.address}`)
      console.log(`🚚 Dispatch Preference: ${employee.dispatchPreference}`)
      console.log(`✅ Status: ${employee.status}`)
      console.log(`📅 Period: ${employee.period}`)
      if (employee.dateOfJoining) {
        console.log(`📆 Date of Joining: ${new Date(employee.dateOfJoining).toLocaleDateString()}`)
      }
      console.log(`🎁 Eligibility:`)
      console.log(`   - Shirt: ${employee.eligibility?.shirt || 0}`)
      console.log(`   - Pant: ${employee.eligibility?.pant || 0}`)
      console.log(`   - Shoe: ${employee.eligibility?.shoe || 0}`)
      console.log(`   - Jacket: ${employee.eligibility?.jacket || 0}`)
      if (employee.cycleDuration) {
        console.log(`⏱️  Cycle Duration (months):`)
        console.log(`   - Shirt: ${employee.cycleDuration.shirt || 6}`)
        console.log(`   - Pant: ${employee.cycleDuration.pant || 6}`)
        console.log(`   - Shoe: ${employee.cycleDuration.shoe || 6}`)
        console.log(`   - Jacket: ${employee.cycleDuration.jacket || 12}`)
      }
      if (employee.createdAt) {
        console.log(`📝 Created: ${new Date(employee.createdAt).toLocaleString()}`)
      }
      if (employee.updatedAt) {
        console.log(`🔄 Updated: ${new Date(employee.updatedAt).toLocaleString()}`)
      }
      console.log('─'.repeat(80))
    } else {
      console.log('❌ Employee not found with email:', searchEmail)
      console.log('\n💡 Checking for similar emails...')
      
      // Search for similar emails
      const similarEmployees = await Employee.find({
        email: { $regex: /sarika/i }
      })
        .populate('companyId', 'id name')
        .lean()
      
      if (similarEmployees.length > 0) {
        console.log(`\nFound ${similarEmployees.length} employee(s) with similar email:`)
        similarEmployees.forEach((emp, index) => {
          console.log(`\n${index + 1}. ${emp.firstName} ${emp.lastName}`)
          console.log(`   Email: ${emp.email}`)
          console.log(`   Employee ID: ${emp.employeeId || emp.id}`)
          console.log(`   Company: ${emp.companyName}`)
        })
      } else {
        console.log('No employees found with similar email pattern.')
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

checkSarikaEmployee()


