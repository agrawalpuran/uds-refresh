/**
 * Script to delete employee 300041 from ICICI Mumbai
 * 
 * Usage: node scripts/delete-employee-300041.js
 */

const { MongoClient, ObjectId } = require('mongodb')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      if (!process.env[key]) {
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

// Get encryption key - same logic as lib/utils/encryption.ts
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText
    }
    
    if (!encryptedText.includes(':')) {
      return encryptedText
    }
    
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }
    
    const iv = Buffer.from(parts[0], 'hex')
    const encrypted = Buffer.from(parts[1], 'hex')
    const key = getKey()
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    
    return decrypted.toString('utf8')
  } catch (error) {
    return encryptedText
  }
}

async function deleteEmployee300041() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db()
    const employeesCollection = db.collection('employees')
    const companiesCollection = db.collection('companies')
    const locationsCollection = db.collection('locations')
    
    // Find ICICI Bank company
    const iciciCompany = await companiesCollection.findOne({ name: /ICICI/i })
    if (!iciciCompany) {
      console.error('❌ ICICI Bank company not found')
      process.exit(1)
    }
    
    console.log(`✅ Found company: ${iciciCompany.name} (ID: ${iciciCompany.id})`)
    
    // Find Mumbai location for ICICI
    const mumbaiLocation = await locationsCollection.findOne({ 
      companyId: iciciCompany._id,
      $or: [
        { name: /Mumbai/i },
        { city: /Mumbai/i }
      ]
    })
    
    if (!mumbaiLocation) {
      console.warn('⚠️  Mumbai location not found, but continuing with employee search...')
    } else {
      console.log(`✅ Found Mumbai location: ${mumbaiLocation.name} (ID: ${mumbaiLocation.id})`)
    }
    
    // Find employee with employeeId = 300041
    // Try multiple search patterns
    let employee = await employeesCollection.findOne({ employeeId: '300041' })
    
    if (!employee) {
      // Try searching by id field
      employee = await employeesCollection.findOne({ id: '300041' })
    }
    
    if (!employee) {
      // Try searching as number
      employee = await employeesCollection.findOne({ employeeId: 300041 })
    }
    
    if (!employee) {
      // List all employees to help debug
      console.error('❌ Employee 300041 not found in database')
      console.log('\n📋 Searching for similar employee IDs...')
      const similarEmployees = await employeesCollection.find({ 
        $or: [
          { employeeId: /30004/i },
          { id: /30004/i }
        ]
      }).limit(10).toArray()
      
      if (similarEmployees.length > 0) {
        console.log(`   Found ${similarEmployees.length} employees with similar IDs:`)
        similarEmployees.forEach(emp => {
          console.log(`   - Employee ID: ${emp.employeeId}, ID: ${emp.id}`)
        })
      }
      
      process.exit(1)
    }
    
    // Check if employee belongs to ICICI
    const empCompany = await companiesCollection.findOne({ _id: employee.companyId })
    if (!empCompany || empCompany._id.toString() !== iciciCompany._id.toString()) {
      console.error(`❌ Employee 300041 belongs to company: ${empCompany?.name || 'Unknown'} (not ICICI Bank)`)
      console.error('   But proceeding with deletion as requested...')
    } else {
      console.log(`✅ Employee belongs to ICICI Bank`)
    }
    
    // Decrypt employee info for display
    let firstName = employee.firstName
    let lastName = employee.lastName
    let email = employee.email
    let location = employee.location
    
    if (firstName && typeof firstName === 'string' && firstName.includes(':')) {
      firstName = decrypt(firstName)
    }
    if (lastName && typeof lastName === 'string' && lastName.includes(':')) {
      lastName = decrypt(lastName)
    }
    if (email && typeof email === 'string' && email.includes(':')) {
      email = decrypt(email)
    }
    if (location && typeof location === 'string' && location.includes(':')) {
      location = decrypt(location)
    }
    
    console.log('\n📋 Employee Details:')
    console.log(`   ID: ${employee.id}`)
    console.log(`   Employee ID: ${employee.employeeId}`)
    console.log(`   Name: ${firstName} ${lastName}`)
    console.log(`   Email: ${email}`)
    console.log(`   Location: ${location}`)
    console.log(`   Designation: ${employee.designation}`)
    console.log(`   Status: ${employee.status}`)
    
    // Verify location matches Mumbai
    if (mumbaiLocation && employee.locationId) {
      const locationMatches = employee.locationId.toString() === mumbaiLocation._id.toString()
      if (!locationMatches) {
        console.warn(`⚠️  Warning: Employee locationId (${employee.locationId}) does not match Mumbai location (${mumbaiLocation._id})`)
        console.warn('   But proceeding with deletion as requested...')
      }
    }
    
    // Confirm deletion
    console.log('\n⚠️  WARNING: This will permanently delete the employee record!')
    console.log('   Press Ctrl+C to cancel, or wait 5 seconds to proceed...')
    
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Delete the employee
    const result = await employeesCollection.deleteOne({ id: employee.id })
    
    if (result.deletedCount === 1) {
      console.log('\n✅ Successfully deleted employee 300041')
      console.log(`   Deleted record with ID: ${employee.id}`)
      
      // Also check if there are any related records that should be cleaned up
      const companyAdminsCollection = db.collection('companyadmins')
      const adminCount = await companyAdminsCollection.countDocuments({ employeeId: employee._id })
      if (adminCount > 0) {
        console.log(`⚠️  Warning: Found ${adminCount} company admin record(s) associated with this employee`)
        console.log('   You may want to clean these up manually if needed')
      }
      
      const locationAdminsCollection = db.collection('locationadmins')
      const locationAdminCount = await locationAdminsCollection.countDocuments({ employeeId: employee._id })
      if (locationAdminCount > 0) {
        console.log(`⚠️  Warning: Found ${locationAdminCount} location admin record(s) associated with this employee`)
        console.log('   You may want to clean these up manually if needed')
      }
      
    } else {
      console.error('\n❌ Failed to delete employee')
      console.error(`   Delete result:`, result)
    }
    
  } catch (error) {
    console.error('\n❌ Error deleting employee:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
deleteEmployee300041()
  .then(() => {
    console.log('\n✅ Script completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
