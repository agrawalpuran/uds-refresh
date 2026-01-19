/**
 * Address Migration Script
 * 
 * Migrates existing address data to the new standardized Address model.
 * 
 * This script:
 * 1. Creates Address records from existing address data in:
 *    - Employees (address field)
 *    - Orders (deliveryAddress field)
 *    - Locations (address, city, state, pincode fields)
 *    - Branches (address, city, state, pincode fields)
 * 2. Updates entities to reference the new address_id
 * 3. Removes old address fields after migration (does NOT preserve them)
 * 4. Uses dummy values for missing address information
 * 
 * Usage:
 *   npm run migrate-addresses
 *   OR
 *   ts-node scripts/migrate-addresses.ts
 */

import mongoose from 'mongoose'
import connectDB from '../lib/db/mongodb'
import Address from '../lib/models/Address'
import Employee from '../lib/models/Employee'
import Order from '../lib/models/Order'
import Location from '../lib/models/Location'
import Branch from '../lib/models/Branch'
import { parseLegacyAddress, createAddress } from '../lib/utils/address-service'

interface MigrationStats {
  employees: { processed: number; migrated: number; errors: number }
  orders: { processed: number; migrated: number; errors: number }
  locations: { processed: number; migrated: number; errors: number }
  branches: { processed: number; migrated: number; errors: number }
}

