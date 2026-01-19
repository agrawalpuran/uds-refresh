/**
 * Script to fix designation encryption by re-encrypting with the correct method
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

async function fixDesignationEncryption() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all designation eligibilities
    const allEligibilities = await DesignationProductEligibility.find({}).lean()
    console.log(`📊 Found ${allEligibilities.length} designation eligibilities\n`)

    for (const elig of allEligibilities) {
      const designation = elig.designation
      if (!designation || typeof designation !== 'string') {
        console.log(`⚠️  Skipping ${elig.id} - no designation field`)
        continue
      }

      // Check if it's encrypted (contains ':')
      if (designation.includes(':')) {
        // Try to decrypt to see if it's valid
        const parts = designation.split(':')
        if (parts.length === 2) {
          // Check if it looks like hex (all hex characters)
          const isHex = /^[0-9a-fA-F]+$/.test(parts[0]) && /^[0-9a-fA-F]+$/.test(parts[1])
          
          if (isHex) {
            console.log(`🔧 Found hex-encrypted designation for ${elig.id}`)
            console.log(`   Encrypted value: ${designation.substring(0, 50)}...`)
            console.log(`   ⚠️  Cannot decrypt hex-encrypted data without original encryption key`)
            console.log(`   💡 You may need to manually update this record or recreate it\n`)
          } else {
            // Try base64 decryption
            try {
              const iv = Buffer.from(parts[0], 'base64')
              const encrypted = parts[1]
              const key = getKey()
              const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
              let decrypted = decipher.update(encrypted, 'base64', 'utf8')
              decrypted += decipher.final('utf8')
              
              if (decrypted && decrypted !== designation && !decrypted.includes(':')) {
                console.log(`✅ Successfully decrypted designation for ${elig.id}: "${decrypted}"`)
                // Re-encrypt with current method to ensure consistency
                const reEncrypted = encrypt(decrypted)
                await DesignationProductEligibility.updateOne(
                  { _id: elig._id },
                  { $set: { designation: reEncrypted } }
                )
                console.log(`   ✅ Re-encrypted with current method\n`)
              } else {
                console.log(`⚠️  Decryption returned invalid result for ${elig.id}`)
              }
            } catch (decryptError) {
              console.log(`❌ Cannot decrypt designation for ${elig.id}: ${decryptError.message}`)
              console.log(`   ⚠️  This record may need to be manually updated\n`)
            }
          }
        }
      } else {
        // Not encrypted, encrypt it
        console.log(`🔧 Found unencrypted designation for ${elig.id}: "${designation}"`)
        const encrypted = encrypt(designation)
        await DesignationProductEligibility.updateOne(
          { _id: elig._id },
          { $set: { designation: encrypted } }
        )
        console.log(`   ✅ Encrypted designation\n`)
      }
    }

    await mongoose.disconnect()
    console.log('✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixDesignationEncryption()

