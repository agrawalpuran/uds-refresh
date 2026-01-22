/**
 * Script to update all existing employees with default date of joining (Oct 1, 2025)
 * Run this script once to set the joining date for all existing employees
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

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)

async function updateJoiningDates() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const defaultJoiningDate = new Date('2025-10-01T00:00:00.000Z')
    
    // Find all employees without dateOfJoining or with null dateOfJoining
    const employees = await Employee.find({
      $or: [
        { dateOfJoining: { $exists: false } },
        { dateOfJoining: null }
      ]
    })

    console.log(`\n📊 Found ${employees.length} employees without date of joining`)

    if (employees.length === 0) {
      console.log('✅ All employees already have a date of joining set')
      await mongoose.disconnect()
      return
    }

    // Update all employees with default joining date
    const result = await Employee.updateMany(
      {
        $or: [
          { dateOfJoining: { $exists: false } },
          { dateOfJoining: null }
        ]
      },
      {
        $set: { dateOfJoining: defaultJoiningDate }
      }
    )

    console.log(`\n✅ Updated ${result.modifiedCount} employees with default joining date: ${defaultJoiningDate.toISOString().split('T')[0]}`)
    
    // Show summary
    const totalEmployees = await Employee.countDocuments()
    const employeesWithJoiningDate = await Employee.countDocuments({ dateOfJoining: { $exists: true, $ne: null } })
    console.log(`\n📊 Total employees: ${totalEmployees}`)
    console.log(`📊 Employees with joining date: ${employeesWithJoiningDate}`)

    console.log('\n🎉 Update completed successfully!')
    
  } catch (error) {
    console.error('❌ Error updating employee joining dates:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
updateJoiningDates()



