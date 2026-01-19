/**
 * Script to create dummy location data for Indigo and ICICI Bank companies
 * 
 * USAGE:
 *   node scripts/create-dummy-locations.js
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

async function createDummyLocations() {
  await connectDB()
  
  const db = mongoose.connection.db
  
  console.log('\n📋 Creating Dummy Locations for Indigo and ICICI Bank\n')
  
  // Find companies using raw MongoDB collection
  const indigoCompany = await db.collection('companies').findOne({ 
    $or: [
      { id: 'COMP-INDIGO' },
      { name: { $regex: /indigo/i } }
    ]
  })
  
  const iciciCompany = await db.collection('companies').findOne({ 
    $or: [
      { id: 'COMP-ICICI' },
      { name: { $regex: /icici/i } }
    ]
  })
  
  if (!indigoCompany) {
    console.log('⚠️  Indigo company not found. Searching all companies...')
    const allCompanies = await db.collection('companies').find({}).limit(10).toArray()
    console.log('Available companies:', allCompanies.map(c => `${c.id}: ${c.name}`).join(', '))
  }
  
  if (!iciciCompany) {
    console.log('⚠️  ICICI Bank company not found. Searching all companies...')
    const allCompanies = await db.collection('companies').find({}).limit(10).toArray()
    console.log('Available companies:', allCompanies.map(c => `${c.id}: ${c.name}`).join(', '))
  }
  
  // Helper function to generate next location ID
  async function getNextLocationId() {
    const existingLocations = await db.collection('locations').find({})
      .sort({ id: -1 })
      .limit(1)
      .toArray()
    
    let nextLocationId = 400001
    if (existingLocations.length > 0) {
      const lastId = existingLocations[0].id
      if (/^\d{6}$/.test(String(lastId))) {
        const lastIdNum = parseInt(String(lastId), 10)
        if (lastIdNum >= 400001 && lastIdNum < 500000) {
          nextLocationId = lastIdNum + 1
        }
      }
    }
    
    // Check if ID exists, find next available
    let locationId = String(nextLocationId).padStart(6, '0')
    let exists = await db.collection('locations').findOne({ id: locationId })
    while (exists && nextLocationId < 500000) {
      nextLocationId++
      locationId = String(nextLocationId).padStart(6, '0')
      exists = await db.collection('locations').findOne({ id: locationId })
    }
    
    return locationId
  }
  
  // Helper function to get employees for a company
  async function getEmployeesForCompany(companyId) {
    const employees = await db.collection('employees').find({ 
      companyId: companyId 
    }).limit(5).toArray()
    return employees
  }
  
  // Dummy locations for Indigo
  const indigoLocations = [
    {
      name: 'Indigo Mumbai Office',
      address: 'Terminal 2, Chhatrapati Shivaji Maharaj International Airport',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400099',
      phone: '+91-22-6670-3000',
      email: 'mumbai.office@indigo.in',
      status: 'active'
    },
    {
      name: 'Indigo Delhi Office',
      address: 'Terminal 3, Indira Gandhi International Airport',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110037',
      phone: '+91-11-4166-6000',
      email: 'delhi.office@indigo.in',
      status: 'active'
    },
    {
      name: 'Indigo Bangalore Office',
      address: 'Terminal 1, Kempegowda International Airport',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560300',
      phone: '+91-80-6678-4000',
      email: 'bangalore.office@indigo.in',
      status: 'active'
    }
  ]
  
  // Dummy locations for ICICI Bank
  const iciciLocations = [
    {
      name: 'ICICI Bank Mumbai Branch',
      address: 'ICICI Bank Tower, Bandra Kurla Complex',
      city: 'Mumbai',
      state: 'Maharashtra',
      pincode: '400051',
      phone: '+91-22-2653-1414',
      email: 'mumbai.branch@icicibank.com',
      status: 'active'
    },
    {
      name: 'ICICI Bank Delhi Branch',
      address: 'ICICI Bank Building, Connaught Place',
      city: 'New Delhi',
      state: 'Delhi',
      pincode: '110001',
      phone: '+91-11-4150-1414',
      email: 'delhi.branch@icicibank.com',
      status: 'active'
    },
    {
      name: 'ICICI Bank Chennai Branch',
      address: 'ICICI Bank, T Nagar',
      city: 'Chennai',
      state: 'Tamil Nadu',
      pincode: '600017',
      phone: '+91-44-2834-1414',
      email: 'chennai.branch@icicibank.com',
      status: 'active'
    }
  ]
  
  // Create locations for Indigo
  if (indigoCompany) {
    console.log(`\n🏢 Creating locations for Indigo (Company ID: ${indigoCompany.id})`)
    const indigoEmployees = await getEmployeesForCompany(indigoCompany._id)
    
    if (indigoEmployees.length === 0) {
      console.log('⚠️  No employees found for Indigo. Locations will be created without Location Admin.')
    }
    
    for (let i = 0; i < indigoLocations.length; i++) {
      const locData = indigoLocations[i]
      
      try {
        // Check if location already exists
        const existing = await db.collection('locations').findOne({ 
          companyId: indigoCompany._id,
          name: locData.name 
        })
        
        if (existing) {
          console.log(`  ⏭️  Location "${locData.name}" already exists, skipping...`)
          continue
        }
        
        const locationId = await getNextLocationId()
        const adminEmployee = indigoEmployees[i] || indigoEmployees[0] // Use first employee or first available
        
        const locationDoc = {
          id: locationId,
          name: locData.name,
          companyId: indigoCompany._id,
          adminId: adminEmployee ? adminEmployee._id : null, // Can be null for now
          address: locData.address,
          city: locData.city,
          state: locData.state,
          pincode: locData.pincode,
          phone: locData.phone,
          email: locData.email,
          status: locData.status,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        const result = await db.collection('locations').insertOne(locationDoc)
        
        // Create LocationAdmin relationship if admin exists
        if (adminEmployee) {
          await db.collection('locationadmins').updateOne(
            { locationId: result.insertedId, employeeId: adminEmployee._id },
            { 
              $set: {
                locationId: result.insertedId,
                employeeId: adminEmployee._id,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            },
            { upsert: true }
          )
        }
        
        console.log(`  ✅ Created: ${locData.name} (ID: ${locationId})`)
        if (adminEmployee) {
          console.log(`     Location Admin: ${adminEmployee.employeeId || adminEmployee.id}`)
        } else {
          console.log(`     ⚠️  No Location Admin assigned`)
        }
      } catch (error) {
        console.error(`  ❌ Failed to create "${locData.name}":`, error.message)
      }
    }
  } else {
    console.log('\n⚠️  Indigo company not found. Skipping Indigo locations.')
  }
  
  // Create locations for ICICI Bank
  if (iciciCompany) {
    console.log(`\n🏢 Creating locations for ICICI Bank (Company ID: ${iciciCompany.id})`)
    const iciciEmployees = await getEmployeesForCompany(iciciCompany._id)
    
    if (iciciEmployees.length === 0) {
      console.log('⚠️  No employees found for ICICI Bank. Locations will be created without Location Admin.')
    }
    
    for (let i = 0; i < iciciLocations.length; i++) {
      const locData = iciciLocations[i]
      
      try {
        // Check if location already exists
        const existing = await db.collection('locations').findOne({ 
          companyId: iciciCompany._id,
          name: locData.name 
        })
        
        if (existing) {
          console.log(`  ⏭️  Location "${locData.name}" already exists, skipping...`)
          continue
        }
        
        const locationId = await getNextLocationId()
        const adminEmployee = iciciEmployees[i] || iciciEmployees[0] // Use first employee or first available
        
        const locationDoc = {
          id: locationId,
          name: locData.name,
          companyId: iciciCompany._id,
          adminId: adminEmployee ? adminEmployee._id : null, // Can be null for now
          address: locData.address,
          city: locData.city,
          state: locData.state,
          pincode: locData.pincode,
          phone: locData.phone,
          email: locData.email,
          status: locData.status,
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        const result = await db.collection('locations').insertOne(locationDoc)
        
        // Create LocationAdmin relationship if admin exists
        if (adminEmployee) {
          await db.collection('locationadmins').updateOne(
            { locationId: result.insertedId, employeeId: adminEmployee._id },
            { 
              $set: {
                locationId: result.insertedId,
                employeeId: adminEmployee._id,
                createdAt: new Date(),
                updatedAt: new Date()
              }
            },
            { upsert: true }
          )
        }
        
        console.log(`  ✅ Created: ${locData.name} (ID: ${locationId})`)
        if (adminEmployee) {
          console.log(`     Location Admin: ${adminEmployee.employeeId || adminEmployee.id}`)
        } else {
          console.log(`     ⚠️  No Location Admin assigned`)
        }
      } catch (error) {
        console.error(`  ❌ Failed to create "${locData.name}":`, error.message)
      }
    }
  } else {
    console.log('\n⚠️  ICICI Bank company not found. Skipping ICICI locations.')
  }
  
  console.log('\n✅ Dummy location creation complete!')
  
  await mongoose.connection.close()
  process.exit(0)
}

// Run the script
createDummyLocations().catch(error => {
  console.error('❌ Script error:', error)
  process.exit(1)
})
