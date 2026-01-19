/**
 * Add Vikram Gupta as Company Admin for ICICI Bank
 */

const { MongoClient } = require('mongodb')
const crypto = require('crypto')

// Set environment variables
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

const MONGODB_URI = process.env.MONGODB_URI
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY

// Encryption function
function encrypt(text) {
  if (!text) return ''
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.substring(0, 32).padEnd(32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'base64')
  encrypted += cipher.final('base64')
  return iv.toString('base64') + ':' + encrypted
}

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

async function addVikramAsAdmin() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db()
    
    const email = 'vikram.gupta6@icicibank.com'
    console.log(`🔍 Looking for employee with email: ${email}`)
    console.log('')

    // Find the employee by email (try encrypted and plain text)
    const employees = db.collection('employees')
    const encryptedEmail = encrypt(email)
    
    let employee = await employees.findOne({ email: encryptedEmail })
    
    // If not found with encrypted, try plain text
    if (!employee) {
      employee = await employees.findOne({ email: email })
    }
    
    // If still not found, try decryption matching
    if (!employee) {
      const allEmployees = await employees.find({}).toArray()
      for (const emp of allEmployees) {
        if (emp.email && typeof emp.email === 'string') {
          try {
            const decryptedEmail = decrypt(emp.email)
            if (decryptedEmail.toLowerCase() === email.toLowerCase()) {
              employee = emp
              break
            }
          } catch (error) {
            continue
          }
        }
      }
    }

    if (!employee) {
      console.error(`❌ Employee not found with email: ${email}`)
      console.error('   Please ensure the employee exists in the database first.')
      await client.close()
      process.exit(1)
    }

    console.log(`✅ Found employee:`)
    console.log(`   ID: ${employee.id || employee.employeeId}`)
    console.log(`   Name: ${employee.firstName ? decrypt(employee.firstName) : ''} ${employee.lastName ? decrypt(employee.lastName) : ''}`)
    console.log(`   Email: ${email}`)
    console.log(`   CompanyId: ${employee.companyId}`)
    console.log('')

    // Get company
    const companies = db.collection('companies')
    let companyId = employee.companyId
    
    // Convert ObjectId to string if needed
    if (companyId && typeof companyId === 'object') {
      companyId = companyId.toString()
    }
    
    const company = await companies.findOne({ _id: employee.companyId })
    if (!company) {
      // Try finding by id field
      const companyById = await companies.findOne({ id: companyId })
      if (companyById) {
        companyId = companyById._id
      } else {
        console.error(`❌ Company not found for employee`)
        await client.close()
        process.exit(1)
      }
    }

    console.log(`📋 Company ID: ${company?.id || 'N/A'}`)
    console.log(`📋 Company Name: ${company?.name || 'N/A'}`)
    console.log('')

    // Check if already an admin
    const companyadmins = db.collection('companyadmins')
    const existingAdmin = await companyadmins.findOne({
      employeeId: employee._id,
      companyId: company._id || companyId
    })

    if (existingAdmin) {
      console.log(`⚠️  Employee is already a company admin`)
      console.log(`   Admin record ID: ${existingAdmin._id}`)
      console.log(`   Can approve orders: ${existingAdmin.canApproveOrders || false}`)
      await client.close()
      process.exit(0)
    }

    // Add as company admin
    console.log(`➕ Adding employee as company admin...`)
    const adminRecord = await companyadmins.insertOne({
      companyId: company._id || companyId,
      employeeId: employee._id,
      canApproveOrders: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })

    console.log(`✅ Successfully added as company admin!`)
    console.log(`   Admin record ID: ${adminRecord.insertedId}`)
    console.log(`   Can approve orders: true`)
    console.log('')
    console.log(`🎉 ${email} can now login as company admin!`)
    
  } catch (error) {
    console.error(`❌ Failed to add company admin:`, error.message)
    console.error('')
    console.error('Error details:', error)
    await client.close()
    process.exit(1)
  } finally {
    await client.close()
  }
}

addVikramAsAdmin()
  .then(() => {
    console.log('')
    console.log('✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('')
    console.error('❌ Script failed:', error)
    process.exit(1)
  })
