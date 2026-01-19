/**
 * Quick script to verify branches and employees are linked correctly
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

const BranchSchema = new mongoose.Schema({}, { strict: false })
const EmployeeSchema = new mongoose.Schema({}, { strict: false })

const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema)
const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)

async function verifyBranches() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const branches = await Branch.find({}).lean()
    console.log(`📊 Total branches: ${branches.length}\n`)

    for (const branch of branches) {
      const employees = await Employee.find({ branchId: branch._id }).lean()
      const admin = branch.adminId ? await Employee.findById(branch.adminId).lean() : null
      
      console.log(`🏢 ${branch.name} (${branch.id})`)
      console.log(`   Address: ${branch.address}, ${branch.city} - ${branch.pincode}`)
      console.log(`   Admin: ${admin ? `${admin.firstName} ${admin.lastName}` : 'Not assigned'}`)
      console.log(`   Employees: ${employees.length}`)
      employees.forEach(emp => {
        console.log(`     - ${emp.firstName} ${emp.lastName} (${emp.designation})`)
      })
      console.log('')
    }

    await mongoose.disconnect()
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

verifyBranches()


