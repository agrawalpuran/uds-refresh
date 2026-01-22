/**
 * Backfill script to create vendorInventory records for all existing ProductVendor relationships
 * 
 * This script:
 * 1. Finds all ProductVendor relationships
 * 2. Creates corresponding VendorInventory records if they don't exist
 * 3. Is idempotent (safe to run multiple times)
 * 
 * Run: node scripts/backfill-vendor-inventory.js
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Try to load .env.local
let MONGODB_URI = process.env.MONGODB_URI
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
      console.log('✅ Loaded MONGODB_URI from .env.local')
    }
  }
} catch (error) {
  console.log('⚠️  Could not read .env.local, using process.env.MONGODB_URI')
}

if (!MONGODB_URI) {
  MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'
  console.log('⚠️  Using default MONGODB_URI:', MONGODB_URI)
}

// Define schemas (simplified for script)
const VendorInventorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Vendor' },
  productId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'Uniform' },
  sizeInventory: { type: Map, of: Number, default: {} },
  totalStock: { type: Number, required: true, default: 0 },
  lowInventoryThreshold: { type: Map, of: Number, default: {} },
}, { timestamps: true })

// Pre-save hook to calculate totalStock
VendorInventorySchema.pre('save', function (next) {
  if (this.sizeInventory && typeof this.sizeInventory === 'object') {
    const sizeMap = this.sizeInventory instanceof Map 
      ? this.sizeInventory 
      : new Map(Object.entries(this.sizeInventory))
    
    let total = 0
    for (const quantity of sizeMap.values()) {
      total += typeof quantity === 'number' ? quantity : 0
    }
    this.totalStock = total
  } else {
    this.totalStock = 0
  }
  next()
})

const VendorInventory = mongoose.models.VendorInventory || mongoose.model('VendorInventory', VendorInventorySchema)

async function backfillVendorInventory() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // Step 1: Get all ProductVendor relationships
    console.log('📊 Step 1: Finding all ProductVendor relationships...')
    const productVendorLinks = await db.collection('productvendors').find({}).toArray()
    console.log(`   Found ${productVendorLinks.length} ProductVendor relationships\n`)

    if (productVendorLinks.length === 0) {
      console.log('⚠️  No ProductVendor relationships found. Nothing to backfill.')
      await mongoose.disconnect()
      return
    }

    // Step 2: Get existing VendorInventory records
    console.log('📊 Step 2: Checking existing VendorInventory records...')
    const existingInventories = await db.collection('vendorinventories').find({}).toArray()
    const existingInventoryMap = new Map()
    existingInventories.forEach(inv => {
      const key = `${inv.vendorId.toString()}_${inv.productId.toString()}`
      existingInventoryMap.set(key, inv)
    })
    console.log(`   Found ${existingInventories.length} existing inventory records\n`)

    // Step 3: Create inventory records for missing relationships
    console.log('📊 Step 3: Creating missing VendorInventory records...')
    let created = 0
    let skipped = 0
    let errors = 0

    for (const link of productVendorLinks) {
      try {
        const vendorId = link.vendorId instanceof mongoose.Types.ObjectId 
          ? link.vendorId 
          : new mongoose.Types.ObjectId(link.vendorId)
        const productId = link.productId instanceof mongoose.Types.ObjectId 
          ? link.productId 
          : new mongoose.Types.ObjectId(link.productId)

        const key = `${vendorId.toString()}_${productId.toString()}`
        
        // Check if inventory already exists
        if (existingInventoryMap.has(key)) {
          skipped++
          continue
        }

        // Generate unique inventory ID
        const inventoryId = `VEND-INV-${Date.now()}-${Math.random().toString(36).substr(2, 5).toUpperCase()}`

        // Create inventory record with default values
        const inventoryData = {
          id: inventoryId,
          vendorId: vendorId,
          productId: productId,
          sizeInventory: new Map(), // Empty initially
          totalStock: 0, // Default to 0
          lowInventoryThreshold: new Map(), // Empty initially (no alerts)
        }

        // Use findOneAndUpdate with upsert to ensure idempotency
        await VendorInventory.findOneAndUpdate(
          { vendorId: vendorId, productId: productId },
          inventoryData,
          { upsert: true, new: true }
        )

        created++
        
        // Log progress every 10 records
        if (created % 10 === 0) {
          console.log(`   Progress: ${created} created, ${skipped} skipped...`)
        }
      } catch (error) {
        errors++
        console.error(`   ❌ Error creating inventory for vendor ${link.vendorId} / product ${link.productId}:`, error.message)
      }
    }

    console.log(`\n✅ Backfill complete!`)
    console.log(`   Created: ${created} inventory records`)
    console.log(`   Skipped: ${skipped} (already exist)`)
    console.log(`   Errors: ${errors}`)

    // Step 4: Verify results
    console.log('\n📊 Step 4: Verifying results...')
    const finalInventoryCount = await db.collection('vendorinventories').countDocuments({})
    console.log(`   Total VendorInventory records: ${finalInventoryCount}`)
    console.log(`   Expected: ${productVendorLinks.length}`)
    
    if (finalInventoryCount >= productVendorLinks.length) {
      console.log('   ✅ All ProductVendor relationships have corresponding inventory records!')
    } else {
      console.log(`   ⚠️  Warning: ${productVendorLinks.length - finalInventoryCount} relationships may be missing inventory records`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

backfillVendorInventory()

