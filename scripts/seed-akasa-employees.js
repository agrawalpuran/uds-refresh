/**
 * Seed script for Akasa Air test employees
 * Creates 15 employees across 3 branches (Mumbai, Bangalore, Delhi - 5 each)
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

// Employee names for test data
const employeeData = {
  mumbai: [
    { firstName: 'Arjun', lastName: 'Menon', gender: 'male', designation: 'Pilot' },
    { firstName: 'Radhika', lastName: 'Pillai', gender: 'female', designation: 'Flight Attendant' },
    { firstName: 'Aditya', lastName: 'Joshi', gender: 'male', designation: 'Co-Pilot' },
    { firstName: 'Shreya', lastName: 'Kapoor', gender: 'female', designation: 'Senior Flight Attendant' },
    { firstName: 'Vikram', lastName: 'Deshmukh', gender: 'male', designation: 'Ground Staff' },
  ],
  bangalore: [
    { firstName: 'Siddharth', lastName: 'Rao', gender: 'male', designation: 'Pilot' },
    { firstName: 'Isha', lastName: 'Bansal', gender: 'female', designation: 'Flight Attendant' },
    { firstName: 'Rahul', lastName: 'Nair', gender: 'male', designation: 'Co-Pilot' },
    { firstName: 'Deepa', lastName: 'Sharma', gender: 'female', designation: 'Senior Flight Attendant' },
    { firstName: 'Karthik', lastName: 'Reddy', gender: 'male', designation: 'Ground Staff' },
  ],
  delhi: [
    { firstName: 'Meera', lastName: 'Krishnan', gender: 'female', designation: 'Flight Attendant' },
    { firstName: 'Karan', lastName: 'Malhotra', gender: 'male', designation: 'Pilot' },
    { firstName: 'Nisha', lastName: 'Desai', gender: 'female', designation: 'Senior Flight Attendant' },
    { firstName: 'Rohan', lastName: 'Gupta', gender: 'male', designation: 'Co-Pilot' },
    { firstName: 'Priyanka', lastName: 'Singh', gender: 'female', designation: 'Ground Staff' },
  ]
}

// Branch configurations
const branchConfigs = {
  mumbai: {
    name: 'Mumbai Hub',
    city: 'Mumbai',
    state: 'Maharashtra',
    pincode: '400099',
    address_line_1: 'Terminal 2, Chhatrapati Shivaji International Airport',
    address_line_2: 'Santacruz East',
  },
  bangalore: {
    name: 'Bangalore Hub',
    city: 'Bangalore',
    state: 'Karnataka',
    pincode: '560300',
    address_line_1: 'Terminal 1, Kempegowda International Airport',
    address_line_2: 'Devanahalli',
  },
  delhi: {
    name: 'Delhi Hub',
    city: 'New Delhi',
    state: 'Delhi',
    pincode: '110037',
    address_line_1: 'Terminal 3, Indira Gandhi International Airport',
    address_line_2: 'IGI Airport',
  }
}

// Size options
const sizes = {
  shirt: ['XS', 'S', 'M', 'L', 'XL'],
  pant: ['26', '28', '30', '32', '34', '36'],
  shoe: ['5', '6', '7', '8', '9', '10', '11']
}

function getRandomSize(type, gender) {
  const options = sizes[type]
  // Adjust for gender-typical sizes
  if (gender === 'female') {
    if (type === 'shirt') return options[Math.floor(Math.random() * 3)] // XS, S, M
    if (type === 'shoe') return options[Math.floor(Math.random() * 3)] // 5, 6, 7
  } else {
    if (type === 'shirt') return options[2 + Math.floor(Math.random() * 3)] // M, L, XL
    if (type === 'shoe') return options[3 + Math.floor(Math.random() * 4)] // 8, 9, 10, 11
  }
  return options[Math.floor(Math.random() * options.length)]
}

async function seedAkasaEmployees() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db

    // 1. Find Akasa Air company
    console.log('\n🔍 Finding Akasa Air company...')
    const company = await db.collection('companies').findOne({ 
      $or: [
        { name: { $regex: /akasa/i } },
        { id: { $regex: /akasa/i } }
      ]
    })

    if (!company) {
      console.error('❌ Akasa Air company not found in database!')
      console.log('Please ensure Akasa Air company exists before running this script.')
      process.exit(1)
    }

    console.log(`✅ Found Akasa Air: id=${company.id}, name=${company.name}`)
    const companyId = company.id

    // 2. Find or create branches for Akasa Air
    console.log('\n🏢 Setting up branches...')
    const branches = {}
    
    for (const [branchKey, branchConfig] of Object.entries(branchConfigs)) {
      // Check if branch exists
      let branch = await db.collection('locations').findOne({
        companyId: companyId,
        $or: [
          { name: { $regex: new RegExp(branchConfig.city, 'i') } },
          { city: { $regex: new RegExp(branchConfig.city, 'i') } }
        ]
      })

      if (!branch) {
        // Create the branch
        const branchId = `LOC-AKASA-${branchKey.toUpperCase()}-${Date.now().toString().slice(-6)}`
        const newBranch = {
          id: branchId,
          name: branchConfig.name,
          companyId: companyId,
          address_line_1: branchConfig.address_line_1,
          address_line_2: branchConfig.address_line_2,
          city: branchConfig.city,
          state: branchConfig.state,
          pincode: branchConfig.pincode,
          country: 'India',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        }

        await db.collection('locations').insertOne(newBranch)
        branch = newBranch
        console.log(`  ✅ Created branch: ${branch.name} (${branch.id})`)
      } else {
        console.log(`  ℹ️  Found existing branch: ${branch.name} (${branch.id})`)
      }

      branches[branchKey] = branch
    }

    // 3. Get next employee ID number
    console.log('\n👥 Creating employees...')
    const lastEmployee = await db.collection('employees')
      .find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray()

    let nextIdNum = 500001 // Start from a high number for Akasa
    if (lastEmployee.length > 0) {
      const lastId = lastEmployee[0].id
      const numMatch = lastId.match(/\d+/)
      if (numMatch) {
        nextIdNum = Math.max(nextIdNum, parseInt(numMatch[0]) + 1)
      }
    }

    const createdEmployees = []

    for (const [branchKey, employees] of Object.entries(employeeData)) {
      const branch = branches[branchKey]
      const branchConfig = branchConfigs[branchKey]
      
      console.log(`\n  📍 ${branchConfig.name}:`)

      for (const empData of employees) {
        const employeeId = String(nextIdNum++)
        const email = `${empData.firstName.toLowerCase()}.${empData.lastName.toLowerCase()}@akasaair.com`

        // Check if employee with this email already exists
        const existing = await db.collection('employees').findOne({ email: email })
        if (existing) {
          console.log(`    ⚠️  ${empData.firstName} ${empData.lastName} already exists, skipping...`)
          continue
        }

        const employee = {
          id: employeeId,
          employeeId: employeeId,
          firstName: empData.firstName,
          lastName: empData.lastName,
          designation: empData.designation,
          gender: empData.gender,
          location: branch.name,
          locationId: branch.id,
          email: email,
          mobile: `+91-98${Math.floor(10000000 + Math.random() * 90000000)}`,
          shirtSize: getRandomSize('shirt', empData.gender),
          pantSize: getRandomSize('pant', empData.gender),
          shoeSize: getRandomSize('shoe', empData.gender),
          address_line_1: `${Math.floor(100 + Math.random() * 900)}, ${['Sector', 'Block', 'Phase'][Math.floor(Math.random() * 3)]} ${Math.floor(1 + Math.random() * 20)}`,
          address_line_2: ['Near Airport', 'Main Road', 'Ring Road'][Math.floor(Math.random() * 3)],
          city: branchConfig.city,
          state: branchConfig.state,
          pincode: branchConfig.pincode,
          country: 'India',
          companyId: companyId,
          companyName: company.name,
          eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
          cycleDuration: { shirt: 12, pant: 12, shoe: 24, jacket: 36 },
          dispatchPreference: ['direct', 'central', 'regional'][Math.floor(Math.random() * 3)],
          status: 'active',
          period: '2024-2025',
          dateOfJoining: new Date('2024-01-15'),
          createdAt: new Date(),
          updatedAt: new Date()
        }

        await db.collection('employees').insertOne(employee)
        createdEmployees.push(employee)
        console.log(`    ✅ Created: ${employee.firstName} ${employee.lastName} (${employee.employeeId}) - ${employee.email}`)
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 SUMMARY')
    console.log('='.repeat(60))
    console.log(`Company: ${company.name} (${company.id})`)
    console.log(`\nBranches:`)
    for (const [key, branch] of Object.entries(branches)) {
      console.log(`  - ${branch.name} (${branch.id})`)
    }
    console.log(`\nEmployees created: ${createdEmployees.length}`)
    console.log(`  - Mumbai: ${createdEmployees.filter(e => e.location === branches.mumbai.name).length}`)
    console.log(`  - Bangalore: ${createdEmployees.filter(e => e.location === branches.bangalore.name).length}`)
    console.log(`  - Delhi: ${createdEmployees.filter(e => e.location === branches.delhi.name).length}`)

    console.log('\n📧 Test Login Emails:')
    createdEmployees.forEach(emp => {
      console.log(`  - ${emp.email} (${emp.firstName} ${emp.lastName} - ${emp.location})`)
    })

    console.log('\n🎉 Done!')

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 Disconnected from MongoDB')
  }
}

seedAkasaEmployees()
