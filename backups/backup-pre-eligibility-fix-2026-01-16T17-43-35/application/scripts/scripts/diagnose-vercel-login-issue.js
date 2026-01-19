/**
 * Diagnostic script to identify why employee login fails in Vercel
 * 
 * This script checks:
 * 1. If companies have valid 'id' fields
 * 2. If employees have valid companyId references
 * 3. If companyId ObjectIds match company _ids
 * 
 * Usage: node scripts/diagnose-vercel-login-issue.js [email]
 * Example: node scripts/diagnose-vercel-login-issue.js emp1@icicibank.com
 */

const mongoose = require('mongoose')
require('dotenv').config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function diagnoseLoginIssue(email) {
  try {
    console.log('🔍 Diagnosing Vercel Login Issue...\n')
    console.log(`MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***@')}\n`)
    
    // Connect to database
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Check all companies have 'id' field
    console.log('📋 Step 1: Checking companies collection...')
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`   Found ${companies.length} companies`)
    
    const companiesWithoutId = companies.filter(c => !c.id)
    const companiesWithInvalidId = companies.filter(c => c.id && !/^\d{6}$/.test(String(c.id)))
    
    if (companiesWithoutId.length > 0) {
      console.error(`   ❌ Found ${companiesWithoutId.length} companies WITHOUT 'id' field:`)
      companiesWithoutId.forEach(c => {
        console.error(`      - _id: ${c._id}, name: ${c.name || 'N/A'}`)
      })
    }
    
    if (companiesWithInvalidId.length > 0) {
      console.error(`   ⚠️  Found ${companiesWithInvalidId.length} companies with INVALID 'id' format:`)
      companiesWithInvalidId.forEach(c => {
        console.error(`      - _id: ${c._id}, id: ${c.id}, name: ${c.name || 'N/A'}`)
      })
    }
    
    if (companiesWithoutId.length === 0 && companiesWithInvalidId.length === 0) {
      console.log('   ✅ All companies have valid numeric 'id' fields')
    }
    console.log('')
    
    // Step 2: If email provided, check specific employee
    if (email) {
      console.log(`📋 Step 2: Checking employee: ${email}`)
      const normalizedEmail = email.trim().toLowerCase()
      
      // Try to find employee by email (checking encrypted and plain text)
      let employee = await db.collection('employees').findOne({ 
        email: normalizedEmail 
      })
      
      if (!employee) {
        // Try to find by checking all employees (might be encrypted)
        const allEmployees = await db.collection('employees').find({}).toArray()
        employee = allEmployees.find(e => {
          const empEmail = e.email || ''
          return empEmail.toLowerCase().includes(normalizedEmail.split('@')[0])
        })
      }
      
      if (!employee) {
        console.error(`   ❌ Employee not found with email: ${email}`)
        console.log('')
      } else {
        console.log(`   ✅ Employee found:`)
        console.log(`      - _id: ${employee._id}`)
        console.log(`      - id: ${employee.id || 'N/A'}`)
        console.log(`      - employeeId: ${employee.employeeId || 'N/A'}`)
        console.log(`      - companyId: ${employee.companyId || 'N/A'}`)
        console.log(`      - companyId type: ${typeof employee.companyId}`)
        
        if (employee.companyId) {
          const companyIdStr = employee.companyId.toString()
          
          // Check if it's a numeric ID
          if (/^\d{6}$/.test(companyIdStr)) {
            console.log(`      ✅ companyId is numeric: ${companyIdStr}`)
            
            // Check if company exists with this ID
            const company = await db.collection('companies').findOne({ id: companyIdStr })
            if (company) {
              console.log(`      ✅ Company found: ${company.name} (ID: ${company.id})`)
            } else {
              console.error(`      ❌ Company NOT found with id: ${companyIdStr}`)
            }
          } 
          // Check if it's an ObjectId
          else if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
            console.log(`      ⚠️  companyId is ObjectId: ${companyIdStr}`)
            
            // Check if company exists with this _id
            const company = await db.collection('companies').findOne({ 
              _id: new mongoose.Types.ObjectId(companyIdStr) 
            })
            
            if (company) {
              console.log(`      ✅ Company found with ObjectId: ${company.name}`)
              if (company.id) {
                console.log(`      ✅ Company has numeric id: ${company.id}`)
              } else {
                console.error(`      ❌ Company MISSING numeric 'id' field!`)
                console.error(`         This is the problem! Run: node scripts/fix-company-ids.js`)
              }
            } else {
              console.error(`      ❌ Company NOT found with ObjectId: ${companyIdStr}`)
              console.error(`         Employee's companyId doesn't match any company!`)
            }
          } else {
            console.error(`      ❌ Invalid companyId format: ${companyIdStr}`)
          }
        } else {
          console.error(`      ❌ Employee has NO companyId!`)
        }
        console.log('')
      }
    }
    
    // Step 3: Check all employees with invalid companyId references
    console.log('📋 Step 3: Checking employees with invalid companyId references...')
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`   Found ${allEmployees.length} employees`)
    
    const employeesWithIssues = []
    
    for (const emp of allEmployees) {
      if (!emp.companyId) {
        employeesWithIssues.push({
          employee: emp,
          issue: 'Missing companyId'
        })
        continue
      }
      
      const companyIdStr = emp.companyId.toString()
      
      // If it's numeric, check if company exists
      if (/^\d{6}$/.test(companyIdStr)) {
        const company = await db.collection('companies').findOne({ id: companyIdStr })
        if (!company) {
          employeesWithIssues.push({
            employee: emp,
            issue: `Numeric companyId ${companyIdStr} doesn't match any company`
          })
        }
      }
      // If it's ObjectId, check if company exists and has 'id' field
      else if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
        const company = await db.collection('companies').findOne({ 
          _id: new mongoose.Types.ObjectId(companyIdStr) 
        })
        
        if (!company) {
          employeesWithIssues.push({
            employee: emp,
            issue: `ObjectId companyId ${companyIdStr} doesn't match any company`
          })
        } else if (!company.id) {
          employeesWithIssues.push({
            employee: emp,
            issue: `Company found but missing 'id' field`
          })
        }
      } else {
        employeesWithIssues.push({
          employee: emp,
          issue: `Invalid companyId format: ${companyIdStr}`
        })
      }
    }
    
    if (employeesWithIssues.length > 0) {
      console.error(`   ❌ Found ${employeesWithIssues.length} employees with issues:`)
      employeesWithIssues.slice(0, 10).forEach(({ employee, issue }) => {
        const email = employee.email || 'N/A'
        const empId = employee.employeeId || employee.id || employee._id
        console.error(`      - ${empId}: ${issue}`)
        console.error(`        Email: ${email}`)
      })
      if (employeesWithIssues.length > 10) {
        console.error(`      ... and ${employeesWithIssues.length - 10} more`)
      }
    } else {
      console.log('   ✅ All employees have valid companyId references')
    }
    console.log('')
    
    // Summary
    console.log('📊 Summary:')
    console.log(`   - Companies without 'id': ${companiesWithoutId.length}`)
    console.log(`   - Companies with invalid 'id': ${companiesWithInvalidId.length}`)
    console.log(`   - Employees with companyId issues: ${employeesWithIssues.length}`)
    console.log('')
    
    if (companiesWithoutId.length > 0 || companiesWithInvalidId.length > 0) {
      console.log('💡 Recommended Fix:')
      console.log('   Run: node scripts/fix-company-ids.js')
      console.log('')
    }
    
    if (employeesWithIssues.length > 0) {
      console.log('💡 Recommended Fix:')
      console.log('   Run: node scripts/fix-employee-companyid.js')
      console.log('')
    }
    
    await mongoose.disconnect()
    console.log('✅ Diagnosis complete')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

// Get email from command line
const email = process.argv[2]
diagnoseLoginIssue(email)
