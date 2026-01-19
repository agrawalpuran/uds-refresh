/**
 * Migration script to convert ProductCompany and ProductVendor relationships
 * from ObjectId format to string ID format.
 * 
 * Run this script with: npx ts-node scripts/migrate-relationships.ts
 * Or call the API endpoint: POST /api/admin/migrate-relationships
 */

import mongoose from 'mongoose'
import { connectDB } from '../lib/db/connect'

async function migrateRelationships() {
  try {
    console.log('🔧 Starting relationship migration...')
    await connectDB()
    
    const response = await fetch('http://localhost:3000/api/admin/migrate-relationships', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const result = await response.json()
    
    if (result.success) {
      console.log('✅ Migration completed successfully!')
      console.log('\n📊 Results:')
      console.log('\nProductCompany Relationships:')
      console.log(`  Total: ${result.results.productCompanies.total}`)
      console.log(`  Migrated: ${result.results.productCompanies.migrated}`)
      console.log(`  Skipped (already correct): ${result.results.productCompanies.skipped}`)
      if (result.results.productCompanies.errors.length > 0) {
        console.log(`  Errors: ${result.results.productCompanies.errors.length}`)
        result.results.productCompanies.errors.forEach((err: string) => {
          console.log(`    - ${err}`)
        })
      }
      
      console.log('\nProductVendor Relationships:')
      console.log(`  Total: ${result.results.productVendors.total}`)
      console.log(`  Migrated: ${result.results.productVendors.migrated}`)
      console.log(`  Skipped (already correct): ${result.results.productVendors.skipped}`)
      if (result.results.productVendors.errors.length > 0) {
        console.log(`  Errors: ${result.results.productVendors.errors.length}`)
        result.results.productVendors.errors.forEach((err: string) => {
          console.log(`    - ${err}`)
        })
      }
    } else {
      console.error('❌ Migration failed:', result.error)
      if (result.stack) {
        console.error(result.stack)
      }
    }
    
    await mongoose.connection.close()
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  }
}

// Check current state first
async function checkCurrentState() {
  try {
    await connectDB()
    
    const response = await fetch('http://localhost:3000/api/admin/migrate-relationships', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    const result = await response.json()
    
    if (result.success) {
      console.log('📊 Current Relationship Status:')
      console.log('\nProductCompany Relationships:')
      console.log(`  Total: ${result.stats.productCompanies.total}`)
      console.log(`  ObjectId format: ${result.stats.productCompanies.objectIdFormat}`)
      console.log(`  String ID format: ${result.stats.productCompanies.stringIdFormat}`)
      console.log(`  Invalid format: ${result.stats.productCompanies.invalidFormat}`)
      
      console.log('\nProductVendor Relationships:')
      console.log(`  Total: ${result.stats.productVendors.total}`)
      console.log(`  ObjectId format: ${result.stats.productVendors.objectIdFormat}`)
      console.log(`  String ID format: ${result.stats.productVendors.stringIdFormat}`)
      console.log(`  Invalid format: ${result.stats.productVendors.invalidFormat}`)
      
      if (result.needsMigration) {
        console.log('\n⚠️  Migration needed! Run migration with: POST /api/admin/migrate-relationships')
      } else {
        console.log('\n✅ All relationships are in the correct format!')
      }
    }
    
    await mongoose.connection.close()
  } catch (error: any) {
    console.error('❌ Failed to check current state:', error)
  }
}

// Run the appropriate function based on command line arguments
const args = process.argv.slice(2)
if (args.includes('--check') || args.includes('-c')) {
  checkCurrentState()
} else {
  migrateRelationships()
}
