/**
 * Script to update existing PR and PO statuses based on underlying order delivery status
 * This script retroactively updates PR and PO statuses based on current delivery data
 * 
 * Usage:
 *   node scripts/update-pr-po-statuses.js [companyId]
 * 
 * If companyId is provided, only updates PRs/POs for that company
 * If not provided, updates all PRs/POs in the system
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables manually (same pattern as purge-all-orders.js)
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim()
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1)
        }
        process.env[key] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGODB_URI_LOCAL

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function updatePRAndPOStatuses() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ MongoDB connected successfully.')

    const companyId = process.argv[2] // Optional company ID from command line
    
    const db = mongoose.connection.db
    
    const result = {
      prsUpdated: 0,
      posUpdated: 0,
      errors: []
    }
    
    // Build query for PRs (Orders with PO_CREATED status)
    let prQuery = { pr_status: 'PO_CREATED' }
    
    if (companyId) {
      // Find company by ID to get ObjectId
      const companiesCollection = db.collection('companies')
      const company = await companiesCollection.findOne({ id: companyId })
      if (!company) {
        throw new Error(`Company not found: ${companyId}`)
      }
      prQuery.companyId = company._id
      console.log(`📋 Updating PRs and POs for company: ${companyId} (${company.name || 'N/A'})`)
    } else {
      console.log('📋 Updating PRs and POs for ALL companies')
    }
    
    // Get all PRs that have PO created using direct MongoDB collection
    const ordersCollection = db.collection('orders')
    const prs = await ordersCollection.find(prQuery, {
      projection: {
        id: 1,
        companyId: 1,
        vendorId: 1,
        items: 1,
        dispatchStatus: 1,
        deliveryStatus: 1,
        status: 1,
        pr_status: 1,
        _id: 1
      }
    }).toArray()
    
    console.log(`Found ${prs.length} PRs to process`)
    
    // Update each PR's status based on delivery data
    for (const pr of prs) {
      try {
        const items = pr.items || []
        
        // Determine PR status based on item-level delivery
        let allItemsDelivered = true
        let allItemsShipped = true
        let anyItemShipped = false
        let anyItemDelivered = false
        
        for (const item of items) {
          const orderedQty = item.quantity || 0
          const dispatchedQty = item.dispatchedQuantity || 0
          const deliveredQty = item.deliveredQuantity || 0
          
          if (orderedQty > 0) {
            if (dispatchedQty > 0) {
              anyItemShipped = true
            }
            if (deliveredQty > 0) {
              anyItemDelivered = true
            }
            if (dispatchedQty < orderedQty) {
              allItemsShipped = false
            }
            if (deliveredQty < orderedQty) {
              allItemsDelivered = false
            }
          }
        }
        
        // Determine new PR status
        let newPRStatus = pr.status
        let newDispatchStatus = pr.dispatchStatus || 'AWAITING_FULFILMENT'
        let newDeliveryStatus = pr.deliveryStatus || 'NOT_DELIVERED'
        
        if (allItemsDelivered && items.length > 0) {
          newPRStatus = 'Delivered'
          newDeliveryStatus = 'DELIVERED'
          if (anyItemShipped) {
            newDispatchStatus = 'SHIPPED'
          }
        } else if (allItemsShipped && !allItemsDelivered) {
          newPRStatus = 'Dispatched'
          newDispatchStatus = 'SHIPPED'
          if (anyItemDelivered) {
            newDeliveryStatus = 'PARTIALLY_DELIVERED'
          }
        } else if (anyItemShipped) {
          newPRStatus = 'Dispatched'
          newDispatchStatus = 'SHIPPED'
          if (anyItemDelivered) {
            newDeliveryStatus = 'PARTIALLY_DELIVERED'
          }
        } else {
          // No items shipped yet
          newPRStatus = 'Awaiting fulfilment'
          newDispatchStatus = 'AWAITING_FULFILMENT'
          newDeliveryStatus = 'NOT_DELIVERED'
        }
        
        // Update PR if status changed using direct MongoDB update
        const updateFields = {}
        let prUpdated = false
        
        if (pr.status !== newPRStatus) {
          updateFields.status = newPRStatus
          prUpdated = true
        }
        
        if (pr.dispatchStatus !== newDispatchStatus) {
          updateFields.dispatchStatus = newDispatchStatus
          prUpdated = true
        }
        
        if (pr.deliveryStatus !== newDeliveryStatus) {
          updateFields.deliveryStatus = newDeliveryStatus
          prUpdated = true
        }
        
        if (prUpdated) {
          await ordersCollection.updateOne(
            { _id: pr._id },
            { $set: updateFields }
          )
          result.prsUpdated++
          console.log(`✅ Updated PR ${pr.id}: status=${newPRStatus}, dispatchStatus=${newDispatchStatus}, deliveryStatus=${newDeliveryStatus}`)
        }
      } catch (error) {
        const errorMsg = `Error updating PR ${pr.id}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    }
    
    // Now update all PO statuses based on their linked PRs
    const purchaseOrdersCollection = db.collection('purchaseorders')
    const poOrdersCollection = db.collection('poorders')
    
    let poQuery = {}
    if (companyId) {
      const companiesCollection = db.collection('companies')
      const company = await companiesCollection.findOne({ id: companyId })
      if (company) {
        poQuery.companyId = company._id
      }
    }
    
    const pos = await purchaseOrdersCollection.find(poQuery).toArray()
    console.log(`\nFound ${pos.length} POs to process`)
    
    for (const po of pos) {
      try {
        // Get all PRs linked to this PO
        // Ensure po._id is an ObjectId for proper comparison
        const poObjectId = po._id instanceof mongoose.Types.ObjectId ? po._id : new mongoose.Types.ObjectId(po._id)
        const poOrderMappings = await poOrdersCollection.find({ purchase_order_id: poObjectId }).toArray()
        if (poOrderMappings.length === 0) {
          continue
        }
        
        const orderIds = poOrderMappings.map(m => {
          // Ensure order_id is an ObjectId
          return m.order_id instanceof mongoose.Types.ObjectId ? m.order_id : new mongoose.Types.ObjectId(m.order_id)
        })
        const linkedPRs = await ordersCollection.find(
          { _id: { $in: orderIds } },
          {
            projection: {
              id: 1,
              dispatchStatus: 1,
              deliveryStatus: 1,
              items: 1,
              pr_status: 1
            }
          }
        ).toArray()
        
        if (linkedPRs.length === 0) {
          continue
        }
        
        // Analyze all PRs to determine PO status
        let allPRsDelivered = true
        let allPRsShipped = true
        let anyPRShipped = false
        
        for (const pr of linkedPRs) {
          const items = pr.items || []
          let prFullyDelivered = true
          let prFullyShipped = true
          let prAnyShipped = false
          
          for (const item of items) {
            const orderedQty = item.quantity || 0
            const dispatchedQty = item.dispatchedQuantity || 0
            const deliveredQty = item.deliveredQuantity || 0
            
            if (orderedQty > 0) {
              if (dispatchedQty > 0) {
                prAnyShipped = true
              }
              if (dispatchedQty < orderedQty) {
                prFullyShipped = false
              }
              if (deliveredQty < orderedQty) {
                prFullyDelivered = false
              }
            }
          }
          
          if (!prFullyDelivered) {
            allPRsDelivered = false
          }
          if (!prFullyShipped) {
            allPRsShipped = false
          }
          if (prAnyShipped) {
            anyPRShipped = true
          }
        }
        
        // Determine new PO status
        let newPOStatus = po.po_status
        
        // If all PRs are fully delivered, PO is COMPLETED
        if (allPRsDelivered && linkedPRs.length > 0) {
          newPOStatus = 'COMPLETED'
        }
        // If all PRs are shipped (but not all delivered), PO is IN_FULFILMENT
        else if (allPRsShipped && !allPRsDelivered) {
          newPOStatus = 'IN_FULFILMENT'
        }
        // If any PR is shipped, PO is IN_FULFILMENT
        else if (anyPRShipped) {
          newPOStatus = 'IN_FULFILMENT'
        }
        // If PO was already SENT_TO_VENDOR or later, keep it (don't downgrade)
        else if (['SENT_TO_VENDOR', 'ACKNOWLEDGED', 'IN_FULFILMENT', 'COMPLETED'].includes(po.po_status)) {
          newPOStatus = po.po_status
        }
        // Otherwise, keep current status
        else {
          newPOStatus = po.po_status || 'SENT_TO_VENDOR'
        }
        
        // Update PO status if it changed
        if (po.po_status !== newPOStatus) {
          await purchaseOrdersCollection.updateOne(
            { _id: po._id },
            { $set: { po_status: newPOStatus } }
          )
          result.posUpdated++
          console.log(`✅ Updated PO ${po.id}: status from ${po.po_status} to ${newPOStatus}`)
        }
      } catch (error) {
        const errorMsg = `Error updating PO ${po.id}: ${error.message}`
        console.error(`❌ ${errorMsg}`)
        result.errors.push(errorMsg)
      }
    }
    
    console.log(`\n✅ Update complete:`)
    console.log(`   - ${result.prsUpdated} PRs updated`)
    console.log(`   - ${result.posUpdated} POs updated`)
    console.log(`   - ${result.errors.length} errors`)
    
    if (result.errors.length > 0) {
      console.log(`\nErrors:`)
      result.errors.forEach(err => console.log(`   - ${err}`))
    }
    
  } catch (error) {
    console.error('❌ Error updating PR and PO statuses:', error)
    console.error('   Stack:', error.stack)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('🔌 Disconnected from MongoDB')
  }
}

updatePRAndPOStatuses()

