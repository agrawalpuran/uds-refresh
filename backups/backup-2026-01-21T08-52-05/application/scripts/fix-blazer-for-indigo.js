/**
 * Script to fix Blazer - Female product for Indigo Airlines
 * This will:
 * 1. Link the Blazer - Female product to Indigo Airlines
 * 2. Link Elite Uniforms vendor to Indigo Airlines (so they can supply the blazer)
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

async function fixBlazerForIndigo() {
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

    // Find Indigo Airlines
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`🏢 Found company: ${indigo.name} (ID: ${indigo.id})\n`)

    // 1. Link product to company
    const existingProductCompany = await ProductCompany.findOne({
      productId: blazerProduct._id,
      companyId: indigo._id
    })

    if (existingProductCompany) {
      console.log('✅ Product-Company link already exists')
    } else {
      await ProductCompany.create({
        productId: blazerProduct._id,
        companyId: indigo._id
      })
      console.log('✅ Created Product-Company link')
    }

    // 2. Find Elite Uniforms vendor
    const eliteVendor = await Vendor.findOne({ id: 'VEND-003' })
    if (!eliteVendor) {
      console.log('❌ Elite Uniforms (VEND-003) vendor not found')
      await mongoose.disconnect()
      return
    }

    console.log(`🏭 Found vendor: ${eliteVendor.name} (ID: ${eliteVendor.id})\n`)

    // 3. Link vendor to company
    const existingVendorCompany = await VendorCompany.findOne({
      vendorId: eliteVendor._id,
      companyId: indigo._id
    })

    if (existingVendorCompany) {
      console.log('✅ Vendor-Company link already exists')
    } else {
      await VendorCompany.create({
        vendorId: eliteVendor._id,
        companyId: indigo._id
      })
      console.log('✅ Created Vendor-Company link')
    }

    // Verify the fix
    console.log('\n🔍 Verifying relationships...')
    const productCompanyCheck = await ProductCompany.findOne({
      productId: blazerProduct._id,
      companyId: indigo._id
    })
    const vendorCompanyCheck = await VendorCompany.findOne({
      vendorId: eliteVendor._id,
      companyId: indigo._id
    })
    const productVendorCheck = await ProductVendor.findOne({
      productId: blazerProduct._id,
      vendorId: eliteVendor._id
    })

    if (productCompanyCheck && vendorCompanyCheck && productVendorCheck) {
      console.log('✅ All relationships are now in place!')
      console.log('   - Product is linked to Indigo Airlines')
      console.log('   - Vendor is linked to Indigo Airlines')
      console.log('   - Vendor supplies the product')
      console.log('\n🎉 The Blazer - Female product should now be visible for Indigo employees!')
    } else {
      console.log('⚠️  Some relationships are missing:')
      if (!productCompanyCheck) console.log('   - Product-Company link missing')
      if (!vendorCompanyCheck) console.log('   - Vendor-Company link missing')
      if (!productVendorCheck) console.log('   - Product-Vendor link missing')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

fixBlazerForIndigo()


