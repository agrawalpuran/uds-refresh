/**
 * Script to add sample ICICI Bank employees to the database
 * All employees will have Mumbai as default location
 */

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
  eligibility: {
    shirt: { type: Number, required: true, default: 0 },
    pant: { type: Number, required: true, default: 0 },
    shoe: { type: Number, required: true, default: 0 },
    jacket: { type: Number, required: true, default: 0 },
  },
  dispatchPreference: { type: String, enum: ['direct', 'central', 'regional'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
  period: { type: String, required: true },
  dateOfJoining: { type: Date, required: true, default: () => new Date('2025-10-01T00:00:00.000Z') },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  showPrices: { type: Boolean, default: false, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function addICICIBankEmployees() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Get ICICI Bank company
    const iciciCompany = await Company.findOne({ id: 'COMP-ICICI' })
    
    if (!iciciCompany) {
      console.error('❌ ICICI Bank company not found. Please run "npm run add-icici-bank" first.')
      process.exit(1)
    }

    console.log(`✅ Found ICICI Bank company: ${iciciCompany.name}`)

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

    // Sample ICICI Bank employees - all with Mumbai location
    const sampleEmployees = [
      {
        id: 'ICICI-001',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Rajesh',
        lastName: 'Kumar',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'rajesh.kumar@icicibank.in',
        mobile: '+91-9876543210',
        shirtSize: 'L',
        pantSize: '34',
        shoeSize: '10',
        address: 'A-123, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-002',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Priya',
        lastName: 'Sharma',
        designation: 'Relationship Manager',
        gender: 'female',
        location: 'Mumbai',
        email: 'priya.sharma@icicibank.in',
        mobile: '+91-9876543211',
        shirtSize: 'M',
        pantSize: '28',
        shoeSize: '7',
        address: 'B-456, Andheri West, Mumbai, Maharashtra 400053',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-003',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Amit',
        lastName: 'Patel',
        designation: 'Credit Analyst',
        gender: 'male',
        location: 'Mumbai',
        email: 'amit.patel@icicibank.in',
        mobile: '+91-9876543212',
        shirtSize: 'XL',
        pantSize: '36',
        shoeSize: '11',
        address: 'C-789, Powai, Mumbai, Maharashtra 400076',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-004',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Sneha',
        lastName: 'Reddy',
        designation: 'Operations Manager',
        gender: 'female',
        location: 'Mumbai',
        email: 'sneha.reddy@icicibank.in',
        mobile: '+91-9876543213',
        shirtSize: 'S',
        pantSize: '30',
        shoeSize: '6',
        address: 'D-321, Worli, Mumbai, Maharashtra 400018',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-005',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Vikram',
        lastName: 'Singh',
        designation: 'Senior Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'vikram.singh@icicibank.in',
        mobile: '+91-9876543214',
        shirtSize: 'M',
        pantSize: '32',
        shoeSize: '9',
        address: 'E-654, Lower Parel, Mumbai, Maharashtra 400013',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-006',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Anjali',
        lastName: 'Mehta',
        designation: 'Customer Service Executive',
        gender: 'female',
        location: 'Mumbai',
        email: 'anjali.mehta@icicibank.in',
        mobile: '+91-9876543215',
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '8',
        address: 'F-987, Vashi, Navi Mumbai, Maharashtra 400703',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-007',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Rohit',
        lastName: 'Gupta',
        designation: 'Teller',
        gender: 'male',
        location: 'Mumbai',
        email: 'rohit.gupta@icicibank.in',
        mobile: '+91-9876543216',
        shirtSize: 'XXL',
        pantSize: '38',
        shoeSize: '12',
        address: 'G-147, Borivali, Mumbai, Maharashtra 400092',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 4, pant: 2, shoe: 1, jacket: 1 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-008',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Kavita',
        lastName: 'Nair',
        designation: 'Personal Banker',
        gender: 'female',
        location: 'Mumbai',
        email: 'kavita.nair@icicibank.in',
        mobile: '+91-9876543217',
        shirtSize: 'XS',
        pantSize: '26',
        shoeSize: '5',
        address: 'H-258, Malad, Mumbai, Maharashtra 400064',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-009',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Manish',
        lastName: 'Verma',
        designation: 'Loan Officer',
        gender: 'male',
        location: 'Mumbai',
        email: 'manish.verma@icicibank.in',
        mobile: '+91-9876543218',
        shirtSize: 'L',
        pantSize: '34',
        shoeSize: '10',
        address: 'I-369, Thane, Maharashtra 400601',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'ICICI-010',
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        firstName: 'Divya',
        lastName: 'Iyer',
        designation: 'Assistant Manager',
        gender: 'female',
        location: 'Mumbai',
        email: 'divya.iyer@icicibank.in',
        mobile: '+91-9876543219',
        shirtSize: 'M',
        pantSize: '28',
        shoeSize: '7',
        address: 'J-741, Chembur, Mumbai, Maharashtra 400071',
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      }
    ]

    console.log('\n👥 Adding ICICI Bank employees...')
    
    let createdCount = 0
    let skippedCount = 0

    // Check if employees already exist and create new ones
    for (const emp of sampleEmployees) {
      const existing = await Employee.findOne({ 
        $or: [
          { id: emp.id },
          { email: emp.email }
        ]
      })
      
      if (existing) {
        console.log(`⚠️  Employee ${emp.id} (${emp.firstName} ${emp.lastName}) already exists, skipping...`)
        skippedCount++
        continue
      }
      
      const employee = await Employee.create(emp)
      console.log(`✅ Created: ${emp.firstName} ${emp.lastName} (${emp.id}) - ${emp.email}`)
      createdCount++
    }

    console.log('\n🎉 ICICI Bank employees added successfully!')
    console.log(`   Created: ${createdCount}`)
    console.log(`   Skipped: ${skippedCount}`)
    
    // Show summary
    const iciciEmployees = await Employee.find({ companyId: iciciCompany._id }).lean()
    console.log(`\n📊 Total ICICI Bank employees in database: ${iciciEmployees.length}`)
    console.log('\n📋 ICICI Bank Employees List:')
    iciciEmployees.forEach((emp, index) => {
      console.log(`   ${index + 1}. ${emp.firstName} ${emp.lastName} (${emp.employeeId}) - ${emp.designation} - ${emp.location}`)
    })

  } catch (error) {
    console.error('❌ Error adding ICICI Bank employees:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
addICICIBankEmployees()
  .then(() => {
    console.log('Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })


