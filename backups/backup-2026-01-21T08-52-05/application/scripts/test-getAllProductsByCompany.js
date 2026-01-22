/**
 * Script to test getAllProductsByCompany function and see what products it returns
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

// Import the function (we'll need to require the module)
// For now, let's replicate the logic

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

async function testGetAllProductsByCompany() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const companyId = 'COMP-INDIGO'

    // Find company
    let company = await Company.findOne({ id: companyId })
    if (!company && mongoose.Types.ObjectId.isValid(companyId)) {
      company = await Company.findById(companyId)
    }

    if (!company) {
      console.log(`❌ Company not found for companyId: ${companyId}`)
      await mongoose.disconnect()
      return
    }

    console.log(`✅ Found company: ${company.name} (ID: ${company.id})\n`)

    // Get all products directly linked via ProductCompany relationship
    const productCompanyLinks = await ProductCompany.find({ companyId: company._id })
      .populate('productId')
      .lean()

    const productIds = productCompanyLinks
      .map((link) => link.productId?._id)
      .filter((id) => id !== null && id !== undefined)

    console.log(`📦 ProductCompany links found: ${productCompanyLinks.length}`)
    console.log(`📦 Product IDs extracted: ${productIds.length}\n`)

    // Fetch all products
    const products = await Uniform.find({
      _id: { $in: productIds },
    })
      .populate('vendorId', 'id name')
      .lean()

    console.log(`📦 Products returned: ${products.length}\n`)

    // Group by gender and category
    const byGender = { male: [], female: [], unisex: [] }
    const categoryMap = new Map()

    products.forEach((product) => {
      const gender = product.gender || 'unisex'
      const category = product.category || ''
      const normalizedCategory = normalizeCategoryName(category)

      byGender[gender].push(product)

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
    })

    console.log('📊 Products by Gender:')
    console.log(`   Male: ${byGender.male.length}`)
    byGender.male.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)})`)
    })
    console.log(`\n   Female: ${byGender.female.length}`)
    byGender.female.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)})`)
    })
    console.log(`\n   Unisex: ${byGender.unisex.length}`)
    byGender.unisex.forEach(p => {
      console.log(`      - ${p.name} (category: ${p.category}, normalized: ${normalizeCategoryName(p.category)})`)
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

    // Specifically check for female trouser products
    const femaleTrouserProducts = byGender.female.filter(p => {
      const cat = normalizeCategoryName(p.category || '')
      return cat === 'trouser'
    })

    console.log(`\n\n🔍 Female Products in Trouser Category: ${femaleTrouserProducts.length}`)
    femaleTrouserProducts.forEach(p => {
      console.log(`   - ${p.name} (category: ${p.category}, ID: ${p.id})`)
    })

    if (categoryMap.has('trouser')) {
      const trouserData = categoryMap.get('trouser')
      const femaleInTrouser = trouserData.products.filter(p => p.gender === 'female')
      console.log(`\n   Female products in trouser category from map: ${femaleInTrouser.length}`)
      femaleInTrouser.forEach(p => {
        console.log(`      - ${p.name}`)
      })
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

testGetAllProductsByCompany()


