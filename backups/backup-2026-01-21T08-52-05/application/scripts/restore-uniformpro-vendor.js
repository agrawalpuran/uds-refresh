const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')

// Load environment variables from .env.local
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8')
  envFile.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const match = trimmed.match(/^([^=]+)=(.*)$/)
      if (match) {
        const key = match[1].trim()
        const value = match[2].trim().replace(/^["']|["']$/g, '') // Remove quotes
        process.env[key] = value
      }
    }
  })
}

const VendorSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  logo: String,
  website: String,
  primaryColor: String,
  secondaryColor: String,
  accentColor: String,
  theme: { type: String, default: 'light' }
}, { timestamps: true })

async function restoreUniformpro() {
  try {
    // Try to get MONGODB_URI from environment or use default
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
    
    if (!mongoUri || mongoUri === 'mongodb://localhost:27017/uniform-distribution') {
      console.log('⚠️  Using default MongoDB URI. If this fails, set MONGODB_URI in .env.local')
    }

    await mongoose.connect(mongoUri)
    console.log('✅ Connected to MongoDB')

    const Vendor = mongoose.model('Vendor', VendorSchema)

    // Check if vendor already exists
    const existingVendor = await Vendor.findOne({ 
      $or: [
        { id: '100001' },
        { email: 'contact@uniformpro.com' }
      ]
    })

    if (existingVendor) {
      console.log('⚠️  Uniformpro vendor already exists:')
      console.log(JSON.stringify(existingVendor, null, 2))
      console.log('\nUpdating with correct data...')
      
      existingVendor.id = '100001'
      existingVendor.name = 'UniformPro Inc'
      existingVendor.email = 'contact@uniformpro.com'
      existingVendor.phone = '+1-555-0101'
      existingVendor.logo = 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200'
      existingVendor.website = 'https://uniformpro.com'
      existingVendor.primaryColor = '#2563eb'
      existingVendor.secondaryColor = '#1e40af'
      existingVendor.accentColor = '#3b82f6'
      existingVendor.theme = 'light'
      
      await existingVendor.save()
      console.log('✅ Uniformpro vendor updated successfully')
    } else {
      // Create new vendor
      const uniformproVendor = new Vendor({
        id: '100001',
        name: 'UniformPro Inc',
        email: 'contact@uniformpro.com',
        phone: '+1-555-0101',
        logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200',
        website: 'https://uniformpro.com',
        primaryColor: '#2563eb',
        secondaryColor: '#1e40af',
        accentColor: '#3b82f6',
        theme: 'light'
      })

      await uniformproVendor.save()
      console.log('✅ Uniformpro vendor created successfully')
    }

    // Verify the vendor
    const vendor = await Vendor.findOne({ id: '100001' })
    console.log('\n📋 Vendor details:')
    console.log(JSON.stringify(vendor, null, 2))

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

restoreUniformpro()
