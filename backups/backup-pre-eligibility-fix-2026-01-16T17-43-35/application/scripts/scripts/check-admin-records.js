/**
 * Script to check all admin records and their employee/company linkages
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
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

async function checkAdminRecords() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    const adminsCollection = db.collection('companyadmins')
    const employeesCollection = db.collection('employees')
    const companiesCollection = db.collection('companies')

    const allAdmins = await adminsCollection.find({}).toArray()
    const allEmployees = await employeesCollection.find({}).toArray()
    const allCompanies = await companiesCollection.find({}).toArray()

    console.log(`Found ${allAdmins.length} admin records\n`)

    for (const admin of allAdmins) {
      const employeeIdStr = admin.employeeId?.toString()
      const companyIdStr = admin.companyId?.toString()

      // Find employee
      const employee = allEmployees.find((e) => {
        const empId = e._id?.toString()
        return empId === employeeIdStr
      })

      // Find company
      const company = allCompanies.find((c) => {
        const compId = c._id?.toString()
        return compId === companyIdStr
      })

      console.log(`Admin Record:`)
      console.log(`  EmployeeId (ObjectId): ${employeeIdStr}`)
      console.log(`  CompanyId (ObjectId): ${companyIdStr}`)
      console.log(`  Can Approve Orders: ${admin.canApproveOrders || false}`)
      
      if (employee) {
        console.log(`  Employee Found: ${employee.id || employee.employeeId || 'N/A'}`)
        console.log(`  Company (from employee): ${employee.companyName || 'N/A'}`)
      } else {
        console.log(`  ✗ Employee NOT FOUND`)
      }

      if (company) {
        console.log(`  Company Found: ${company.name} (id: ${company.id})`)
      } else {
        console.log(`  ✗ Company NOT FOUND`)
      }

      console.log('')
    }

  } catch (error) {
    console.error('Error in checkAdminRecords:', error)
  } finally {
    await mongoose.disconnect()
  }
}

checkAdminRecords()

