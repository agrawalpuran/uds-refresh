const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Try to load .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=')
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim()
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function checkVendorProductLinks() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db

    // Get all vendors
    const vendors = await db.collection('vendors').find({}).toArray()
    console.log(`\n📊 Found ${vendors.length} vendors in the database\n`)

    // Get all ProductVendor relationships
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`📊 Found ${productVendorLinks.length} ProductVendor relationships\n`)

    // Get all products
    const products = await db.collection('uniforms').find({}).toArray()
    console.log(`📊 Found ${products.length} products in the database\n`)

    // Check each vendor
    for (const vendor of vendors) {
      console.log(`\n${'='.repeat(60)}`)
      console.log(`Vendor: ${vendor.name} (ID: ${vendor.id})`)
      console.log(`${'='.repeat(60)}`)

      const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
        ? vendor._id 
        : new mongoose.Types.ObjectId(vendor._id)

      // Count ProductVendor relationships for this vendor
      const linksForVendor = productVendorLinks.filter(link => {
        const linkVendorId = link.vendorId instanceof mongoose.Types.ObjectId
          ? link.vendorId
          : new mongoose.Types.ObjectId(link.vendorId)
        return linkVendorId.toString() === vendorObjectId.toString()
      })

      console.log(`  ProductVendor relationships: ${linksForVendor.length}`)

      if (linksForVendor.length > 0) {
        console.log(`  ✅ Products linked to this vendor:`)
        for (const link of linksForVendor.slice(0, 5)) {
          const product = products.find(p => 
            p._id.toString() === link.productId.toString()
          )
          if (product) {
            console.log(`     - ${product.name} (${product.id})`)
          } else {
            console.log(`     - Product ID: ${link.productId} (product not found)`)
          }
        }
        if (linksForVendor.length > 5) {
          console.log(`     ... and ${linksForVendor.length - 5} more`)
        }
      } else {
        console.log(`  ⚠️  No products linked to this vendor`)
        
        // Check if there are any orders for this vendor (fallback method)
        const ordersWithVendor = await db.collection('orders').find({
          vendorId: vendorObjectId
        }).toArray()
        
        console.log(`  Orders for this vendor: ${ordersWithVendor.length}`)
        
        if (ordersWithVendor.length > 0) {
          const productIdSet = new Set()
          ordersWithVendor.forEach(order => {
            if (order.items && Array.isArray(order.items)) {
              order.items.forEach(item => {
                if (item.uniformId) {
                  productIdSet.add(item.uniformId.toString())
                }
              })
            }
          })
          console.log(`  Products found in orders: ${productIdSet.size}`)
          if (productIdSet.size > 0) {
            console.log(`  ⚠️  Products are only linked via orders, not via ProductVendor relationships`)
          }
        }
      }
    }

    // Check for products without vendor links
    console.log(`\n${'='.repeat(60)}`)
    console.log(`Products without vendor links:`)
    console.log(`${'='.repeat(60)}`)
    
    const productsWithoutVendor = products.filter(product => {
      return !productVendorLinks.some(link => 
        link.productId.toString() === product._id.toString()
      )
    })

    console.log(`  Found ${productsWithoutVendor.length} products without vendor links`)
    if (productsWithoutVendor.length > 0) {
      console.log(`  Sample products without vendor links:`)
      productsWithoutVendor.slice(0, 10).forEach(product => {
        console.log(`     - ${product.name} (${product.id})`)
      })
      if (productsWithoutVendor.length > 10) {
        console.log(`     ... and ${productsWithoutVendor.length - 10} more`)
      }
    }

    console.log(`\n${'='.repeat(60)}`)
    console.log(`Summary:`)
    console.log(`${'='.repeat(60)}`)
    console.log(`  Total Vendors: ${vendors.length}`)
    console.log(`  Total Products: ${products.length}`)
    console.log(`  Total ProductVendor Links: ${productVendorLinks.length}`)
    console.log(`  Products without vendor links: ${productsWithoutVendor.length}`)
    console.log(`\n💡 To link products to vendors, use the Super Admin portal:`)
    console.log(`   Super Admin → Products → Link Products to Vendor`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkVendorProductLinks()

