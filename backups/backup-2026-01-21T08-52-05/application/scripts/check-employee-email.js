const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function checkEmployeeEmail() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    const db = mongoose.connection.db
    const employees = await db.collection('employees').find({}).toArray()
    
    console.log(`📊 Total Employees: ${employees.length}`)
    console.log('')
    console.log('📧 Employee Emails:')
    console.log('')
    
    employees.forEach((emp, index) => {
      console.log(`${index + 1}. Name: ${emp.firstName || emp.name || 'N/A'} ${emp.lastName || ''}`)
      console.log(`   Email: ${emp.email || 'NO EMAIL'}`)
      console.log(`   Employee ID: ${emp.id || emp.employeeId || 'N/A'}`)
      console.log('')
    })
    
    // Check specifically for the email
    const searchEmail = 'rajesh.kumar@goindigo.in'
    console.log(`🔍 Searching for: ${searchEmail}`)
    const found = employees.find(emp => 
      emp.email && emp.email.toLowerCase() === searchEmail.toLowerCase()
    )
    
    if (found) {
      console.log('✅ Found employee:')
      console.log(`   Name: ${found.firstName || found.name} ${found.lastName || ''}`)
      console.log(`   Email: ${found.email}`)
      console.log(`   ID: ${found.id || found.employeeId}`)
    } else {
      console.log('❌ Employee not found with that email')
      console.log('')
      console.log('💡 Checking similar emails...')
      const similar = employees.filter(emp => 
        emp.email && emp.email.toLowerCase().includes('rajesh')
      )
      if (similar.length > 0) {
        console.log('Found similar:')
        similar.forEach(emp => {
          console.log(`   - ${emp.email}`)
        })
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await mongoose.disconnect()
    console.log('🔌 Disconnected')
  }
}

checkEmployeeEmail()



