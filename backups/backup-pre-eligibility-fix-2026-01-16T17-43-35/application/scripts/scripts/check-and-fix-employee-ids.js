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

async function checkAndFixEmployeeIds() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    const companies = await db.collection('companies').find({}).toArray()
    
    console.log(`📊 Found ${employees.length} employees and ${companies.length} companies\n`)
    
    // Create company map
    const companyMap = {}
    companies.forEach(comp => {
      companyMap[comp.name] = comp
      companyMap[comp.id] = comp
    })
    
    console.log('📋 Current Employees:')
    employees.forEach((emp, idx) => {
      const companyName = emp.companyName || 'N/A'
      const company = companyMap[companyName] || companyMap[emp.companyId]
      console.log(`   ${idx + 1}. ${emp.employeeId || emp.id}: ${emp.firstName || 'N/A'} ${emp.lastName || 'N/A'}`)
      console.log(`      Company: ${companyName} (${company ? company.id : 'N/A'})`)
      console.log(`      companyId in DB: ${emp.companyId ? emp.companyId.toString() : 'MISSING'}`)
      console.log('')
    })
    
    // Check for Amit Patel specifically
    const amitPatel = employees.find(emp => 
      (emp.firstName && emp.firstName.includes('Amit')) ||
      (emp.lastName && emp.lastName.includes('Patel')) ||
      emp.employeeId === 'IND-003' ||
      emp.id === 'IND-003'
    )
    
    if (amitPatel) {
      console.log('🔍 Found Amit Patel:')
      console.log(`   _id: ${amitPatel._id}`)
      console.log(`   id: ${amitPatel.id}`)
      console.log(`   employeeId: ${amitPatel.employeeId}`)
      console.log(`   firstName: ${amitPatel.firstName}`)
      console.log(`   lastName: ${amitPatel.lastName}`)
      console.log(`   companyId: ${amitPatel.companyId ? amitPatel.companyId.toString() : 'MISSING'}`)
      console.log(`   companyName: ${amitPatel.companyName || 'N/A'}`)
      
      const indigo = companyMap['Indigo'] || companyMap['COMP-INDIGO']
      if (indigo) {
        console.log(`\n   Company COMP-INDIGO _id: ${indigo._id}`)
        const match = amitPatel.companyId && amitPatel.companyId.toString() === indigo._id.toString()
        console.log(`   Match: ${match ? '✅ YES' : '❌ NO'}`)
        
        if (!match) {
          console.log('\n🔧 Fixing companyId for Amit Patel...')
          await db.collection('employees').updateOne(
            { _id: amitPatel._id },
            { 
              $set: { 
                companyId: indigo._id,
                companyName: indigo.name
              }
            }
          )
          console.log('✅ Fixed!')
        }
        
        // Also update employeeId to IND-003 if it's not already
        if (amitPatel.employeeId !== 'IND-003') {
          console.log(`\n🔧 Updating employeeId from "${amitPatel.employeeId}" to "IND-003"...`)
          await db.collection('employees').updateOne(
            { _id: amitPatel._id },
            { 
              $set: { 
                employeeId: 'IND-003'
              }
            }
          )
          console.log('✅ Updated employeeId to IND-003')
        }
      }
    } else {
      console.log('⚠️  Amit Patel not found in employees')
    }
    
    // Update all Indigo employees to have IND- prefix
    console.log('\n🔧 Updating employeeIds for Indigo employees...')
    const indigo = companyMap['Indigo'] || companyMap['COMP-INDIGO']
    if (indigo) {
      const indigoEmployees = employees.filter(emp => {
        const empCompanyId = emp.companyId ? emp.companyId.toString() : null
        return empCompanyId === indigo._id.toString() || emp.companyName === 'Indigo'
      })
      
      let updatedCount = 0
      for (let i = 0; i < indigoEmployees.length; i++) {
        const emp = indigoEmployees[i]
        const newEmployeeId = `IND-${String(i + 1).padStart(3, '0')}`
        if (emp.employeeId !== newEmployeeId) {
          await db.collection('employees').updateOne(
            { _id: emp._id },
            { $set: { employeeId: newEmployeeId } }
          )
          console.log(`   Updated ${emp.employeeId || emp.id} → ${newEmployeeId}`)
          updatedCount++
        }
      }
      console.log(`✅ Updated ${updatedCount} Indigo employee IDs`)
    }
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkAndFixEmployeeIds()






