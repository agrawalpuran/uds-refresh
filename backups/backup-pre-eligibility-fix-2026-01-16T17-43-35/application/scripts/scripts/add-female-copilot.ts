import mongoose from 'mongoose'
import connectDB from '../lib/db/mongodb'
import Employee from '../lib/models/Employee'
import Company from '../lib/models/Company'

async function addFemaleCoPilot() {
  try {
    console.log('🚀 Starting to add female co-pilot employee...')
    console.log('🔄 Connecting to MongoDB...')
    await connectDB()
    console.log('✅ Connected to MongoDB successfully')

    // Get Indigo company
    const indigoCompany = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigoCompany) {
      console.error('❌ Indigo company not found. Please ensure company exists.')
      process.exit(1)
    }

    // Check if employee already exists
    const existingEmployee = await Employee.findOne({ 
      $or: [
        { id: 'IND-014' },
        { email: 'kavya.sharma@goindigo.in' }
      ]
    })

    if (existingEmployee) {
      console.log(`⚠️  Female co-pilot already exists: ${existingEmployee.firstName} ${existingEmployee.lastName} (${existingEmployee.id})`)
      console.log(`   Email: ${existingEmployee.email}`)
      process.exit(0)
    }

    // Create female co-pilot employee
    const femaleCoPilot = {
      id: 'IND-014',
      employeeId: 'IND-014',
      firstName: 'Kavya',
      lastName: 'Sharma',
      designation: 'Co-Pilot',
      gender: 'female',
      location: 'Delhi Base',
      email: 'kavya.sharma@goindigo.in',
      mobile: '+91-9876543235',
      shirtSize: 'M',
      pantSize: '30',
      shoeSize: '8',
      address: 'G-404, Sector 22, Noida, Uttar Pradesh 201301',
      companyId: indigoCompany._id,
      companyName: 'Indigo',
      eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
      cycleDuration: { shirt: 6, pant: 6, shoe: 6, jacket: 12 },
      dispatchPreference: 'direct',
      status: 'active',
      period: '2024-2025',
      dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
    }

    const employee = await Employee.create(femaleCoPilot)
    console.log(`✅ Created female co-pilot: ${femaleCoPilot.firstName} ${femaleCoPilot.lastName} (${femaleCoPilot.id})`)
    console.log(`   Email: ${femaleCoPilot.email}`)
    console.log(`   Designation: ${femaleCoPilot.designation}`)
    console.log(`   Gender: ${femaleCoPilot.gender}`)
    
    console.log('\n📋 Login Details:')
    console.log(`   Email: ${femaleCoPilot.email}`)
    console.log(`   OTP: 123456 (demo OTP)`)
    console.log(`   Actor Type: consumer`)
    
  } catch (error: any) {
    console.error('❌ Error adding female co-pilot:', error)
    if (error.code === 11000) {
      console.error('   Duplicate key error - employee may already exist')
    }
    process.exit(1)
  } finally {
    console.log('\n👋 Disconnecting from MongoDB...')
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

addFemaleCoPilot()


