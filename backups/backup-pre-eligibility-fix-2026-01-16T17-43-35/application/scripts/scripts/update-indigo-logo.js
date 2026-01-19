/**
 * Script to update Indigo Airlines company logo
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

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  secondaryColor: { type: String },
  showPrices: { type: Boolean, default: false, required: true },
  allowPersonalPayments: { type: Boolean, default: false, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
}, { timestamps: true })

const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function updateIndigoLogo() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB')

    const indigoCompanyId = 'COMP-INDIGO'
    const newLogoUrl = 'https://www.goindigo.in/content/dam/s6web/in/en/assets/logo/IndiGo_logo_2x.png'

    console.log(`\nUpdating logo for company: ${indigoCompanyId}`)
    console.log(`New logo URL: ${newLogoUrl}`)

    const company = await Company.findOne({ id: indigoCompanyId })
    
    if (!company) {
      console.error(`Company with ID ${indigoCompanyId} not found!`)
      process.exit(1)
    }

    console.log(`\nCurrent company details:`)
    console.log(`  Name: ${company.name}`)
    console.log(`  Current Logo: ${company.logo}`)
    console.log(`  Primary Color: ${company.primaryColor}`)

    // Update logo
    company.logo = newLogoUrl
    await company.save()

    console.log(`\n✅ Successfully updated logo!`)
    console.log(`  New Logo: ${company.logo}`)

    // Verify the update
    const updated = await Company.findOne({ id: indigoCompanyId })
    console.log(`\n✅ Verification - Logo is now: ${updated.logo}`)

  } catch (error) {
    console.error('Error updating logo:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  }
}

updateIndigoLogo()

