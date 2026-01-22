/**
 * Script to enable the Test Orders feature flag
 * This ensures the feature is enabled in the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Try to read .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local, using default connection string')
}

async function enableTestOrdersFeature() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const featureConfigCollection = db.collection('systemfeatureconfigs')

    // Find or create the feature config
    let config = await featureConfigCollection.findOne({ id: 'SYS_FEATURE_CFG' })

    if (!config) {
      console.log('📝 Creating new feature config with testOrdersEnabled = true...')
      await featureConfigCollection.insertOne({
        id: 'SYS_FEATURE_CFG',
        testOrdersEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      console.log('✅ Feature config created with testOrdersEnabled = true\n')
    } else {
      console.log('📝 Updating existing feature config...')
      console.log(`   Current testOrdersEnabled: ${config.testOrdersEnabled}`)
      
      await featureConfigCollection.updateOne(
        { id: 'SYS_FEATURE_CFG' },
        {
          $set: {
            testOrdersEnabled: true,
            updatedAt: new Date()
          }
        }
      )
      console.log('✅ Feature config updated: testOrdersEnabled = true\n')
    }

    // Verify
    const updatedConfig = await featureConfigCollection.findOne({ id: 'SYS_FEATURE_CFG' })
    console.log('📋 Verification:')
    console.log(`   testOrdersEnabled: ${updatedConfig.testOrdersEnabled}`)
    console.log(`   ✅ Test Orders feature is now ENABLED`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
enableTestOrdersFeature()
  .then(() => {
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

