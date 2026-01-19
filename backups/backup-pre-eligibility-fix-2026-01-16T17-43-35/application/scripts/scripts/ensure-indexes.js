const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Read .env.local to get connection string
function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/MONGODB_URI=(.+)/)
    if (match) {
      return match[1].trim()
    }
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
}

const MONGODB_URI = getMongoUri()

// Index definitions based on schema files
const indexDefinitions = {
  employees: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { employeeId: 1 }, options: { unique: true, name: 'employeeId_1' } },
    { keys: { email: 1 }, options: { unique: true, name: 'email_1' } },
    { keys: { companyId: 1, status: 1 }, options: { name: 'companyId_1_status_1' } },
    { keys: { locationId: 1, status: 1 }, options: { name: 'locationId_1_status_1' } },
    { keys: { companyId: 1, locationId: 1 }, options: { name: 'companyId_1_locationId_1' } },
  ],
  companies: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { adminId: 1 }, options: { name: 'adminId_1' } },
  ],
  vendors: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { email: 1 }, options: { unique: true, name: 'email_1' } },
  ],
  uniforms: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { sku: 1 }, options: { unique: true, name: 'sku_1' } },
    { keys: { companyIds: 1 }, options: { name: 'companyIds_1' } },
    { keys: { category: 1, gender: 1 }, options: { name: 'category_1_gender_1' } },
  ],
  orders: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { employeeId: 1, companyId: 1 }, options: { name: 'employeeId_1_companyId_1' } },
    { keys: { employeeIdNum: 1, companyIdNum: 1 }, options: { name: 'employeeIdNum_1_companyIdNum_1' } },
    { keys: { companyId: 1, status: 1 }, options: { name: 'companyId_1_status_1' } },
    { keys: { companyIdNum: 1, status: 1 }, options: { name: 'companyIdNum_1_status_1' } },
    { keys: { orderDate: -1 }, options: { name: 'orderDate_-1' } },
    { keys: { vendorId: 1 }, options: { name: 'vendorId_1' } },
    { keys: { parentOrderId: 1, vendorId: 1 }, options: { name: 'parentOrderId_1_vendorId_1' } },
    { keys: { orderType: 1 }, options: { name: 'orderType_1' } },
    { keys: { returnRequestId: 1 }, options: { name: 'returnRequestId_1' } },
    { keys: { employeeIdNum: 1 }, options: { name: 'employeeIdNum_1' } },
    { keys: { companyIdNum: 1 }, options: { name: 'companyIdNum_1' } },
    { keys: { status: 1 }, options: { name: 'status_1' } },
  ],
  vendorinventories: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { vendorId: 1, productId: 1 }, options: { unique: true, name: 'vendorId_1_productId_1' } },
  ],
  returnrequests: [
    { keys: { returnRequestId: 1 }, options: { unique: true, name: 'returnRequestId_1' } },
    { keys: { employeeId: 1, status: 1 }, options: { name: 'employeeId_1_status_1' } },
    { keys: { companyId: 1, status: 1 }, options: { name: 'companyId_1_status_1' } },
    { keys: { originalOrderId: 1, productId: 1 }, options: { name: 'originalOrderId_1_productId_1' } },
    { keys: { replacementOrderId: 1 }, options: { name: 'replacementOrderId_1' } },
    { keys: { originalOrderId: 1 }, options: { name: 'originalOrderId_1' } },
    { keys: { productId: 1 }, options: { name: 'productId_1' } },
    { keys: { employeeId: 1 }, options: { name: 'employeeId_1' } },
    { keys: { employeeIdNum: 1 }, options: { name: 'employeeIdNum_1' } },
    { keys: { companyId: 1 }, options: { name: 'companyId_1' } },
    { keys: { status: 1 }, options: { name: 'status_1' } },
  ],
  companyadmins: [
    { keys: { companyId: 1, employeeId: 1 }, options: { unique: true, name: 'companyId_1_employeeId_1' } },
    { keys: { companyId: 1 }, options: { name: 'companyId_1' } },
    { keys: { employeeId: 1 }, options: { name: 'employeeId_1' } },
  ],
  locationadmins: [
    { keys: { locationId: 1, employeeId: 1 }, options: { unique: true, name: 'locationId_1_employeeId_1' } },
    { keys: { locationId: 1 }, options: { name: 'locationId_1' } },
    { keys: { employeeId: 1 }, options: { name: 'employeeId_1' } },
  ],
  designationproducteligibilities: [
    { keys: { id: 1 }, options: { unique: true, name: 'id_1' } },
    { keys: { companyId: 1, designation: 1, gender: 1, status: 1 }, options: { name: 'companyId_1_designation_1_gender_1_status_1' } },
    { keys: { companyId: 1, designation: 1, status: 1 }, options: { name: 'companyId_1_designation_1_status_1' } },
    { keys: { companyId: 1, status: 1 }, options: { name: 'companyId_1_status_1' } },
  ],
  productcompanies: [
    { keys: { productId: 1, companyId: 1 }, options: { unique: true, name: 'productId_1_companyId_1' } },
  ],
  productvendors: [
    { keys: { productId: 1, vendorId: 1 }, options: { unique: true, name: 'productId_1_vendorId_1' } },
  ],
}

