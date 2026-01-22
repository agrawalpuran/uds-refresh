/**
 * Recreate Vikram Gupta company admin record
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

function decrypt(text) {
  if (!text || !text.includes(':')) return text
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = parts[1]
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
    let decrypted = decipher.update(encrypted, 'base64', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

async function recreateAdmin() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    const email = 'vikram.gupta6@icicibank.com'
    const employees = db.collection('employees')
    const companies = db.collection('companies')
    const companyadmins = db.collection('companyadmins')
    
    console.log('🔍 Finding employee...')
    
    // Find employee by decrypting all emails
    const allEmployees = await employees.find({}).toArray()
    let employee = null
    
    for (const emp of allEmployees) {
      if (emp.email && typeof emp.email === 'string') {
        try {
          const decrypted = decrypt(emp.email)
          if (decrypted.toLowerCase() === email.toLowerCase()) {
            employee = emp
            break
          }
        } catch (error) {
          continue
        }
      }
    }
    
    if (!employee) {
      console.error('❌ Employee not found')
      await client.close()
      process.exit(1)
    }
    
    console.log(`✅ Found employee:`)
    console.log(`   ID: ${employee.id || employee.employeeId}`)
    console.log(`   MongoDB _id: ${employee._id}`)
    console.log(`   CompanyId: ${employee.companyId}`)
    console.log('')
    
    // Get company
    let company = null
    if (employee.companyId) {
      company = await companies.findOne({ _id: employee.companyId })
      if (!company) {
        // Try by id field
        const companyIdStr = employee.companyId.toString()
        const allCompanies = await companies.find({}).toArray()
        company = allCompanies.find(c => c._id.toString() === companyIdStr)
      }
    }
    
    if (!company) {
      // Find ICICI Bank
      company = await companies.findOne({ 
        $or: [
          { id: '100004' },
          { name: { $regex: /icici/i } }
        ]
      })
    }
    
    if (!company) {
      console.error('❌ Company not found')
      await client.close()
      process.exit(1)
    }
    
    console.log(`✅ Found company:`)
    console.log(`   ID: ${company.id}`)
    console.log(`   Name: ${company.name}`)
    console.log(`   MongoDB _id: ${company._id}`)
    console.log('')
    
    // Check if admin record already exists
    const existingAdmin = await companyadmins.findOne({
      employeeId: employee._id,
      companyId: company._id
    })
    
    if (existingAdmin) {
      console.log('⚠️  Admin record already exists:')
      console.log(`   Admin ID: ${existingAdmin._id}`)
      console.log(`   Can approve orders: ${existingAdmin.canApproveOrders || false}`)
      await client.close()
      process.exit(0)
    }
    
    // Create admin record
    console.log('➕ Creating admin record...')
    const adminRecord = await companyadmins.insertOne({
      companyId: company._id,
      employeeId: employee._id,
      canApproveOrders: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    
    console.log(`✅ Admin record created!`)
    console.log(`   Admin ID: ${adminRecord.insertedId}`)
    console.log(`   Employee _id: ${employee._id}`)
    console.log(`   Company _id: ${company._id}`)
    console.log(`   Can approve orders: true`)
    console.log('')
    
    // Verify it was created
    const verify = await companyadmins.findOne({ _id: adminRecord.insertedId })
    if (verify) {
      console.log('✅ Verified admin record exists in database')
    } else {
      console.error('❌ Admin record not found after creation!')
    }
    
    console.log('')
    console.log(`🎉 ${email} is now a company admin!`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error('Stack:', error.stack)
  } finally {
    await client.close()
  }
}

recreateAdmin()

