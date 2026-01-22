/**
 * Script to check ProductVendor and ProductCompany relationships in MongoDB
 * Specifically for product ID 7 (Blazer - Male)
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

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

async function checkData() {
  try {
    console.log('Connecting to MongoDB...')
    console.log(`URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`)
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('CHECKING PRODUCT-VENDOR RELATIONSHIPS FOR PRODUCT ID 7')
    console.log('='.repeat(80))
    console.log()

    // Find product with ID 7 (try both string and number)
    let product = await db.collection('uniforms').findOne({ id: 7 })
    if (!product) {
      product = await db.collection('uniforms').findOne({ id: '7' })
    }
    if (!product) {
      product = await db.collection('uniforms').findOne({ id: Number(7) })
    }
    if (!product) {
      console.log('❌ Product with ID 7 not found!')
      console.log('\nAvailable products:')
      const allProducts = await db.collection('uniforms').find({}).toArray()
      allProducts.forEach(p => {
        console.log(`  - ID: ${p.id} (type: ${typeof p.id}), Name: ${p.name || 'N/A'}`)
      })
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found Product:`)
    console.log(`   ID: ${product.id}`)
    console.log(`   Name: ${product.name || 'N/A'}`)
    console.log(`   _id: ${product._id}`)
    console.log()

    // Check ProductCompany links
    console.log('='.repeat(80))
    console.log('PRODUCT-COMPANY RELATIONSHIPS:')
    console.log('='.repeat(80))
    const productCompanyLinks = await db.collection('productcompanies').find({
      productId: product._id
    }).toArray()

    if (productCompanyLinks.length === 0) {
      console.log('❌ No ProductCompany links found for this product!')
    } else {
      console.log(`✅ Found ${productCompanyLinks.length} ProductCompany link(s):`)
      for (const link of productCompanyLinks) {
        const company = await db.collection('companies').findOne({ _id: link.companyId })
        console.log(`   - Company: ${company ? company.name : 'NOT FOUND'} (ID: ${company ? company.id : 'N/A'})`)
        console.log(`     Company _id: ${link.companyId}`)
      }
    }
    console.log()

    // Check ProductVendor links
    console.log('='.repeat(80))
    console.log('PRODUCT-VENDOR RELATIONSHIPS:')
    console.log('='.repeat(80))
    const productVendorLinks = await db.collection('productvendors').find({
      productId: product._id
    }).toArray()

    if (productVendorLinks.length === 0) {
      console.log('❌ No ProductVendor links found for this product!')
    } else {
      console.log(`✅ Found ${productVendorLinks.length} ProductVendor link(s):`)
      for (const link of productVendorLinks) {
        const vendor = await db.collection('vendors').findOne({ _id: link.vendorId })
        console.log(`   - Vendor: ${vendor ? vendor.name : 'NOT FOUND'} (ID: ${vendor ? vendor.id : 'N/A'})`)
        console.log(`     Vendor _id: ${link.vendorId}`)
        if (link.companyId) {
          const company = await db.collection('companies').findOne({ _id: link.companyId })
          console.log(`     Company in link: ${company ? company.name : 'NOT FOUND'} (ID: ${company ? company.id : 'N/A'})`)
        } else {
          console.log(`     Company in link: NONE (missing companyId)`)
        }
      }
    }
    console.log()

    // Check all companies
    console.log('='.repeat(80))
    console.log('ALL COMPANIES IN DATABASE:')
    console.log('='.repeat(80))
    const companies = await db.collection('companies').find({}).toArray()
    companies.forEach(c => {
      console.log(`   - ID: ${c.id}, Name: ${c.name}, _id: ${c._id}`)
    })
    console.log()

    // Check all vendors
    console.log('='.repeat(80))
    console.log('ALL VENDORS IN DATABASE:')
    console.log('='.repeat(80))
    const vendors = await db.collection('vendors').find({}).toArray()
    vendors.forEach(v => {
      console.log(`   - ID: ${v.id}, Name: ${v.name}, _id: ${v._id}`)
    })
    console.log()

    // Check employee's company
    console.log('='.repeat(80))
    console.log('CHECKING EMPLOYEE COMPANY (for context):')
    console.log('='.repeat(80))
    const employees = await db.collection('employees').find({}).limit(5).toArray()
    employees.forEach(emp => {
      if (emp.companyId) {
        const company = companies.find(c => c._id.toString() === emp.companyId.toString())
        console.log(`   Employee: ${emp.employeeId || emp.id}, Company: ${company ? company.name : 'NOT FOUND'}`)
      }
    })
    console.log()

    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

checkData()

