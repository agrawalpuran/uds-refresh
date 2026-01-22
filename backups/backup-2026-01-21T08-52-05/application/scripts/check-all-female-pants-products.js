/**
 * Script to check if there are any female pants/trousers products in the database
 * that might not be linked to Indigo
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

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const ProductCompany = mongoose.models.ProductCompany || mongoose.model('ProductCompany', ProductCompanySchema)

// Normalize category function
const normalizeCategoryName = (category) => {
  if (!category) return ''
  const lower = category.toLowerCase().trim()
  if (lower.includes('shirt')) return 'shirt'
  if (lower.includes('trouser') || lower.includes('pant')) return 'trouser'
  if (lower.includes('shoe')) return 'shoe'
  if (lower.includes('blazer') || lower.includes('jacket')) return 'blazer'
  if (lower.includes('accessory')) return 'accessory'
  return lower
}

async function checkFemalePantsProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find all female products
    const allFemaleProducts = await Uniform.find({ gender: 'female' }).lean()
    console.log(`📦 Total female products in database: ${allFemaleProducts.length}\n`)

    // Find female products with pants/trousers category
    const femalePantsProducts = allFemaleProducts.filter(p => {
      const cat = normalizeCategoryName(p.category || '')
      return cat === 'trouser'
    })

    console.log(`👖 Female products with pants/trousers category: ${femalePantsProducts.length}\n`)
    
    if (femalePantsProducts.length > 0) {
      console.log('Found female pants/trousers products:')
      for (const product of femalePantsProducts) {
        console.log(`\n   Product: ${product.name}`)
        console.log(`   ID: ${product.id}`)
        console.log(`   Category: ${product.category}`)
        console.log(`   Normalized: ${normalizeCategoryName(product.category)}`)
        console.log(`   Gender: ${product.gender}`)
        
        // Check if linked to Indigo
        const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
        if (indigo) {
          const link = await ProductCompany.findOne({
            productId: product._id,
            companyId: indigo._id
          })
          if (link) {
            console.log(`   ✅ Linked to Indigo Airlines`)
          } else {
            console.log(`   ❌ NOT linked to Indigo Airlines`)
          }
        }
      }
    } else {
      console.log('❌ No female pants/trousers products found in the database')
      console.log('\n📋 All female products:')
      allFemaleProducts.forEach(p => {
        console.log(`   - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)})`)
      })
    }

    // Also check for any products that might be unisex and include pants
    const unisexPantsProducts = await Uniform.find({ 
      gender: 'unisex',
      $or: [
        { category: /pant/i },
        { category: /trouser/i },
        { name: /pant/i },
        { name: /trouser/i }
      ]
    }).lean()

    if (unisexPantsProducts.length > 0) {
      console.log(`\n\n👥 Unisex pants/trousers products: ${unisexPantsProducts.length}`)
      unisexPantsProducts.forEach(p => {
        console.log(`   - ${p.name} (category: ${p.category}, gender: ${p.gender})`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkFemalePantsProducts()


