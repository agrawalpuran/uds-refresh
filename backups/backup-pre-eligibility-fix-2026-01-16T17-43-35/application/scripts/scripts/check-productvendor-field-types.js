/**
 * Check Field Types in productvendors Collection
 * 
 * This script checks the actual BSON types of vendorId and productId fields
 * to verify if they are ObjectIds or strings.
 */

// Try to load dotenv if available (optional)
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // dotenv not available, will use environment variables directly
}

const mongoose = require('mongoose')

// MongoDB connection
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

async function checkFieldTypes() {
  const db = await connectDB()
  const collection = db.collection('productvendors')
  
  console.log('\n🔍 Checking field types in productvendors collection')
  console.log('─'.repeat(60))
  
  try {
    // Get all documents
    const allDocs = await collection.find({}).toArray()
    console.log(`📋 Found ${allDocs.length} total documents\n`)
    
    if (allDocs.length === 0) {
      console.log('⚠️  No documents found in collection')
      return
    }
    
    // Check each document
    let objectIdCount = { vendorId: 0, productId: 0 }
    let stringCount = { vendorId: 0, productId: 0 }
    let otherCount = { vendorId: 0, productId: 0 }
    let nullCount = { vendorId: 0, productId: 0 }
    
    console.log('📊 Analyzing field types:\n')
    
    allDocs.forEach((doc, index) => {
      console.log(`Document ${index + 1} (_id: ${doc._id}):`)
      
      // Check vendorId
      if (doc.vendorId === null || doc.vendorId === undefined) {
        nullCount.vendorId++
        console.log(`  vendorId: null/undefined`)
      } else if (doc.vendorId instanceof mongoose.Types.ObjectId) {
        objectIdCount.vendorId++
        console.log(`  vendorId: ObjectId("${doc.vendorId.toString()}")`)
      } else if (typeof doc.vendorId === 'object' && doc.vendorId.constructor && doc.vendorId.constructor.name === 'ObjectId') {
        objectIdCount.vendorId++
        console.log(`  vendorId: ObjectId (via constructor)("${doc.vendorId.toString()}")`)
      } else if (typeof doc.vendorId === 'string') {
        stringCount.vendorId++
        console.log(`  vendorId: String("${doc.vendorId}")`)
      } else {
        otherCount.vendorId++
        console.log(`  vendorId: ${typeof doc.vendorId} (${doc.vendorId})`)
      }
      
      // Check productId
      if (doc.productId === null || doc.productId === undefined) {
        nullCount.productId++
        console.log(`  productId: null/undefined`)
      } else if (doc.productId instanceof mongoose.Types.ObjectId) {
        objectIdCount.productId++
        console.log(`  productId: ObjectId("${doc.productId.toString()}")`)
      } else if (typeof doc.productId === 'object' && doc.productId.constructor && doc.productId.constructor.name === 'ObjectId') {
        objectIdCount.productId++
        console.log(`  productId: ObjectId (via constructor)("${doc.productId.toString()}")`)
      } else if (typeof doc.productId === 'string') {
        stringCount.productId++
        console.log(`  productId: String("${doc.productId}")`)
      } else {
        otherCount.productId++
        console.log(`  productId: ${typeof doc.productId} (${doc.productId})`)
      }
      
      console.log('')
    })
    
    // Summary
    console.log('─'.repeat(60))
    console.log('📊 Summary:')
    console.log(`\nvendorId field types:`)
    console.log(`  ✅ Strings: ${stringCount.vendorId}`)
    console.log(`  ⚠️  ObjectIds: ${objectIdCount.vendorId}`)
    console.log(`  ❓ Other types: ${otherCount.vendorId}`)
    console.log(`  ⚪ Null/undefined: ${nullCount.vendorId}`)
    
    console.log(`\nproductId field types:`)
    console.log(`  ✅ Strings: ${stringCount.productId}`)
    console.log(`  ⚠️  ObjectIds: ${objectIdCount.productId}`)
    console.log(`  ❓ Other types: ${otherCount.productId}`)
    console.log(`  ⚪ Null/undefined: ${nullCount.productId}`)
    
    // Check using MongoDB's $type operator
    console.log('\n─'.repeat(60))
    console.log('🔍 MongoDB BSON Type Check (using $type operator):')
    
    const objectIdVendorIds = await collection.countDocuments({
      vendorId: { $type: 'objectId' }
    })
    const stringVendorIds = await collection.countDocuments({
      vendorId: { $type: 'string' }
    })
    
    const objectIdProductIds = await collection.countDocuments({
      productId: { $type: 'objectId' }
    })
    const stringProductIds = await collection.countDocuments({
      productId: { $type: 'string' }
    })
    
    console.log(`\nvendorId BSON types:`)
    console.log(`  ObjectId: ${objectIdVendorIds}`)
    console.log(`  String: ${stringVendorIds}`)
    
    console.log(`\nproductId BSON types:`)
    console.log(`  ObjectId: ${objectIdProductIds}`)
    console.log(`  String: ${stringProductIds}`)
    
    // Final verdict
    console.log('\n─'.repeat(60))
    if (objectIdCount.vendorId > 0 || objectIdCount.productId > 0 || 
        objectIdVendorIds > 0 || objectIdProductIds > 0) {
      console.log('⚠️  VERDICT: Some fields are still ObjectIds!')
      console.log('   Migration may be needed.')
    } else {
      console.log('✅ VERDICT: All fields are strings!')
      console.log('   No migration needed.')
    }
    
  } catch (error) {
    console.error('\n❌ Error checking field types:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run check
checkFieldTypes()
  .then(() => {
    console.log('\n✨ Script finished')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n💥 Script failed:', error)
    process.exit(1)
  })