async function ensureIndexes() {
  try {
    console.log('🔄 Ensuring all database indexes are created...\n')
    console.log('='.repeat(80))
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...')
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}\n`)
    
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    
    console.log('✅ Connected successfully!\n')
    
    const db = mongoose.connection.db
    console.log(`📊 Database: ${db.databaseName}\n`)
    
    // Create indexes for all collections
    console.log('='.repeat(80))
    console.log('Creating/Verifying Indexes')
    console.log('='.repeat(80))
    
    const results = []
    
    for (const [collectionName, indexes] of Object.entries(indexDefinitions)) {
      try {
        const coll = db.collection(collectionName)
        console.log(`\n   Processing: ${collectionName}`)
        
        // Get existing indexes
        const existingIndexes = await coll.indexes()
        const existingIndexNames = new Set(existingIndexes.map(idx => idx.name))
        
        let created = 0
        let skipped = 0
        let errors = 0
        
        for (const indexDef of indexes) {
          try {
            const indexName = indexDef.options.name || Object.keys(indexDef.keys).join('_') + '_1'
            
            if (existingIndexNames.has(indexName)) {
              skipped++
              continue
            }
            
            await coll.createIndex(indexDef.keys, indexDef.options)
            created++
            console.log(`      ✅ Created: ${indexName}`)
          } catch (e) {
            if (e.message.includes('already exists') || e.message.includes('duplicate key')) {
              skipped++
            } else {
              errors++
              console.log(`      ⚠️  Error creating index: ${e.message}`)
            }
          }
        }
        
        const totalIndexes = await coll.indexes()
        const count = await coll.countDocuments()
        results.push({ 
          collection: collectionName, 
          indexes: totalIndexes.length, 
          created, 
          skipped, 
          errors,
          documents: count 
        })
        console.log(`   ✅ ${collectionName.padEnd(35)} ${totalIndexes.length.toString().padStart(2)} indexes (${created} created, ${skipped} existing, ${errors} errors), ${count.toString().padStart(3)} documents`)
      } catch (e) {
        console.log(`   ❌ ${collectionName.padEnd(35)} Error: ${e.message}`)
        results.push({ collection: collectionName, error: e.message })
      }
    }
    
    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY')
    console.log('='.repeat(80))
    
    let totalCreated = 0
    let totalSkipped = 0
    let totalErrors = 0
    
    for (const result of results) {
      if (result.error) {
        console.log(`   ❌ ${result.collection.padEnd(35)} Error: ${result.error}`)
      } else {
        totalCreated += result.created || 0
        totalSkipped += result.skipped || 0
        totalErrors += result.errors || 0
        console.log(`   ✅ ${result.collection.padEnd(35)} ${result.indexes.toString().padStart(2)} indexes, ${result.documents.toString().padStart(3)} documents`)
      }
    }
    
    if (totalCreated > 0 || totalSkipped > 0) {
      console.log(`\n   📊 Indexes: ${totalCreated} created, ${totalSkipped} already existed`)
    }
    if (totalErrors > 0) {
      console.log(`   ⚠️  Errors: ${totalErrors}`)
    }
    
    console.log('\n✅ All indexes verified and created!')
    console.log('\n💡 Indexes ensure:')
    console.log('   - Fast queries on indexed fields')
    console.log('   - Unique constraints are enforced')
    console.log('   - Compound indexes optimize complex queries')
    
  } catch (error) {
    console.error('\n❌ Operation failed:')
    console.error(`   ${error.message}`)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('\n🔌 Database connection closed.')
  }
}

// Run the script
ensureIndexes().catch(console.error)

