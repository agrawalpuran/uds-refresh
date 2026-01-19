/**
 * Script to create 30 dummy employees for ICICI Bank
 * Assigns them to locations and sets location admins
 * 
 * USAGE:
 *   node scripts/create-icici-employees.js
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
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

async function connectDB() {
  try {
    if (mongoose.connection.readyState === 1) {
      console.log('✅ Already connected to MongoDB')
      return
    }
    const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
    console.log('🔌 Connecting to MongoDB...')
    console.log(`📍 URI: ${maskedUri}`)
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message)
    process.exit(1)
  }
}

// Helper function to generate random Indian names
const firstNames = {
  male: ['Rajesh', 'Amit', 'Vikram', 'Suresh', 'Ramesh', 'Kumar', 'Anil', 'Sunil', 'Deepak', 'Nitin', 'Pradeep', 'Manoj', 'Sanjay', 'Ajay', 'Vijay'],
  female: ['Priya', 'Anita', 'Sunita', 'Kavita', 'Neha', 'Pooja', 'Ritu', 'Sneha', 'Divya', 'Shreya', 'Anjali', 'Meera', 'Kiran', 'Swati', 'Rashmi']
}

const lastNames = ['Sharma', 'Patel', 'Singh', 'Kumar', 'Gupta', 'Verma', 'Reddy', 'Rao', 'Mehta', 'Jain', 'Shah', 'Desai', 'Joshi', 'Malhotra', 'Agarwal']

function getRandomName(gender) {
  const firstName = firstNames[gender][Math.floor(Math.random() * firstNames[gender].length)]
  const lastName = lastNames[Math.floor(Math.random() * lastNames.length)]
  return { firstName, lastName }
}

// Helper function to generate employee data
function generateEmployeeData(index, locationId, companyId) {
  const gender = Math.random() > 0.5 ? 'male' : 'female'
  const { firstName, lastName } = getRandomName(gender)
  
  const designations = [
    'Branch Manager', 'Assistant Manager', 'Relationship Manager', 'Cashier', 
    'Loan Officer', 'Customer Service Executive', 'Operations Manager', 
    'Credit Analyst', 'Teller', 'Security Officer', 'IT Support', 'HR Executive'
  ]
  
  const cities = ['Mumbai', 'Delhi', 'Chennai', 'Bangalore', 'Kolkata', 'Hyderabad', 'Pune', 'Ahmedabad']
  const states = ['Maharashtra', 'Delhi', 'Tamil Nadu', 'Karnataka', 'West Bengal', 'Telangana', 'Maharashtra', 'Gujarat']
  const pincodes = ['400001', '110001', '600001', '560001', '700001', '500001', '411001', '380001']
  
  const cityIndex = Math.floor(Math.random() * cities.length)
  
  const sizes = {
    shirt: ['S', 'M', 'L', 'XL', 'XXL'],
    pant: ['28', '30', '32', '34', '36', '38'],
    shoe: ['7', '8', '9', '10', '11']
  }
  
  return {
    firstName,
    lastName,
    designation: designations[Math.floor(Math.random() * designations.length)],
    gender,
    location: cities[cityIndex], // String location field (legacy)
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@icicibank.com`,
    mobile: `9${Math.floor(100000000 + Math.random() * 900000000)}`, // 10-digit mobile
    shirtSize: sizes.shirt[Math.floor(Math.random() * sizes.shirt.length)],
    pantSize: sizes.pant[Math.floor(Math.random() * sizes.pant.length)],
    shoeSize: sizes.shoe[Math.floor(Math.random() * sizes.shoe.length)],
    address: `${Math.floor(Math.random() * 100) + 1}, ${cities[cityIndex]} Street, ${cities[cityIndex]}`,
    companyId,
    locationId, // ObjectId reference to Location
    eligibility: {
      shirt: Math.floor(Math.random() * 5) + 2, // 2-6
      pant: Math.floor(Math.random() * 5) + 2,
      shoe: Math.floor(Math.random() * 3) + 1, // 1-3
      jacket: Math.floor(Math.random() * 2) + 1 // 1-2
    },
    cycleDuration: {
      shirt: 6,
      pant: 6,
      shoe: 12,
      jacket: 12
    },
    dispatchPreference: ['direct', 'central', 'regional'][Math.floor(Math.random() * 3)],
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date(2020 + Math.floor(Math.random() * 5), Math.floor(Math.random() * 12), Math.floor(Math.random() * 28) + 1)
  }
}

async function createICICIEmployees() {
  await connectDB()
  
  const db = mongoose.connection.db
  
  console.log('\n📋 Creating 30 Dummy Employees for ICICI Bank\n')
  
  // Find ICICI Bank company
  const iciciCompany = await db.collection('companies').findOne({ 
    $or: [
      { id: 'COMP-ICICI' },
      { name: { $regex: /icici/i } }
    ]
  })
  
  if (!iciciCompany) {
    console.log('❌ ICICI Bank company not found. Please create the company first.')
    await mongoose.connection.close()
    process.exit(1)
  }
  
  console.log(`✅ Found ICICI Bank: ${iciciCompany.name} (ID: ${iciciCompany.id})\n`)
  
  // Find ICICI Bank locations
  const iciciLocations = await db.collection('locations').find({ 
    companyId: iciciCompany._id 
  }).toArray()
  
  if (iciciLocations.length === 0) {
    console.log('⚠️  No locations found for ICICI Bank. Creating employees without location assignment.')
  } else {
    console.log(`✅ Found ${iciciLocations.length} locations for ICICI Bank:`)
    iciciLocations.forEach((loc, idx) => {
      console.log(`   ${idx + 1}. ${loc.name} (ID: ${loc.id})`)
    })
    console.log('')
  }
  
  // Get existing employees to find next employee ID
  const existingEmployees = await db.collection('employees').find({})
    .sort({ id: -1 })
    .limit(1)
    .toArray()
  
  let nextEmployeeId = 300001
  if (existingEmployees.length > 0) {
    const lastId = existingEmployees[0].id
    if (/^\d{6}$/.test(String(lastId))) {
      const lastIdNum = parseInt(String(lastId), 10)
      if (lastIdNum >= 300001 && lastIdNum < 400000) {
        nextEmployeeId = lastIdNum + 1
      }
    }
  }
  
  // Distribute employees across locations
  const employeesPerLocation = Math.floor(30 / (iciciLocations.length || 1))
  const remainder = 30 % (iciciLocations.length || 1)
  
  const createdEmployees = []
  let currentEmployeeId = nextEmployeeId
  
  // Create employees and assign to locations
  for (let i = 0; i < 30; i++) {
    // Determine which location this employee belongs to
    let locationIndex = 0
    if (iciciLocations.length > 0) {
      if (i < employeesPerLocation * iciciLocations.length) {
        locationIndex = Math.floor(i / employeesPerLocation)
      } else {
        // Distribute remainder across first few locations
        locationIndex = i - (employeesPerLocation * iciciLocations.length)
      }
      locationIndex = Math.min(locationIndex, iciciLocations.length - 1)
    }
    
    const location = iciciLocations[locationIndex] || null
    const locationId = location ? location._id : null
    
    const employeeData = generateEmployeeData(i, locationId, iciciCompany._id)
    const employeeId = String(currentEmployeeId).padStart(6, '0')
    
    // Check if employee ID already exists
    const existing = await db.collection('employees').findOne({ id: employeeId })
    if (existing) {
      currentEmployeeId++
      continue
    }
    
    // Use createEmployee function which handles encryption automatically
    // Convert locationId ObjectId to location ID string for the function
    const locationIdString = location ? location.id : undefined
    
    try {
      // Import and use createEmployee from data-access
      // We need to use dynamic import or require with proper path resolution
      const path = require('path')
      const dataAccessPath = path.join(__dirname, '..', 'lib', 'db', 'data-access.ts')
      
      // Since we can't easily import TypeScript, let's use raw MongoDB with encryption
      // Import encryption utility
      const crypto = require('crypto')
      
      // Get encryption key from env
      const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
      const ALGORITHM = 'aes-256-cbc'
      const IV_LENGTH = 16
      
      const getKey = () => {
        const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
        if (key.length !== 32) {
          return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
        }
        return key
      }
      
      const encrypt = (text) => {
        if (!text) return text
        const iv = crypto.randomBytes(IV_LENGTH)
        const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv)
        let encrypted = cipher.update(text, 'utf8', 'hex')
        encrypted += cipher.final('hex')
        return iv.toString('hex') + ':' + encrypted
      }
      
      // Encrypt sensitive fields
      const encryptedEmail = encrypt(employeeData.email)
      const encryptedMobile = encrypt(employeeData.mobile)
      const encryptedAddress = encrypt(employeeData.address)
      const encryptedFirstName = encrypt(employeeData.firstName)
      const encryptedLastName = encrypt(employeeData.lastName)
      const encryptedDesignation = encrypt(employeeData.designation)
      
      const employeeDoc = {
        id: employeeId,
        employeeId: employeeId,
        firstName: encryptedFirstName,
        lastName: encryptedLastName,
        designation: encryptedDesignation,
        gender: employeeData.gender,
        location: employeeData.location,
        email: encryptedEmail,
        mobile: encryptedMobile,
        shirtSize: employeeData.shirtSize,
        pantSize: employeeData.pantSize,
        shoeSize: employeeData.shoeSize,
        address: encryptedAddress,
        companyId: iciciCompany._id,
        companyName: iciciCompany.name,
        locationId: locationId,
        eligibility: employeeData.eligibility,
        cycleDuration: employeeData.cycleDuration,
        dispatchPreference: employeeData.dispatchPreference,
        status: employeeData.status,
        period: employeeData.period,
        dateOfJoining: employeeData.dateOfJoining,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const result = await db.collection('employees').insertOne(employeeDoc)
      createdEmployees.push({
        _id: result.insertedId,
        id: employeeId,
        locationId: locationId,
        locationName: location ? location.name : 'No Location',
        firstName: employeeData.firstName,
        lastName: employeeData.lastName,
        designation: employeeData.designation
      })
      
      console.log(`  ✅ Created: ${employeeData.firstName} ${employeeData.lastName} (${employeeId}) - ${employeeData.designation} - Location: ${location ? location.name : 'None'}`)
      
      currentEmployeeId++
    } catch (error) {
      console.error(`  ❌ Failed to create employee ${employeeId}:`, error.message)
    }
  }
  
  console.log(`\n✅ Created ${createdEmployees.length} employees for ICICI Bank\n`)
  
  // Assign Location Admins
  if (iciciLocations.length > 0 && createdEmployees.length > 0) {
    console.log('👤 Assigning Location Admins...\n')
    
    // Group employees by location
    const employeesByLocation = new Map()
    for (const emp of createdEmployees) {
      if (emp.locationId) {
        const locId = emp.locationId.toString()
        if (!employeesByLocation.has(locId)) {
          employeesByLocation.set(locId, [])
        }
        employeesByLocation.get(locId).push(emp)
      }
    }
    
    // Assign first employee of each location as Location Admin
    for (const location of iciciLocations) {
      const locId = location._id.toString()
      const locationEmployees = employeesByLocation.get(locId) || []
      
      if (locationEmployees.length > 0) {
        // Pick first employee as Location Admin (prefer Branch Manager or Assistant Manager)
        let adminEmployee = locationEmployees.find(e => 
          e.designation.includes('Manager') || e.designation.includes('Manager')
        ) || locationEmployees[0]
        
        try {
          // Update location with adminId
          await db.collection('locations').updateOne(
            { _id: location._id },
            { 
              $set: { 
                adminId: adminEmployee._id,
                updatedAt: new Date()
              }
            }
          )
          
          // Create LocationAdmin relationship
          await db.collection('locationadmins').updateOne(
            { locationId: location._id, employeeId: adminEmployee._id },
            {
              $set: {
                locationId: location._id,
                employeeId: adminEmployee._id,
                updatedAt: new Date()
              },
              $setOnInsert: {
                createdAt: new Date()
              }
            },
            { upsert: true }
          )
          
          console.log(`  ✅ Assigned Location Admin for ${location.name}:`)
          console.log(`     Admin: ${adminEmployee.firstName} ${adminEmployee.lastName} (${adminEmployee.id}) - ${adminEmployee.designation}`)
          console.log(`     Total employees in location: ${locationEmployees.length}\n`)
        } catch (error) {
          console.error(`  ❌ Failed to assign Location Admin for ${location.name}:`, error.message)
        }
      } else {
        console.log(`  ⚠️  No employees found for location ${location.name}, skipping admin assignment\n`)
      }
    }
  }
  
  // Summary
  console.log('📊 Summary:')
  console.log(`   Total employees created: ${createdEmployees.length}`)
  if (iciciLocations.length > 0) {
    console.log(`   Locations: ${iciciLocations.length}`)
    for (const location of iciciLocations) {
      const locEmployees = createdEmployees.filter(e => 
        e.locationId && e.locationId.toString() === location._id.toString()
      )
      console.log(`     - ${location.name}: ${locEmployees.length} employees`)
    }
  }
  
  console.log('\n✅ Script completed successfully!')
  
  await mongoose.connection.close()
  process.exit(0)
}

// Run the script
createICICIEmployees().catch(error => {
  console.error('❌ Script error:', error)
  process.exit(1)
})

