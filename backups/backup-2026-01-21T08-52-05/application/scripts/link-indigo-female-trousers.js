/**
 * Script to link "Indigo Formal Trousers - Female" product to Indigo Airlines
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
const CompanySchema = new mongoose.Schema({}, { strict: false, collection: 'companies', strictPopulate: false })
const ProductCompanySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { strict: false, collection: 'productcompanies', strictPopulate: false })
const VendorSchema = new mongoose.Schema({}, { strict: false, collection: 'vendors', strictPopulate: false })
const ProductVendorSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform' },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' }
}, { strict: false, collection: 'productvendors', strictPopulate: false })
const VendorCompanySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor' },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }
}, { strict: false, collection: 'vendorcompanies', strictPopulate: false })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const ProductCompany = mongoose.models.ProductCompany || mongoose.model('ProductCompany', ProductCompanySchema)
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema)
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema)
const VendorCompany = mongoose.models.VendorCompany || mongoose.model('VendorCompany', VendorCompanySchema)

async function linkIndigoFemaleTrousers() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find the product
    const product = await Uniform.findOne({ name: 'Indigo Formal Trousers - Female' })
    if (!product) {
      console.log('❌ Product "Indigo Formal Trousers - Female" not found')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found product: ${product.name} (ID: ${product.id})\n`)

    // Find Indigo Airlines
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found company: ${indigo.name} (ID: ${indigo.id})\n`)

    // Check if already linked
    const existingLink = await ProductCompany.findOne({
      productId: product._id,
      companyId: indigo._id
    })

    if (existingLink) {
      console.log('✅ Product is already linked to Indigo Airlines')
    } else {
      // Create the link
      await ProductCompany.create({
        productId: product._id,
        companyId: indigo._id
      })
      console.log('✅ Created ProductCompany link\n')
    }

    // Check vendor relationships - need to ensure there's a vendor that can fulfill this
    // First, find which vendors supply this product
    const productVendorLinks = await ProductVendor.find({ productId: product._id })
      .populate('vendorId')
      .lean()

    console.log(`📦 Vendors that supply this product: ${productVendorLinks.length}`)
    productVendorLinks.forEach(link => {
      console.log(`   - ${link.vendorId?.name || 'Unknown'} (ID: ${link.vendorId?.id || 'N/A'})`)
    })

    // Check if any of these vendors are linked to Indigo
    if (productVendorLinks.length > 0) {
      for (const pvLink of productVendorLinks) {
        const vendorId = pvLink.vendorId?._id
        if (vendorId) {
          const vendorCompanyLink = await VendorCompany.findOne({
            vendorId: vendorId,
            companyId: indigo._id
          })

          if (vendorCompanyLink) {
            console.log(`\n✅ Vendor "${pvLink.vendorId.name}" is already linked to Indigo Airlines`)
          } else {
            console.log(`\n⚠️  Vendor "${pvLink.vendorId.name}" is NOT linked to Indigo Airlines`)
            console.log(`   This product will not appear in the catalog until the vendor is linked to Indigo`)
          }
        }
      }
    } else {
      console.log('\n⚠️  No vendors are linked to this product')
      console.log('   This product will not appear in the catalog until a vendor is linked')
    }

    // Verify the link
    const verifyLink = await ProductCompany.findOne({
      productId: product._id,
      companyId: indigo._id
    })

    if (verifyLink) {
      console.log('\n✅ Verification: Product is now linked to Indigo Airlines')
    } else {
      console.log('\n❌ Verification failed: Link was not created')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

linkIndigoFemaleTrousers()


