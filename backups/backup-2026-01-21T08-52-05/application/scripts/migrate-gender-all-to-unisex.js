/**
 * Migration script to update gender field from 'all' to 'unisex' in DesignationProductEligibility
 * This ensures consistency across the application
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

// Schema definition
const DesignationProductEligibilitySchema = new mongoose.Schema({
  id: String,
  companyId: mongoose.Schema.Types.ObjectId,
  companyName: String,
  designation: String,
  gender: { type: String, enum: ['male', 'female', 'unisex', 'all'], default: 'unisex' }, // Include 'all' temporarily for migration
  allowedProductCategories: [String],
  itemEligibility: mongoose.Schema.Types.Mixed,
  status: String,
}, { collection: 'designationproducteligibilities', strict: false })

const DesignationProductEligibility = mongoose.models.DesignationProductEligibility || 
  mongoose.model('DesignationProductEligibility', DesignationProductEligibilitySchema)

async function migrateGenderAllToUnisex() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Find all eligibilities with gender 'all'
    const eligibilitiesWithAll = await DesignationProductEligibility.find({ gender: 'all' })
    
    console.log(`📊 Found ${eligibilitiesWithAll.length} designation eligibilities with gender='all'`)

    if (eligibilitiesWithAll.length === 0) {
      console.log('✅ No records to migrate. All records already use "unisex".')
      await mongoose.disconnect()
      return
    }

    // Update all records
    let updatedCount = 0
    for (const eligibility of eligibilitiesWithAll) {
      try {
        eligibility.gender = 'unisex'
        await eligibility.save()
        updatedCount++
        console.log(`✅ Updated eligibility ${eligibility.id} (designation: ${eligibility.designation})`)
      } catch (error) {
        console.error(`❌ Error updating eligibility ${eligibility.id}:`, error.message)
      }
    }

    console.log(`\n🎉 Migration complete!`)
    console.log(`   - Updated ${updatedCount} out of ${eligibilitiesWithAll.length} records`)
    console.log(`   - All designation eligibilities now use "unisex" instead of "all"`)

    // Verify the migration
    const remainingAll = await DesignationProductEligibility.countDocuments({ gender: 'all' })
    if (remainingAll === 0) {
      console.log(`\n✅ Verification: No records with gender='all' remain`)
    } else {
      console.log(`\n⚠️  Warning: ${remainingAll} records still have gender='all'`)
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
  }
}

migrateGenderAllToUnisex()


