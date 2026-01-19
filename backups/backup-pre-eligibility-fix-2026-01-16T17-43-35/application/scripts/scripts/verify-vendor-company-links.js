/**
 * Script to verify and fix VendorCompany relationships
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

async function verifyVendorCompanyLinks() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all vendors
    const allVendors = await db.collection('vendors').find({}).toArray()
    console.log(`🏪 Vendors (${allVendors.length}):`)
    const vendorMap = new Map()
    for (const vendor of allVendors) {
      vendorMap.set(vendor._id.toString(), vendor)
      console.log(`   - ${vendor.name} (${vendor.id}) - _id: ${vendor._id}`)
    }
    console.log('')
    
    // Get all companies
    const allCompanies = await db.collection('companies').find({}).toArray()
    console.log(`🏢 Companies (${allCompanies.length}):`)
    const companyMap = new Map()
    for (const company of allCompanies) {
      companyMap.set(company._id.toString(), company)
      console.log(`   - ${company.name} (${company.id}) - _id: ${company._id}`)
    }
    console.log('')
    
    // Get VendorCompany relationships
    const vendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    console.log(`🔗 VendorCompany relationships (${vendorCompanyLinks.length}):\n`)
    
    const vendorCompanyMap = new Map()
    for (const link of vendorCompanyLinks) {
      const vendorIdStr = link.vendorId?.toString()
      const companyIdStr = link.companyId?.toString()
      
      const vendor = vendorMap.get(vendorIdStr)
      const company = companyMap.get(companyIdStr)
      
      if (vendor && company) {
        if (!vendorCompanyMap.has(vendorIdStr)) {
          vendorCompanyMap.set(vendorIdStr, [])
        }
        vendorCompanyMap.get(vendorIdStr).push(company)
        console.log(`✅ ${vendor.name} (${vendor.id}) ➡️ ${company.name} (${company.id})`)
      } else {
        console.log(`❌ Invalid link: Vendor ${vendorIdStr} ➡️ Company ${companyIdStr}`)
      }
    }
    console.log('')
    
    // Check which vendors are not linked to any companies
    console.log('🔍 Checking which vendors need company links...\n')
    const vendorsWithoutLinks = []
    for (const vendor of allVendors) {
      const vendorIdStr = vendor._id.toString()
      const companies = vendorCompanyMap.get(vendorIdStr) || []
      if (companies.length === 0) {
        vendorsWithoutLinks.push(vendor)
        console.log(`⚠️  ${vendor.name} (${vendor.id}): Not linked to any companies`)
      } else {
        const companyNames = companies.map((c) => c.name || c.id).join(', ')
        console.log(`✅ ${vendor.name} (${vendor.id}): Linked to ${companies.length} company(ies) - ${companyNames}`)
      }
    }
    
    console.log(`\n📊 Summary:`)
    console.log(`   - Total vendors: ${allVendors.length}`)
    console.log(`   - Vendors with company links: ${allVendors.length - vendorsWithoutLinks.length}`)
    console.log(`   - Vendors without company links: ${vendorsWithoutLinks.length}`)
    console.log(`   - Total VendorCompany links: ${vendorCompanyLinks.length}`)
    
    if (vendorsWithoutLinks.length > 0) {
      console.log(`\n⚠️  Vendors that need to be linked to companies:`)
      vendorsWithoutLinks.forEach((v) => {
        console.log(`   - ${v.name} (${v.id})`)
      })
      console.log(`\n💡 To link vendors to companies, use the superadmin dashboard Relationships tab.`)
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

verifyVendorCompanyLinks()

