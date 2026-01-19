const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  showPrices: { type: Boolean, default: false, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
}, { timestamps: true })

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function updateCompanies() {
  try {
    console.log('🔄 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Update companies that don't have showPrices field
    const result = await Company.updateMany(
      { showPrices: { $exists: false } },
      { $set: { showPrices: false } }
    )

    console.log(`✅ Updated ${result.modifiedCount} companies with showPrices field`)

    // Show all companies
    const companies = await Company.find().lean()
    console.log(`\n📊 Total companies: ${companies.length}`)
    companies.forEach(c => {
      console.log(`  - ${c.name} (${c.id}): showPrices=${c.showPrices || false}`)
    })

  } catch (error) {
    console.error('❌ Error updating companies:', error)
    process.exit(1)
  } finally {
    console.log('👋 Disconnecting from MongoDB...')
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

updateCompanies()






