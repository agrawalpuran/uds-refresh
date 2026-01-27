/**
 * Seed Workflow Configurations
 * 
 * This script populates the WorkflowConfiguration collection with
 * default workflow configurations for all companies in the system.
 * 
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/seed-workflow-configurations.ts
 *   
 * Or add to package.json:
 *   "seed-workflows": "ts-node --compiler-options '{\"module\":\"CommonJS\"}' scripts/seed-workflow-configurations.ts"
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

// =============================================================================
// WORKFLOW CONFIGURATION SCHEMA (inline to avoid module issues)
// =============================================================================

const WORKFLOW_ENTITY_TYPES = {
  ORDER: 'ORDER',
  GRN: 'GRN',
  INVOICE: 'INVOICE',
} as const

const WORKFLOW_ROLES = {
  EMPLOYEE: 'EMPLOYEE',
  LOCATION_ADMIN: 'LOCATION_ADMIN',
  SITE_ADMIN: 'SITE_ADMIN',
  COMPANY_ADMIN: 'COMPANY_ADMIN',
  SUPER_ADMIN: 'SUPER_ADMIN',
  VENDOR: 'VENDOR',
  FINANCE_ADMIN: 'FINANCE_ADMIN',
} as const

interface IWorkflowStage {
  stageKey: string
  stageName: string
  order: number
  allowedRoles: string[]
  canApprove: boolean
  canReject: boolean
  isTerminal: boolean
  isOptional?: boolean
}

interface IWorkflowConfig {
  id: string
  companyId: string
  entityType: string
  workflowName: string
  stages: IWorkflowStage[]
  statusOnSubmission?: string
  statusOnApproval?: Record<string, string>
  statusOnRejection?: Record<string, string>
  version: number
  isActive: boolean
  createdBy?: string
}

// =============================================================================
// DEFAULT WORKFLOW TEMPLATES
// =============================================================================

/**
 * Two-stage Order approval: Location Admin → Company Admin
 */
const ORDER_TWO_STAGE_WORKFLOW = (companyId: string): IWorkflowConfig => ({
  id: `WF-ORDER-${companyId}-2STAGE`,
  companyId,
  entityType: WORKFLOW_ENTITY_TYPES.ORDER,
  workflowName: 'Two-Stage Order Approval',
  stages: [
    {
      stageKey: 'LOCATION_APPROVAL',
      stageName: 'Location Admin Approval',
      order: 1,
      allowedRoles: [WORKFLOW_ROLES.LOCATION_ADMIN, WORKFLOW_ROLES.SITE_ADMIN],
      canApprove: true,
      canReject: true,
      isTerminal: false,
    },
    {
      stageKey: 'COMPANY_APPROVAL',
      stageName: 'Company Admin Approval',
      order: 2,
      allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN, WORKFLOW_ROLES.SUPER_ADMIN],
      canApprove: true,
      canReject: true,
      isTerminal: true,
    },
  ],
  statusOnSubmission: 'PENDING_SITE_ADMIN_APPROVAL',
  statusOnApproval: {
    'LOCATION_APPROVAL': 'PENDING_COMPANY_ADMIN_APPROVAL',
    'COMPANY_APPROVAL': 'COMPANY_ADMIN_APPROVED',
  },
  statusOnRejection: {
    'LOCATION_APPROVAL': 'REJECTED',
    'COMPANY_APPROVAL': 'REJECTED',
  },
  version: 1,
  isActive: true,
  createdBy: 'SYSTEM_SEED',
})

/**
 * Single-stage Order approval: Company Admin only
 */
const ORDER_SINGLE_STAGE_WORKFLOW = (companyId: string): IWorkflowConfig => ({
  id: `WF-ORDER-${companyId}-1STAGE`,
  companyId,
  entityType: WORKFLOW_ENTITY_TYPES.ORDER,
  workflowName: 'Single-Stage Order Approval',
  stages: [
    {
      stageKey: 'COMPANY_APPROVAL',
      stageName: 'Company Admin Approval',
      order: 1,
      allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN, WORKFLOW_ROLES.SUPER_ADMIN, WORKFLOW_ROLES.LOCATION_ADMIN],
      canApprove: true,
      canReject: true,
      isTerminal: true,
    },
  ],
  statusOnSubmission: 'PENDING_COMPANY_ADMIN_APPROVAL',
  statusOnApproval: {
    'COMPANY_APPROVAL': 'COMPANY_ADMIN_APPROVED',
  },
  statusOnRejection: {
    'COMPANY_APPROVAL': 'REJECTED',
  },
  version: 1,
  isActive: true,
  createdBy: 'SYSTEM_SEED',
})

/**
 * Invoice approval workflow: Company Admin
 */
const INVOICE_WORKFLOW = (companyId: string): IWorkflowConfig => ({
  id: `WF-INVOICE-${companyId}`,
  companyId,
  entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
  workflowName: 'Invoice Approval',
  stages: [
    {
      stageKey: 'INVOICE_COMPANY_APPROVAL',
      stageName: 'Company Admin Approval',
      order: 1,
      allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN, WORKFLOW_ROLES.SUPER_ADMIN, WORKFLOW_ROLES.FINANCE_ADMIN],
      canApprove: true,
      canReject: true,
      isTerminal: true,
    },
  ],
  statusOnSubmission: 'RAISED',
  statusOnApproval: {
    'INVOICE_COMPANY_APPROVAL': 'APPROVED',
  },
  statusOnRejection: {
    'INVOICE_COMPANY_APPROVAL': 'REJECTED',
  },
  version: 1,
  isActive: true,
  createdBy: 'SYSTEM_SEED',
})

