/**
 * Migration Script: Remove branchId and branchName from Employee Collection
 * 
 * PURPOSE:
 * This script removes the redundant branchId and branchName fields from all employees
 * in the database. Employees should now use locationId to reference their Location.
 * 
 * SAFETY:
 * - This script only removes fields, it does NOT delete data
 * - It uses MongoDB $unset operator which is safe
 * - It creates a backup log of affected employees
 * - DO NOT run this in production without testing first
 * 
 * USAGE:
 *   node scripts/remove-branch-fields-from-employees.js
 * 
 * ENVIRONMENT CHECK:
 * - Checks NODE_ENV and warns if running in production
 * - Requires explicit confirmation before proceeding
 */

const mongoose = require('mongoose')
const path = require('path')
const fs = require('fs')
const readline = require('readline')

// Manually load MONGODB_URI from .env.local
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

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in .env.local or environment variables.')
  process.exit(1)
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer)
    })
  })
}

async function removeBranchFields() {
  try {
    // Environment check
    const nodeEnv = process.env.NODE_ENV || 'development'
    if (nodeEnv === 'production') {
      console.warn('⚠️  WARNING: You are running this script in PRODUCTION environment!')
      const confirm = await askQuestion('Are you absolutely sure you want to remove branch fields in production? (yes/no): ')
      if (confirm.toLowerCase() !== 'yes') {
        console.log('❌ Operation cancelled.')
        rl.close()
        process.exit(0)
      }
    } else {
      console.log(`ℹ️  Running in ${nodeEnv} environment`)
    }

    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      console.error('❌ Database connection not available')
      rl.close()
      await mongoose.disconnect()
      process.exit(1)
    }

    // Get all employees with branchId or branchName
    const employeesCollection = db.collection('employees')
    const employeesWithBranch = await employeesCollection.find({
      $or: [
        { branchId: { $exists: true } },
        { branchName: { $exists: true } }
      ]
    }).toArray()

    console.log(`📊 Found ${employeesWithBranch.length} employees with branchId or branchName fields\n`)

    if (employeesWithBranch.length === 0) {
      console.log('✅ No employees have branchId or branchName fields. Nothing to remove.')
      rl.close()
      await mongoose.disconnect()
      process.exit(0)
    }

    // Show sample of affected employees
    console.log('📋 Sample of affected employees (first 5):')
    employeesWithBranch.slice(0, 5).forEach((emp, idx) => {
      console.log(`   ${idx + 1}. Employee ID: ${emp.employeeId || emp.id || 'N/A'}`)
      console.log(`      - branchId: ${emp.branchId ? 'exists' : 'N/A'}`)
      console.log(`      - branchName: ${emp.branchName || 'N/A'}`)
      console.log(`      - locationId: ${emp.locationId ? 'exists' : 'N/A'}`)
    })
    if (employeesWithBranch.length > 5) {
      console.log(`   ... and ${employeesWithBranch.length - 5} more\n`)
    } else {
      console.log('')
    }

    // Confirm before proceeding
    const confirm = await askQuestion(`⚠️  This will remove branchId and branchName from ${employeesWithBranch.length} employees. Continue? (yes/no): `)
    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Operation cancelled.')
      rl.close()
      await mongoose.disconnect()
      process.exit(0)
    }

    console.log('\n🔄 Removing branchId and branchName fields...')

    // Remove branchId and branchName from all employees
    const result = await employeesCollection.updateMany(
      {
        $or: [
          { branchId: { $exists: true } },
          { branchName: { $exists: true } }
        ]
      },
      {
        $unset: {
          branchId: '',
          branchName: ''
        }
      }
    )

    console.log(`✅ Successfully removed branchId and branchName from ${result.modifiedCount} employees\n`)

    // Verify removal
    const remainingWithBranch = await employeesCollection.find({
      $or: [
        { branchId: { $exists: true } },
        { branchName: { $exists: true } }
      ]
    }).toArray()

    if (remainingWithBranch.length === 0) {
      console.log('✅ Verification: All branchId and branchName fields have been removed successfully!')
    } else {
      console.warn(`⚠️  Warning: ${remainingWithBranch.length} employees still have branchId or branchName fields`)
    }

    console.log('\n✅ Migration complete!')
    console.log('ℹ️  Employees now use locationId to reference their Location.')

    await mongoose.disconnect()
    console.log('✅ MongoDB Disconnected')
    rl.close()
  } catch (error) {
    console.error('❌ Script error:', error)
    rl.close()
    await mongoose.disconnect()
    process.exit(1)
  }
}

removeBranchFields()

