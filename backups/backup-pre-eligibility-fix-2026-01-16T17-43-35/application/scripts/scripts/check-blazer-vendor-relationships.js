/**
 * Script to check vendor relationships for Blazer - Female product
 * This will help identify why the product is not showing for Sarika Jain
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

// Schema definitions
const UniformSchema = new mongoose.Schema({}, { strict: false, collection: 'uniforms', strictPopulate: false })
const VendorSchema = new mongoose.Schema({}, { strict: false, collection: 'vendors', strictPopulate: false })
const CompanySchema = new mongoose.Schema({}, { strict: false, collection: 'companies', strictPopulate: false })
const ProductVendorSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }
}, { strict: false, collection: 'productvendors', strictPopulate: false })
const VendorCompanySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { strict: false, collection: 'vendorcompanies', strictPopulate: false })
const ProductCompanySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { strict: false, collection: 'productcompanies', strictPopulate: false })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema)
const VendorCompany = mongoose.models.VendorCompany || mongoose.model('VendorCompany', VendorCompanySchema)
const ProductCompany = mongoose.models.ProductCompany || mongoose.model('ProductCompany', ProductCompanySchema)

async function checkBlazerRelationships() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find Blazer - Female product
    const blazerProduct = await Uniform.findOne({ name: /Blazer.*Female/i })
    if (!blazerProduct) {
      console.log('❌ Blazer - Female product not found')
      await mongoose.disconnect()
      return
    }

    console.log(`📦 Found product: ${blazerProduct.name} (ID: ${blazerProduct.id})`)
    console.log(`   Product ObjectId: ${blazerProduct._id}\n`)

    // Check ProductCompany relationships
    const productCompanyLinks = await ProductCompany.find({ productId: blazerProduct._id })
      .populate('companyId', 'id name')
      .lean()
    
    console.log(`🔗 Product-Company Links (${productCompanyLinks.length}):`)
    productCompanyLinks.forEach(link => {
      const company = link.companyId
      console.log(`   - Linked to company: ${company?.name || 'Unknown'} (ID: ${company?.id || 'N/A'})`)
    })
    console.log()

    // Check ProductVendor relationships
    const productVendorLinks = await ProductVendor.find({ productId: blazerProduct._id })
      .populate('vendorId', 'id name')
      .lean()
    
    console.log(`🏭 Product-Vendor Links (${productVendorLinks.length}):`)
    if (productVendorLinks.length === 0) {
      console.log('   ❌ NO VENDORS LINKED TO THIS PRODUCT!')
    } else {
      for (const link of productVendorLinks) {
        const vendor = link.vendorId
        console.log(`   - Vendor: ${vendor?.name || 'Unknown'} (ID: ${vendor?.id || 'N/A'})`)
        console.log(`     Vendor ObjectId: ${vendor?._id}`)
        
        // Check if this vendor supplies to Indigo
        const vendorCompanyLinks = await VendorCompany.find({ 
          vendorId: vendor?._id,
          companyId: (await Company.findOne({ id: 'COMP-INDIGO' }))?._id
        })
          .populate('companyId', 'id name')
          .lean()
        
        if (vendorCompanyLinks.length > 0) {
          console.log(`     ✅ This vendor DOES supply to Indigo Airlines`)
        } else {
          console.log(`     ❌ This vendor DOES NOT supply to Indigo Airlines`)
          
          // Check which companies this vendor DOES supply to
          const allVendorCompanyLinks = await VendorCompany.find({ vendorId: vendor?._id })
            .populate('companyId', 'id name')
            .lean()
          
          if (allVendorCompanyLinks.length > 0) {
            console.log(`     📋 Vendor supplies to:`)
            allVendorCompanyLinks.forEach(vcLink => {
              console.log(`        - ${vcLink.companyId?.name || 'Unknown'} (${vcLink.companyId?.id || 'N/A'})`)
            })
          } else {
            console.log(`     ⚠️  Vendor is not linked to ANY company!`)
          }
        }
        console.log()
      }
    }

    // Check if Indigo exists
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found in database')
    } else {
      console.log(`\n✅ Indigo Airlines found: ${indigo.name} (ObjectId: ${indigo._id})`)
      
      // List all vendors that supply to Indigo
      const indigoVendorLinks = await VendorCompany.find({ companyId: indigo._id })
        .populate('vendorId', 'id name')
        .lean()
      
      console.log(`\n🏭 Vendors that supply to Indigo (${indigoVendorLinks.length}):`)
      indigoVendorLinks.forEach(link => {
        console.log(`   - ${link.vendorId?.name || 'Unknown'} (ID: ${link.vendorId?.id || 'N/A'})`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkBlazerRelationships()

