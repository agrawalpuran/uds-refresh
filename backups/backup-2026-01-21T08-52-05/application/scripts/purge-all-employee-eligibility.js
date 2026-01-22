/**
 * CRITICAL DATA OPERATION — PURGE ALL EMPLOYEE PRODUCT ELIGIBILITY RECORDS
 * 
 * This script resets ALL employee eligibility data embedded in Employee documents:
 * - eligibility: { shirt, pant, shoe, jacket } → Reset to { 0, 0, 0, 0 }
 * - cycleDuration: { shirt, pant, shoe, jacket } → Reset to defaults { 6, 6, 6, 12 }
 * - eligibilityResetDates: { shirt, pant, shoe, jacket } → Clear (set to null)
 * 
 * WARNING: This is a DESTRUCTIVE operation. All employee eligibility data will be reset.
 * Employee records themselves are NOT deleted - only eligibility fields are reset.
 */

const { MongoClient } = require('mongodb')
const fs = require('fs')
const path = require('path')

// Try to load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
let MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
  if (mongoMatch) {
    MONGODB_URI = mongoMatch[1].trim()
  }
}

// Override with process.env if available
MONGODB_URI = process.env.MONGODB_URI || MONGODB_URI

async function purgeAllEmployeeEligibility() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db()
    const employeesCollection = db.collection('employees')
    
    console.log('\n📊 Analyzing current employee eligibility data...')
    
    // Count total employees
    const totalEmployees = await employeesCollection.countDocuments({})
    console.log(`   Total employees: ${totalEmployees}`)
    
    // Count employees with non-zero eligibility
    const employeesWithEligibility = await employeesCollection.countDocuments({
      $or: [
        { 'eligibility.shirt': { $ne: 0 } },
        { 'eligibility.pant': { $ne: 0 } },
        { 'eligibility.shoe': { $ne: 0 } },
        { 'eligibility.jacket': { $ne: 0 } }
      ]
    })
    console.log(`   Employees with non-zero eligibility: ${employeesWithEligibility}`)
    
    // Count employees with non-default cycle durations
    const employeesWithCustomCycles = await employeesCollection.countDocuments({
      $or: [
        { 'cycleDuration.shirt': { $ne: 6 } },
        { 'cycleDuration.pant': { $ne: 6 } },
        { 'cycleDuration.shoe': { $ne: 6 } },
        { 'cycleDuration.jacket': { $ne: 12 } }
      ]
    })
    console.log(`   Employees with custom cycle durations: ${employeesWithCustomCycles}`)
    
    // Count employees with eligibility reset dates
    const employeesWithResetDates = await employeesCollection.countDocuments({
      $or: [
        { 'eligibilityResetDates.shirt': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.pant': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.shoe': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.jacket': { $exists: true, $ne: null } }
      ]
    })
    console.log(`   Employees with eligibility reset dates: ${employeesWithResetDates}`)
    
    if (totalEmployees === 0) {
      console.log('\n✅ No employees found. Nothing to purge.')
      return
    }
    
    console.log('\n⚠️  WARNING: This will reset ALL employee eligibility data!')
    console.log('   This includes:')
    console.log('   - eligibility quantities (shirt, pant, shoe, jacket) → Reset to 0')
    console.log('   - cycleDuration values → Reset to defaults (6, 6, 6, 12 months)')
    console.log('   - eligibilityResetDates → Cleared (set to null)')
    console.log('\n   Employee records will NOT be deleted.')
    console.log('   Only eligibility-related fields will be reset.')
    console.log('\n   Press Ctrl+C to cancel, or wait 10 seconds to proceed...')
    
    // Wait 10 seconds for user to cancel
    await new Promise(resolve => setTimeout(resolve, 10000))
    
    console.log('\n🗑️  Starting eligibility data purge...')
    
    // Reset eligibility to default values (all zeros)
    console.log('\n   1. Resetting eligibility quantities to 0...')
    const eligibilityResult = await employeesCollection.updateMany(
      {},
      {
        $set: {
          'eligibility.shirt': 0,
          'eligibility.pant': 0,
          'eligibility.shoe': 0,
          'eligibility.jacket': 0
        }
      }
    )
    console.log(`      ✅ Updated ${eligibilityResult.modifiedCount} employee records`)
    
    // Reset cycleDuration to default values
    console.log('\n   2. Resetting cycle durations to defaults (6, 6, 6, 12 months)...')
    const cycleResult = await employeesCollection.updateMany(
      {},
      {
        $set: {
          'cycleDuration.shirt': 6,
          'cycleDuration.pant': 6,
          'cycleDuration.shoe': 6,
          'cycleDuration.jacket': 12
        }
      }
    )
    console.log(`      ✅ Updated ${cycleResult.modifiedCount} employee records`)
    
    // Clear eligibilityResetDates
    console.log('\n   3. Clearing eligibility reset dates...')
    const resetDatesResult = await employeesCollection.updateMany(
      {},
      {
        $unset: {
          'eligibilityResetDates.shirt': '',
          'eligibilityResetDates.pant': '',
          'eligibilityResetDates.shoe': '',
          'eligibilityResetDates.jacket': ''
        }
      }
    )
    console.log(`      ✅ Updated ${resetDatesResult.modifiedCount} employee records`)
    
    // Verify purge
    console.log('\n🔍 Verifying purge...')
    
    const finalEmployeesWithEligibility = await employeesCollection.countDocuments({
      $or: [
        { 'eligibility.shirt': { $ne: 0 } },
        { 'eligibility.pant': { $ne: 0 } },
        { 'eligibility.shoe': { $ne: 0 } },
        { 'eligibility.jacket': { $ne: 0 } }
      ]
    })
    
    const finalEmployeesWithCustomCycles = await employeesCollection.countDocuments({
      $or: [
        { 'cycleDuration.shirt': { $ne: 6 } },
        { 'cycleDuration.pant': { $ne: 6 } },
        { 'cycleDuration.shoe': { $ne: 6 } },
        { 'cycleDuration.jacket': { $ne: 12 } }
      ]
    })
    
    const finalEmployeesWithResetDates = await employeesCollection.countDocuments({
      $or: [
        { 'eligibilityResetDates.shirt': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.pant': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.shoe': { $exists: true, $ne: null } },
        { 'eligibilityResetDates.jacket': { $exists: true, $ne: null } }
      ]
    })
    
    // Sample verification - check a few employee records
    console.log('\n📋 Sample verification (checking 3 random employees)...')
    const sampleEmployees = await employeesCollection.find({}).limit(3).toArray()
    sampleEmployees.forEach((emp, index) => {
      console.log(`\n   Employee ${index + 1} (ID: ${emp.id || emp.employeeId}):`)
      console.log(`      eligibility: ${JSON.stringify(emp.eligibility || {})}`)
      console.log(`      cycleDuration: ${JSON.stringify(emp.cycleDuration || {})}`)
      console.log(`      eligibilityResetDates: ${JSON.stringify(emp.eligibilityResetDates || {})}`)
    })
    
    console.log('\n📊 Final Status:')
    console.log(`   Total employees: ${totalEmployees}`)
    console.log(`   Employees with non-zero eligibility: ${finalEmployeesWithEligibility}`)
    console.log(`   Employees with custom cycle durations: ${finalEmployeesWithCustomCycles}`)
    console.log(`   Employees with eligibility reset dates: ${finalEmployeesWithResetDates}`)
    
    if (finalEmployeesWithEligibility === 0 && 
        finalEmployeesWithCustomCycles === 0 && 
        finalEmployeesWithResetDates === 0) {
      console.log('\n✅ SUCCESS: All employee eligibility data has been purged!')
      console.log('   All eligibility fields have been reset to defaults.')
      console.log('   Employee records remain intact.')
    } else {
      console.log('\n⚠️  WARNING: Some eligibility data may still exist.')
      console.log('   Please verify manually if needed.')
    }
    
  } catch (error) {
    console.error('\n❌ An error occurred:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
    console.log('✅ Script completed')
  }
}

// Run the script
purgeAllEmployeeEligibility()
  .then(() => {
    console.log('\n✅ Script execution completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error)
    process.exit(1)
  })

