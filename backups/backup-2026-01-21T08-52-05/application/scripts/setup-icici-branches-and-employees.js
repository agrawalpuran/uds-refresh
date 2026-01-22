/**
 * Script to create 10 ICICI Bank branches in Mumbai and assign employees
 * - Creates 10 branches with separate Mumbai addresses
 * - Creates 10 more employees (total 20 ICICI Bank employees)
 * - Links 2 employees to each branch
 * - Assigns one admin to each branch
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Branch Schema
const BranchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  state: { type: String, required: true },
  pincode: { type: String, required: true },
  phone: { type: String },
  email: { type: String },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active', index: true },
}, { timestamps: true })

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

const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema)
const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function setupBranchesAndEmployees() {
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

    // Get existing employees count for ID generation
    const existingEmployees = await Employee.find({ 
      employeeId: { $exists: true, $ne: null, $ne: '' },
      employeeId: { $regex: /^EMP-\d+$/ }
    }).sort({ employeeId: -1 }).limit(1)

    let nextIdNumber = 1
    if (existingEmployees.length > 0) {
      const lastId = existingEmployees[0].employeeId
      const match = lastId.match(/^EMP-(\d+)$/)
      if (match) {
        nextIdNumber = parseInt(match[1], 10) + 1
      }
    }

    // 10 Mumbai branches with separate addresses
    const branches = [
      {
        id: 'BRANCH-ICICI-001',
        name: 'ICICI Bank - Bandra Kurla Complex',
        address: 'Ground Floor, Tower A, One BKC, Bandra Kurla Complex',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400051',
        phone: '+91-22-2653-1000',
        email: 'bkc.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-002',
        name: 'ICICI Bank - Andheri West',
        address: 'Shop No. 1-4, Ground Floor, Andheri Kurla Road, Andheri West',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400053',
        phone: '+91-22-2673-2000',
        email: 'andheri.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-003',
        name: 'ICICI Bank - Powai',
        address: 'Shop No. 5-8, Hiranandani Gardens, Powai',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400076',
        phone: '+91-22-2570-3000',
        email: 'powai.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-004',
        name: 'ICICI Bank - Worli',
        address: 'Ground Floor, Worli Sea Face, Dr. Annie Besant Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400018',
        phone: '+91-22-2492-4000',
        email: 'worli.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-005',
        name: 'ICICI Bank - Lower Parel',
        address: 'Shop No. 10-12, High Street Phoenix, Lower Parel',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400013',
        phone: '+91-22-2495-5000',
        email: 'lowerparel.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-006',
        name: 'ICICI Bank - Vashi',
        address: 'Shop No. 15-18, Sector 17, Vashi',
        city: 'Navi Mumbai',
        state: 'Maharashtra',
        pincode: '400703',
        phone: '+91-22-2789-6000',
        email: 'vashi.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-007',
        name: 'ICICI Bank - Borivali',
        address: 'Ground Floor, Borivali West, SV Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400092',
        phone: '+91-22-2896-7000',
        email: 'borivali.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-008',
        name: 'ICICI Bank - Malad',
        address: 'Shop No. 20-22, Malad West, Link Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400064',
        phone: '+91-22-2885-8000',
        email: 'malad.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-009',
        name: 'ICICI Bank - Thane',
        address: 'Ground Floor, Korum Mall, Thane West',
        city: 'Thane',
        state: 'Maharashtra',
        pincode: '400601',
        phone: '+91-22-2534-9000',
        email: 'thane.branch@icicibank.in',
      },
      {
        id: 'BRANCH-ICICI-010',
        name: 'ICICI Bank - Chembur',
        address: 'Shop No. 25-28, Chembur East, Central Avenue',
        city: 'Mumbai',
        state: 'Maharashtra',
        pincode: '400071',
        phone: '+91-22-2552-1000',
        email: 'chembur.branch@icicibank.in',
      },
    ]

    // 10 new employees (in addition to existing 10)
    const newEmployees = [
      {
        id: 'ICICI-011',
        firstName: 'Rahul',
        lastName: 'Sharma',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'rahul.sharma@icicibank.in',
        mobile: '+91-9876543220',
        shirtSize: 'L',
        pantSize: '34',
        shoeSize: '10',
        address: 'K-101, Bandra Kurla Complex, Mumbai, Maharashtra 400051',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
      },
      {
        id: 'ICICI-012',
        firstName: 'Meera',
        lastName: 'Patel',
        designation: 'Relationship Manager',
        gender: 'female',
        location: 'Mumbai',
        email: 'meera.patel@icicibank.in',
        mobile: '+91-9876543221',
        shirtSize: 'M',
        pantSize: '28',
        shoeSize: '7',
        address: 'L-202, Andheri West, Mumbai, Maharashtra 400053',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
      },
      {
        id: 'ICICI-013',
        firstName: 'Arjun',
        lastName: 'Desai',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'arjun.desai@icicibank.in',
        mobile: '+91-9876543222',
        shirtSize: 'XL',
        pantSize: '36',
        shoeSize: '11',
        address: 'M-303, Powai, Mumbai, Maharashtra 400076',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
      },
      {
        id: 'ICICI-014',
        firstName: 'Neha',
        lastName: 'Joshi',
        designation: 'Operations Manager',
        gender: 'female',
        location: 'Mumbai',
        email: 'neha.joshi@icicibank.in',
        mobile: '+91-9876543223',
        shirtSize: 'S',
        pantSize: '30',
        shoeSize: '6',
        address: 'N-404, Worli, Mumbai, Maharashtra 400018',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
      },
      {
        id: 'ICICI-015',
        firstName: 'Suresh',
        lastName: 'Kumar',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'suresh.kumar@icicibank.in',
        mobile: '+91-9876543224',
        shirtSize: 'M',
        pantSize: '32',
        shoeSize: '9',
        address: 'O-505, Lower Parel, Mumbai, Maharashtra 400013',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
      },
      {
        id: 'ICICI-016',
        firstName: 'Pooja',
        lastName: 'Reddy',
        designation: 'Personal Banker',
        gender: 'female',
        location: 'Mumbai',
        email: 'pooja.reddy@icicibank.in',
        mobile: '+91-9876543225',
        shirtSize: 'L',
        pantSize: '32',
        shoeSize: '8',
        address: 'P-606, Vashi, Navi Mumbai, Maharashtra 400703',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
      },
      {
        id: 'ICICI-017',
        firstName: 'Vikash',
        lastName: 'Malhotra',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'vikash.malhotra@icicibank.in',
        mobile: '+91-9876543226',
        shirtSize: 'XXL',
        pantSize: '38',
        shoeSize: '12',
        address: 'Q-707, Borivali, Mumbai, Maharashtra 400092',
        eligibility: { shirt: 4, pant: 2, shoe: 1, jacket: 1 },
        dispatchPreference: 'direct',
      },
      {
        id: 'ICICI-018',
        firstName: 'Anita',
        lastName: 'Kulkarni',
        designation: 'Credit Analyst',
        gender: 'female',
        location: 'Mumbai',
        email: 'anita.kulkarni@icicibank.in',
        mobile: '+91-9876543227',
        shirtSize: 'XS',
        pantSize: '26',
        shoeSize: '5',
        address: 'R-808, Malad, Mumbai, Maharashtra 400064',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'central',
      },
      {
        id: 'ICICI-019',
        firstName: 'Deepak',
        lastName: 'Rao',
        designation: 'Branch Manager',
        gender: 'male',
        location: 'Mumbai',
        email: 'deepak.rao@icicibank.in',
        mobile: '+91-9876543228',
        shirtSize: 'L',
        pantSize: '34',
        shoeSize: '10',
        address: 'S-909, Thane, Maharashtra 400601',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'regional',
      },
      {
        id: 'ICICI-020',
        firstName: 'Sunita',
        lastName: 'Bhatt',
        designation: 'Loan Officer',
        gender: 'female',
        location: 'Mumbai',
        email: 'sunita.bhatt@icicibank.in',
        mobile: '+91-9876543229',
        shirtSize: 'M',
        pantSize: '28',
        shoeSize: '7',
        address: 'T-1010, Chembur, Mumbai, Maharashtra 400071',
        eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
        dispatchPreference: 'direct',
      },
    ]

    console.log('\n🏢 Creating branches...')
    const createdBranches = []
    
    for (const branchData of branches) {
      const existing = await Branch.findOne({ id: branchData.id })
      if (existing) {
        console.log(`⚠️  Branch ${branchData.id} already exists, skipping...`)
        createdBranches.push(existing)
        continue
      }
      
      const branch = new Branch({
        ...branchData,
        companyId: iciciCompany._id,
        status: 'active',
      })
      
      await branch.save()
      createdBranches.push(branch)
      console.log(`✅ Created branch: ${branchData.name}`)
    }

    console.log(`\n👥 Creating new employees...`)
    const createdEmployees = []
    
    for (const empData of newEmployees) {
      const existing = await Employee.findOne({ 
        $or: [
          { id: empData.id },
          { email: empData.email }
        ]
      })
      
      if (existing) {
        console.log(`⚠️  Employee ${empData.id} already exists, skipping...`)
        continue
      }
      
      const employee = new Employee({
        ...empData,
        employeeId: `EMP-${String(nextIdNumber++).padStart(6, '0')}`,
        companyId: iciciCompany._id,
        companyName: 'ICICI Bank',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z'),
        cycleDuration: {
          shirt: 6,
          pant: 6,
          shoe: 6,
          jacket: 12,
        },
      })
      
      await employee.save()
      createdEmployees.push(employee)
      console.log(`✅ Created: ${empData.firstName} ${empData.lastName} (${empData.id})`)
    }

    // Get all ICICI Bank employees (existing + new)
    const allICICIEmployees = await Employee.find({ companyId: iciciCompany._id }).lean()
    console.log(`\n📊 Total ICICI Bank employees: ${allICICIEmployees.length}`)

    // Assign 2 employees to each branch and set one as admin
    console.log('\n🔗 Linking employees to branches...')
    
    for (let i = 0; i < createdBranches.length; i++) {
      const branch = createdBranches[i]
      const employeeIndex1 = i * 2
      const employeeIndex2 = i * 2 + 1
      
      if (employeeIndex1 < allICICIEmployees.length && employeeIndex2 < allICICIEmployees.length) {
        const emp1 = allICICIEmployees[employeeIndex1]
        const emp2 = allICICIEmployees[employeeIndex2]
        
        // Update employee 1 (will be branch admin)
        await Employee.updateOne(
          { _id: emp1._id },
          { 
            $set: { 
              branchId: branch._id,
              branchName: branch.name,
            }
          }
        )
        
        // Update employee 2
        await Employee.updateOne(
          { _id: emp2._id },
          { 
            $set: { 
              branchId: branch._id,
              branchName: branch.name,
            }
          }
        )
        
        // Set employee 1 as branch admin
        await Branch.updateOne(
          { _id: branch._id },
          { $set: { adminId: emp1._id } }
        )
        
        console.log(`✅ Branch ${branch.name}:`)
        console.log(`   Admin: ${emp1.firstName} ${emp1.lastName} (${emp1.designation})`)
        console.log(`   Employee: ${emp2.firstName} ${emp2.lastName} (${emp2.designation})`)
      }
    }

    // Display summary
    console.log('\n📋 Summary:')
    console.log(`   Branches created: ${createdBranches.length}`)
    console.log(`   New employees created: ${createdEmployees.length}`)
    console.log(`   Total ICICI Bank employees: ${allICICIEmployees.length}`)
    
    console.log('\n🏢 Branch Details:')
    const allBranches = await Branch.find({ companyId: iciciCompany._id })
      .populate('adminId', 'firstName lastName designation email')
      .lean()
    
    for (const branch of allBranches) {
      const branchEmployees = await Employee.find({ branchId: branch._id })
        .select('firstName lastName designation email')
        .lean()
      
      console.log(`\n   ${branch.name} (${branch.id})`)
      console.log(`   Address: ${branch.address}, ${branch.city} - ${branch.pincode}`)
      console.log(`   Admin: ${branch.adminId ? `${branch.adminId.firstName} ${branch.adminId.lastName}` : 'Not assigned'}`)
      console.log(`   Employees (${branchEmployees.length}):`)
      branchEmployees.forEach(emp => {
        console.log(`     - ${emp.firstName} ${emp.lastName} (${emp.designation})`)
      })
    }

    console.log('\n🎉 Setup completed successfully!')

  } catch (error) {
    console.error('❌ Error setting up branches and employees:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
setupBranchesAndEmployees()
  .then(() => {
    console.log('Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })


