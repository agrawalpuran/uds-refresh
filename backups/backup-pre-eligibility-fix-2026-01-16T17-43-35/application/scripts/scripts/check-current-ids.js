/**
 * Check current Company, Uniform, and Employee IDs in the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function checkCurrentIds() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CURRENT IDs IN DATABASE')
    console.log('='.repeat(80))
    console.log()

    // Check Companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`COMPANIES (${companies.length}):`)
    companies.forEach((company, index) => {
      console.log(`   ${index + 1}. ${company.name}: id = "${company.id}" (type: ${typeof company.id})`)
    })
    console.log()

    // Check Uniforms/Products
    const uniforms = await db.collection('uniforms').find({}).toArray()
    console.log(`UNIFORMS/PRODUCTS (${uniforms.length}):`)
    uniforms.slice(0, 10).forEach((uniform, index) => {
      console.log(`   ${index + 1}. ${uniform.name}: id = "${uniform.id}" (type: ${typeof uniform.id})`)
    })
    if (uniforms.length > 10) {
      console.log(`   ... and ${uniforms.length - 10} more`)
    }
    console.log()

    // Check Employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`EMPLOYEES (${employees.length}):`)
    employees.slice(0, 10).forEach((employee, index) => {
      console.log(`   ${index + 1}. ${employee.firstName} ${employee.lastName}: id = "${employee.id}", employeeId = "${employee.employeeId}"`)
    })
    if (employees.length > 10) {
      console.log(`   ... and ${employees.length - 10} more`)
    }
    console.log()

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkCurrentIds()

