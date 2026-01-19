/**
 * Script to check and display company workflow settings
 */

import connectDB from '../lib/db/mongodb'
import mongoose from 'mongoose'
import Company from '../lib/models/Company'

async function checkCompanyWorkflowSettings() {
  try {
    await connectDB()
    console.log('✅ Connected to MongoDB\n')

    // Find ICICI Bank
    const company = await Company.findOne({ id: '100004' })
      .select('id name enable_pr_po_workflow enable_site_admin_pr_approval require_company_admin_po_approval allow_multi_pr_po')
      .lean()

    if (!company) {
      console.log('❌ Company not found')
      return
    }

    console.log('📋 Company Workflow Settings:')
    console.log(`   Company: ${company.name} (${company.id})`)
    console.log(`   enable_pr_po_workflow: ${company.enable_pr_po_workflow} (type: ${typeof company.enable_pr_po_workflow})`)
    console.log(`   enable_site_admin_pr_approval: ${company.enable_site_admin_pr_approval} (type: ${typeof company.enable_site_admin_pr_approval})`)
    console.log(`   require_company_admin_po_approval: ${company.require_company_admin_po_approval} (type: ${typeof company.require_company_admin_po_approval})`)
    console.log(`   allow_multi_pr_po: ${company.allow_multi_pr_po} (type: ${typeof company.allow_multi_pr_po})`)

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error: any) {
    console.error('❌ Error:', error.message)
    process.exit(1)
  }
}

checkCompanyWorkflowSettings()