/**
 * GRN approval workflow: Company Admin
 */
const GRN_WORKFLOW = (companyId: string): IWorkflowConfig => ({
  id: `WF-GRN-${companyId}`,
  companyId,
  entityType: WORKFLOW_ENTITY_TYPES.GRN,
  workflowName: 'GRN Approval',
  stages: [
    {
      stageKey: 'GRN_COMPANY_APPROVAL',
      stageName: 'Company Admin Approval',
      order: 1,
      allowedRoles: [WORKFLOW_ROLES.COMPANY_ADMIN, WORKFLOW_ROLES.SUPER_ADMIN],
      canApprove: true,
      canReject: true,
      isTerminal: true,
    },
  ],
  statusOnSubmission: 'RAISED',
  statusOnApproval: {
    'GRN_COMPANY_APPROVAL': 'APPROVED',
  },
  statusOnRejection: {
    'GRN_COMPANY_APPROVAL': 'REJECTED',
  },
  version: 1,
  isActive: true,
  createdBy: 'SYSTEM_SEED',
})

// =============================================================================
// MAIN SEEDING FUNCTION
// =============================================================================

async function seedWorkflowConfigurations() {
  console.log('🚀 Starting workflow configuration seeding...\n')
  
  // Connect to MongoDB
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('❌ MONGODB_URI not found in environment variables')
    process.exit(1)
  }
  
  try {
    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB\n')
    
    // Get all companies
    const Company = mongoose.connection.collection('companies')
    const companies = await Company.find({}).toArray()
    
    console.log(`📋 Found ${companies.length} companies\n`)
    
    // Get or create WorkflowConfiguration collection
    const WorkflowConfig = mongoose.connection.collection('workflowconfigurations')
    
    // Track stats
    let created = 0
    let skipped = 0
    let errors = 0
    
    for (const company of companies) {
      const companyId = company.id || company._id.toString()
      const companyName = company.name || companyId
      
      console.log(`\n🏢 Processing company: ${companyName} (${companyId})`)
      
      // Create Order workflow (two-stage by default)
      const orderWorkflow = ORDER_TWO_STAGE_WORKFLOW(companyId)
      try {
        const existing = await WorkflowConfig.findOne({ 
          companyId, 
          entityType: WORKFLOW_ENTITY_TYPES.ORDER,
          isActive: true 
        })
        
        if (existing) {
          console.log(`  ⏭️  ORDER workflow already exists, skipping`)
          skipped++
        } else {
          await WorkflowConfig.insertOne(orderWorkflow)
          console.log(`  ✅ Created ORDER workflow: ${orderWorkflow.workflowName}`)
          created++
        }
      } catch (err: any) {
        console.log(`  ❌ Error creating ORDER workflow: ${err.message}`)
        errors++
      }
      
      // Create Invoice workflow
      const invoiceWorkflow = INVOICE_WORKFLOW(companyId)
      try {
        const existing = await WorkflowConfig.findOne({ 
          companyId, 
          entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
          isActive: true 
        })
        
        if (existing) {
          console.log(`  ⏭️  INVOICE workflow already exists, skipping`)
          skipped++
        } else {
          await WorkflowConfig.insertOne(invoiceWorkflow)
          console.log(`  ✅ Created INVOICE workflow: ${invoiceWorkflow.workflowName}`)
          created++
        }
      } catch (err: any) {
        console.log(`  ❌ Error creating INVOICE workflow: ${err.message}`)
        errors++
      }
      
      // Create GRN workflow
      const grnWorkflow = GRN_WORKFLOW(companyId)
      try {
        const existing = await WorkflowConfig.findOne({ 
          companyId, 
          entityType: WORKFLOW_ENTITY_TYPES.GRN,
          isActive: true 
        })
        
        if (existing) {
          console.log(`  ⏭️  GRN workflow already exists, skipping`)
          skipped++
        } else {
          await WorkflowConfig.insertOne(grnWorkflow)
          console.log(`  ✅ Created GRN workflow: ${grnWorkflow.workflowName}`)
          created++
        }
      } catch (err: any) {
        console.log(`  ❌ Error creating GRN workflow: ${err.message}`)
        errors++
      }
    }
    
    console.log('\n' + '='.repeat(50))
    console.log('📊 SEEDING SUMMARY')
    console.log('='.repeat(50))
    console.log(`  Companies processed: ${companies.length}`)
    console.log(`  Workflows created:   ${created}`)
    console.log(`  Workflows skipped:   ${skipped}`)
    console.log(`  Errors:              ${errors}`)
    console.log('='.repeat(50) + '\n')
    
    // Create indexes
    console.log('📇 Creating indexes...')
    await WorkflowConfig.createIndex({ companyId: 1, entityType: 1, isActive: 1 })
    await WorkflowConfig.createIndex({ id: 1 }, { unique: true })
    console.log('✅ Indexes created\n')
    
    console.log('🎉 Workflow configuration seeding complete!')
    
  } catch (error: any) {
    console.error('❌ Error during seeding:', error.message)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the seeding
seedWorkflowConfigurations()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
