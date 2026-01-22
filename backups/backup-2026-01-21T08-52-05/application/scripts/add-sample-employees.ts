import mongoose from 'mongoose'
import connectDB from '../lib/db/mongodb'
import Employee from '../lib/models/Employee'
import Company from '../lib/models/Company'

async function addSampleEmployees() {
  try {
    console.log('🚀 Starting to add sample employees...')
    console.log('🔄 Connecting to MongoDB...')
    await connectDB()
    console.log('✅ Connected to MongoDB successfully')

    // Get company IDs from database
    const companies = await Company.find().lean()
    if (companies.length === 0) {
      console.error('❌ No companies found in database. Please run migration first.')
      process.exit(1)
    }

    const indigoCompany = companies.find((c: any) => c.id === 'COMP-INDIGO')
    const akasaCompany = companies.find((c: any) => c.id === 'COMP-AKASA')

    if (!indigoCompany || !akasaCompany) {
      console.error('❌ Required companies not found. Please run migration first.')
      process.exit(1)
    }

    const sampleEmployees = [
      {
        id: 'IND-011',
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
        cycleDuration: { shirt: 6, pant: 6, shoe: 6, jacket: 12 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'IND-012',
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
        period: '2024-2025'
      },
      {
        id: 'IND-013',
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
        cycleDuration: { shirt: 6, pant: 6, shoe: 6, jacket: 12 },
        dispatchPreference: 'direct',
        status: 'active',
        period: '2024-2025',
        dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
      },
      {
        id: 'AKA-012',
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



