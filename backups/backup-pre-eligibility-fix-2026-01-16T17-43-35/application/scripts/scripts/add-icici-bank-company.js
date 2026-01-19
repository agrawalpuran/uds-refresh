/**
 * Script to add ICICI Bank company to the database
 * Run this script to add ICICI Bank with Mumbai as default address
 */

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

async function addICICIBankCompany() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    // Check if ICICI Bank already exists
    const existingCompany = await Company.findOne({ id: 'COMP-ICICI' })
    
    if (existingCompany) {
      console.log('⚠️  ICICI Bank company already exists with ID: COMP-ICICI')
      console.log('   Updating existing company...')
      
      existingCompany.name = 'ICICI Bank'
      existingCompany.logo = 'https://www.icicibank.com/assets/images/icici-logo.svg'
      existingCompany.website = 'https://www.icicibank.com'
      existingCompany.primaryColor = '#f76b1c'
      existingCompany.showPrices = false
      
      await existingCompany.save()
      console.log('✅ ICICI Bank company updated successfully!')
    } else {
      // Create new ICICI Bank company
      const iciciBank = new Company({
        id: 'COMP-ICICI',
        name: 'ICICI Bank',
        logo: 'https://www.icicibank.com/assets/images/icici-logo.svg',
        website: 'https://www.icicibank.com',
        primaryColor: '#f76b1c', // ICICI Bank orange color
        showPrices: false,
      })
      
      await iciciBank.save()
      console.log('✅ ICICI Bank company created successfully!')
      console.log('   Company ID: COMP-ICICI')
      console.log('   Name: ICICI Bank')
      console.log('   Primary Color: #f76b1c (Orange)')
      console.log('   Default Location: Mumbai')
    }

    // Display all companies
    const allCompanies = await Company.find({}, 'id name primaryColor').lean()
    console.log('\n📊 All Companies in Database:')
    allCompanies.forEach((company, index) => {
      console.log(`   ${index + 1}. ${company.name} (${company.id}) - Color: ${company.primaryColor}`)
    })

    console.log('\n🎉 Script completed successfully!')
    console.log('📝 Note: Default address (Mumbai) is stored at employee level, not company level.')
    console.log('   When creating employees for ICICI Bank, set their location to "Mumbai Base" or "Mumbai".')

  } catch (error) {
    console.error('❌ Error adding ICICI Bank company:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
addICICIBankCompany()
  .then(() => {
    console.log('Script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Script failed:', error)
    process.exit(1)
  })