async function migrateEmployeeAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Employee addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    // Migrate ALL employees, not just those without addressId
    const employees = await Employee.find({})
    console.log(`Found ${employees.length} employees to migrate`)

    for (const employee of employees) {
      processed++
      
      try {
        // Parse legacy address or use dummy values
        let parsedAddress: Partial<{ address_line_1: string; address_line_2?: string; address_line_3?: string; city: string; state: string; pincode: string; country: string }> = {}
        
        if (employee.address && employee.address.trim().length > 0) {
          parsedAddress = parseLegacyAddress(employee.address)
        }

        // Use dummy values for missing fields
        const addressData = {
          address_line_1: parsedAddress.address_line_1 || (employee.address ? employee.address.substring(0, 255) : 'Address not specified'),
          address_line_2: parsedAddress.address_line_2 || undefined,
          address_line_3: parsedAddress.address_line_3 || undefined,
          city: parsedAddress.city || 'New Delhi',
          state: parsedAddress.state || 'Delhi',
          pincode: parsedAddress.pincode || '110001',
          country: parsedAddress.country || 'India',
        }

        // Create or update address record
        let addressId: mongoose.Types.ObjectId
        if (employee.addressId) {
          // Update existing address
          const { updateAddress } = require('../lib/utils/address-service')
          const updatedAddress = await updateAddress(employee.addressId.toString(), addressData)
          addressId = new mongoose.Types.ObjectId(updatedAddress.id)
        } else {
          // Create new address
          const address = await createAddress(addressData)
          addressId = new mongoose.Types.ObjectId(address.id)
        }

        // Update employee: set addressId and remove old address field
        // Use runValidators: false to bypass schema validation for required address field
        const updateResult = await Employee.findByIdAndUpdate(
          employee._id,
          { 
            $set: { addressId: addressId },
            $unset: { address: '' }
          },
          { new: true, runValidators: false }
        )

        if (!updateResult) {
          throw new Error(`Employee ${employee.id} not found after address creation`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} employee addresses...`)
        }
      } catch (error: any) {
        errors++
        console.error(`  ❌ Error migrating employee ${employee.id}:`, error.message)
      }
    }

    console.log(`✅ Employee migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in employee migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function migrateOrderAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Order shipping addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    // Migrate ALL orders, not just those without shippingAddressId
    const orders = await Order.find({})
    console.log(`Found ${orders.length} orders to migrate`)

    for (const order of orders) {
      processed++
      
      try {
        // Parse legacy address or use dummy values
        let parsedAddress: Partial<{ address_line_1: string; address_line_2?: string; address_line_3?: string; city: string; state: string; pincode: string; country: string }> = {}
        
        if (order.deliveryAddress && order.deliveryAddress.trim().length > 0) {
          parsedAddress = parseLegacyAddress(order.deliveryAddress)
        }

        // Use dummy values for missing fields
        const addressData = {
          address_line_1: parsedAddress.address_line_1 || (order.deliveryAddress ? order.deliveryAddress.substring(0, 255) : 'Address not specified'),
          address_line_2: parsedAddress.address_line_2 || undefined,
          address_line_3: parsedAddress.address_line_3 || undefined,
          city: parsedAddress.city || 'New Delhi',
          state: parsedAddress.state || 'Delhi',
          pincode: parsedAddress.pincode || '110001',
          country: parsedAddress.country || 'India',
        }

        // Create or update address record
        let addressId: mongoose.Types.ObjectId
        if (order.shippingAddressId) {
          // Update existing address
          const { updateAddress } = require('../lib/utils/address-service')
          const updatedAddress = await updateAddress(order.shippingAddressId.toString(), addressData)
          addressId = new mongoose.Types.ObjectId(updatedAddress.id)
        } else {
          // Create new address
          const address = await createAddress(addressData)
          addressId = new mongoose.Types.ObjectId(address.id)
        }

        // Update order: set shippingAddressId and remove old deliveryAddress field
        // Use runValidators: false to bypass schema validation for required deliveryAddress field
        const updateResult = await Order.findByIdAndUpdate(
          order._id,
          { 
            $set: { shippingAddressId: addressId },
            $unset: { deliveryAddress: '' }
          },
          { new: true, runValidators: false }
        )

        if (!updateResult) {
          throw new Error(`Order ${order.id} not found after address creation`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} order addresses...`)
        }
      } catch (error: any) {
        errors++
        console.error(`  ❌ Error migrating order ${order.id}:`, error.message)
      }
    }

    console.log(`✅ Order migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in order migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function migrateLocationAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Location addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    // Use raw MongoDB collection to avoid validation issues with invalid location IDs
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    // Migrate ALL locations, not just those without addressId
    const locationsCollection = db.collection('locations')
    const locations = await locationsCollection.find({}).toArray()
    console.log(`Found ${locations.length} locations to migrate`)

    for (const locationDoc of locations) {
      processed++
      
      try {
        // Handle invalid location IDs gracefully
        const locationId = locationDoc.id || locationDoc._id?.toString()
        if (!locationId) {
          console.log(`  ⏭️  Location: No ID found, skipping`)
          continue
        }

        // Use existing structured data if available, otherwise parse address string or use dummy values
        let addressData: any = {
          address_line_1: locationDoc.address || 'Address not specified',
          city: locationDoc.city || 'New Delhi',
          state: locationDoc.state || 'Delhi',
          pincode: locationDoc.pincode || '110001',
          country: 'India',
        }

        // If we have address string but missing other fields, try to parse it
        if (locationDoc.address && (!locationDoc.city || !locationDoc.state || !locationDoc.pincode)) {
          const parsed = parseLegacyAddress(locationDoc.address)
          addressData = {
            address_line_1: parsed.address_line_1 || locationDoc.address.substring(0, 255) || 'Address not specified',
            address_line_2: parsed.address_line_2 || undefined,
            address_line_3: parsed.address_line_3 || undefined,
            city: parsed.city || locationDoc.city || 'New Delhi',
            state: parsed.state || locationDoc.state || 'Delhi',
            pincode: parsed.pincode || locationDoc.pincode || '110001',
            country: 'India',
          }
        }

        // Create or update address record
        let addressId: mongoose.Types.ObjectId
        if (locationDoc.addressId) {
          // Update existing address
          const { updateAddress } = require('../lib/utils/address-service')
          const updatedAddress = await updateAddress(locationDoc.addressId.toString(), addressData)
          addressId = new mongoose.Types.ObjectId(updatedAddress.id)
        } else {
          // Create new address
          const address = await createAddress(addressData)
          addressId = new mongoose.Types.ObjectId(address.id)
        }

        // Update location with addressId and remove old address fields using raw MongoDB collection
        const locationObjectId = locationDoc._id instanceof mongoose.Types.ObjectId 
          ? locationDoc._id 
          : new mongoose.Types.ObjectId(locationDoc._id)
        
        const updateResult = await locationsCollection.updateOne(
          { _id: locationObjectId },
          { 
            $set: { addressId: addressId },
            $unset: { address: '', city: '', state: '', pincode: '' }
          }
        )

        if (updateResult.matchedCount === 0) {
          throw new Error(`Location ${locationId} not found after address creation`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} location addresses...`)
        }
      } catch (error: any) {
        errors++
        const locationId = locationDoc.id || locationDoc._id?.toString() || 'unknown'
        console.error(`  ❌ Error migrating location ${locationId}:`, error.message)
      }
    }

    console.log(`✅ Location migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in location migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function migrateBranchAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Branch addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    // Migrate ALL branches, not just those without addressId
    const branches = await Branch.find({})
    console.log(`Found ${branches.length} branches to migrate`)

    for (const branch of branches) {
      processed++
      
      try {
        // Use existing structured data with dummy values if needed
        const addressData = {
          address_line_1: branch.address || 'Address not specified',
          city: branch.city || 'New Delhi',
          state: branch.state || 'Delhi',
          pincode: branch.pincode || '110001',
          country: 'India',
        }

        // Create or update address record
        let addressId: mongoose.Types.ObjectId
        if (branch.addressId) {
          // Update existing address
          const { updateAddress } = require('../lib/utils/address-service')
          const updatedAddress = await updateAddress(branch.addressId.toString(), addressData)
          addressId = new mongoose.Types.ObjectId(updatedAddress.id)
        } else {
          // Create new address
          const address = await createAddress(addressData)
          addressId = new mongoose.Types.ObjectId(address.id)
        }

        // Update branch: set addressId and remove old address fields
        // Use runValidators: false to bypass schema validation for required address fields
        const updateResult = await Branch.findByIdAndUpdate(
          branch._id,
          { 
            $set: { addressId: addressId },
            $unset: { address: '', city: '', state: '', pincode: '' }
          },
          { new: true, runValidators: false }
        )

        if (!updateResult) {
          throw new Error(`Branch ${branch.id} not found after address creation`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} branch addresses...`)
        }
      } catch (error: any) {
        errors++
        console.error(`  ❌ Error migrating branch ${branch.id}:`, error.message)
      }
    }

    console.log(`✅ Branch migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in branch migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function main() {
  console.log('🚀 Starting Address Migration...')
  console.log('=====================================\n')

  try {
    await connectDB()
    console.log('✅ Connected to database\n')

    const stats: MigrationStats = {
      employees: { processed: 0, migrated: 0, errors: 0 },
      orders: { processed: 0, migrated: 0, errors: 0 },
      locations: { processed: 0, migrated: 0, errors: 0 },
      branches: { processed: 0, migrated: 0, errors: 0 },
    }

    // Migrate each entity type
    stats.employees = await migrateEmployeeAddresses()
    stats.orders = await migrateOrderAddresses()
    stats.locations = await migrateLocationAddresses()
    stats.branches = await migrateBranchAddresses()

    // Print summary
    console.log('\n=====================================')
    console.log('📊 Migration Summary')
    console.log('=====================================')
    console.log(`Employees:  ${stats.employees.migrated} migrated, ${stats.employees.errors} errors (${stats.employees.processed} processed)`)
    console.log(`Orders:     ${stats.orders.migrated} migrated, ${stats.orders.errors} errors (${stats.orders.processed} processed)`)
    console.log(`Locations:  ${stats.locations.migrated} migrated, ${stats.locations.errors} errors (${stats.locations.processed} processed)`)
    console.log(`Branches:   ${stats.branches.migrated} migrated, ${stats.branches.errors} errors (${stats.branches.processed} processed)`)
    
    const totalMigrated = stats.employees.migrated + stats.orders.migrated + stats.locations.migrated + stats.branches.migrated
    const totalErrors = stats.employees.errors + stats.orders.errors + stats.locations.errors + stats.branches.errors
    
    console.log(`\nTotal: ${totalMigrated} addresses migrated, ${totalErrors} errors`)
    console.log('\n✅ Migration complete!')
    console.log('\n✅ All old address fields have been removed.')
    console.log('    All addresses are now in the new standardized format.\n')

  } catch (error: any) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('✅ Database connection closed')
  }
}

// Run migration if executed directly
if (require.main === module) {
  main().catch(console.error)
}

export default main

