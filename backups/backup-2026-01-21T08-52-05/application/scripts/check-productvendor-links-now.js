/**
 * Quick check of ProductVendor links for product 5
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection.db
  const product = await db.collection('uniforms').findOne({ id: '5' })
  if (!product) {
    console.log('❌ Product 5 not found')
    await mongoose.disconnect()
    return
  }
  console.log('✓ Product:', product.name, '_id:', product._id.toString())
  
  const productVendors = await db.collection('productvendors').find({}).toArray()
  console.log('\nTotal ProductVendor links in DB:', productVendors.length)
  
  const matching = productVendors.filter(pv => {
    if (!pv.productId) return false
    return pv.productId.toString() === product._id.toString()
  })
  
  console.log('Matching ProductVendor links for product 5:', matching.length)
  
  if (matching.length > 0) {
    console.log('\n✓ Links found:')
    matching.forEach((pv, i) => {
      console.log(`  ${i + 1}. vendorId: ${pv.vendorId?.toString()}`)
    })
  } else {
    console.log('\n❌ NO LINKS FOUND!')
    console.log('\nAll ProductVendor links in DB:')
    productVendors.forEach((pv, i) => {
      console.log(`  ${i + 1}. productId: ${pv.productId?.toString()}, vendorId: ${pv.vendorId?.toString()}`)
    })
  }
  
  await mongoose.disconnect()
  process.exit(0)
}).catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})

