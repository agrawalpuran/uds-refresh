/**
 * Script to fix Diageo admin record - convert companyId and employeeId from strings to ObjectIds
 * 
 * Usage: node scripts/fix-diageo-admin-objectids.js
 */

const { MongoClient, ObjectId } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function fixDiageoAdminObjectIds() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('Connecting to MongoDB...')
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Find the Diageo admin record with string IDs
    console.log('🔍 Finding Diageo admin record...')
    const adminRecord = await db.collection('companyadmins').findOne({
      _id: new ObjectId('694abf46758861bf21a4144e')
    })

    if (!adminRecord) {
      console.error('❌ Admin record not found')
      return
    }

    console.log('Current admin record:')
    console.log(`  _id: ${adminRecord._id}`)
    console.log(`  companyId: ${adminRecord.companyId} (type: ${typeof adminRecord.companyId})`)
    console.log(`  employeeId: ${adminRecord.employeeId} (type: ${typeof adminRecord.employeeId})`)
    console.log('')

    // Check if they're strings
    const companyIdIsString = typeof adminRecord.companyId === 'string'
    const employeeIdIsString = typeof adminRecord.employeeId === 'string'

    if (!companyIdIsString && !employeeIdIsString) {
      console.log('✅ Both IDs are already ObjectIds - no fix needed!')
      return
    }

    console.log('⚠️ Found string IDs - converting to ObjectIds...')
    console.log('')

    // Convert to ObjectIds
    const companyIdObjectId = companyIdIsString 
      ? new ObjectId(adminRecord.companyId)
      : adminRecord.companyId
    
    const employeeIdObjectId = employeeIdIsString
      ? new ObjectId(adminRecord.employeeId)
      : adminRecord.employeeId

    console.log('Converted IDs:')
    console.log(`  companyId: ${companyIdObjectId} (ObjectId)`)
    console.log(`  employeeId: ${employeeIdObjectId} (ObjectId)`)
    console.log('')

    // Update the record
    console.log('📝 Updating admin record...')
    const updateResult = await db.collection('companyadmins').updateOne(
      { _id: adminRecord._id },
      {
        $set: {
          companyId: companyIdObjectId,
          employeeId: employeeIdObjectId,
          updatedAt: new Date()
        }
      }
    )

    if (updateResult.modifiedCount === 0) {
      console.error('❌ Failed to update admin record')
      return
    }

    console.log('✅ Admin record updated!')
    console.log('')

    // Verify the update
    console.log('🔍 Verifying update...')
    const verifyRecord = await db.collection('companyadmins').findOne({
      _id: adminRecord._id
    })

    console.log('Updated admin record:')
    console.log(`  _id: ${verifyRecord._id}`)
    console.log(`  companyId: ${verifyRecord.companyId} (type: ${verifyRecord.companyId instanceof ObjectId ? 'ObjectId' : typeof verifyRecord.companyId})`)
    console.log(`  employeeId: ${verifyRecord.employeeId} (type: ${verifyRecord.employeeId instanceof ObjectId ? 'ObjectId' : typeof verifyRecord.employeeId})`)
    console.log('')

    if (verifyRecord.companyId instanceof ObjectId && verifyRecord.employeeId instanceof ObjectId) {
      console.log('✅ SUCCESS: Both IDs are now ObjectIds!')
      console.log('')
      console.log('The admin login should now work correctly.')
    } else {
      console.error('❌ ERROR: IDs are still not ObjectIds!')
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

// Run the script
fixDiageoAdminObjectIds()

