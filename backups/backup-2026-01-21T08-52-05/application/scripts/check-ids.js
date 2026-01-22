const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Uniform Schema
const UniformSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'], required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], required: true },
  sizes: [String],
  price: { type: Number, required: true },
  image: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  stock: { type: Number, required: true, default: 0 },
  companyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
}, { timestamps: true })

const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function checkIds() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    console.log('📦 Products:')
    console.log('='.repeat(60))
    const products = await Uniform.find({}, 'id name').limit(10).lean()
    products.forEach(p => {
      console.log(`  ID: ${p.id} | Name: ${p.name}`)
    })
    
    console.log('\n🏢 Companies:')
    console.log('='.repeat(60))
    const companies = await Company.find({}, 'id name').limit(10).lean()
    companies.forEach(c => {
      console.log(`  ID: ${c.id} | Name: ${c.name}`)
    })
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
  }
}

checkIds()






