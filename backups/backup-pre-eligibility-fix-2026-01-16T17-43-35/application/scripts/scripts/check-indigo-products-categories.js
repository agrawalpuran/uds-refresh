/**
 * Script to check products and categories for Indigo Airlines
 * This will help identify why Pants category is not showing
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

// Normalize category function (same as in the UI)
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

async function checkIndigoProducts() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find Indigo Airlines
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines (COMP-INDIGO) not found')
      await mongoose.disconnect()
      return
    }

    console.log(`🏢 Found company: ${indigo.name} (ID: ${indigo.id})\n`)

    // Get all products linked to Indigo
    const productCompanyLinks = await ProductCompany.find({ companyId: indigo._id })
      .populate('productId')
      .lean()

    console.log(`📦 Total products linked to Indigo: ${productCompanyLinks.length}\n`)

    // Group by gender
    const productsByGender = {
      male: [],
      female: [],
      unisex: []
    }

    // Group by category
    const categoryMap = new Map()

    for (const link of productCompanyLinks) {
      const product = link.productId
      if (!product) continue

      const gender = product.gender || 'unisex'
      const category = product.category || ''
      const normalizedCategory = normalizeCategoryName(category)

      // Add to gender group
      if (gender === 'male') {
        productsByGender.male.push(product)
      } else if (gender === 'female') {
        productsByGender.female.push(product)
      } else {
        productsByGender.unisex.push(product)
      }

      // Add to category map
      if (normalizedCategory) {
        const current = categoryMap.get(normalizedCategory) || { count: 0, products: [], genders: new Set() }
        current.count++
        current.products.push({
          id: product.id,
          name: product.name,
          category: category,
          normalizedCategory: normalizedCategory,
          gender: gender
        })
        current.genders.add(gender)
        categoryMap.set(normalizedCategory, current)
      }
    }

    // Display results
    console.log('📊 Products by Gender:')
    console.log(`   Male: ${productsByGender.male.length} products`)
    productsByGender.male.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)}, gender: ${p.gender})`)
    })
    console.log(`\n   Female: ${productsByGender.female.length} products`)
    productsByGender.female.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)}, gender: ${p.gender})`)
    })
    console.log(`\n   Unisex: ${productsByGender.unisex.length} products`)
    productsByGender.unisex.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)}, gender: ${p.gender})`)
    })

    console.log('\n\n📋 Categories Found:')
    for (const [categoryId, data] of categoryMap.entries()) {
      console.log(`\n   Category: ${categoryId}`)
      console.log(`   Total products: ${data.count}`)
      console.log(`   Genders: ${Array.from(data.genders).join(', ')}`)
      console.log(`   Products:`)
      data.products.forEach(p => {
        console.log(`      - ${p.name} (original category: ${p.category}, gender: ${p.gender})`)
      })
    }

    // Check specifically for female products with pants/trousers
    console.log('\n\n🔍 Female Products with Pants/Trousers:')
    const femalePantsProducts = productsByGender.female.filter(p => {
      const cat = normalizeCategoryName(p.category || '')
      return cat === 'trouser'
    })
    console.log(`   Found ${femalePantsProducts.length} female products in pants/trousers category:`)
    femalePantsProducts.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)})`)
    })

    // Check if trouser category exists in categoryMap
    console.log('\n\n🔍 Category Map Check:')
    if (categoryMap.has('trouser')) {
      const trouserData = categoryMap.get('trouser')
      console.log(`   ✅ Trouser category exists with ${trouserData.count} products`)
      console.log(`   Genders in trouser category: ${Array.from(trouserData.genders).join(', ')}`)
      
      // Check female products in trouser category
      const femaleTrouserProducts = trouserData.products.filter(p => p.gender === 'female')
      console.log(`   Female products in trouser category: ${femaleTrouserProducts.length}`)
      femaleTrouserProducts.forEach(p => {
        console.log(`      - ${p.name} (original category: ${p.category})`)
      })
    } else {
      console.log(`   ❌ Trouser category NOT found in categoryMap`)
      console.log(`   Available categories: ${Array.from(categoryMap.keys()).join(', ')}`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

checkIndigoProducts()


