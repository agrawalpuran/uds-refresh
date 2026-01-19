/**
 * Script to fix orders that should have PR status set to PENDING_SITE_ADMIN_APPROVAL
 * but were created before the workflow logic was properly implemented.
 * 
 * This script:
 * 1. Finds orders with status 'Awaiting approval' that don't have PR status set
 * 2. Checks if the company has PR/PO workflow enabled with site admin approval required
 * 3. Updates those orders with the correct PR status, PR number, and PR date
 */

// Use the same MongoDB connection approach as other migration scripts
import connectDB from '../lib/db/mongodb'
import mongoose from 'mongoose'

// Import models
const Company = require('../lib/models/Company').default
const Order = require('../lib/models/Order').default

async function fixMissingPRStatus() {
  try {
    // Connect to MongoDB using the shared connection utility
    await connectDB()
    console.log('✅ Connected to MongoDB')

    // Find all orders with status 'Awaiting approval' that don't have PR status set
    const ordersToFix = await Order.find({
      status: 'Awaiting approval',
      $or: [
        { pr_status: { $exists: false } },
        { pr_status: null },
        { pr_status: '' }
      ]
    })
      .populate('companyId', 'id name enable_pr_po_workflow enable_site_admin_pr_approval')
      .lean()

    console.log(`\n📋 Found ${ordersToFix.length} order(s) without PR status`)

    if (ordersToFix.length === 0) {
      console.log('✅ No orders need fixing')
      await mongoose.disconnect()
      return
    }

    let fixedCount = 0
    let skippedCount = 0

    for (const order of ordersToFix) {
      try {
        // Get company (might be populated or just ObjectId)
        let company: any = null
        if (order.companyId && typeof order.companyId === 'object' && 'id' in order.companyId) {
          company = order.companyId
        } else if (order.companyId) {
          // Fetch company by ObjectId
          company = await Company.findById(order.companyId)
            .select('id name enable_pr_po_workflow enable_site_admin_pr_approval')
            .lean()
        }

        if (!company) {
          console.log(`⚠️  Skipping order ${order.id}: Company not found`)
          skippedCount++
          continue
        }

        // Check if PR/PO workflow is enabled
        // Handle undefined as false (workflow not enabled)
        const isWorkflowEnabled = company.enable_pr_po_workflow === true || company.enable_pr_po_workflow === 'true'
        const isSiteAdminApprovalRequired = company.enable_site_admin_pr_approval === true || company.enable_site_admin_pr_approval === 'true'

        console.log(`\n📦 Processing order: ${order.id}`)
        console.log(`   Company: ${company.name} (${company.id})`)
        console.log(`   enable_pr_po_workflow: ${company.enable_pr_po_workflow} (type: ${typeof company.enable_pr_po_workflow})`)
        console.log(`   enable_site_admin_pr_approval: ${company.enable_site_admin_pr_approval} (type: ${typeof company.enable_site_admin_pr_approval})`)
        console.log(`   Workflow enabled: ${isWorkflowEnabled}`)
        console.log(`   Site admin approval required: ${isSiteAdminApprovalRequired}`)

        if (!isWorkflowEnabled) {
          if (company.enable_pr_po_workflow === undefined) {
            console.log(`   ⚠️  Skipping: PR/PO workflow flags are not set (undefined) for this company`)
            console.log(`   💡 To enable: Go to Super Admin → Workflow Configuration or Company Settings and enable the workflow flags`)
          } else {
            console.log(`   ⏭️  Skipping: PR/PO workflow not enabled for this company`)
          }
          skippedCount++
          continue
        }

        // Determine PR status
        let prStatus: string
        if (isSiteAdminApprovalRequired) {
          prStatus = 'PENDING_SITE_ADMIN_APPROVAL'
        } else {
          prStatus = 'PENDING_COMPANY_ADMIN_APPROVAL'
        }

        // Generate PR number (format: PR-{companyId}-{timestamp}-{random})
        const prNumber = `PR-${company.id}-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`
        const prDate = order.orderDate ? new Date(order.orderDate) : new Date()

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

        console.log(`   ✅ Fixed: Set PR status to ${prStatus}`)
        console.log(`      PR Number: ${prNumber}`)
        console.log(`      PR Date: ${prDate.toISOString()}`)
        fixedCount++

      } catch (error: any) {
        console.error(`   ❌ Error processing order ${order.id}:`, error.message)
        skippedCount++
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   ✅ Fixed: ${fixedCount} order(s)`)
    console.log(`   ⏭️  Skipped: ${skippedCount} order(s)`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('✅ Script completed successfully')

  } catch (error: any) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run the script
fixMissingPRStatus()

