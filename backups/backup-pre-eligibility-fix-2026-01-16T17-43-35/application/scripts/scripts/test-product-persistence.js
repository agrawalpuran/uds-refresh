/**
 * Test script to verify products are actually persisted
 * This will create one product and immediately verify it exists
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function testProductPersistence() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // Check current count
    const beforeCount = await db.collection('uniforms').countDocuments({})
    console.log(`Products before: ${beforeCount}`)

    // Create a test product
    const testProduct = {
      id: '999999',
      name: 'Test Product',
      category: 'shirt',
      gender: 'unisex',
      sizes: ['S', 'M', 'L'],
      price: 100,
      image: '/test.jpg',
      sku: 'TEST-SKU-999',
      stock: 0,
      companyIds: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    console.log('\nInserting test product...')
    const insertResult = await db.collection('uniforms').insertOne(testProduct)
    console.log(`Insert result: ${JSON.stringify(insertResult)}`)

    // Verify immediately with same connection
    const verify1 = await db.collection('uniforms').findOne({ id: '999999' })
    console.log(`\nVerification 1 (same connection): ${verify1 ? 'FOUND' : 'NOT FOUND'}`)
    if (verify1) {
      console.log(`  Name: ${verify1.name}, SKU: ${verify1.sku}`)
    }

    // Count after insert
    const afterCount = await db.collection('uniforms').countDocuments({})
    console.log(`Products after insert: ${afterCount}`)

    // Close and reconnect to verify persistence
    console.log('\nClosing connection...')
    await mongoose.connection.close()
    
    console.log('Reconnecting...')
    await mongoose.connect(MONGODB_URI)
    const db2 = mongoose.connection.db
    if (!db2) {
      throw new Error('Database connection not available')
    }

    // Verify with new connection
    const verify2 = await db2.collection('uniforms').findOne({ id: '999999' })
    console.log(`\nVerification 2 (new connection): ${verify2 ? 'FOUND' : 'NOT FOUND'}`)
    if (verify2) {
      console.log(`  Name: ${verify2.name}, SKU: ${verify2.sku}`)
    } else {
      console.log('  ❌ PRODUCT NOT FOUND AFTER RECONNECT!')
    }

    // Count with new connection
    const finalCount = await db2.collection('uniforms').countDocuments({})
    console.log(`Products with new connection: ${finalCount}`)

    // Clean up test product
    if (verify2) {
      await db2.collection('uniforms').deleteOne({ id: '999999' })
      console.log('\n✅ Test product cleaned up')
    }

    await mongoose.connection.close()
    console.log('\n✅ Test completed')
    
  } catch (error) {
    console.error('\n❌ ERROR:', error)
    process.exit(1)
  }
}

testProductPersistence()

