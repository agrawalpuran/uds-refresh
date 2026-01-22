/**
 * Script to check employee-company linkage and identify issues
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

// We'll use raw MongoDB collections

async function checkEmployeeCompanyLinkage() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`Found ${employees.length} employees\n`)

    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    const companyMap = new Map()
    companies.forEach(c => {
      companyMap.set(c._id.toString(), c)
      if (c.id) {
        companyMap.set(c.id, c)
      }
    })
    console.log(`Found ${companies.length} companies\n`)

    // Check each employee
    const issues = []
    const fixed = []

    for (const emp of employees) {
      const empId = emp.id || emp.employeeId || emp.email
      let companyId = emp.companyId
      let companyName = emp.companyName

      // Check if companyId exists
      if (!companyId) {
        issues.push({
          employee: empId,
          issue: 'No companyId',
          companyName: companyName || 'N/A',
          fix: 'Need to link employee to company'
        })
        continue
      }

      // Convert companyId to string for comparison
      const companyIdStr = companyId.toString ? companyId.toString() : String(companyId)

      // Try to find company
      let company = null
      
      // Try by ObjectId
      if (mongoose.Types.ObjectId.isValid(companyIdStr) && companyIdStr.length === 24) {
        company = companyMap.get(companyIdStr)
      }
      
      // Try by string ID
      if (!company) {
        company = companyMap.get(companyIdStr)
      }

      // Try by companyName as fallback
      if (!company && companyName) {
        const companyByName = companies.find(c => c.name === companyName)
        if (companyByName) {
          company = companyByName
          // Suggest fixing the companyId
          fixed.push({
            employee: empId,
            currentCompanyId: companyIdStr,
            correctCompanyId: company._id.toString(),
            companyName: companyName,
            fix: `Update companyId from ${companyIdStr} to ${company._id.toString()}`
          })
        }
      }

      if (!company) {
        issues.push({
          employee: empId,
          issue: 'Company not found',
          companyId: companyIdStr,
          companyName: companyName || 'N/A',
          fix: 'Company reference is invalid or company was deleted'
        })
      } else {
        console.log(`✓ Employee ${empId}: Linked to company ${company.id} (${company.name})`)
      }
    }

    // Print summary
    console.log('\n=== SUMMARY ===')
    console.log(`Total employees: ${employees.length}`)
    console.log(`Employees with issues: ${issues.length}`)
    console.log(`Employees that can be fixed: ${fixed.length}`)

    if (issues.length > 0) {
      console.log('\n=== ISSUES FOUND ===')
      issues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. Employee: ${issue.employee}`)
        console.log(`   Issue: ${issue.issue}`)
        console.log(`   CompanyId: ${issue.companyId || 'N/A'}`)
        console.log(`   CompanyName: ${issue.companyName}`)
        console.log(`   Fix: ${issue.fix}`)
      })
    }

    if (fixed.length > 0) {
      console.log('\n=== FIXES SUGGESTED ===')
      fixed.forEach((fix, idx) => {
        console.log(`\n${idx + 1}. Employee: ${fix.employee}`)
        console.log(`   Current companyId: ${fix.currentCompanyId}`)
        console.log(`   Correct companyId: ${fix.correctCompanyId}`)
        console.log(`   Company: ${fix.companyName}`)
        console.log(`   Action: ${fix.fix}`)
      })
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

checkEmployeeCompanyLinkage()

