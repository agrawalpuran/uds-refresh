/**
 * Script to add unique employee IDs to all existing employees in the database
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
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)

async function addEmployeeIds() {
  try {
    console.log('🚀 Starting to add employee IDs...')
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Get all employees without employeeId
    const employees = await Employee.find({ $or: [{ employeeId: { $exists: false } }, { employeeId: null }, { employeeId: '' }] })
    
    if (employees.length === 0) {
      console.log('✅ All employees already have employee IDs')
      
      // Show summary
      const totalEmployees = await Employee.countDocuments()
      const employeesWithId = await Employee.countDocuments({ employeeId: { $exists: true, $ne: null, $ne: '' } })
      console.log(`\n📊 Total employees: ${totalEmployees}`)
      console.log(`📊 Employees with ID: ${employeesWithId}`)
      
      await mongoose.disconnect()
      return
    }

    console.log(`📋 Found ${employees.length} employees without employee IDs`)

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

    console.log(`🔢 Starting employee ID from: EMP-${String(nextIdNumber).padStart(6, '0')}`)

    // Add employee IDs
    let updated = 0
    for (const employee of employees) {
      const employeeId = `EMP-${String(nextIdNumber).padStart(6, '0')}`
      
      try {
        await Employee.updateOne(
          { _id: employee._id },
          { $set: { employeeId: employeeId } }
        )
        console.log(`✅ Added employee ID ${employeeId} to ${employee.firstName} ${employee.lastName} (${employee.email})`)
        updated++
        nextIdNumber++
      } catch (error) {
        if (error.code === 11000) {
          // Duplicate key error - try next number
          nextIdNumber++
          const newEmployeeId = `EMP-${String(nextIdNumber).padStart(6, '0')}`
          await Employee.updateOne(
            { _id: employee._id },
            { $set: { employeeId: newEmployeeId } }
          )
          console.log(`✅ Added employee ID ${newEmployeeId} to ${employee.firstName} ${employee.lastName} (${employee.email})`)
          updated++
          nextIdNumber++
        } else {
          console.error(`❌ Error updating employee ${employee.firstName} ${employee.lastName}:`, error.message)
        }
      }
    }

    console.log(`\n🎉 Successfully added employee IDs to ${updated} employees!`)
    
    // Show summary
    const totalEmployees = await Employee.countDocuments()
    const employeesWithIdCount = await Employee.countDocuments({ employeeId: { $exists: true, $ne: null, $ne: '' } })
    console.log(`\n📊 Total employees: ${totalEmployees}`)
    console.log(`📊 Employees with ID: ${employeesWithIdCount}`)
    
  } catch (error) {
    console.error('❌ Error adding employee IDs:', error)
    process.exit(1)
  } finally {
    console.log('👋 Disconnecting from MongoDB...')
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

addEmployeeIds()






