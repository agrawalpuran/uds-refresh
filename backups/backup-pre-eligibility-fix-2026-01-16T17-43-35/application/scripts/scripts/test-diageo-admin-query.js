/**
 * Test script to verify Diageo admin record can be queried correctly
 * This tests if the ObjectId query works for the admin record
 */

const { MongoClient, ObjectId } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function testDiageoAdminQuery() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('DIAGEO ADMIN QUERY TEST')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Step 1: Find the employee
    console.log('🔍 Step 1: Finding employee Swapnil.jain@diageo.com...')
    const employee = await db.collection('employees').findOne({
      id: '300043'
    })

    if (!employee) {
      console.error('❌ Employee not found')
      return
    }

    console.log('✅ Employee found:')
    console.log(`   Employee ID: ${employee.id}`)
    console.log(`   Employee _id: ${employee._id}`)
    console.log(`   Employee _id type: ${employee._id instanceof ObjectId ? 'ObjectId' : typeof employee._id}`)
    console.log('')

    // Step 2: Convert to ObjectId for query
    const employeeObjectId = employee._id instanceof ObjectId
      ? employee._id
      : new ObjectId(employee._id.toString())
    
    console.log('🔍 Step 2: Querying admin record with ObjectId...')
    console.log(`   Querying with employeeId: ${employeeObjectId} (ObjectId)`)
    console.log('')

    // Method 1: Direct ObjectId query (what getCompanyByAdminEmail uses)
    const adminRecord1 = await db.collection('companyadmins').findOne({
      employeeId: employeeObjectId
    })

    console.log('Method 1: Direct ObjectId query')
    if (adminRecord1) {
      console.log('✅ Found admin record!')
      console.log(`   _id: ${adminRecord1._id}`)
      console.log(`   companyId: ${adminRecord1.companyId} (type: ${adminRecord1.companyId instanceof ObjectId ? 'ObjectId' : typeof adminRecord1.companyId})`)
      console.log(`   employeeId: ${adminRecord1.employeeId} (type: ${adminRecord1.employeeId instanceof ObjectId ? 'ObjectId' : typeof adminRecord1.employeeId})`)
    } else {
      console.log('❌ Admin record NOT found with ObjectId query')
    }
    console.log('')

    // Method 2: String comparison query (fallback)
    const adminRecord2 = await db.collection('companyadmins').findOne({
      employeeId: employeeObjectId.toString()
    })

    console.log('Method 2: String comparison query')
    if (adminRecord2) {
      console.log('✅ Found admin record!')
      console.log(`   _id: ${adminRecord2._id}`)
      console.log(`   companyId: ${adminRecord2.companyId} (type: ${adminRecord2.companyId instanceof ObjectId ? 'ObjectId' : typeof adminRecord2.companyId})`)
      console.log(`   employeeId: ${adminRecord2.employeeId} (type: ${adminRecord2.employeeId instanceof ObjectId ? 'ObjectId' : typeof adminRecord2.employeeId})`)
    } else {
      console.log('❌ Admin record NOT found with string query')
    }
    console.log('')

    // Method 3: Find all and match
    console.log('Method 3: Finding all admins and matching...')
    const allAdmins = await db.collection('companyadmins').find({}).toArray()
    console.log(`   Found ${allAdmins.length} total admin records`)
    
    const matchingAdmin = allAdmins.find(a => {
      if (!a.employeeId) return false
      const aEmployeeId = a.employeeId instanceof ObjectId ? a.employeeId : new ObjectId(a.employeeId.toString())
      return aEmployeeId.toString() === employeeObjectId.toString()
    })

    if (matchingAdmin) {
      console.log('✅ Found matching admin record!')
      console.log(`   _id: ${matchingAdmin._id}`)
      console.log(`   companyId: ${matchingAdmin.companyId} (type: ${matchingAdmin.companyId instanceof ObjectId ? 'ObjectId' : typeof matchingAdmin.companyId})`)
      console.log(`   employeeId: ${matchingAdmin.employeeId} (type: ${matchingAdmin.employeeId instanceof ObjectId ? 'ObjectId' : typeof matchingAdmin.employeeId})`)
    } else {
      console.log('❌ No matching admin record found')
    }
    console.log('')

    // Summary
    console.log('='.repeat(80))
    if (adminRecord1) {
      console.log('✅ SUCCESS: Direct ObjectId query works!')
      console.log('   Login should work correctly.')
    } else if (adminRecord2 || matchingAdmin) {
      console.log('⚠️ WARNING: Direct ObjectId query failed, but string/fallback works')
      console.log('   This indicates the employeeId might be stored as a string in the database')
      console.log('   The getCompanyByAdminEmail function has fallback logic, so login should still work')
    } else {
      console.log('❌ ERROR: No admin record found with any method!')
      console.log('   Login will fail - admin record is missing or employeeId mismatch')
    }
    console.log('='.repeat(80))

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
  } finally {
    await client.close()
    console.log('\nDatabase connection closed')
  }
}

// Run the test
testDiageoAdminQuery()

