const mongoose = require('mongoose')
const Employee = require('../lib/models/Employee').default

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function updateEmployeeCycleDurations() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const defaultCycleDurations = {
      shirt: 6,
      pant: 6,
      shoe: 6,
      jacket: 12
    }

    console.log(`Updating all employees with cycleDuration to ${JSON.stringify(defaultCycleDurations)}...`)

    // Update employees that don't have cycleDuration set
    const result = await Employee.updateMany(
      { cycleDuration: { $exists: false } },
      { $set: { cycleDuration: defaultCycleDurations } }
    )

    console.log(`✅ Updated ${result.modifiedCount} employees with default cycle durations.`)

    // Also ensure all employees have cycleDuration set (in case some have partial data)
    const updateAllResult = await Employee.updateMany(
      {},
      { $set: { cycleDuration: defaultCycleDurations } }
    )
    console.log(`✅ Ensured all ${updateAllResult.modifiedCount} employees have cycleDuration set.`)

    console.log('✅ Migration completed successfully!')
  } catch (error) {
    console.error('❌ Error updating employee cycle durations:', error)
    process.exit(1)
  } finally {
    console.log('👋 Disconnecting from MongoDB...')
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
  }
}

updateEmployeeCycleDurations()



