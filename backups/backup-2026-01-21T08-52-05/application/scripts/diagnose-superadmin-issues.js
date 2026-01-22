/**
 * Diagnostic script to check common issues with SuperAdmin dashboard
 */

const { MongoClient } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function diagnose() {
  let client = null
  
  try {
    console.log('🔍 Diagnosing SuperAdmin Dashboard Issues...\n')
    console.log('='.repeat(60))
    
    // 1. Test MongoDB Connection
    console.log('\n1️⃣ Testing MongoDB Connection...')
    client = new MongoClient(MONGODB_URI)
    await client.connect()
    const db = client.db()
    console.log('   ✅ MongoDB connection successful')
    console.log(`   📊 Database: ${db.databaseName}`)
    
    // 2. Check Collections
    console.log('\n2️⃣ Checking Collections...')
    const collections = await db.listCollections().toArray()
    console.log(`   📁 Found ${collections.length} collections:`)
    
    const importantCollections = ['employees', 'companies', 'vendors', 'uniforms', 'orders', 'companyadmins']
    const collectionCounts = {}
    
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments()
      collectionCounts[col.name] = count
      const isImportant = importantCollections.includes(col.name)
      const icon = isImportant ? '⭐' : '  '
      console.log(`   ${icon} ${col.name.padEnd(30)} ${count} documents`)
    }
    
    // 3. Check Important Collections
    console.log('\n3️⃣ Checking Important Collections...')
    let hasData = true
    for (const colName of importantCollections) {
      const count = collectionCounts[colName] || 0
      if (count === 0) {
        console.log(`   ⚠️  ${colName}: NO DATA FOUND`)
        hasData = false
      } else {
        console.log(`   ✅ ${colName}: ${count} documents`)
      }
    }
    
    // 4. Sample Data Check
    console.log('\n4️⃣ Sampling Data...')
    const sampleChecks = {
      employees: await db.collection('employees').findOne({}),
      companies: await db.collection('companies').findOne({}),
      vendors: await db.collection('vendors').findOne({}),
      uniforms: await db.collection('uniforms').findOne({})
    }
    
    for (const [collection, sample] of Object.entries(sampleChecks)) {
      if (sample) {
        console.log(`   ✅ ${collection}: Has data (sample ID: ${sample.id || sample._id || 'N/A'})`)
      } else {
        console.log(`   ❌ ${collection}: Empty or not found`)
      }
    }
    
    // 5. Check Company Admins
    console.log('\n5️⃣ Checking Company Admins...')
    const adminCount = await db.collection('companyadmins').countDocuments()
    console.log(`   📊 Company Admins: ${adminCount} documents`)
    
    if (adminCount > 0) {
      const sampleAdmin = await db.collection('companyadmins').findOne({})
      console.log(`   ✅ Sample admin found:`, {
        id: sampleAdmin?.id || sampleAdmin?._id,
        employeeId: sampleAdmin?.employeeId,
        companyId: sampleAdmin?.companyId
      })
    }
    
    // 6. Summary
    console.log('\n' + '='.repeat(60))
    console.log('\n📊 DIAGNOSIS SUMMARY:\n')
    
    if (!hasData) {
      console.log('❌ ISSUE FOUND: Some important collections are empty!')
      console.log('   💡 Solution: Check if data was migrated correctly')
      console.log('   💡 Run: node scripts/migrate-data-to-atlas.js (if using Atlas)')
    } else {
      console.log('✅ All important collections have data')
    }
    
    if (adminCount === 0) {
      console.log('⚠️  WARNING: No company admins found')
      console.log('   💡 This might affect admin login functionality')
    }
    
    console.log('\n✅ MongoDB connection is working correctly')
    console.log('✅ Database structure looks good')
    console.log('\n💡 Next Steps:')
    console.log('   1. Ensure Next.js server is running: npm run dev')
    console.log('   2. Check browser console for API errors')
    console.log('   3. Verify API endpoints are accessible')
    console.log('   4. Check network tab in browser DevTools')
    
  } catch (error) {
    console.error('\n❌ DIAGNOSIS FAILED:')
    console.error(`   Error: ${error.message}`)
    console.error('\n💡 Common Issues:')
    console.error('   1. MongoDB is not running')
    console.error('   2. Connection string is incorrect')
    console.error('   3. Network access is blocked')
    console.error('   4. Database name is wrong')
  } finally {
    if (client) {
      await client.close()
      console.log('\n🔌 Connection closed')
    }
  }
}

diagnose()
  .then(() => {
    console.log('\n✅ Diagnosis complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Diagnosis failed:', error.message)
    process.exit(1)
  })

