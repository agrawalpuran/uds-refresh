/**
 * Diagnostic script to check why companyId conversion is failing for employees
 * Specifically checks employee 300032 and similar cases
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', 'env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim()
      }
    }
  } catch (error) {
    console.error('Could not read env.local file')
  }
}

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required')
  console.error('Set it in env.local file or as environment variable')
  process.exit(1)
}

async function diagnoseCompanyIdConversion() {
  try {
    console.log('🔍 Diagnosing companyId Conversion Issues')
    console.log('=' .repeat(60))
    console.log('')
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    console.log('✅ Connected to MongoDB')
    console.log(`   Database: ${mongoose.connection.db.databaseName}`)
    console.log('')
    
    const db = mongoose.connection.db
    
    // Step 1: Check specific employee 300032
    console.log('📋 Step 1: Checking Employee 300032')
    console.log('-'.repeat(60))
    const employee = await db.collection('employees').findOne({ id: '300032' })
    
    if (!employee) {
      console.log('❌ Employee 300032 not found')
    } else {
      console.log('✅ Employee found:')
      console.log(`   ID: ${employee.id}`)
      console.log(`   Email: ${employee.email || 'N/A'}`)
      console.log(`   companyId type: ${typeof employee.companyId}`)
      console.log(`   companyId value: ${employee.companyId}`)
      
      if (employee.companyId) {
        const companyIdStr = employee.companyId.toString()
        console.log(`   companyId string: ${companyIdStr}`)
        console.log(`   Is ObjectId (24 hex): ${/^[0-9a-fA-F]{24}$/.test(companyIdStr)}`)
        console.log(`   Is numeric ID (6 digits): ${/^\d{6}$/.test(companyIdStr)}`)
        
        // Try to find the company
        if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
          console.log('')
          console.log('   🔍 Looking up company by ObjectId...')
          const company = await db.collection('companies').findOne({
            _id: new mongoose.Types.ObjectId(companyIdStr)
          })
          
          if (company) {
            console.log('   ✅ Company found:')
            console.log(`      Name: ${company.name}`)
            console.log(`      _id: ${company._id}`)
            console.log(`      id field: ${company.id || 'MISSING!'}`)
            console.log(`      id type: ${typeof company.id}`)
            
            if (!company.id) {
              console.log('   ❌ PROBLEM: Company is missing the "id" field!')
              console.log('   💡 Fix: Run scripts/fix-company-ids.js to add missing id fields')
            } else {
              console.log(`   ✅ Company has valid id field: ${company.id}`)
            }
          } else {
            console.log('   ❌ PROBLEM: No company found with that ObjectId!')
            console.log('   💡 Fix: Employee companyId reference is invalid')
          }
        }
      } else {
        console.log('   ❌ PROBLEM: Employee has no companyId!')
      }
    }
    console.log('')
    
    // Step 2: Check all companies have id fields
    console.log('📋 Step 2: Checking All Companies Have id Fields')
    console.log('-'.repeat(60))
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`   Total companies: ${companies.length}`)
    
    const companiesWithoutId = companies.filter(c => !c.id)
    const companiesWithId = companies.filter(c => c.id)
    
    console.log(`   Companies WITH id field: ${companiesWithId.length}`)
    console.log(`   Companies WITHOUT id field: ${companiesWithoutId.length}`)
    
    if (companiesWithoutId.length > 0) {
      console.log('')
      console.log('   ❌ PROBLEM: Found companies without id field:')
      companiesWithoutId.forEach(c => {
        console.log(`      - ${c.name} (_id: ${c._id})`)
      })
      console.log('   💡 Fix: Run scripts/fix-company-ids.js to add missing id fields')
    } else {
      console.log('   ✅ All companies have id fields')
    }
    console.log('')
    
    // Step 3: Check employees with invalid companyId references
    console.log('📋 Step 3: Checking Employees with Invalid companyId References')
    console.log('-'.repeat(60))
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`   Total employees: ${allEmployees.length}`)
    
    let invalidCount = 0
    const invalidEmployees = []
    
    for (const emp of allEmployees) {
      if (emp.companyId) {
        const companyIdStr = emp.companyId.toString()
        if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
          // It's an ObjectId, check if company exists
          const company = await db.collection('companies').findOne({
            _id: new mongoose.Types.ObjectId(companyIdStr)
          })
          
          if (!company) {
            invalidCount++
            invalidEmployees.push({
              id: emp.id,
              email: emp.email,
              companyId: companyIdStr
            })
          } else if (!company.id) {
            invalidCount++
            invalidEmployees.push({
              id: emp.id,
              email: emp.email,
              companyId: companyIdStr,
              issue: 'Company missing id field'
            })
          }
        }
      }
    }
    
    console.log(`   Employees with invalid companyId: ${invalidCount}`)
    if (invalidCount > 0) {
      console.log('')
      console.log('   ❌ PROBLEM: Found employees with invalid companyId references:')
      invalidEmployees.slice(0, 10).forEach(emp => {
        console.log(`      - Employee ${emp.id} (${emp.email || 'N/A'})`)
        console.log(`        companyId: ${emp.companyId}`)
        if (emp.issue) {
          console.log(`        Issue: ${emp.issue}`)
        }
      })
      if (invalidEmployees.length > 10) {
        console.log(`      ... and ${invalidEmployees.length - 10} more`)
      }
      console.log('   💡 Fix: Run scripts/fix-employee-companyid.js to repair references')
    } else {
      console.log('   ✅ All employees have valid companyId references')
    }
    console.log('')
    
    // Step 4: Summary
    console.log('📋 Summary')
    console.log('='.repeat(60))
    const hasIssues = companiesWithoutId.length > 0 || invalidCount > 0
    
    if (hasIssues) {
      console.log('❌ Issues Found:')
      if (companiesWithoutId.length > 0) {
        console.log(`   - ${companiesWithoutId.length} companies missing id field`)
      }
      if (invalidCount > 0) {
        console.log(`   - ${invalidCount} employees with invalid companyId references`)
      }
      console.log('')
      console.log('💡 Recommended Fixes:')
      console.log('   1. Run: node scripts/fix-company-ids.js')
      console.log('   2. Run: node scripts/fix-employee-companyid.js')
    } else {
      console.log('✅ No issues found! All companies and employees are properly configured.')
    }
    console.log('')
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

diagnoseCompanyIdConversion()



