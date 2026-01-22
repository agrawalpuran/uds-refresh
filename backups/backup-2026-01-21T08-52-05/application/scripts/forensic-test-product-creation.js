/**
 * FORENSIC TEST: Product Creation with Full Error Surfacing
 * 
 * This script attempts to create a product using the exact same path
 * as the application, with comprehensive error logging.
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

// Import the Uniform model
const Uniform = require('../lib/models/Uniform').default

// Import the createProduct function
const { createProduct } = require('../lib/db/data-access')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function testProductCreation() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║  FORENSIC TEST: PRODUCT CREATION                          ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')
    
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    // Test 1: Direct Mongoose create (same as createProduct function)
    console.log('════════════════════════════════════════════════════════════')
    console.log('TEST 1: Direct Uniform.create() with valid data')
    console.log('════════════════════════════════════════════════════════════\n')
    
    const testProductData = {
      id: '999998',
      name: 'Forensic Test Product',
      category: 'shirt',
      gender: 'unisex',
      sizes: ['S', 'M', 'L'],
      price: 100,
      image: '/test.jpg',
      sku: 'FORENSIC-TEST-001',
      stock: 0,
      companyIds: [],
    }
    
    console.log('Payload to create:')
    console.log(JSON.stringify(testProductData, null, 2))
    console.log()
    
    try {
      const directResult = await Uniform.create(testProductData)
      console.log('✅ Direct Uniform.create() succeeded')
      console.log('Created product:', JSON.stringify(directResult.toObject(), null, 2))
      
      // Verify it exists in database
      const verify = await Uniform.findOne({ id: '999998' })
      if (verify) {
        console.log('✅ Product verified in database')
      } else {
        console.log('❌ Product NOT found in database after creation!')
      }
      
      // Clean up
      await Uniform.deleteOne({ id: '999998' })
      console.log('✅ Test product cleaned up\n')
    } catch (err) {
      console.error('❌ Direct Uniform.create() FAILED')
      console.error('Error Name:', err.name)
      console.error('Error Message:', err.message)
      if (err.errors) {
        console.error('Validation Errors:')
        Object.keys(err.errors).forEach(key => {
          const error = err.errors[key]
          console.error(`  ${key}: ${error.message}`)
        })
      }
      if (err.keyPattern) {
        console.error('Duplicate Key Pattern:', JSON.stringify(err.keyPattern))
      }
      console.error('Stack:', err.stack)
    }
    
    // Test 2: Using createProduct function (application path)
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('TEST 2: Using createProduct() function (application path)')
    console.log('════════════════════════════════════════════════════════════\n')
    
    const appProductData = {
      name: 'Forensic Test Product via App',
      category: 'shirt',
      gender: 'unisex',
      sizes: ['S', 'M', 'L'],
      price: 200,
      image: '/test-app.jpg',
      sku: 'FORENSIC-TEST-002',
      stock: 0,
    }
    
    try {
      const appResult = await createProduct(appProductData)
      console.log('✅ createProduct() succeeded')
      console.log('Created product:', JSON.stringify(appResult, null, 2))
      
      // Verify it exists
      const verify = await Uniform.findOne({ id: appResult.id })
      if (verify) {
        console.log('✅ Product verified in database')
      } else {
        console.log('❌ Product NOT found in database after creation!')
      }
      
      // Clean up
      await Uniform.deleteOne({ id: appResult.id })
      console.log('✅ Test product cleaned up\n')
    } catch (err) {
      console.error('❌ createProduct() FAILED')
      console.error('Error Name:', err.name)
      console.error('Error Message:', err.message)
      if (err.errors) {
        console.error('Validation Errors:')
        Object.keys(err.errors).forEach(key => {
          const error = err.errors[key]
          console.error(`  ${key}: ${error.message}`)
        })
      }
      console.error('Stack:', err.stack)
    }
    
    // Test 3: Check for unique constraint violations
    console.log('\n════════════════════════════════════════════════════════════')
    console.log('TEST 3: Checking for existing products that might conflict')
    console.log('════════════════════════════════════════════════════════════\n')
    
    const existingProducts = await Uniform.find({}).limit(5).lean()
    console.log(`Found ${existingProducts.length} existing products (showing first 5):`)
    existingProducts.forEach((p, idx) => {
      console.log(`  ${idx + 1}. ID: ${p.id}, SKU: ${p.sku}, Name: ${p.name}`)
    })
    
    // Check for duplicate IDs or SKUs
    const allProducts = await Uniform.find({}).lean()
    const ids = allProducts.map(p => p.id)
    const skus = allProducts.map(p => p.sku)
    const duplicateIds = ids.filter((id, idx) => ids.indexOf(id) !== idx)
    const duplicateSkus = skus.filter((sku, idx) => skus.indexOf(sku) !== idx)
    
    if (duplicateIds.length > 0) {
      console.log(`\n⚠️  WARNING: Found duplicate IDs: ${duplicateIds.join(', ')}`)
    }
    if (duplicateSkus.length > 0) {
      console.log(`\n⚠️  WARNING: Found duplicate SKUs: ${duplicateSkus.join(', ')}`)
    }
    
    await mongoose.connection.close()
    console.log('\n✅ Forensic test completed')
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error)
    console.error('Stack:', error.stack)
    process.exit(1)
  }
}

testProductCreation()

