/**
 * Migration Script #5 — OPTIONAL CLEANUP (MANUAL CONFIRMATION REQUIRED)
 * 
 * Purpose: Generate cleanup commands for orphaned records.
 * 
 * ⚠️  WARNING: This script DOES NOT execute deletions automatically!
 * ⚠️  It only outputs instructions and requires manual confirmation.
 * 
 * What this script does:
 * - Identifies orphaned shipments, GRNs, invoices, and vendor links
 * - Generates MongoDB delete commands for review
 * - Exports IDs to JSON files for backup before deletion
 * - Provides step-by-step instructions for manual execution
 * 
 * Usage: node scripts/migration-05-optional-cleanup.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

require('dotenv').config()
const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// =============================================================================
// IDENTIFICATION FUNCTIONS
// =============================================================================

async function identifyOrphanedShipments(db) {
  const shipments = await db.collection('shipments').find({}).toArray()
  const prNumbers = await db.collection('orders').distinct('pr_number', {
    pr_number: { $exists: true, $ne: null }
  })
  const prNumberSet = new Set(prNumbers)
  
  return shipments
    .filter(s => !prNumberSet.has(s.prNumber))
    .map(s => ({
      _id: s._id,
      shipmentId: s.shipmentId,
      prNumber: s.prNumber,
      vendorId: s.vendorId,
    }))
}

async function identifyOrphanedGRNs(db) {
  const grns = await db.collection('grns').find({}).toArray()
  const poNumbers = await db.collection('purchaseorders').distinct('client_po_number')
  const poNumberSet = new Set(poNumbers)
  
  return grns
    .filter(g => !poNumberSet.has(g.poNumber))
    .map(g => ({
      _id: g._id,
      id: g.id,
      grnNumber: g.grnNumber,
      poNumber: g.poNumber,
      vendorId: g.vendorId,
    }))
}

async function identifyOrphanedInvoices(db) {
  const invoices = await db.collection('invoices').find({}).toArray()
  const grnIds = await db.collection('grns').distinct('id')
  const grnIdSet = new Set(grnIds)
  
  return invoices
    .filter(i => !grnIdSet.has(i.grnId))
    .map(i => ({
      _id: i._id,
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      grnId: i.grnId,
      vendorId: i.vendorId,
    }))
}

async function identifyOrphanedProductVendors(db) {
  const productVendors = await db.collection('productvendors').find({}).toArray()
  
  if (productVendors.length === 0) return []
  
  const vendorIds = new Set(await db.collection('vendors').distinct('id'))
  const uniformIds = new Set(await db.collection('uniforms').distinct('id'))
  
  return productVendors
    .filter(pv => !vendorIds.has(pv.vendorId) || (pv.uniformId && !uniformIds.has(pv.uniformId)))
    .map(pv => ({
      _id: pv._id,
      id: pv.id,
      vendorId: pv.vendorId,
      uniformId: pv.uniformId,
    }))
}

async function identifyOrphanedVendorInventory(db) {
  const inventories = await db.collection('vendorinventories').find({}).toArray()
  
  if (inventories.length === 0) return []
  
  const vendorIds = new Set(await db.collection('vendors').distinct('id'))
  const uniformIds = new Set(await db.collection('uniforms').distinct('id'))
  
  return inventories
    .filter(vi => !vendorIds.has(vi.vendorId) || (vi.uniformId && !uniformIds.has(vi.uniformId)))
    .map(vi => ({
      _id: vi._id,
      id: vi.id,
      vendorId: vi.vendorId,
      uniformId: vi.uniformId,
    }))
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗')
  console.log('║     MIGRATION SCRIPT #5 — OPTIONAL CLEANUP                                   ║')
  console.log('║     ⚠️  NO AUTOMATIC DELETIONS — Manual confirmation required                ║')
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝')
  console.log()
  console.log(`Timestamp: ${new Date().toISOString()}`)
  
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    console.error('ERROR: MONGODB_URI environment variable not set')
    process.exit(1)
  }
  
  try {
    await mongoose.connect(mongoUri)
    console.log('Connected to MongoDB')
    
    const db = mongoose.connection.db
    
    // Identify all orphaned records
    console.log('\n' + '='.repeat(80))
    console.log('IDENTIFYING ORPHANED RECORDS')
    console.log('='.repeat(80))
    
    const orphanedShipments = await identifyOrphanedShipments(db)
    console.log(`Orphaned Shipments: ${orphanedShipments.length}`)
    
    const orphanedGRNs = await identifyOrphanedGRNs(db)
    console.log(`Orphaned GRNs: ${orphanedGRNs.length}`)
    
    const orphanedInvoices = await identifyOrphanedInvoices(db)
    console.log(`Orphaned Invoices: ${orphanedInvoices.length}`)
    
    const orphanedProductVendors = await identifyOrphanedProductVendors(db)
    console.log(`Orphaned Product-Vendor Links: ${orphanedProductVendors.length}`)
    
    const orphanedVendorInventory = await identifyOrphanedVendorInventory(db)
    console.log(`Orphaned Vendor Inventory: ${orphanedVendorInventory.length}`)
    
    const totalOrphaned = orphanedShipments.length + orphanedGRNs.length + 
                          orphanedInvoices.length + orphanedProductVendors.length + 
                          orphanedVendorInventory.length
    
    if (totalOrphaned === 0) {
      console.log('\n✅ No orphaned records found. Nothing to clean up.')
      await mongoose.disconnect()
      return
    }
    
    // Create backup directory
    const backupDir = path.join(__dirname, '..', 'backups', `orphaned-records-${new Date().toISOString().split('T')[0]}`)
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true })
    }
    
    // Export orphaned records to JSON for backup
    console.log('\n' + '='.repeat(80))
    console.log('EXPORTING ORPHANED RECORDS FOR BACKUP')
    console.log('='.repeat(80))
    
    if (orphanedShipments.length > 0) {
      const shipmentBackupPath = path.join(backupDir, 'orphaned-shipments.json')
      fs.writeFileSync(shipmentBackupPath, JSON.stringify(orphanedShipments, null, 2))
      console.log(`Exported ${orphanedShipments.length} shipments to: ${shipmentBackupPath}`)
    }
    
    if (orphanedGRNs.length > 0) {
      const grnBackupPath = path.join(backupDir, 'orphaned-grns.json')
      fs.writeFileSync(grnBackupPath, JSON.stringify(orphanedGRNs, null, 2))
      console.log(`Exported ${orphanedGRNs.length} GRNs to: ${grnBackupPath}`)
    }
    
    if (orphanedInvoices.length > 0) {
      const invoiceBackupPath = path.join(backupDir, 'orphaned-invoices.json')
      fs.writeFileSync(invoiceBackupPath, JSON.stringify(orphanedInvoices, null, 2))
      console.log(`Exported ${orphanedInvoices.length} invoices to: ${invoiceBackupPath}`)
    }
    
    if (orphanedProductVendors.length > 0) {
      const pvBackupPath = path.join(backupDir, 'orphaned-product-vendors.json')
      fs.writeFileSync(pvBackupPath, JSON.stringify(orphanedProductVendors, null, 2))
      console.log(`Exported ${orphanedProductVendors.length} product-vendor links to: ${pvBackupPath}`)
    }
    
    if (orphanedVendorInventory.length > 0) {
      const viBackupPath = path.join(backupDir, 'orphaned-vendor-inventory.json')
      fs.writeFileSync(viBackupPath, JSON.stringify(orphanedVendorInventory, null, 2))
      console.log(`Exported ${orphanedVendorInventory.length} vendor inventory to: ${viBackupPath}`)
    }
    
    // Generate MongoDB commands
    console.log('\n' + '═'.repeat(80))
    console.log('CLEANUP COMMANDS (DO NOT RUN WITHOUT REVIEW)')
    console.log('═'.repeat(80))
    
    console.log('\n⚠️  IMPORTANT: Review each command carefully before executing!')
    console.log('⚠️  These commands will DELETE data permanently.')
    console.log('⚠️  Ensure you have backed up the database before proceeding.\n')
    
    if (orphanedShipments.length > 0) {
      const shipmentIds = orphanedShipments.map(s => `ObjectId("${s._id}")`).join(', ')
      console.log('\n--- DELETE ORPHANED SHIPMENTS ---')
      console.log(`// Count: ${orphanedShipments.length}`)
      console.log(`// Preview (first 5):`)
      orphanedShipments.slice(0, 5).forEach(s => {
        console.log(`//   ShipmentID: ${s.shipmentId}, PR#: ${s.prNumber}`)
      })
      console.log(`\ndb.shipments.deleteMany({ _id: { $in: [${shipmentIds}] } })`)
    }
    
    if (orphanedGRNs.length > 0) {
      const grnIds = orphanedGRNs.map(g => `ObjectId("${g._id}")`).join(', ')
      console.log('\n--- DELETE ORPHANED GRNs ---')
      console.log(`// Count: ${orphanedGRNs.length}`)
      console.log(`// Preview (first 5):`)
      orphanedGRNs.slice(0, 5).forEach(g => {
        console.log(`//   GRN#: ${g.grnNumber}, PO#: ${g.poNumber}`)
      })
      console.log(`\ndb.grns.deleteMany({ _id: { $in: [${grnIds}] } })`)
    }
    
    if (orphanedInvoices.length > 0) {
      const invoiceIds = orphanedInvoices.map(i => `ObjectId("${i._id}")`).join(', ')
      console.log('\n--- DELETE ORPHANED INVOICES ---')
      console.log(`// Count: ${orphanedInvoices.length}`)
      console.log(`// Preview (first 5):`)
      orphanedInvoices.slice(0, 5).forEach(i => {
        console.log(`//   Invoice#: ${i.invoiceNumber}, GRN: ${i.grnId}`)
      })
      console.log(`\ndb.invoices.deleteMany({ _id: { $in: [${invoiceIds}] } })`)
    }
    
    if (orphanedProductVendors.length > 0) {
      const pvIds = orphanedProductVendors.map(pv => `ObjectId("${pv._id}")`).join(', ')
      console.log('\n--- DELETE ORPHANED PRODUCT-VENDOR LINKS ---')
      console.log(`// Count: ${orphanedProductVendors.length}`)
      console.log(`// Preview (first 5):`)
      orphanedProductVendors.slice(0, 5).forEach(pv => {
        console.log(`//   Vendor: ${pv.vendorId}, Uniform: ${pv.uniformId}`)
      })
      console.log(`\ndb.productvendors.deleteMany({ _id: { $in: [${pvIds}] } })`)
    }
    
    if (orphanedVendorInventory.length > 0) {
      const viIds = orphanedVendorInventory.map(vi => `ObjectId("${vi._id}")`).join(', ')
      console.log('\n--- DELETE ORPHANED VENDOR INVENTORY ---')
      console.log(`// Count: ${orphanedVendorInventory.length}`)
      console.log(`// Preview (first 5):`)
      orphanedVendorInventory.slice(0, 5).forEach(vi => {
        console.log(`//   Vendor: ${vi.vendorId}, Uniform: ${vi.uniformId}`)
      })
      console.log(`\ndb.vendorinventories.deleteMany({ _id: { $in: [${viIds}] } })`)
    }
    
    // Summary and instructions
    console.log('\n' + '═'.repeat(80))
    console.log('MANUAL EXECUTION INSTRUCTIONS')
    console.log('═'.repeat(80))
    
    console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ⚠️  READ CAREFULLY ⚠️                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. REVIEW the backup files in:                                             │
│     ${backupDir}
│                                                                             │
│  2. VERIFY each orphaned record is truly orphaned                           │
│     (not just temporarily unlinked or pending)                              │
│                                                                             │
│  3. CREATE a full database backup before proceeding:                        │
│     mongodump --uri="<your-mongodb-uri>" --out=./backup-before-cleanup      │
│                                                                             │
│  4. CONNECT to MongoDB shell:                                               │
│     mongosh "<your-mongodb-uri>"                                            │
│                                                                             │
│  5. EXECUTE commands one at a time, verifying results                       │
│                                                                             │
│  6. VERIFY application functionality after each deletion                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

Summary:
- Orphaned Shipments to delete: ${orphanedShipments.length}
- Orphaned GRNs to delete: ${orphanedGRNs.length}
- Orphaned Invoices to delete: ${orphanedInvoices.length}
- Orphaned Product-Vendor links to delete: ${orphanedProductVendors.length}
- Orphaned Vendor Inventory to delete: ${orphanedVendorInventory.length}
- TOTAL records to delete: ${totalOrphaned}

Backup location: ${backupDir}
`)
    
    console.log('═'.repeat(80))
    console.log('SCRIPT COMPLETE — NO DELETIONS WERE PERFORMED')
    console.log('═'.repeat(80))
    
  } catch (error) {
    console.error('Migration error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

main()
