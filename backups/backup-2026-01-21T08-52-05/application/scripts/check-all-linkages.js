/**
 * Comprehensive diagnostic script to check all linkages and ID mappings
 * for product "Leather Dress Shoes - Male" (id: 5)
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
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local, using default connection string')
}

async function checkAllLinkages() {
  try {
    console.log('='.repeat(80))
    console.log('COMPREHENSIVE LINKAGE DIAGNOSTIC')
    console.log('='.repeat(80))
    console.log()

    await mongoose.connect(MONGODB_URI)
    console.log('✓ Connected to MongoDB\n')

    const db = mongoose.connection.db

    // 1. Check Product
    console.log('1. CHECKING PRODUCT (id: 5)')
    console.log('-'.repeat(80))
    const product = await db.collection('uniforms').findOne({ id: '5' })
    if (!product) {
      console.log('❌ Product with id "5" not found')
      // List available products
      const products = await db.collection('uniforms').find({}, { projection: { id: 1, name: 1 } }).limit(10).toArray()
      console.log('Available products:', products.map(p => `id=${p.id}, name=${p.name}`))
      await mongoose.disconnect()
      return
    }
    console.log(`✓ Product found:`)
    console.log(`  - id: ${product.id}`)
    console.log(`  - name: ${product.name}`)
    console.log(`  - _id: ${product._id.toString()}`)
    console.log()

    // 2. Check Companies
    console.log('2. CHECKING COMPANIES')
    console.log('-'.repeat(80))
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`Found ${companies.length} companies:`)
    companies.forEach(c => {
      console.log(`  - id: ${c.id}, name: ${c.name}, _id: ${c._id.toString()}`)
    })
    console.log()

    // 3. Check ProductCompany Links
    console.log('3. CHECKING PRODUCT-COMPANY LINKS')
    console.log('-'.repeat(80))
    const productIdObj = product._id
    const productCompanyLinks = await db.collection('productcompanies').find({
      productId: productIdObj
    }).toArray()
    
    console.log(`Found ${productCompanyLinks.length} ProductCompany link(s) for product ${product.id}:`)
    if (productCompanyLinks.length === 0) {
      console.log('❌ No ProductCompany links found!')
    } else {
      for (const link of productCompanyLinks) {
        const companyIdObj = link.companyId
        const company = companies.find(c => c._id.toString() === companyIdObj.toString())
        console.log(`  - companyId: ${companyIdObj.toString()}`)
        console.log(`    Company: ${company ? `id=${company.id}, name=${company.name}` : 'NOT FOUND'}`)
      }
    }
    console.log()

    // 4. Check ProductVendor Links (with and without companyId)
    console.log('4. CHECKING PRODUCT-VENDOR LINKS')
    console.log('-'.repeat(80))
    const productVendorLinks = await db.collection('productvendors').find({
      productId: productIdObj
    }).toArray()
    
    console.log(`Found ${productVendorLinks.length} ProductVendor link(s) for product ${product.id}:`)
    if (productVendorLinks.length === 0) {
      console.log('❌ No ProductVendor links found!')
    } else {
      const vendors = await db.collection('vendors').find({}).toArray()
      for (const link of productVendorLinks) {
        const vendorIdObj = link.vendorId
        const companyIdObj = link.companyId
        const vendor = vendors.find(v => v._id.toString() === vendorIdObj.toString())
        const company = companyIdObj ? companies.find(c => c._id.toString() === companyIdObj.toString()) : null
        
        console.log(`  - vendorId: ${vendorIdObj.toString()}`)
        console.log(`    Vendor: ${vendor ? `id=${vendor.id}, name=${vendor.name}` : 'NOT FOUND'}`)
        console.log(`  - companyId: ${companyIdObj ? companyIdObj.toString() : 'MISSING ❌'}`)
        console.log(`    Company: ${company ? `id=${company.id}, name=${company.name}` : companyIdObj ? 'NOT FOUND' : 'N/A'}`)
        console.log()
      }
    }
    console.log()

    // 5. Check for specific company (e.g., Indigo - id: 3)
    console.log('5. CHECKING FOR SPECIFIC COMPANY (Indigo - id: 3)')
    console.log('-'.repeat(80))
    const indigoCompany = companies.find(c => c.id === '3' || c.id === 3)
    if (!indigoCompany) {
      console.log('❌ Company with id "3" (Indigo) not found')
    } else {
      console.log(`✓ Company found:`)
      console.log(`  - id: ${indigoCompany.id}`)
      console.log(`  - name: ${indigoCompany.name}`)
      console.log(`  - _id: ${indigoCompany._id.toString()}`)
      console.log()

      // Check ProductCompany link for this company
      const pcLink = productCompanyLinks.find(l => 
        l.companyId.toString() === indigoCompany._id.toString()
      )
      if (pcLink) {
        console.log(`✓ ProductCompany link exists for company ${indigoCompany.id}`)
      } else {
        console.log(`❌ ProductCompany link MISSING for company ${indigoCompany.id}`)
      }
      console.log()

      // Check ProductVendor link for this company
      const pvLink = productVendorLinks.find(l => 
        l.companyId && l.companyId.toString() === indigoCompany._id.toString()
      )
      if (pvLink) {
        console.log(`✓ ProductVendor link exists for company ${indigoCompany.id}`)
        const vendorIdObj = pvLink.vendorId
        const vendors = await db.collection('vendors').find({}).toArray()
        const vendor = vendors.find(v => v._id.toString() === vendorIdObj.toString())
        console.log(`  - vendorId: ${vendorIdObj.toString()}`)
        console.log(`  - Vendor: ${vendor ? `id=${vendor.id}, name=${vendor.name}` : 'NOT FOUND'}`)
      } else {
        console.log(`❌ ProductVendor link MISSING or has no companyId for company ${indigoCompany.id}`)
        console.log(`   Available ProductVendor links:`)
        productVendorLinks.forEach((l, i) => {
          console.log(`     ${i + 1}. vendorId: ${l.vendorId.toString()}, companyId: ${l.companyId ? l.companyId.toString() : 'MISSING'}`)
        })
      }
    }
    console.log()

    // 6. Test the lookup logic
    console.log('6. TESTING LOOKUP LOGIC')
    console.log('-'.repeat(80))
    if (indigoCompany) {
      const productIdStr = product._id.toString()
      const companyIdStr = indigoCompany._id.toString()
      
      console.log(`Looking for ProductVendor links with:`)
      console.log(`  - productId: ${productIdStr}`)
      console.log(`  - companyId: ${companyIdStr}`)
      console.log()

      const matchingLinks = productVendorLinks.filter(pv => {
        const pvProductIdStr = pv.productId ? pv.productId.toString() : null
        const pvCompanyIdStr = pv.companyId ? pv.companyId.toString() : null
        
        const productMatches = pvProductIdStr === productIdStr
        const companyMatches = pvCompanyIdStr === companyIdStr
        
        console.log(`  Link: productId=${pvProductIdStr}, companyId=${pvCompanyIdStr || 'MISSING'}`)
        console.log(`    - Product matches: ${productMatches}`)
        console.log(`    - Company matches: ${companyMatches}`)
        console.log(`    - Overall match: ${productMatches && companyMatches}`)
        console.log()
        
        return productMatches && companyMatches
      })
      
      console.log(`Result: Found ${matchingLinks.length} matching ProductVendor link(s)`)
      if (matchingLinks.length === 0) {
        console.log('❌ No matching links found!')
        console.log()
        console.log('Possible issues:')
        console.log('  1. ProductVendor links exist but are missing companyId')
        console.log('  2. ProductVendor links have wrong companyId')
        console.log('  3. ProductVendor links don\'t exist at all')
      }
    }
    console.log()

    await mongoose.disconnect()
    console.log('✓ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkAllLinkages()

