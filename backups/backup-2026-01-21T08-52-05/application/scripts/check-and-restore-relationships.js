/**
 * Check and restore product-company and product-vendor relationships
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  envContent.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, ...valueParts] = trimmedLine.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found')
  process.exit(1)
}

async function checkAndRestoreRelationships() {
  try {
    await mongoose.connect(MONGODB_URI)
    const db = mongoose.connection.db
    
    console.log('\n🔍 Checking current relationships...\n')
    
    // Check current relationships
    const productCompanies = await db.collection('productcompanies').find({}).toArray()
    const productVendors = await db.collection('productvendors').find({}).toArray()
    
    console.log(`Current Product-Company relationships: ${productCompanies.length}`)
    console.log(`Current Product-Vendor relationships: ${productVendors.length}\n`)
    
    // Find backup file
    const backupDir = path.join(__dirname, '..', '..', 'mongodb-backup-2025-11-28T15-25-12')
    const backupFile = path.join(backupDir, 'database-backup.json')
    
    if (!fs.existsSync(backupFile)) {
      console.log('⚠️  Backup file not found. Looking for other backup files...\n')
      // Try to find any backup file
      const parentDir = path.join(__dirname, '..', '..')
      const files = fs.readdirSync(parentDir)
      const backupFiles = files.filter(f => f.includes('backup') && f.endsWith('.json'))
      
      if (backupFiles.length === 0) {
        console.log('❌ No backup file found. Cannot restore relationships.')
        await mongoose.disconnect()
        return
      }
      
      console.log(`Found backup files: ${backupFiles.join(', ')}`)
      // Use the first one
      const foundBackup = path.join(parentDir, backupFiles[0])
      console.log(`Using: ${foundBackup}\n`)
      
      const backupData = JSON.parse(fs.readFileSync(foundBackup, 'utf8'))
      
      // Restore productcompanies
      if (backupData.productcompanies && backupData.productcompanies.length > 0) {
        console.log(`\n📦 Restoring ${backupData.productcompanies.length} Product-Company relationships...`)
        // Clear existing
        await db.collection('productcompanies').deleteMany({})
        // Insert from backup
        for (const rel of backupData.productcompanies) {
          // Convert string IDs to ObjectIds if needed
          const product = await db.collection('uniforms').findOne({ id: rel.productId || rel.product })
          const company = await db.collection('companies').findOne({ id: rel.companyId || rel.company })
          
          if (product && company) {
            await db.collection('productcompanies').insertOne({
              productId: product._id,
              companyId: company._id
            })
          }
        }
        console.log('✅ Product-Company relationships restored')
      }
      
      // Restore productvendors
      if (backupData.productvendors && backupData.productvendors.length > 0) {
        console.log(`\n📦 Restoring ${backupData.productvendors.length} Product-Vendor relationships...`)
        // Clear existing
        await db.collection('productvendors').deleteMany({})
        // Insert from backup
        for (const rel of backupData.productvendors) {
          const product = await db.collection('uniforms').findOne({ id: rel.productId || rel.product })
          const vendor = await db.collection('vendors').findOne({ id: rel.vendorId || rel.vendor })
          
          if (product && vendor) {
            await db.collection('productvendors').insertOne({
              productId: product._id,
              vendorId: vendor._id
            })
          }
        }
        console.log('✅ Product-Vendor relationships restored')
      }
    } else {
      console.log(`📦 Found backup file: ${backupFile}\n`)
      const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
      
      // Restore productcompanies using default relationships from lib/data.ts
      const defaultRelationships = [
        // UniformPro products for Indigo
        { productId: '1', companyId: 'COMP-INDIGO' },
        { productId: '2', companyId: 'COMP-INDIGO' },
        { productId: '3', companyId: 'COMP-INDIGO' },
        { productId: '4', companyId: 'COMP-INDIGO' },
        { productId: '7', companyId: 'COMP-INDIGO' },
        { productId: '8', companyId: 'COMP-INDIGO' },
        // UniformPro products for Akasa
        { productId: '1', companyId: 'COMP-AKASA' },
        { productId: '2', companyId: 'COMP-AKASA' },
        { productId: '3', companyId: 'COMP-AKASA' },
        { productId: '4', companyId: 'COMP-AKASA' },
        // Footwear Plus products for Indigo
        { productId: '5', companyId: 'COMP-INDIGO' },
        { productId: '6', companyId: 'COMP-INDIGO' },
        // Footwear Plus products for Akasa
        { productId: '5', companyId: 'COMP-AKASA' },
        { productId: '6', companyId: 'COMP-AKASA' },
        // Footwear Plus products for Air India
        { productId: '5', companyId: 'COMP-AIRINDIA' },
        { productId: '6', companyId: 'COMP-AIRINDIA' }
      ]
      
      console.log(`\n📦 Restoring ${defaultRelationships.length} Product-Company relationships...`)
      // Clear existing
      await db.collection('productcompanies').deleteMany({})
      let restored = 0
      
      for (const rel of defaultRelationships) {
        const product = await db.collection('uniforms').findOne({ id: rel.productId })
        const company = await db.collection('companies').findOne({ id: rel.companyId })
        
        if (!product) {
          console.log(`  ⚠️  Product not found: ${rel.productId}`)
          continue
        }
        
        if (!company) {
          console.log(`  ⚠️  Company not found: ${rel.companyId}`)
          continue
        }
        
        // Check if relationship already exists
        const existing = await db.collection('productcompanies').findOne({
          productId: product._id,
          companyId: company._id
        })
        
        if (!existing) {
          await db.collection('productcompanies').insertOne({
            productId: product._id,
            companyId: company._id
          })
          restored++
          console.log(`  ✓ ${rel.productId} -> ${rel.companyId}`)
        }
      }
      console.log(`✅ Restored ${restored} Product-Company relationships`)
      
      // Restore productvendors using default relationships from lib/data.ts
      const defaultVendorRelationships = [
        // UniformPro products
        { productId: '1', vendorId: 'VEND-001' },
        { productId: '2', vendorId: 'VEND-001' },
        { productId: '3', vendorId: 'VEND-001' },
        { productId: '4', vendorId: 'VEND-001' },
        { productId: '7', vendorId: 'VEND-001' },
        { productId: '8', vendorId: 'VEND-001' },
        // Footwear Plus products
        { productId: '5', vendorId: 'VEND-002' },
        { productId: '6', vendorId: 'VEND-002' }
      ]
      
      console.log(`\n📦 Restoring ${defaultVendorRelationships.length} Product-Vendor relationships...`)
      // Clear existing
      await db.collection('productvendors').deleteMany({})
      let restoredPV = 0
      
      for (const rel of defaultVendorRelationships) {
        const product = await db.collection('uniforms').findOne({ id: rel.productId })
        const vendor = await db.collection('vendors').findOne({ id: rel.vendorId })
        
        if (!product) {
          console.log(`  ⚠️  Product not found: ${rel.productId}`)
          continue
        }
        
        if (!vendor) {
          console.log(`  ⚠️  Vendor not found: ${rel.vendorId}`)
          continue
        }
        
        // Check if relationship already exists
        const existing = await db.collection('productvendors').findOne({
          productId: product._id,
          vendorId: vendor._id
        })
        
        if (!existing) {
          await db.collection('productvendors').insertOne({
            productId: product._id,
            vendorId: vendor._id
          })
          restoredPV++
          console.log(`  ✓ ${rel.productId} -> ${rel.vendorId}`)
        }
      }
      console.log(`✅ Restored ${restoredPV} Product-Vendor relationships`)
    }
    
    // Show final counts
    const finalPC = await db.collection('productcompanies').find({}).toArray()
    const finalPV = await db.collection('productvendors').find({}).toArray()
    
    console.log(`\n📊 Final Relationship Counts:`)
    console.log(`   Product-Company: ${finalPC.length}`)
    console.log(`   Product-Vendor: ${finalPV.length}\n`)
    
    await mongoose.disconnect()
  } catch (error) {
    console.error('❌ Error:', error.message)
    console.error(error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkAndRestoreRelationships()

