/**
 * Pre-Workflow Unification Backup Script
 * 
 * Creates a complete database backup before implementing unified workflow changes.
 * Stores backup in: backups/backup-pre-workflow-unification-{timestamp}/database/
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Try to load dotenv, but continue without it if not available
try {
  require('dotenv').config({ path: path.resolve(__dirname, '..', '.env.local') })
} catch (e) {
  // Try to read .env.local directly
  try {
    const envPath = path.resolve(__dirname, '..', '.env.local')
    const envContent = fs.readFileSync(envPath, 'utf8')
    envContent.split('\n').forEach(line => {
      const [key, ...valueParts] = line.split('=')
      if (key && valueParts.length > 0) {
        process.env[key.trim()] = valueParts.join('=').trim()
      }
    })
  } catch (e2) {
    console.log('Note: .env.local not found, using default MongoDB URI')
  }
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function backupDatabase() {
  try {
    console.log('='.repeat(60))
    console.log('PRE-WORKFLOW UNIFICATION DATABASE BACKUP')
    console.log('='.repeat(60))
    console.log('')
    console.log('This backup is created BEFORE implementing:')
    console.log('  - Unified status fields')
    console.log('  - Dual-write logic')
    console.log('  - Status engine centralization')
    console.log('')
    
    // Create backup directory
    const projectRoot = path.resolve(__dirname, '..')
    const timestamp = '2026-01-15T21-11-10' // Match the application backup timestamp
    const backupDir = path.join(projectRoot, 'backups', `backup-pre-workflow-unification-${timestamp}`, 'database')
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }

    console.log(`Backup directory: ${backupDir}`)
    console.log(`MongoDB URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//<credentials>@')}`)
    console.log('')
    
    // Connect to MongoDB
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')
    console.log('')

    // Get all collections
    const db = mongoose.connection.db
    const collections = await db.listCollections().toArray()
    
    console.log(`Found ${collections.length} collections to backup:`)
    console.log('')
    
    const backupData = {}
    let totalDocuments = 0
    
    // Collections relevant to workflow
    const workflowCollections = [
      'orders',
      'purchaseorders',
      'shipments',
      'grns',
      'invoices',
      'indentheaders',
      'poorders',
      'employees',
      'companies',
      'vendors',
      'vendorinventories'
    ]
    
    for (const collection of collections) {
      const collectionName = collection.name
      
      // Skip system collections
      if (collectionName.startsWith('system.')) {
        continue
      }
      
      const isWorkflowCollection = workflowCollections.includes(collectionName.toLowerCase())
      const prefix = isWorkflowCollection ? '🔶' : '⬜'
      
      const data = await db.collection(collectionName).find({}).toArray()
      backupData[collectionName] = data
      totalDocuments += data.length
      
      console.log(`  ${prefix} ${collectionName}: ${data.length} documents`)
      
      // Also save individual collection files for easier access
      const collectionFile = path.join(backupDir, `${collectionName}.json`)
      fs.writeFileSync(collectionFile, JSON.stringify(data, null, 2))
    }

    // Save combined backup file
    const backupFile = path.join(backupDir, 'complete-database-backup.json')
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2))
    
    // Create backup metadata
    const metadata = {
      timestamp: new Date().toISOString(),
      purpose: 'Pre-Workflow Unification Backup',
      mongodbUri: MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//<credentials>@'),
      collectionsCount: collections.length,
      totalDocuments: totalDocuments,
      workflowCollections: workflowCollections,
      notes: [
        'This backup was created BEFORE implementing unified workflow status fields',
        'Changes to implement:',
        '  1. Add unified_status field to Order',
        '  2. Add unified_pr_status field to Order (for PR workflow)',
        '  3. Add unified_po_status field to PurchaseOrder',
        '  4. Add unified_shipment_status field to Shipment',
        '  5. Add unified_grn_status field to GRN',
        '  6. Add unified_invoice_status field to Invoice',
        '  7. Implement dual-write logic in status-engine.ts',
        '',
        'To restore: node scripts/restore-pre-workflow-unification.js'
      ]
    }
    
    const metadataFile = path.join(backupDir, 'backup-metadata.json')
    fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2))
    
    console.log('')
    console.log('='.repeat(60))
    console.log('✅ DATABASE BACKUP COMPLETED SUCCESSFULLY')
    console.log('='.repeat(60))
    console.log('')
    console.log(`📁 Backup location: ${backupDir}`)
    console.log(`📊 Total collections: ${collections.length}`)
    console.log(`📄 Total documents: ${totalDocuments}`)
    console.log('')
    console.log('Files created:')
    console.log(`  - complete-database-backup.json (all collections)`)
    console.log(`  - backup-metadata.json (backup info)`)
    console.log(`  - Individual collection files (*.json)`)
    console.log('')
    console.log('🔶 = Workflow-related collection (will be modified)')
    console.log('⬜ = Other collection (not affected)')
    console.log('')
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('❌ Error creating database backup:', error)
    process.exit(1)
  }
}

backupDatabase()
