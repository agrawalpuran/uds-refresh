/**
 * Script to create a sample designation eligibility for Indigo Airlines
 * This can be used as a template or to test the creation process
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

// Encryption utility
const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
const IV_LENGTH = 16

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

// DesignationProductEligibility Schema
const DesignationProductEligibilitySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], default: 'unisex' },
  allowedProductCategories: [{ type: String, required: true }],
  itemEligibility: {
    type: {
      shirt: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
      trouser: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
      pant: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
      shoe: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
      blazer: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
      jacket: { quantity: Number, renewalFrequency: Number, renewalUnit: String },
    },
    required: false,
  },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const DesignationProductEligibility = mongoose.models.DesignationProductEligibility || mongoose.model('DesignationProductEligibility', DesignationProductEligibilitySchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function createSampleEligibility() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find Indigo Airlines
    const indigo = await Company.findOne({ id: 'COMP-INDIGO' })
    if (!indigo) {
      console.log('❌ Indigo Airlines company not found')
      await mongoose.disconnect()
      return
    }

    console.log(`🏢 Company: ${indigo.name} (${indigo.id})`)
    console.log(`   _id: ${indigo._id}\n`)

    // Check existing eligibilities
    const existing = await DesignationProductEligibility.find({ companyId: indigo._id }).lean()
    console.log(`📊 Existing designation eligibilities: ${existing.length}\n`)

    if (existing.length > 0) {
      console.log('⚠️  Designation eligibilities already exist. Listing them:')
      for (const e of existing) {
        console.log(`   - ID: ${e.id}, Status: ${e.status}`)
        console.log(`     Designation: ${e.designation}`)
        console.log(`     Gender: ${e.gender}`)
        console.log(`     Categories: ${e.allowedProductCategories?.join(', ') || 'none'}`)
      }
      console.log('')
    }

    // Create a sample eligibility for Co-Pilot (Female) - common designation
    const sampleDesignation = 'Co-Pilot'
    const sampleGender = 'female'
    const encryptedDesignation = encrypt(sampleDesignation)

    // Check if this already exists
    const existingEligibility = await DesignationProductEligibility.findOne({
      companyId: indigo._id,
      designation: encryptedDesignation,
      gender: sampleGender
    })

    if (existingEligibility) {
      console.log(`✅ Designation eligibility already exists for ${sampleDesignation} (${sampleGender})`)
      console.log(`   ID: ${existingEligibility.id}`)
      console.log(`   Status: ${existingEligibility.status}`)
      await mongoose.disconnect()
      return
    }

    // Generate ID
    const allEligibilities = await DesignationProductEligibility.find({}, 'id')
      .sort({ id: -1 })
      .limit(1)
      .lean()
    
    let nextIdNumber = 1
    if (allEligibilities.length > 0 && allEligibilities[0].id) {
      const lastId = allEligibilities[0].id as string
      const match = lastId.match(/^DESIG-ELIG-(\d+)$/)
      if (match) {
        nextIdNumber = parseInt(match[1], 10) + 1
      }
    }
    
    const eligibilityId = `DESIG-ELIG-${String(nextIdNumber).padStart(6, '0')}`

    // Create sample eligibility
    const sampleEligibility = new DesignationProductEligibility({
      id: eligibilityId,
      companyId: indigo._id,
      companyName: indigo.name,
      designation: encryptedDesignation, // Will be encrypted by pre-save hook, but we're pre-encrypting
      gender: sampleGender,
      allowedProductCategories: ['blazer', 'shirt', 'trouser', 'shoe'],
      itemEligibility: {
        blazer: { quantity: 2, renewalFrequency: 12, renewalUnit: 'months' },
        shirt: { quantity: 4, renewalFrequency: 6, renewalUnit: 'months' },
        trouser: { quantity: 3, renewalFrequency: 6, renewalUnit: 'months' },
        shoe: { quantity: 2, renewalFrequency: 12, renewalUnit: 'months' },
      },
      status: 'active',
    })

    await sampleEligibility.save()
    console.log(`✅ Created sample designation eligibility:`)
    console.log(`   ID: ${eligibilityId}`)
    console.log(`   Designation: ${sampleDesignation}`)
    console.log(`   Gender: ${sampleGender}`)
    console.log(`   Categories: blazer, shirt, trouser, shoe`)
    console.log(`   Status: active\n`)

    // Verify it was saved
    const saved = await DesignationProductEligibility.findOne({ id: eligibilityId })
      .populate('companyId', 'id name')
      .lean()
    
    if (saved) {
      console.log(`✅ Verification - Eligibility saved successfully`)
      console.log(`   Company: ${saved.companyId?.name || 'Unknown'}`)
      console.log(`   Status: ${saved.status}`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    if (error.message) {
      console.error(`   Message: ${error.message}`)
    }
    if (error.stack) {
      console.error(`   Stack: ${error.stack}`)
    }
    await mongoose.disconnect()
    process.exit(1)
  }
}

createSampleEligibility()

