/**
 * Script to update all employee emails from @goindigo.in to @icicibank.in
 * Run this script to update the email domain for all employees in the database
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

async function updateEmployeeEmails() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB successfully!')

    // Find all employees with @goindigo.in email
    const employeesToUpdate = await Employee.find({ 
      email: { $regex: /@goindigo\.in$/i } 
    })

    console.log(`Found ${employeesToUpdate.length} employees with @goindigo.in email`)

    if (employeesToUpdate.length === 0) {
      console.log('No employees found with @goindigo.in email. Nothing to update.')
      await mongoose.disconnect()
      return
    }

    let updatedCount = 0
    let errorCount = 0

    // Update each employee's email
    for (const employee of employeesToUpdate) {
      try {
        const oldEmail = employee.email
        const newEmail = oldEmail.replace(/@goindigo\.in$/i, '@icicibank.in')
        
        // Update the email
        employee.email = newEmail
        await employee.save()
        
        console.log(`✓ Updated: ${oldEmail} → ${newEmail}`)
        updatedCount++
      } catch (error) {
        console.error(`✗ Error updating employee ${employee.id} (${employee.email}):`, error.message)
        errorCount++
      }
    }

    console.log('\n=== Update Summary ===')
    console.log(`Total employees found: ${employeesToUpdate.length}`)
    console.log(`Successfully updated: ${updatedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log('Email domain update completed!')

  } catch (error) {
    console.error('Error updating employee emails:', error)
  } finally {
    await mongoose.disconnect()
    console.log('Disconnected from MongoDB')
  }
}

// Run the update
updateEmployeeEmails()
  .then(() => {
    console.log('Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })


