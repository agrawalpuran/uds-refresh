/**
 * Check if employee exists in MongoDB Atlas
 */

const { MongoClient } = require('mongodb')

const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

async function checkEmployee() {
  const client = new MongoClient(MONGODB_URI_ATLAS)
  
  try {
    await client.connect()
    const db = client.db()
    const employees = db.collection('employees')
    
    const email = 'anjali.sharma@icicibank.com'
    console.log(`🔍 Searching for employee: ${email}`)
    console.log('')
    
    // Try exact match
    const employee = await employees.findOne({ email: email })
    
    if (employee) {
      console.log('✅ Employee found with exact email match:')
      console.log(JSON.stringify(employee, null, 2))
    } else {
      console.log('❌ Employee NOT found with exact email match')
      console.log('')
      
      // Get all employees to check
      const allEmployees = await employees.find({}).toArray()
      console.log(`📊 Total employees in Atlas: ${allEmployees.length}`)
      console.log('')
      
      // Check for ICICI employees
      const iciciEmployees = await employees.find({ 
        $or: [
          { email: { $regex: /icicibank/i } },
          { 'companyId.name': { $regex: /icici/i } }
        ]
      }).toArray()
      
      console.log(`📊 ICICI Bank employees found: ${iciciEmployees.length}`)
      if (iciciEmployees.length > 0) {
        console.log('')
        console.log('ICICI employees:')
        for (const emp of iciciEmployees) {
          console.log(`  - Email: ${emp.email || 'N/A'} | ID: ${emp.id || emp.employeeId || 'N/A'} | Name: ${emp.firstName || ''} ${emp.lastName || ''}`)
        }
      }
      console.log('')
      
      // Check if email is encrypted
      console.log('🔐 Checking if emails are encrypted...')
      const sampleEmployees = await employees.find({}).limit(5).toArray()
      for (const emp of sampleEmployees) {
        const emailValue = emp.email || 'N/A'
        const isEncrypted = emailValue.length > 50 || !emailValue.includes('@')
        console.log(`  - ${emp.id || 'N/A'}: ${emailValue.substring(0, 30)}${emailValue.length > 30 ? '...' : ''} ${isEncrypted ? '(encrypted)' : '(plain)'}`)
      }
    }
    
    // Check companies
    console.log('')
    console.log('🏢 Checking companies...')
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`Total companies: ${companies.length}`)
    for (const comp of companies) {
      console.log(`  - ${comp.name || comp.id || 'N/A'}: ${comp.id || 'N/A'}`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    await client.close()
  }
}

checkEmployee()

