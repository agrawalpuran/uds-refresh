/**
 * CRITICAL DIAGNOSTIC: Vendor-Product Mapping Issue
 * 
 * Problem: Cargo Pants is assigned to Uniform Pro but showing under Footwear Plus
 * Order ID: ORD-1766743458270-3AUQHTKR6-100001
 * 
 * This script will:
 * 1. Check ProductVendor relationships for Cargo Pants
 * 2. Check the order's vendorId
 * 3. Verify vendor assignments
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function debugVendorProductMapping() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }))
    const Vendor = mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))
    const Uniform = mongoose.model('Uniform', new mongoose.Schema({}, { strict: false }))
    const ProductVendor = mongoose.model('ProductVendor', new mongoose.Schema({}, { strict: false }))

    const orderId = 'ORD-1766743458270-3AUQHTKR6-100001'
    const productName = 'Cargo Pants'
    
    console.log(`📋 DIAGNOSTIC: Vendor-Product Mapping Issue\n`)
    console.log(`Order ID: ${orderId}`)
    console.log(`Product: ${productName}\n`)
    console.log('='.repeat(80))
    
    // STEP 1: Find the order
    console.log(`\n🔍 STEP 1: Finding order ${orderId}...`)
    const order = await Order.findOne({ id: orderId }).lean()
    
    if (!order) {
      console.error(`❌ Order not found: ${orderId}`)
      // Try finding by parentOrderId
      const parentOrderId = 'ORD-1766743458270-3AUQHTKR6'
      console.log(`\n🔍 Trying to find orders with parentOrderId: ${parentOrderId}...`)
      const orders = await Order.find({ parentOrderId: parentOrderId }).lean()
      if (orders.length > 0) {
        console.log(`✅ Found ${orders.length} order(s) with parentOrderId`)
        orders.forEach((o, idx) => {
          console.log(`\n  Order ${idx + 1}:`)
          console.log(`    ID: ${o.id}`)
          console.log(`    Status: ${o.status}`)
          console.log(`    VendorId: ${o.vendorId?.toString() || 'N/A'}`)
          console.log(`    VendorName: ${o.vendorName || 'N/A'}`)
          console.log(`    Items: ${o.items?.length || 0}`)
          if (o.items) {
            o.items.forEach((item, i) => {
              console.log(`      ${i + 1}. ${item.uniformName || item.uniformId} (Size: ${item.size})`)
            })
          }
        })
      }
      await mongoose.disconnect()
      return
    }
    
    console.log(`✅ Order found:`)
    console.log(`   Order ID: ${order.id}`)
    console.log(`   Status: ${order.status}`)
    console.log(`   VendorId (ObjectId): ${order.vendorId?.toString() || 'N/A'}`)
    console.log(`   VendorName: ${order.vendorName || 'N/A'}`)
    console.log(`   Items: ${order.items?.length || 0}`)
    
    // STEP 2: Check order items
    console.log(`\n🔍 STEP 2: Analyzing order items...`)
    if (order.items && order.items.length > 0) {
      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i]
        console.log(`\n   Item ${i + 1}:`)
        console.log(`     Product Name: ${item.uniformName || 'N/A'}`)
        console.log(`     Product ID (numeric): ${item.productId || 'N/A'}`)
        console.log(`     UniformId (ObjectId): ${item.uniformId?.toString() || 'N/A'}`)
        console.log(`     Size: ${item.size}`)
        console.log(`     Quantity: ${item.quantity}`)
        
        // Find the product
        let product = null
        if (item.productId) {
          product = await Uniform.findOne({ id: item.productId }).lean()
        }
        if (!product && item.uniformId) {
          product = await Uniform.findById(item.uniformId).lean()
        }
        
        if (product) {
          console.log(`     ✅ Product found in database:`)
          console.log(`        Product ID: ${product.id}`)
          console.log(`        Product Name: ${product.name}`)
          console.log(`        Product _id: ${product._id.toString()}`)
          
          // STEP 3: Check ProductVendor relationships
          console.log(`\n   🔍 STEP 3: Checking ProductVendor relationships for this product...`)
          const db = mongoose.connection.db
          if (db) {
            const productVendorLinks = await db.collection('productvendors').find({
              productId: product._id
            }).toArray()
            
            console.log(`     Found ${productVendorLinks.length} ProductVendor link(s)`)
            
            if (productVendorLinks.length === 0) {
              console.error(`     ❌ NO ProductVendor relationship found for this product!`)
            } else {
              for (const link of productVendorLinks) {
                const vendorIdObj = link.vendorId
                const vendor = await Vendor.findById(vendorIdObj).lean()
                
                console.log(`\n     ProductVendor Link:`)
                console.log(`       VendorId (ObjectId): ${vendorIdObj?.toString() || 'N/A'}`)
                if (vendor) {
                  console.log(`       ✅ Vendor: ${vendor.name} (ID: ${vendor.id})`)
                  console.log(`       Vendor _id: ${vendor._id.toString()}`)
                  
                  // Compare with order's vendorId
                  const orderVendorIdStr = order.vendorId?.toString() || ''
                  const linkVendorIdStr = vendorIdObj?.toString() || ''
                  
                  if (orderVendorIdStr === linkVendorIdStr) {
                    console.log(`       ✅ MATCH: Order vendorId matches ProductVendor relationship`)
                  } else {
                    console.error(`       ❌ MISMATCH: Order vendorId (${orderVendorIdStr}) does NOT match ProductVendor vendorId (${linkVendorIdStr})`)
                    console.error(`       ❌ This is the root cause! Order was created with wrong vendor.`)
                  }
                } else {
                  console.error(`       ❌ Vendor not found for vendorId: ${vendorIdObj?.toString()}`)
                }
              }
            }
          }
        } else {
          console.error(`     ❌ Product not found in database`)
        }
      }
    }
    
    // STEP 4: Verify order's vendor
    console.log(`\n🔍 STEP 4: Verifying order's vendor assignment...`)
    if (order.vendorId) {
      const orderVendor = await Vendor.findById(order.vendorId).lean()
      if (orderVendor) {
        console.log(`   Order's Vendor:`)
        console.log(`     Name: ${orderVendor.name}`)
        console.log(`     ID: ${orderVendor.id}`)
        console.log(`     _id: ${orderVendor._id.toString()}`)
        console.log(`     VendorName in order: ${order.vendorName || 'N/A'}`)
        
        if (orderVendor.name !== order.vendorName) {
          console.error(`     ⚠️ WARNING: Vendor name mismatch!`)
          console.error(`        Order.vendorName: ${order.vendorName}`)
          console.error(`        Actual vendor name: ${orderVendor.name}`)
        }
      } else {
        console.error(`   ❌ Vendor not found for order.vendorId: ${order.vendorId.toString()}`)
      }
    } else {
      console.error(`   ❌ Order has no vendorId!`)
    }
    
    // STEP 5: Check all vendors
    console.log(`\n🔍 STEP 5: Listing all vendors for reference...`)
    const allVendors = await Vendor.find({}).select('id name _id').lean()
    console.log(`   Found ${allVendors.length} vendor(s):`)
    allVendors.forEach((v, idx) => {
      console.log(`     ${idx + 1}. ${v.name} (ID: ${v.id}, _id: ${v._id.toString()})`)
    })
    
    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n' + '='.repeat(80))
    console.log('📊 DIAGNOSTIC COMPLETE')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

debugVendorProductMapping()

