/**
 * Script to check if products have gender field set
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

async function checkProductsGender() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all products
    const allProducts = await db.collection('uniforms').find({}).toArray()
    console.log(`📦 Found ${allProducts.length} products\n`)
    
    console.log('🔍 Checking product gender fields...\n')
    
    const productsWithGender = []
    const productsWithoutGender = []
    const genderCounts = { male: 0, female: 0, unisex: 0, null: 0, undefined: 0, other: 0 }
    
    for (const product of allProducts) {
      const gender = product.gender
      const productInfo = {
        id: product.id || product._id,
        name: product.name,
        category: product.category,
        gender: gender
      }
      
      if (gender === 'male' || gender === 'female' || gender === 'unisex') {
        productsWithGender.push(productInfo)
        genderCounts[gender]++
      } else if (gender === null) {
        productsWithoutGender.push(productInfo)
        genderCounts.null++
      } else if (gender === undefined) {
        productsWithoutGender.push(productInfo)
        genderCounts.undefined++
      } else {
        productsWithoutGender.push(productInfo)
        genderCounts.other++
      }
    }
    
    console.log('📊 Gender Statistics:')
    console.log(`   - Products with valid gender: ${productsWithGender.length}`)
    console.log(`   - Products without gender: ${productsWithoutGender.length}`)
    console.log(`   - Male: ${genderCounts.male}`)
    console.log(`   - Female: ${genderCounts.female}`)
    console.log(`   - Unisex: ${genderCounts.unisex}`)
    console.log(`   - Null: ${genderCounts.null}`)
    console.log(`   - Undefined: ${genderCounts.undefined}`)
    console.log(`   - Other: ${genderCounts.other}\n`)
    
    if (productsWithoutGender.length > 0) {
      console.log('⚠️  Products without gender:')
      productsWithoutGender.slice(0, 10).forEach((p) => {
        console.log(`   - ${p.id || p.name}: gender = ${p.gender}`)
      })
      if (productsWithoutGender.length > 10) {
        console.log(`   ... and ${productsWithoutGender.length - 10} more`)
      }
      console.log('')
    }
    
    if (productsWithGender.length > 0) {
      console.log('✅ Sample products with gender:')
      productsWithGender.slice(0, 5).forEach((p) => {
        console.log(`   - ${p.id || p.name} (${p.category}): ${p.gender}`)
      })
      console.log('')
    }
    
    await mongoose.disconnect()
    console.log('✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkProductsGender()

