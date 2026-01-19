/**
 * Script to check ProductCompany relationships for Indigo and link products if needed
 */

const fs = require('fs')
const path = require('path')
const mongoose = require('mongoose')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmedLine = line.trim()
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const match = trimmedLine.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        let value = match[2].trim().replace(/^["']|["']$/g, '')
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define schemas
const CompanySchema = new mongoose.Schema({}, { strict: false, collection: 'companies' })
const UniformSchema = new mongoose.Schema({}, { strict: false, collection: 'uniforms' })
const ProductCompanySchema = new mongoose.Schema({}, { strict: false, collection: 'productcompanies' })

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema, 'companies')
const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema, 'uniforms')
const ProductCompany = mongoose.models.ProductCompany || mongoose.model('ProductCompany', ProductCompanySchema, 'productcompanies')

async function checkAndLinkProducts() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    // Find Indigo company
    const indigoCompany = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigoCompany) {
      console.error('Indigo company (COMP-INDIGO) not found!')
      process.exit(1)
    }
    
    console.log(`Found Indigo company: ${indigoCompany.name || 'Unknown'} (ID: ${indigoCompany.id})`)
    console.log(`Company _id: ${indigoCompany._id}`)

    // Get all products
    const allProducts = await Uniform.find({}).lean()
    console.log(`\nTotal products in database: ${allProducts.length}`)
    
    if (allProducts.length === 0) {
      console.log('No products found in database. Nothing to link.')
      process.exit(0)
    }

    // Get existing ProductCompany relationships for Indigo
    const existingLinks = await ProductCompany.find({ 
      companyId: indigoCompany._id 
    }).lean()
    
    console.log(`\nExisting ProductCompany relationships for Indigo: ${existingLinks.length}`)
    
    if (existingLinks.length > 0) {
      console.log('Existing linked products:')
      for (const link of existingLinks.slice(0, 5)) {
        const product = await Uniform.findById(link.productId).lean()
        if (product) {
          console.log(`  - ${product.name || product.id} (${product.id})`)
        }
      }
    }

    // Check which products are NOT linked
    const linkedProductIds = new Set(
      existingLinks.map(link => link.productId.toString())
    )
    
    const unlinkedProducts = allProducts.filter(
      product => !linkedProductIds.has(product._id.toString())
    )
    
    console.log(`\nProducts NOT linked to Indigo: ${unlinkedProducts.length}`)
    
    if (unlinkedProducts.length > 0) {
      console.log('\nUnlinked products (first 10):')
      unlinkedProducts.slice(0, 10).forEach(product => {
        console.log(`  - ${product.name || 'Unknown'} (ID: ${product.id}, _id: ${product._id})`)
      })
      
      console.log(`\nWould you like to link all ${unlinkedProducts.length} products to Indigo?`)
      console.log('To do this automatically, run: node scripts/check-and-link-products-to-indigo.js --link-all')
      
      // Check if --link-all flag is provided
      if (process.argv.includes('--link-all')) {
        console.log('\nLinking all products to Indigo...')
        let linked = 0
        let errors = 0
        
        for (const product of unlinkedProducts) {
          try {
            await ProductCompany.findOneAndUpdate(
              { productId: product._id, companyId: indigoCompany._id },
              { productId: product._id, companyId: indigoCompany._id },
              { upsert: true, new: true }
            )
            linked++
            if (linked % 10 === 0) {
              console.log(`  Linked ${linked}/${unlinkedProducts.length} products...`)
            }
          } catch (error) {
            errors++
            console.error(`  Error linking product ${product.id}:`, error.message)
          }
        }
        
        console.log(`\n✓ Successfully linked ${linked} products to Indigo`)
        if (errors > 0) {
          console.log(`⚠ ${errors} errors occurred`)
        }
      }
    } else {
      console.log('\n✓ All products are already linked to Indigo!')
    }

    // Summary
    const finalLinks = await ProductCompany.find({ 
      companyId: indigoCompany._id 
    }).countDocuments()
    
    console.log(`\n=== Summary ===`)
    console.log(`Total products: ${allProducts.length}`)
    console.log(`Products linked to Indigo: ${finalLinks}`)
    console.log(`Products not linked: ${allProducts.length - finalLinks}`)

  } catch (error) {
    console.error('Error:', error)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

checkAndLinkProducts()

