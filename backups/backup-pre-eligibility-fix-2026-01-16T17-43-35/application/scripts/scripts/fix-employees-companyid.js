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

async function fixEmployeesCompanyId() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    const companyMap = {}
    companies.forEach(comp => {
      companyMap[comp.id] = comp._id
      companyMap[comp.name] = comp._id
    })
    
    console.log(`📊 Found ${companies.length} companies:`)
    companies.forEach(comp => {
      console.log(`   - ${comp.name} (ID: ${comp.id})`)
    })
    console.log('')

    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Found ${employees.length} employees\n`)

    let fixedCount = 0
    let alreadyCorrectCount = 0
    let errorCount = 0

    for (const emp of employees) {
      let needsFix = false
      let targetCompanyId = null
      let reason = ''

      // Check if companyId is missing or invalid
      if (!emp.companyId) {
        needsFix = true
        reason = 'Missing companyId'
      } else {
        // Check if companyId is a valid ObjectId that exists
        const company = await db.collection('companies').findOne({ _id: emp.companyId })
        if (!company) {
          needsFix = true
          reason = 'Invalid companyId (company not found)'
        } else {
          // Verify companyName matches
          if (emp.companyName && emp.companyName !== company.name) {
            needsFix = true
            reason = `Company name mismatch: ${emp.companyName} vs ${company.name}`
          }
        }
      }

      // If needs fix, try to determine correct company
      if (needsFix) {
        // Try to find company by companyName
        if (emp.companyName) {
          const matchingCompany = companies.find(c => 
            c.name === emp.companyName || 
            c.name.toLowerCase() === emp.companyName.toLowerCase()
          )
          if (matchingCompany) {
            targetCompanyId = matchingCompany._id
          }
        }

        // If still not found, try to infer from employeeId prefix
        if (!targetCompanyId && emp.employeeId) {
          if (emp.employeeId.startsWith('IND-')) {
            const indigo = companies.find(c => c.id === 'COMP-INDIGO' || c.name.toLowerCase().includes('indigo'))
            if (indigo) targetCompanyId = indigo._id
          } else if (emp.employeeId.startsWith('AKA-')) {
            const akasa = companies.find(c => c.id === 'COMP-AKASA' || c.name.toLowerCase().includes('akasa'))
            if (akasa) targetCompanyId = akasa._id
          } else if (emp.employeeId.startsWith('AIR-')) {
            const airindia = companies.find(c => c.id === 'COMP-AIRINDIA' || c.name.toLowerCase().includes('air india'))
            if (airindia) targetCompanyId = airindia._id
          }
        }

        if (targetCompanyId) {
          const targetCompany = companies.find(c => c._id.toString() === targetCompanyId.toString())
          console.log(`🔧 Fixing employee ${emp.employeeId || emp.id}:`)
          console.log(`   Reason: ${reason}`)
          console.log(`   Setting companyId to: ${targetCompany.name} (${targetCompany.id})`)

          await db.collection('employees').updateOne(
            { _id: emp._id },
            { 
              $set: { 
                companyId: targetCompanyId,
                companyName: targetCompany.name
              }
            }
          )

          fixedCount++
          console.log(`   ✅ Fixed\n`)
        } else {
          console.log(`⚠️  Cannot fix employee ${emp.employeeId || emp.id}:`)
          console.log(`   Reason: ${reason}`)
          console.log(`   Company Name: ${emp.companyName || 'N/A'}`)
          console.log(`   Could not determine correct company\n`)
          errorCount++
        }
      } else {
        alreadyCorrectCount++
      }
    }

    console.log('\n📊 Summary:')
    console.log(`   ✅ Already correct: ${alreadyCorrectCount}`)
    console.log(`   🔧 Fixed: ${fixedCount}`)
    console.log(`   ⚠️  Errors: ${errorCount}`)
    console.log(`   📝 Total: ${employees.length}`)

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixEmployeesCompanyId()

