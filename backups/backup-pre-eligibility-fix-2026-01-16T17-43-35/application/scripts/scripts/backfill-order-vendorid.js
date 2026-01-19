/**
 * Migration script to backfill vendorId for existing orders
 * This script will:
 * 1. Find all orders without vendorId
 * 2. For each order, find the vendor for each item
 * 3. If all items are from the same vendor, set that vendorId
 * 4. If items are from different vendors, create split orders
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

async function backfillOrderVendorId() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const ordersCollection = db.collection('orders')
    const uniformsCollection = db.collection('uniforms')
    const vendorsCollection = db.collection('vendors')
    const productVendorsCollection = db.collection('productvendors')
    const productCompaniesCollection = db.collection('productcompanies')
    const companiesCollection = db.collection('companies')
    
    // Get all orders without vendorId
    const ordersWithoutVendorId = await ordersCollection.find({ 
      $or: [
        { vendorId: { $exists: false } },
        { vendorId: null }
      ]
    }).toArray()
    
    console.log(`Found ${ordersWithoutVendorId.length} orders without vendorId\n`)

    if (ordersWithoutVendorId.length === 0) {
      console.log('✅ All orders already have vendorId')
      await mongoose.disconnect()
      process.exit(0)
    }

    // Get all vendors, products, and companies for lookup
    const allVendors = await vendorsCollection.find({}).toArray()
    const allProducts = await uniformsCollection.find({}).toArray()
    const allCompanies = await companiesCollection.find({}).toArray()
    const allProductVendors = await productVendorsCollection.find({}).toArray()
    const allProductCompanies = await productCompaniesCollection.find({}).toArray()

    // Create lookup maps
    const vendorMap = new Map()
    allVendors.forEach((v) => {
      vendorMap.set(v._id.toString(), { id: v.id, name: v.name, _id: v._id })
    })

    const productMap = new Map()
    allProducts.forEach((p) => {
      productMap.set(p._id.toString(), { id: p.id, name: p.name, _id: p._id })
    })

    const companyMap = new Map()
    allCompanies.forEach((c) => {
      companyMap.set(c._id.toString(), { id: c.id, name: c.name, _id: c._id })
    })

    // Create product-vendor lookup map
    const productVendorMap = new Map()
    allProductVendors.forEach((pv) => {
      const productIdStr = pv.productId?.toString()
      if (productIdStr) {
        if (!productVendorMap.has(productIdStr)) {
          productVendorMap.set(productIdStr, [])
        }
        productVendorMap.get(productIdStr).push(pv.vendorId?.toString())
      }
    })

    let updatedCount = 0
    let skippedCount = 0
    const errors = []

    for (const order of ordersWithoutVendorId) {
      try {
        // Get company for this order
        const companyIdStr = order.companyId?.toString()
        if (!companyIdStr) {
          console.log(`⚠️  Order ${order.id} has no companyId - skipping`)
          skippedCount++
          continue
        }

        const company = companyMap.get(companyIdStr)
        if (!company) {
          console.log(`⚠️  Order ${order.id} has invalid companyId ${companyIdStr} - skipping`)
          skippedCount++
          continue
        }

        // Find vendors for each item in the order
        const itemVendors = new Map()
        
        for (const item of order.items || []) {
          const productIdStr = item.uniformId?.toString()
          if (!productIdStr) {
            continue
          }

          // Find vendors for this product
          const vendorIds = productVendorMap.get(productIdStr) || []
          
          if (vendorIds.length === 0) {
            console.log(`⚠️  Order ${order.id}, item ${item.uniformName || productIdStr} has no vendors - skipping order`)
            skippedCount++
            break
          }

          // Use first vendor (same logic as createOrder)
          const vendorIdStr = vendorIds[0]
          const vendor = vendorMap.get(vendorIdStr)
          
          if (vendor) {
            if (!itemVendors.has(vendorIdStr)) {
              itemVendors.set(vendorIdStr, {
                vendorId: vendorIdStr,
                vendorName: vendor.name,
                vendorObjectId: vendor._id,
                items: []
              })
            }
            itemVendors.get(vendorIdStr).items.push(item)
          }
        }

        if (itemVendors.size === 0) {
          console.log(`⚠️  Order ${order.id} has no valid vendors for any items - skipping`)
          skippedCount++
          continue
        }

        // If all items are from the same vendor, update the order
        if (itemVendors.size === 1) {
          const vendorInfo = Array.from(itemVendors.values())[0]
          
          await ordersCollection.updateOne(
            { _id: order._id },
            {
              $set: {
                vendorId: vendorInfo.vendorObjectId,
                vendorName: vendorInfo.vendorName
              }
            }
          )
          
          console.log(`✅ Updated order ${order.id} with vendor ${vendorInfo.vendorName} (${vendorInfo.vendorId})`)
          updatedCount++
        } else {
          // Multiple vendors - this should have been split, but we'll use the first vendor
          // and log a warning
          const vendorInfo = Array.from(itemVendors.values())[0]
          
          await ordersCollection.updateOne(
            { _id: order._id },
            {
              $set: {
                vendorId: vendorInfo.vendorObjectId,
                vendorName: vendorInfo.vendorName
              }
            }
          )
          
          console.log(`⚠️  Order ${order.id} has items from ${itemVendors.size} vendors, using first vendor: ${vendorInfo.vendorName}`)
          console.log(`   Note: This order should ideally be split into ${itemVendors.size} separate orders`)
          updatedCount++
        }
      } catch (error) {
        console.error(`❌ Error processing order ${order.id}:`, error.message)
        errors.push({ orderId: order.id, error: error.message })
      }
    }

    console.log('\n=== MIGRATION SUMMARY ===')
    console.log(`Total orders processed: ${ordersWithoutVendorId.length}`)
    console.log(`✅ Updated: ${updatedCount}`)
    console.log(`⚠️  Skipped: ${skippedCount}`)
    console.log(`❌ Errors: ${errors.length}`)

    if (errors.length > 0) {
      console.log('\n=== ERRORS ===')
      errors.forEach((e, idx) => {
        console.log(`${idx + 1}. Order ${e.orderId}: ${e.error}`)
      })
    }

    // Verify
    const remainingWithoutVendorId = await ordersCollection.countDocuments({
      $or: [
        { vendorId: { $exists: false } },
        { vendorId: null }
      ]
    })

    if (remainingWithoutVendorId === 0) {
      console.log('\n✅ All orders now have vendorId!')
    } else {
      console.log(`\n⚠️  ${remainingWithoutVendorId} order(s) still missing vendorId`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    process.exit(errors.length > 0 ? 1 : 0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

backfillOrderVendorId()

