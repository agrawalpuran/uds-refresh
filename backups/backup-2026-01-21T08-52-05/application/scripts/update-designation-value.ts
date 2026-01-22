/**
 * Script to update the designation value for the sample eligibility record
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

// Encryption utility (using base64 as standard)
const crypto = require('crypto')

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
const IV_LENGTH = 16

function getKey(): Buffer {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function encrypt(text: string): string {
  if (!text) return text
  try {
    const iv = crypto.randomBytes(IV_LENGTH)
    const key = getKey()
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
    let encrypted = cipher.update(text, 'utf8', 'base64')
    encrypted += cipher.final('base64')
    return `${iv.toString('base64')}:${encrypted}`
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

// DesignationProductEligibility Schema
const DesignationProductEligibilitySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], default: 'unisex' },
  allowedProductCategories: [{ type: String, required: true }],
  itemEligibility: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

const DesignationProductEligibility = mongoose.models.DesignationProductEligibility || mongoose.model('DesignationProductEligibility', DesignationProductEligibilitySchema)

async function updateDesignationValue() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find the eligibility record
    const eligibility = await DesignationProductEligibility.findOne({ id: 'DESIG-ELIG-000001' })
    
    if (!eligibility) {
      console.log('❌ Eligibility record not found')
      await mongoose.disconnect()
      return
    }

    console.log(`📋 Found eligibility: ${eligibility.id}`)
    console.log(`   Current designation (encrypted): ${eligibility.designation.substring(0, 50)}...`)
    console.log(`   Gender: ${eligibility.gender}`)
    console.log('')

    // Update with correct designation value (Co-Pilot)
    const correctDesignation = 'Co-Pilot'
    const encryptedDesignation = encrypt(correctDesignation)
    
    eligibility.designation = encryptedDesignation
    await eligibility.save()
    
    console.log(`✅ Updated designation to: "${correctDesignation}"`)
    console.log(`   New encrypted value: ${encryptedDesignation.substring(0, 50)}...`)
    console.log('')

    // Verify it can be decrypted
    const { decrypt } = require('../lib/utils/encryption')
    const decrypted = decrypt(encryptedDesignation)
    console.log(`✅ Verification - Decrypted value: "${decrypted}"`)

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

updateDesignationValue()

