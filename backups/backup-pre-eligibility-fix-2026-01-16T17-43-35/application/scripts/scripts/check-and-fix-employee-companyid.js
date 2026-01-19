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

async function checkAndFixEmployeeCompanyIds() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`📊 Total companies found: ${allCompanies.length}`)
    allCompanies.forEach(comp => {
      console.log(`   - ${comp.name} (ID: ${comp.id})`)
    })
    console.log('')
    
    // Create a map of company name to company _id
    const companyMap = new Map()
    allCompanies.forEach(company => {
      if (company.name) companyMap.set(company.name.toLowerCase(), company._id)
      if (company.id) companyMap.set(company.id, company._id)
    })

    // Get all employees
    const allEmployees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Total employees found: ${allEmployees.length}\n`)

    let fixedCount = 0
    let missingCount = 0
    let alreadyCorrectCount = 0
    const issues = []

    for (const employee of allEmployees) {
      const employeeId = employee.id || employee.employeeId || employee._id
      const hasCompanyId = employee.companyId && employee.companyId.toString
      const companyName = employee.companyName

      if (!hasCompanyId) {
        missingCount++
        console.log(`\n⚠️  Employee ${employeeId} is missing companyId`)
        console.log(`   Company Name: ${companyName}`)
        
        // Try to find company by companyName
        let targetCompanyId = null
        if (companyName) {
          const normalizedName = companyName.toLowerCase()
          targetCompanyId = companyMap.get(normalizedName)
          
          if (!targetCompanyId) {
            // Try partial match
            for (const [name, id] of companyMap.entries()) {
              if (normalizedName.includes(name) || name.includes(normalizedName)) {
                targetCompanyId = id
                break
              }
            }
          }
        }

        if (targetCompanyId) {
          // Update employee with correct companyId
          const targetCompany = allCompanies.find(c => c._id.toString() === targetCompanyId.toString())
          await db.collection('employees').updateOne(
            { _id: employee._id },
            { 
              $set: { 
                companyId: targetCompanyId,
                companyName: targetCompany?.name || employee.companyName
              }
            }
          )
          fixedCount++
          console.log(`   ✅ Fixed: Assigned to company ${targetCompany?.name || targetCompanyId}`)
        } else {
          issues.push({
            employeeId,
            companyName,
            issue: 'Could not find matching company'
          })
          console.log(`   ❌ Could not find matching company`)
        }
      } else {
        // Verify companyId is valid
        const companyIdStr = employee.companyId.toString()
        const company = allCompanies.find(c => c._id.toString() === companyIdStr)
        
        if (!company) {
          missingCount++
          console.log(`\n⚠️  Employee ${employeeId} has invalid companyId: ${companyIdStr}`)
          console.log(`   Company Name: ${companyName}`)
          
          // Try to fix by companyName
          let targetCompanyId = null
          if (companyName) {
            const normalizedName = companyName.toLowerCase()
            targetCompanyId = companyMap.get(normalizedName)
          }
          
          if (targetCompanyId) {
            const targetCompany = allCompanies.find(c => c._id.toString() === targetCompanyId.toString())
            await db.collection('employees').updateOne(
              { _id: employee._id },
              { 
                $set: { 
                  companyId: targetCompanyId,
                  companyName: targetCompany?.name || employee.companyName
                }
              }
            )
            fixedCount++
            console.log(`   ✅ Fixed: Updated to valid company ${targetCompany?.name || targetCompanyId}`)
          } else {
            issues.push({
              employeeId,
              companyName,
              issue: 'Invalid companyId and could not find matching company'
            })
            console.log(`   ❌ Could not fix`)
          }
        } else {
          alreadyCorrectCount++
        }
      }
    }

    console.log(`\n\n📈 Summary:`)
    console.log(`   ✅ Already correct: ${alreadyCorrectCount}`)
    console.log(`   🔧 Fixed: ${fixedCount}`)
    console.log(`   ❌ Issues remaining: ${issues.length}`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Employees with issues:`)
      issues.forEach(issue => {
        console.log(`   - ${issue.employeeId}: ${issue.issue} (Company: ${issue.companyName})`)
      })
    }

    // Show sample of employees by company
    console.log(`\n📊 Employees by company:`)
    for (const company of allCompanies) {
      const count = await db.collection('employees').countDocuments({ companyId: company._id })
      console.log(`   ${company.name || company.id}: ${count} employees`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkAndFixEmployeeCompanyIds()

