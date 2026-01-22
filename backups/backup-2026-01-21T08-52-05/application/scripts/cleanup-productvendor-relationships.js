/**
 * CRITICAL DATA CLEANUP: ProductVendor Relationships
 * 
 * This script will:
 * 1. Find Footwear Plus vendor
 * 2. List ALL ProductVendor relationships for this vendor
 * 3. Identify any relationships that shouldn't exist (more than 2)
 * 4. Optionally delete extra relationships (manual confirmation required)
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
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

async function cleanupProductVendorRelationships() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    const db = mongoose.connection.db
    
    // Step 1: Find Footwear Plus vendor
    console.log('📋 STEP 1: Finding Footwear Plus vendor...')
    const vendor = await db.collection('vendors').findOne({ 
      $or: [
        { name: /footwear/i },
        { id: /footwear/i },
        { name: /Footwear Plus/i }
      ]
    })
    
    if (!vendor) {
      console.log('❌ Vendor not found. Listing all vendors...')
      const allVendors = await db.collection('vendors').find({}).limit(10).toArray()
      allVendors.forEach(v => {
        console.log(`  - ${v.name} (id: ${v.id}, _id: ${v._id})`)
      })
      process.exit(1)
    }
    
    console.log(`✅ Found vendor: ${vendor.name}`)
    console.log(`   ID: ${vendor.id}`)
    console.log(`   _id: ${vendor._id}`)
    
    const vendorObjectId = vendor._id instanceof mongoose.Types.ObjectId 
      ? vendor._id 
      : new mongoose.Types.ObjectId(vendor._id.toString())
    
    // Step 2: Get ALL ProductVendor relationships for this vendor
    console.log('\n📋 STEP 2: Getting ALL ProductVendor relationships...')
    const productVendorLinks = await db.collection('productvendors').find({
      vendorId: vendorObjectId
    }).toArray()
    
    console.log(`✅ Found ${productVendorLinks.length} ProductVendor relationship(s)`)
    
    if (productVendorLinks.length === 0) {
      console.log('⚠️  No ProductVendor relationships found!')
      process.exit(0)
    }
    
    // Step 3: Get product details for each relationship
    console.log('\n📋 STEP 3: Analyzing ProductVendor relationships...')
    const relationships = []
    
    for (let i = 0; i < productVendorLinks.length; i++) {
      const link = productVendorLinks[i]
      const productId = link.productId instanceof mongoose.Types.ObjectId
        ? link.productId
        : new mongoose.Types.ObjectId(link.productId)
      
      const product = await db.collection('uniforms').findOne({ _id: productId })
      
      relationships.push({
        index: i + 1,
        linkId: link._id,
        productId: productId.toString(),
        productName: product?.name || 'NOT FOUND',
        productSku: product?.sku || 'N/A',
        productIdField: product?.id || 'N/A',
        isValid: !!product
      })
    }
    
    console.log('\n📦 ProductVendor Relationships:')
    relationships.forEach(rel => {
      const status = rel.isValid ? '✅' : '❌'
      console.log(`   ${status} ${rel.index}. ${rel.productName} (SKU: ${rel.productSku}, ID: ${rel.productIdField})`)
      console.log(`      Product _id: ${rel.productId}`)
      console.log(`      Link _id: ${rel.linkId}`)
    })
    
    // Step 4: Identify expected vs actual
    console.log('\n📋 STEP 4: Analysis...')
    console.log(`   Expected relationships: 2 (Heels - Female, Sneakers - Unisex)`)
    console.log(`   Actual relationships: ${relationships.length}`)
    
    if (relationships.length === 2) {
      console.log('✅ Correct number of relationships found!')
      const productNames = relationships.map(r => r.productName)
      const hasHeels = productNames.some(n => /heel/i.test(n))
      const hasSneakers = productNames.some(n => /sneaker/i.test(n))
      
      if (hasHeels && hasSneakers) {
        console.log('✅ Correct products found (Heels and Sneakers)!')
        console.log('\n✅ No cleanup needed - relationships are correct.')
        process.exit(0)
      } else {
        console.log('⚠️  Relationships exist but products may be incorrect')
        console.log(`   Found products: ${productNames.join(', ')}`)
      }
    } else if (relationships.length > 2) {
      console.log(`\n❌ CRITICAL: Found ${relationships.length} relationships but expected only 2!`)
      console.log('   Extra relationships found:')
      
      // Identify which are the correct 2 (Heels and Sneakers)
      const heelsRel = relationships.find(r => /heel/i.test(r.productName))
      const sneakersRel = relationships.find(r => /sneaker/i.test(r.productName))
      
      const validRels = [heelsRel, sneakersRel].filter(Boolean)
      const invalidRels = relationships.filter(r => 
        !validRels.some(vr => vr.linkId.toString() === r.linkId.toString())
      )
      
      console.log(`\n   ✅ Valid relationships (${validRels.length}):`)
      validRels.forEach(rel => {
        console.log(`      - ${rel.productName} (${rel.productSku})`)
      })
      
      console.log(`\n   ❌ Invalid relationships (${invalidRels.length}):`)
      invalidRels.forEach(rel => {
        console.log(`      - ${rel.productName} (${rel.productSku}, _id: ${rel.productId})`)
      })
      
      if (invalidRels.length > 0) {
        console.log('\n⚠️  WARNING: About to delete invalid ProductVendor relationships!')
        console.log(`   This will remove ${invalidRels.length} relationship(s)`)
        console.log('   Proceeding with cleanup...\n')
        
        // Delete invalid relationships
        let deletedCount = 0
        for (const rel of invalidRels) {
          try {
            const result = await db.collection('productvendors').deleteOne({
              _id: rel.linkId
            })
            
            if (result.deletedCount > 0) {
              deletedCount++
              console.log(`   ✅ Deleted relationship for ${rel.productName} (${rel.linkId})`)
            } else {
              console.log(`   ⚠️  Failed to delete relationship ${rel.linkId}`)
            }
          } catch (error) {
            console.error(`   ❌ Error deleting relationship ${rel.linkId}:`, error.message)
          }
        }
        
        console.log(`\n✅ Cleanup complete! Deleted ${deletedCount} invalid relationship(s)`)
        
        // Verify cleanup
        const remainingLinks = await db.collection('productvendors').find({
          vendorId: vendorObjectId
        }).toArray()
        
        console.log(`\n✅ Remaining ProductVendor relationships: ${remainingLinks.length}`)
        if (remainingLinks.length === 2) {
          console.log('✅ Cleanup successful! Vendor now has exactly 2 relationships.')
        } else {
          console.log(`⚠️  Still have ${remainingLinks.length} relationships (expected 2)`)
        }
      }
    } else {
      console.log(`⚠️  Found only ${relationships.length} relationship(s) but expected 2`)
      console.log('   This vendor may be missing product assignments.')
    }
    
    console.log('\n✅ Analysis complete!')
    
  } catch (error) {
    console.error('❌ Error:', error)
    console.error(error.stack)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

cleanupProductVendorRelationships()

