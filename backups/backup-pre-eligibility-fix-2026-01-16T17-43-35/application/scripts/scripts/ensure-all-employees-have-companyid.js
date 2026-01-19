/**
 * Script to ensure all employees have a mandatory companyId
 * Checks and fixes any employees missing companyId
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function ensureAllEmployeesHaveCompanyId() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`📊 Total companies found: ${allCompanies.length}`)
    
    if (allCompanies.length === 0) {
      console.error('❌ No companies found in database! Cannot assign companyId to employees.')
      process.exit(1)
    }

    // Use Indigo as default if available, otherwise use first company
    let defaultCompany = allCompanies.find(c => c.id === 'COMP-INDIGO' || c.name?.toLowerCase().includes('indigo'))
    if (!defaultCompany) {
      defaultCompany = allCompanies[0]
    }
    
    console.log(`📌 Default company for assignment: ${defaultCompany.name} (ID: ${defaultCompany.id})`)
    console.log(`   Company _id: ${defaultCompany._id}\n`)

    // Get all employees
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Total employees found: ${allEmployees.length}\n`)

    // Find employees without companyId
    const employeesWithoutCompanyId = allEmployees.filter(emp => {
      return !emp.companyId || emp.companyId === null || emp.companyId === undefined
    })

    console.log(`⚠️  Employees without companyId: ${employeesWithoutCompanyId.length}`)

    if (employeesWithoutCompanyId.length > 0) {
      console.log('\n📋 Employees missing companyId:')
      employeesWithoutCompanyId.forEach((emp, index) => {
        console.log(`   ${index + 1}. Employee ID: ${emp.employeeId || emp.id || 'N/A'}, Name: ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'}`)
      })

      // Check if --fix flag is provided
      if (process.argv.includes('--fix')) {
        console.log(`\n🔧 Fixing ${employeesWithoutCompanyId.length} employees...`)
        
        let fixed = 0
        let errors = 0

        for (const emp of employeesWithoutCompanyId) {
          try {
            // Update employee with default company
            await db.collection('employees').updateOne(
              { _id: emp._id },
              {
                $set: {
                  companyId: defaultCompany._id,
                  companyName: defaultCompany.name || defaultCompany.id
                }
              }
            )
            fixed++
            if (fixed % 5 === 0) {
              console.log(`   Fixed ${fixed}/${employeesWithoutCompanyId.length} employees...`)
            }
          } catch (error) {
            errors++
            console.error(`   ❌ Error fixing employee ${emp.employeeId || emp.id}:`, error.message)
          }
        }

        console.log(`\n✅ Successfully fixed ${fixed} employees`)
        if (errors > 0) {
          console.log(`⚠️  ${errors} errors occurred`)
        }
      } else {
        console.log('\nℹ️  To fix these employees, run:')
        console.log('   node scripts/ensure-all-employees-have-companyid.js --fix')
      }
    } else {
      console.log('✅ All employees have companyId assigned!')
    }

    // Verify all employees now have companyId
    const finalCheck = await db.collection('employees').find({}).toArray()
    const stillMissing = finalCheck.filter(emp => {
      return !emp.companyId || emp.companyId === null || emp.companyId === undefined
    })

    console.log(`\n=== Final Summary ===`)
    console.log(`Total employees: ${finalCheck.length}`)
    console.log(`Employees with companyId: ${finalCheck.length - stillMissing.length}`)
    console.log(`Employees without companyId: ${stillMissing.length}`)

    if (stillMissing.length > 0) {
      console.log('\n⚠️  Warning: Some employees still missing companyId:')
      stillMissing.forEach(emp => {
        console.log(`   - ${emp.employeeId || emp.id || 'N/A'}`)
      })
    } else {
      console.log('\n✅ All employees now have companyId!')
    }

    // Also check for employees with invalid companyId (pointing to non-existent companies)
    console.log('\n🔍 Checking for employees with invalid companyId references...')
    const companyIds = new Set(allCompanies.map(c => c._id.toString()))
    const employeesWithInvalidCompanyId = finalCheck.filter(emp => {
      if (!emp.companyId) return false
      const companyIdStr = emp.companyId.toString ? emp.companyId.toString() : String(emp.companyId)
      return !companyIds.has(companyIdStr)
    })

    if (employeesWithInvalidCompanyId.length > 0) {
      console.log(`⚠️  Found ${employeesWithInvalidCompanyId.length} employees with invalid companyId references`)
      if (process.argv.includes('--fix')) {
        console.log('🔧 Fixing invalid companyId references...')
        for (const emp of employeesWithInvalidCompanyId) {
          try {
            await db.collection('employees').updateOne(
              { _id: emp._id },
              {
                $set: {
                  companyId: defaultCompany._id,
                  companyName: defaultCompany.name || defaultCompany.id
                }
              }
            )
          } catch (error) {
            console.error(`   ❌ Error fixing employee ${emp.employeeId || emp.id}:`, error.message)
          }
        }
        console.log('✅ Fixed invalid companyId references')
      } else {
        console.log('   Run with --fix to correct these')
      }
    } else {
      console.log('✅ All companyId references are valid')
    }

  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

ensureAllEmployeesHaveCompanyId()



