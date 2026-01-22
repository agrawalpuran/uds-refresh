/**
 * Check productvendor ID Mapping
 * 
 * This script checks if productId and vendorId in productvendors collection
 * need to be mapped from ObjectId hex strings to 6-digit numeric IDs.
 */

// Try to load dotenv if available (optional)
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not available
}

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    })
    console.log('✅ Connected to MongoDB')
    return mongoose.connection.db
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

async function checkIdMapping() {
  const db = await connectDB()
  const productvendorsCollection = db.collection('productvendors')
  const uniformsCollection = db.collection('uniforms')
  const vendorsCollection = db.collection('vendors')
  
  console.log('\n🔍 Checking ID format in productvendors collection')
  console.log('─'.repeat(60))
  
  try {
    const allDocs = await productvendorsCollection.find({}).toArray()
    console.log(`📋 Found ${allDocs.length} documents\n`)
    
    if (allDocs.length === 0) {
      console.log('⚠️  No documents found')
      return
    }
    
    let needsMapping = 0
    let correctFormat = 0
    
    for (const doc of allDocs) {
      const vendorId = doc.vendorId
      const productId = doc.productId
      
      const isVendorIdHex = typeof vendorId === 'string' && /^[0-9a-fA-F]{24}$/.test(vendorId)
      const isProductIdHex = typeof productId === 'string' && /^[0-9a-fA-F]{24}$/.test(productId)
      const isVendorIdNumeric = typeof vendorId === 'string' && /^\d{6}$/.test(vendorId)
      const isProductIdNumeric = typeof productId === 'string' && /^\d{6}$/.test(productId)
      
      console.log(`Document ${doc._id}:`)
      console.log(`  vendorId: "${vendorId}"`)
      console.log(`    - Type: ${typeof vendorId}`)
      console.log(`    - Is 24-char hex (ObjectId format): ${isVendorIdHex}`)
      console.log(`    - Is 6-digit numeric: ${isVendorIdNumeric}`)
      
      console.log(`  productId: "${productId}"`)
      console.log(`    - Type: ${typeof productId}`)
      console.log(`    - Is 24-char hex (ObjectId format): ${isProductIdHex}`)
      console.log(`    - Is 6-digit numeric: ${isProductIdNumeric}`)
      
      if (isVendorIdHex || isProductIdHex) {
        needsMapping++
        console.log(`  ⚠️  NEEDS MAPPING: Contains ObjectId hex strings`)
        
        // Try to find the actual vendor/product by _id to get their numeric ID
        if (isVendorIdHex && mongoose.Types.ObjectId.isValid(vendorId)) {
          const vendor = await vendorsCollection.findOne({ _id: new mongoose.Types.ObjectId(vendorId) })
          if (vendor) {
            console.log(`    → Found vendor: id="${vendor.id}", name="${vendor.name || 'N/A'}"`)
          } else {
            console.log(`    → Vendor not found with _id: ${vendorId}`)
          }
        }
        
        if (isProductIdHex && mongoose.Types.ObjectId.isValid(productId)) {
          const product = await uniformsCollection.findOne({ _id: new mongoose.Types.ObjectId(productId) })
          if (product) {
            console.log(`    → Found product: id="${product.id}", name="${product.name || 'N/A'}"`)
          } else {
            console.log(`    → Product not found with _id: ${productId}`)
          }
        }
      } else if (isVendorIdNumeric && isProductIdNumeric) {
        correctFormat++
        console.log(`  ✅ CORRECT FORMAT: Both IDs are 6-digit numeric`)
      } else {
        console.log(`  ❓ UNKNOWN FORMAT`)
      }
      
      console.log('')
    }
    
    console.log('─'.repeat(60))
    console.log('📊 Summary:')
    console.log(`   Documents with correct format (6-digit numeric): ${correctFormat}`)
    console.log(`   Documents needing mapping (ObjectId hex strings): ${needsMapping}`)
    
    if (needsMapping > 0) {
      console.log('\n⚠️  VERDICT: Some documents contain ObjectId hex strings!')
      console.log('   These need to be mapped to 6-digit numeric IDs.')
      console.log('   The mapping requires looking up the actual vendor/product records.')
    } else {
      console.log('\n✅ VERDICT: All documents are in correct format!')
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

checkIdMapping()
  .then(() => {
    console.log('\n✨ Script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })
