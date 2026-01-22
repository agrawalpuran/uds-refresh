const mongoose = require('mongoose')

// MongoDB connection
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
  eligibility: {
    shirt: { type: Number, required: true, default: 0 },
    pant: { type: Number, required: true, default: 0 },
    shoe: { type: Number, required: true, default: 0 },
    jacket: { type: Number, required: true, default: 0 },
  },
  dispatchPreference: { type: String, enum: ['direct', 'central', 'regional'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  period: { type: String, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function addSampleEmployees() {
  try {
    console.log('🚀 Starting to add sample employees...')
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Get company IDs from database
    const companies = await Company.find().lean()
    if (companies.length === 0) {
      console.error('❌ No companies found in database. Please run migration first.')
      process.exit(1)
    }

    const indigoCompany = companies.find(c => c.id === 'COMP-INDIGO')
    const akasaCompany = companies.find(c => c.id === 'COMP-AKASA')

    if (!indigoCompany || !akasaCompany) {
      console.error('❌ Required companies not found. Please run migration first.')
      process.exit(1)
    }

    // Get the highest existing employee ID number
    const employeesWithId = await Employee.find({ 
      employeeId: { $exists: true, $ne: null, $ne: '' },
      employeeId: { $regex: /^EMP-\d+$/ }
    }).sort({ employeeId: -1 }).limit(1)

    let nextIdNumber = 1
    if (employeesWithId.length > 0) {
      const lastId = employeesWithId[0].employeeId
      const match = lastId.match(/^EMP-(\d+)$/)
      if (match) {
        nextIdNumber = parseInt(match[1], 10) + 1
      }
    }

    const sampleEmployees = [
      {
        id: 'IND-011',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Vikram',
        lastName: 'Singh',
        designation: 'Pilot',
        gender: 'male',
        location: 'Delhi Base',
        email: 'vikram.singh@goindigo.in',
        mobile: '+91-9876543230',
        shirtSize: 'L',
        pantSize: '34',
        shoeSize: '10',
        address: 'D-101, Sector 18, Noida, Uttar Pradesh 201301',
        companyId: indigoCompany._id,
        companyName: 'Indigo',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'IND-012',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Anjali',
        lastName: 'Verma',
        designation: 'Flight Attendant',
        gender: 'female',
        location: 'Mumbai Base',
        email: 'anjali.verma@goindigo.in',
        mobile: '+91-9876543231',
        shirtSize: 'S',
        pantSize: '28',
        shoeSize: '7',
        address: 'E-202, Andheri East, Mumbai, Maharashtra 400069',
        companyId: indigoCompany._id,
        companyName: 'Indigo',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'IND-013',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Rohit',
        lastName: 'Gupta',
        designation: 'Co-Pilot',
        gender: 'male',
        location: 'Bangalore Base',
        email: 'rohit.gupta@goindigo.in',
        mobile: '+91-9876543232',
        shirtSize: 'XL',
        pantSize: '36',
        shoeSize: '11',
        address: 'F-303, Indiranagar, Bangalore, Karnataka 560038',
        companyId: indigoCompany._id,
        companyName: 'Indigo',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'AKA-011',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Neha',
        lastName: 'Reddy',
        designation: 'Flight Attendant',
        gender: 'female',
        location: 'Hyderabad Base',
        email: 'neha.reddy@akasaair.com',
        mobile: '+91-9876543233',
        shirtSize: 'M',
        pantSize: '30',
        shoeSize: '8',
        address: 'G-404, Banjara Hills, Hyderabad, Telangana 500034',
        companyId: akasaCompany._id,
        companyName: 'Akasa Air',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'AKA-012',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Suresh',
        lastName: 'Nair',
        designation: 'Ground Staff',
        gender: 'male',
        location: 'Chennai Base',
        email: 'suresh.nair@akasaair.com',
        mobile: '+91-9876543234',
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '9',
        address: 'H-505, Anna Nagar, Chennai, Tamil Nadu 600040',
        companyId: akasaCompany._id,
        companyName: 'Akasa Air',
        eligibility: { shirt: 4, pant: 2, shoe: 1, jacket: 1 },
        dispatchPreference: 'regional',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      }
    ]

    console.log('👥 Adding sample employees...')
    
    // Check if employees already exist
    for (const emp of sampleEmployees) {
      const existing = await Employee.findOne({ id: emp.id })
      if (existing) {
        console.log(`⚠️  Employee ${emp.id} (${emp.firstName} ${emp.lastName}) already exists, skipping...`)
        continue
      }
      
      const employee = await Employee.create(emp)
      console.log(`✅ Created employee: ${emp.firstName} ${emp.lastName} (${emp.id}) - ${emp.email}`)
    }

    console.log('🎉 Sample employees added successfully!')
    
    // Show summary
    const totalEmployees = await Employee.countDocuments()
    console.log(`\n📊 Total employees in database: ${totalEmployees}`)
    
  } catch (error) {
    console.error('❌ Error adding sample employees:', error)
    process.exit(1)
  } finally {
    console.log('👋 Disconnecting from MongoDB...')
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

addSampleEmployees()

