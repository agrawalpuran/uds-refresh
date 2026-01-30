/**
 * Migration Script: Migrate Branch Collection to Location Collection
 * 
 * This script migrates the 1 record from the 'branches' collection to the 'locations' collection.
 * After migration, the 'branches' collection can be safely deleted.
 * 
 * Usage: node scripts/migrate-branch-to-location.js
 * 
 * IMPORTANT: Run this script ONCE after deploying the code changes.
 */

require('dotenv').config({ path: '.env.local' })
const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

async function migrateBranchToLocation() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB')

    const db = mongoose.connection.db

    // Step 1: Find all records in branches collection
    console.log('\n📋 Step 1: Checking branches collection...')
    const branches = await db.collection('branches').find({}).toArray()
    console.log(`   Found ${branches.length} record(s) in branches collection`)

    if (branches.length === 0) {
      console.log('✅ No branches to migrate. Collection is empty.')
      return
    }

    // Display branches
    for (const branch of branches) {
      console.log(`   - ${branch.name} (ID: ${branch.id}, Company: ${branch.companyId})`)
    }

    // Step 2: Check if these branches already exist in locations
    console.log('\n📋 Step 2: Checking for duplicates in locations collection...')
    const migratedBranches = []
    const skippedBranches = []

    for (const branch of branches) {
      // Check by name + companyId (unique identifier)
      const existingLocation = await db.collection('locations').findOne({
        companyId: branch.companyId,
        name: branch.name
      })

      if (existingLocation) {
        console.log(`   ⚠️  "${branch.name}" already exists in locations (ID: ${existingLocation.id})`)
        skippedBranches.push(branch)
      } else {
        migratedBranches.push(branch)
      }
    }

    if (migratedBranches.length === 0) {
      console.log('\n✅ All branches already exist in locations collection. No migration needed.')
      return
    }

    // Step 3: Generate new location IDs and migrate
    console.log('\n📋 Step 3: Migrating branches to locations...')
    
    // Find highest existing location ID number
    const existingLocations = await db.collection('locations').find({})
      .sort({ id: -1 })
      .limit(10)
      .toArray()
    
    let nextIdNum = 200001 // Start from 200001 for branch-created locations
    for (const loc of existingLocations) {
      const idStr = String(loc.id || '')
      const numMatch = idStr.match(/(\d+)$/)
      if (numMatch) {
        const num = parseInt(numMatch[1], 10)
        if (num >= nextIdNum) {
          nextIdNum = num + 1
        }
      }
    }

    for (const branch of migratedBranches) {
      // Generate new location ID
      let locationId = String(nextIdNum)
      
      // Check for collision
      let existingById = await db.collection('locations').findOne({ id: locationId })
      while (existingById) {
        nextIdNum++
        locationId = String(nextIdNum)
        existingById = await db.collection('locations').findOne({ id: locationId })
      }

      // Create location document
      const locationDoc = {
        id: locationId,
        name: branch.name,
        companyId: branch.companyId,
        adminId: branch.adminId || '',
        address_line_1: branch.address_line_1 || '',
        address_line_2: branch.address_line_2 || '',
        address_line_3: branch.address_line_3 || '',
        city: branch.city || '',
        state: branch.state || '',
        pincode: branch.pincode || '',
        country: branch.country || 'India',
        phone: branch.phone || '',
        email: branch.email || '',
        status: branch.isActive !== false ? 'active' : 'inactive',
        createdAt: branch.createdAt || new Date(),
        updatedAt: new Date()
      }

      // Insert into locations
      await db.collection('locations').insertOne(locationDoc)
      console.log(`   ✅ Migrated: "${branch.name}" → Location ID: ${locationId}`)
      
      nextIdNum++
    }

    // Step 4: Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 MIGRATION SUMMARY')
    console.log('='.repeat(60))
    console.log(`   Migrated: ${migratedBranches.length} branch(es)`)
    console.log(`   Skipped (already exists): ${skippedBranches.length} branch(es)`)
    
    // Step 5: Ask about deleting branches collection
    console.log('\n⚠️  NEXT STEPS:')
    console.log('   1. Verify the data in locations collection')
    console.log('   2. Test the application to ensure everything works')
    console.log('   3. Once confirmed, you can delete the branches collection:')
    console.log('      db.branches.drop()')
    
    console.log('\n🎉 Migration completed successfully!')

  } catch (error) {
    console.error('❌ Migration error:', error)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 Disconnected from MongoDB')
  }
}

migrateBranchToLocation()
