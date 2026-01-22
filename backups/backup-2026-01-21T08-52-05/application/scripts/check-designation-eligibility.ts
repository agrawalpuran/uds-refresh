/**
 * Script to check designation eligibility records for Indigo Airlines
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

function decrypt(text: string): string {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift()!, 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

// DesignationProductEligibility Schema
const DesignationProductEligibilitySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], default: 'unisex' },
  allowedProductCategories: [{ type: String }],
  itemEligibility: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const DesignationProductEligibility = mongoose.models.DesignationProductEligibility || mongoose.model('DesignationProductEligibility', DesignationProductEligibilitySchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function checkDesignationEligibility() {
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

    // Get all designation eligibilities (including inactive)
    const allEligibilities = await DesignationProductEligibility.find({})
      .populate('companyId', 'id name')
      .lean()

    console.log(`📊 Total designation eligibilities in database: ${allEligibilities.length}\n`)

    if (allEligibilities.length === 0) {
      console.log('⚠️  No designation eligibility records found in the database at all.')
      console.log('   This means no eligibility rules have been created yet.')
      console.log('   You need to create them through the UI or via a script.\n')
    }

    // Filter for Indigo (check both active and inactive)
    const indigoEligibilities = allEligibilities.filter((e: any) => {
      if (e.companyId) {
        if (typeof e.companyId === 'object' && e.companyId !== null) {
          return e.companyId._id.toString() === indigo._id.toString() || e.companyId.id === 'COMP-INDIGO'
        } else {
          return e.companyId.toString() === indigo._id.toString()
        }
      }
      return false
    })

    // Also check by companyId ObjectId directly (in case populate didn't work)
    const indigoEligibilitiesByObjectId = await DesignationProductEligibility.find({ 
      companyId: indigo._id 
    }).lean()
    
    console.log(`📋 Eligibilities found by direct ObjectId query: ${indigoEligibilitiesByObjectId.length}`)
    if (indigoEligibilitiesByObjectId.length > 0 && indigoEligibilities.length === 0) {
      console.log('⚠️  Found eligibilities by ObjectId but not by populated query - possible populate issue\n')
    }

    console.log(`📋 Designation Eligibilities for Indigo Airlines: ${indigoEligibilities.length}\n`)

    if (indigoEligibilities.length === 0) {
      console.log('⚠️  No designation eligibilities found for Indigo Airlines')
      console.log('\n📋 All designation eligibilities in database:')
      for (const e of allEligibilities) {
        const companyName = typeof e.companyId === 'object' && e.companyId !== null 
          ? e.companyId.name || 'Unknown'
          : 'Unknown'
        const decryptedDesignation = decrypt(e.designation || '')
        console.log(`   - ${decryptedDesignation} (${e.gender}) - Company: ${companyName}`)
        console.log(`     ID: ${e.id}, Status: ${e.status}`)
        console.log(`     Categories: ${e.allowedProductCategories?.join(', ') || 'none'}`)
      }
    } else {
      for (const e of indigoEligibilities) {
        const decryptedDesignation = decrypt(e.designation || '')
        console.log(`✅ ${decryptedDesignation} (${e.gender})`)
        console.log(`   ID: ${e.id}`)
        console.log(`   Status: ${e.status}`)
        console.log(`   Categories: ${e.allowedProductCategories?.join(', ') || 'none'}`)
        if (e.itemEligibility) {
          console.log(`   Item Eligibility: ${JSON.stringify(e.itemEligibility, null, 2)}`)
        }
        console.log('')
      }
    }

    // Check for eligibilities with wrong companyId
    const wrongCompanyEligibilities = allEligibilities.filter((e: any) => {
      if (e.companyId) {
        if (typeof e.companyId === 'object' && e.companyId !== null) {
          return e.companyId._id.toString() !== indigo._id.toString() && e.companyId.id !== 'COMP-INDIGO'
        } else {
          return e.companyId.toString() !== indigo._id.toString()
        }
      }
      return false
    })

    if (wrongCompanyEligibilities.length > 0) {
      console.log(`\n⚠️  Found ${wrongCompanyEligibilities.length} eligibilities with different companyId:`)
      for (const e of wrongCompanyEligibilities) {
        const companyName = typeof e.companyId === 'object' && e.companyId !== null 
          ? e.companyId.name || 'Unknown'
          : 'Unknown'
        const decryptedDesignation = decrypt(e.designation || '')
        console.log(`   - ${decryptedDesignation} - Company: ${companyName}`)
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

checkDesignationEligibility()

