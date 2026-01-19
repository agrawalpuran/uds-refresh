/**
 * Script to check if products exist in the database
 * and verify the collection name
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

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
  MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
}

async function checkProducts() {
  try {
    console.log('Connecting to MongoDB...')
    console.log(`URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`) // Hide credentials
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    // List all collections
    console.log('=== ALL COLLECTIONS IN DATABASE ===')
    const collections = await db.listCollections().toArray()
    collections.forEach(col => {
      console.log(`  - ${col.name}`)
    })
    console.log()

    // Check for products in different possible collection names
    const possibleCollectionNames = ['uniforms', 'uniform', 'products', 'product']
    
    for (const collectionName of possibleCollectionNames) {
      try {
        const count = await db.collection(collectionName).countDocuments({})
        if (count > 0) {
          console.log(`✅ Found ${count} products in collection: "${collectionName}"`)
          
          // Show sample products
          const sampleProducts = await db.collection(collectionName)
            .find({})
            .project({ id: 1, name: 1, sku: 1, category: 1, gender: 1, price: 1, _id: 0 })
            .limit(5)
            .toArray()
          
          console.log('\nSample products:')
          sampleProducts.forEach((p, idx) => {
            console.log(`  ${idx + 1}. ${p.name || 'N/A'}`)
            console.log(`     ID: ${p.id || 'N/A'}, SKU: ${p.sku || 'N/A'}, Category: ${p.category || 'N/A'}, Gender: ${p.gender || 'N/A'}, Price: ₹${p.price || 'N/A'}`)
          })
        } else {
          console.log(`   Collection "${collectionName}" exists but is empty (0 documents)`)
        }
      } catch (error) {
        // Collection doesn't exist
        console.log(`   Collection "${collectionName}" does not exist`)
      }
    }

    // Also check what the Uniform model uses
    console.log('\n=== CHECKING UNIFORM MODEL ===')
    try {
      // Try to use the model directly
      const Uniform = require('../lib/models/Uniform').default
      const modelCount = await Uniform.countDocuments({})
      console.log(`Uniform model count: ${modelCount}`)
      
      if (modelCount > 0) {
        const sample = await Uniform.find({}).limit(3).lean()
        console.log('\nSample from Uniform model:')
        sample.forEach((p, idx) => {
          console.log(`  ${idx + 1}. ${p.name}`)
          console.log(`     ID: ${p.id}, SKU: ${p.sku}`)
        })
      }
    } catch (error) {
      console.log(`   Could not use Uniform model: ${error.message}`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('\n❌ ERROR:', error)
    process.exit(1)
  }
}

checkProducts()


