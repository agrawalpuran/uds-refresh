/**
 * Script to enable PR/PO workflow for a company and fix existing orders
 * 
 * This script:
 * 1. Enables PR/PO workflow flags for the specified company
 * 2. Fixes existing orders to have the correct PR status
 */

import connectDB from '../lib/db/mongodb'
import mongoose from 'mongoose'
import Company from '../lib/models/Company'
import Order from '../lib/models/Order'

async function enableWorkflowAndFixOrders(companyId: string) {
  try {
    await connectDB()
    console.log('✅ Connected to MongoDB\n')

    // Find the company
    let company = await Company.findOne({ id: companyId })
    
    if (!company) {
      console.log(`❌ Company not found: ${companyId}`)
      await mongoose.disconnect()
      return
    }

    console.log(`📋 Company: ${company.name} (${company.id})\n`)

    // Enable workflow flags
    console.log('🔧 Enabling PR/PO workflow flags...')
    company.enable_pr_po_workflow = true
    company.enable_site_admin_pr_approval = true
    company.require_company_admin_po_approval = true
    company.allow_multi_pr_po = true
    
    // Sync deprecated fields for backward compatibility
    company.enable_site_admin_approval = true
    company.require_company_admin_approval = true
    
    await company.save()
    console.log('✅ Workflow flags enabled\n')

    // Now fix existing orders
    console.log('🔧 Fixing existing orders...\n')
    
    const ordersToFix = await Order.find({
      companyId: company._id,
      status: 'Awaiting approval',
      $or: [
        { pr_status: { $exists: false } },
        { pr_status: null },
        { pr_status: '' }
      ]
    }).lean()

    console.log(`📋 Found ${ordersToFix.length} order(s) to fix\n`)

    let fixedCount = 0

    for (const order of ordersToFix) {
      try {
        // Generate PR number (format: PR-{companyId}-{timestamp}-{random})
        const prNumber = `PR-${company.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
        const prDate = order.orderDate ? new Date(order.orderDate) : new Date()
        const prStatus = 'PENDING_SITE_ADMIN_APPROVAL'

        // Update the order
        await Order.updateOne(
          { _id: order._id },
          {
            $set: {
              pr_status: prStatus,
              pr_number: prNumber,
              pr_date: prDate
            }
          }
        )

        console.log(`✅ Fixed order: ${order.id}`)
        console.log(`   PR Status: ${prStatus}`)
        console.log(`   PR Number: ${prNumber}\n`)
        fixedCount++

      } catch (error: any) {
        console.error(`❌ Error fixing order ${order.id}:`, error.message)
      }
    }

    console.log(`📊 Summary:`)
    console.log(`   ✅ Workflow enabled for company: ${company.name}`)
    console.log(`   ✅ Fixed: ${fixedCount} order(s)`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('✅ Script completed successfully')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

// Get company ID from command line argument or use default
const companyId = process.argv[2] || '100004' // Default to ICICI Bank

console.log(`🚀 Enabling workflow for company: ${companyId}\n`)
enableWorkflowAndFixOrders(companyId)

