/**
 * Script to check Blazer-male product relationships
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

async function checkBlazerRelationships() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Find Blazer-male product
    const blazerProducts = await db.collection('uniforms').find({
      $or: [
        { name: { $regex: /blazer/i } },
        { category: { $regex: /blazer|jacket/i } }
      ],
      gender: 'male'
    }).toArray()
    
    console.log(`🔍 Found ${blazerProducts.length} male blazer/jacket products:\n`)
    
    for (const product of blazerProducts) {
      console.log(`📦 Product: ${product.name || product.id}`)
      console.log(`   ID: ${product.id || product._id}`)
      console.log(`   Category: ${product.category}`)
      console.log(`   Gender: ${product.gender}`)
      console.log(`   _id: ${product._id}\n`)
      
      // Check ProductCompany relationships
      const productIdStr = product._id.toString()
      const allProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
      const productCompanyLinks = allProductCompanyLinks.filter((link) => {
        const linkProductIdStr = link.productId?.toString ? link.productId.toString() : String(link.productId)
        return linkProductIdStr === productIdStr
      })
      
      console.log(`   🔗 ProductCompany relationships: ${productCompanyLinks.length}`)
      for (const link of productCompanyLinks) {
        const companyIdStr = link.companyId?.toString ? link.companyId.toString() : String(link.companyId)
        const company = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(companyIdStr) })
        console.log(`      - Company: ${company?.name || companyIdStr} (${company?.id || 'N/A'})`)
      }
      
      // Check ProductVendor relationships
      const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
      const productVendorLinks = allProductVendorLinks.filter((link) => {
        const linkProductIdStr = link.productId?.toString ? link.productId.toString() : String(link.productId)
        return linkProductIdStr === productIdStr
      })
      
      console.log(`   🏪 ProductVendor relationships: ${productVendorLinks.length}`)
      for (const link of productVendorLinks) {
        const vendorIdStr = link.vendorId?.toString ? link.vendorId.toString() : String(link.vendorId)
        const vendor = await db.collection('vendors').findOne({ _id: new mongoose.Types.ObjectId(vendorIdStr) })
        console.log(`      - Vendor: ${vendor?.name || vendorIdStr} (${vendor?.id || 'N/A'})`)
      }
      
      // Check derived vendor-company relationships
      if (productCompanyLinks.length > 0 && productVendorLinks.length > 0) {
        console.log(`   ✅ Has both ProductCompany and ProductVendor links - should be visible`)
        
        // Check if vendor supplies to company
        for (const pcLink of productCompanyLinks) {
          const companyIdStr = pcLink.companyId?.toString ? pcLink.companyId.toString() : String(pcLink.companyId)
          const company = await db.collection('companies').findOne({ _id: new mongoose.Types.ObjectId(companyIdStr) })
          
          for (const pvLink of productVendorLinks) {
            const vendorIdStr = pvLink.vendorId?.toString ? pvLink.vendorId.toString() : String(pvLink.vendorId)
            const vendor = await db.collection('vendors').findOne({ _id: new mongoose.Types.ObjectId(vendorIdStr) })
            
            // Check if this vendor supplies to this company (via derived relationship)
            // A vendor supplies to a company if there's at least one product that:
            // 1. Is linked to the company (ProductCompany) - we have this
            // 2. Is supplied by the vendor (ProductVendor) - we have this
            // So this vendor should supply to this company!
            console.log(`      🔄 Vendor ${vendor?.name || vendorIdStr} should supply to company ${company?.name || companyIdStr}`)
          }
        }
      } else {
        console.log(`   ⚠️  Missing relationships:`)
        if (productCompanyLinks.length === 0) {
          console.log(`      - No ProductCompany link`)
        }
        if (productVendorLinks.length === 0) {
          console.log(`      - No ProductVendor link`)
        }
      }
      
      console.log('')
    }
    
    // Also check Indigo company
    const indigo = await db.collection('companies').findOne({ $or: [{ id: 'COMP-INDIGO' }, { name: /indigo/i }] })
    if (indigo) {
      console.log(`\n🏢 Indigo Company:`)
      console.log(`   ID: ${indigo.id}`)
      console.log(`   Name: ${indigo.name}`)
      console.log(`   _id: ${indigo._id}\n`)
      
      // Get all ProductCompany links for Indigo
      const allProductCompanyLinksForIndigo = await db.collection('productcompanies').find({}).toArray()
      const indigoProductCompanyLinks = allProductCompanyLinksForIndigo.filter((link) => {
        const linkCompanyIdStr = link.companyId?.toString ? link.companyId.toString() : String(link.companyId)
        return linkCompanyIdStr === indigo._id.toString()
      })
      
      console.log(`   📦 Products linked to Indigo: ${indigoProductCompanyLinks.length}`)
      for (const link of indigoProductCompanyLinks.slice(0, 10)) {
        const productIdStr = link.productId?.toString ? link.productId.toString() : String(link.productId)
        const product = await db.collection('uniforms').findOne({ _id: new mongoose.Types.ObjectId(productIdStr) })
        if (product) {
          console.log(`      - ${product.name || product.id} (${product.category}, ${product.gender})`)
        }
      }
    }
    
    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    console.error('Stack:', error.stack)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkBlazerRelationships()

