/**
 * Fix Location Admin for Anjali Singh - ICICI Bank Chennai Branch
 * This script will:
 * 1. Find Anjali Singh (employeeId: 300032)
 * 2. Find Chennai location for ICICI Bank
 * 3. Set Anjali Singh as the location admin
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

async function fixLocationAdmin() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const companiesCollection = db.collection('companies')
    const locationsCollection = db.collection('locations')
    const employeesCollection = db.collection('employees')

    // Step 1: Find ICICI company
    const company = await companiesCollection.findOne({ 
      $or: [{ id: '100004' }, { name: { $regex: /icici/i } }] 
    })
    if (!company) {
      throw new Error('ICICI Bank company not found')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})\n`)

    // Step 2: Find Anjali Singh (employeeId: 300032)
    const anjali = await employeesCollection.findOne({
      employeeId: '300032'
    })
    
    if (!anjali) {
      throw new Error('Anjali Singh (employeeId: 300032) not found')
    }
    console.log(`✅ Found employee: ${anjali.employeeId} (_id: ${anjali._id})\n`)

    // Step 3: Find Chennai location
    const chennaiLocation = await locationsCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })

    if (!chennaiLocation) {
      throw new Error('Chennai location not found for ICICI Bank')
    }
    console.log(`✅ Found location: ${chennaiLocation.name} (_id: ${chennaiLocation._id})\n`)

    // Step 4: Check current admin
    if (chennaiLocation.adminId) {
      const currentAdminId = chennaiLocation.adminId.toString()
      const anjaliId = anjali._id.toString()
      
      if (currentAdminId === anjaliId) {
        console.log('✅ Anjali Singh is already set as location admin')
        console.log(`   Location: ${chennaiLocation.name}`)
        console.log(`   Admin ID: ${anjaliId}`)
        console.log(`   Employee ID: ${anjali.employeeId}`)
        await mongoose.disconnect()
        return
      } else {
        console.log(`⚠️  Current admin ID: ${currentAdminId}`)
        console.log(`   Anjali ID: ${anjaliId}`)
        console.log(`   They don't match - will update...\n`)
      }
    } else {
      console.log('⚠️  No admin currently set for Chennai location\n')
    }

    // Step 5: Update location with Anjali as admin
    const updateResult = await locationsCollection.updateOne(
      { _id: chennaiLocation._id },
      { 
        $set: { 
          adminId: anjali._id 
        } 
      }
    )

    if (updateResult.modifiedCount === 1) {
      console.log('✅ Successfully set Anjali Singh as location admin!')
      console.log(`   Location: ${chennaiLocation.name}`)
      console.log(`   Admin Employee ID: ${anjali.employeeId}`)
      console.log(`   Admin MongoDB _id: ${anjali._id}`)
    } else {
      console.log('⚠️  Update may not have succeeded')
      console.log(`   Modified count: ${updateResult.modifiedCount}`)
    }

    // Step 6: Verify the update
    const updatedLocation = await locationsCollection.findOne({ _id: chennaiLocation._id })
    if (updatedLocation && updatedLocation.adminId) {
      const adminId = updatedLocation.adminId.toString()
      const anjaliId = anjali._id.toString()
      if (adminId === anjaliId) {
        console.log('\n✅ Verification: Location admin correctly set!')
      } else {
        console.log(`\n⚠️  Verification failed: Admin ID mismatch`)
        console.log(`   Expected: ${anjaliId}`)
        console.log(`   Found: ${adminId}`)
      }
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

fixLocationAdmin()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })
