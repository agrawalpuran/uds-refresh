/**
 * Address Migration Script - Convert Address Table to Embedded Format
 * 
 * This script migrates existing Address records to embedded format in their respective tables:
 * - Employees: addressId -> address_line_1, address_line_2, address_line_3, city, state, pincode, country
 * - Locations: addressId -> address_line_1, address_line_2, address_line_3, city, state, pincode, country
 * - Vendors: addressId -> address_line_1, address_line_2, address_line_3, city, state, pincode, country
 * - Branches: addressId -> address_line_1, address_line_2, address_line_3, city, state, pincode, country
 * - Orders: shippingAddressId -> shipping_address_line_1, shipping_address_line_2, shipping_address_line_3, shipping_city, shipping_state, shipping_pincode, shipping_country
 * 
 * After migration, the Address collection can be dropped.
 * 
 * Usage:
 *   npm run migrate-addresses-to-embedded
 *   OR
 *   npx tsx scripts/migrate-addresses-to-embedded.ts
 */

import mongoose from 'mongoose'
import connectDB from '../lib/db/mongodb'
import Address from '../lib/models/Address'
import Employee from '../lib/models/Employee'
import Location from '../lib/models/Location'
import Vendor from '../lib/models/Vendor'
import Branch from '../lib/models/Branch'
import Order from '../lib/models/Order'

interface MigrationStats {
  employees: { processed: number; migrated: number; errors: number }
  locations: { processed: number; migrated: number; errors: number }
  vendors: { processed: number; migrated: number; errors: number }
  branches: { processed: number; migrated: number; errors: number }
  orders: { processed: number; migrated: number; errors: number }
}

async function migrateEmployeeAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Employee addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    // Use raw MongoDB collection to handle both addressId and legacy address field
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    const employeesCollection = db.collection('employees')
    const employees = await employeesCollection.find({ addressId: { $exists: true } }).toArray()
    console.log(`Found ${employees.length} employees with addressId`)

    for (const employeeDoc of employees) {
      processed++
      
      try {
        const addressId = employeeDoc.addressId
        if (!addressId) {
          continue
        }

        // Fetch address from Address collection
        const address = await Address.findById(addressId)
        if (!address) {
          console.warn(`  ⚠️  Employee ${employeeDoc.id}: Address ${addressId} not found`)
          errors++
          continue
        }

        // Update employee with embedded address fields
        const updateResult = await employeesCollection.updateOne(
          { _id: employeeDoc._id },
          {
            $set: {
              address_line_1: address.address_line_1,
              address_line_2: address.address_line_2 || undefined,
              address_line_3: address.address_line_3 || undefined,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              country: address.country || 'India',
            },
            $unset: { addressId: '', address: '' } // Remove old fields
          }
        )

        if (updateResult.matchedCount === 0) {
          throw new Error(`Employee ${employeeDoc.id} not found`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} employee addresses...`)
        }
      } catch (error: any) {
        errors++
        console.error(`  ❌ Error migrating employee ${employeeDoc.id}:`, error.message)
      }
    }

    console.log(`✅ Employee migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in employee migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function migrateLocationAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Location addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    const locationsCollection = db.collection('locations')
    const locations = await locationsCollection.find({ addressId: { $exists: true } }).toArray()
    console.log(`Found ${locations.length} locations with addressId`)

    for (const locationDoc of locations) {
      processed++
      
      try {
        const addressId = locationDoc.addressId
        if (!addressId) {
          continue
        }

        const address = await Address.findById(addressId)
        if (!address) {
          console.warn(`  ⚠️  Location ${locationDoc.id}: Address ${addressId} not found`)
          errors++
          continue
        }

        // First, unset old fields to avoid conflicts
        await locationsCollection.updateOne(
          { _id: locationDoc._id },
          {
            $unset: { addressId: '', address: '' }
          }
        )
        
        // Then set new embedded address fields
        const updateResult = await locationsCollection.updateOne(
          { _id: locationDoc._id },
          {
            $set: {
              address_line_1: address.address_line_1,
              address_line_2: address.address_line_2 || undefined,
              address_line_3: address.address_line_3 || undefined,
              city: address.city,
              state: address.state,
              pincode: address.pincode,
              country: address.country || 'India',
            }
          }
        )

        if (updateResult.matchedCount === 0) {
          throw new Error(`Location ${locationDoc.id} not found`)
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

async function migrateVendorAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Vendor addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    const vendors = await Vendor.find({ addressId: { $exists: true } })
    console.log(`Found ${vendors.length} vendors with addressId`)

    for (const vendor of vendors) {
      processed++
      
      try {
        if (!vendor.addressId) {
          continue
        }

        const address = await Address.findById(vendor.addressId)
        if (!address) {
          console.warn(`  ⚠️  Vendor ${vendor.id}: Address ${vendor.addressId} not found`)
          errors++
          continue
        }

        vendor.address_line_1 = address.address_line_1
        vendor.address_line_2 = address.address_line_2
        vendor.address_line_3 = address.address_line_3
        vendor.city = address.city
        vendor.state = address.state
        vendor.pincode = address.pincode
        vendor.country = address.country || 'India'
        vendor.addressId = undefined

        await vendor.save()
        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} vendor addresses...`)
        }
      } catch (error: any) {
        errors++
        console.error(`  ❌ Error migrating vendor ${vendor.id}:`, error.message)
      }
    }

    console.log(`✅ Vendor migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in vendor migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function migrateBranchAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Branch addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    const branches = await Branch.find({ addressId: { $exists: true } })
    console.log(`Found ${branches.length} branches with addressId`)

    for (const branch of branches) {
      processed++
      
      try {
        if (!branch.addressId) {
          continue
        }

        const address = await Address.findById(branch.addressId)
        if (!address) {
          console.warn(`  ⚠️  Branch ${branch.id}: Address ${branch.addressId} not found`)
          errors++
          continue
        }

        branch.address_line_1 = address.address_line_1
        branch.address_line_2 = address.address_line_2
        branch.address_line_3 = address.address_line_3
        branch.city = address.city
        branch.state = address.state
        branch.pincode = address.pincode
        branch.country = address.country || 'India'
        branch.addressId = undefined

        await branch.save()
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

async function migrateOrderAddresses(): Promise<{ processed: number; migrated: number; errors: number }> {
  console.log('\n📋 Migrating Order shipping addresses...')
  
  let processed = 0
  let migrated = 0
  let errors = 0

  try {
    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }
    
    const ordersCollection = db.collection('orders')
    const orders = await ordersCollection.find({ shippingAddressId: { $exists: true } }).toArray()
    console.log(`Found ${orders.length} orders with shippingAddressId`)

    for (const orderDoc of orders) {
      processed++
      
      try {
        const addressId = orderDoc.shippingAddressId
        if (!addressId) {
          continue
        }

        const address = await Address.findById(addressId)
        if (!address) {
          console.warn(`  ⚠️  Order ${orderDoc.id}: Address ${addressId} not found`)
          errors++
          continue
        }

        // First, unset old field to avoid conflicts
        await ordersCollection.updateOne(
          { _id: orderDoc._id },
          {
            $unset: { shippingAddressId: '', deliveryAddress: '' }
          }
        )
        
        // Then set new embedded shipping address fields
        const updateResult = await ordersCollection.updateOne(
          { _id: orderDoc._id },
          {
            $set: {
              shipping_address_line_1: address.address_line_1,
              shipping_address_line_2: address.address_line_2 || undefined,
              shipping_address_line_3: address.address_line_3 || undefined,
              shipping_city: address.city,
              shipping_state: address.state,
              shipping_pincode: address.pincode,
              shipping_country: address.country || 'India',
            }
          }
        )

        if (updateResult.matchedCount === 0) {
          throw new Error(`Order ${orderDoc.id} not found`)
        }

        migrated++
        if (migrated % 10 === 0) {
          console.log(`  ✅ Migrated ${migrated} order addresses...`)
        }
      } catch (error: any) {
        errors++
        const orderId = orderDoc.id || orderDoc._id?.toString() || 'unknown'
        console.error(`  ❌ Error migrating order ${orderId}:`, error.message)
      }
    }

    console.log(`✅ Order migration complete: ${migrated} migrated, ${errors} errors`)
  } catch (error: any) {
    console.error('❌ Error in order migration:', error.message)
  }

  return { processed, migrated, errors }
}

async function main() {
  console.log('🚀 Starting Address to Embedded Format Migration...')
  console.log('=====================================\n')

  try {
    await connectDB()
    console.log('✅ Connected to database\n')

    const stats: MigrationStats = {
      employees: { processed: 0, migrated: 0, errors: 0 },
      locations: { processed: 0, migrated: 0, errors: 0 },
      vendors: { processed: 0, migrated: 0, errors: 0 },
      branches: { processed: 0, migrated: 0, errors: 0 },
      orders: { processed: 0, migrated: 0, errors: 0 },
    }

    // Migrate each entity type
    stats.employees = await migrateEmployeeAddresses()
    stats.locations = await migrateLocationAddresses()
    stats.vendors = await migrateVendorAddresses()
    stats.branches = await migrateBranchAddresses()
    stats.orders = await migrateOrderAddresses()

    // Print summary
    console.log('\n=====================================')
    console.log('📊 Migration Summary')
    console.log('=====================================')
    console.log(`Employees:  ${stats.employees.migrated} migrated, ${stats.employees.errors} errors (${stats.employees.processed} processed)`)
    console.log(`Locations:  ${stats.locations.migrated} migrated, ${stats.locations.errors} errors (${stats.locations.processed} processed)`)
    console.log(`Vendors:    ${stats.vendors.migrated} migrated, ${stats.vendors.errors} errors (${stats.vendors.processed} processed)`)
    console.log(`Branches:   ${stats.branches.migrated} migrated, ${stats.branches.errors} errors (${stats.branches.processed} processed)`)
    console.log(`Orders:     ${stats.orders.migrated} migrated, ${stats.orders.errors} errors (${stats.orders.processed} processed)`)
    
    const totalMigrated = stats.employees.migrated + stats.locations.migrated + stats.vendors.migrated + stats.branches.migrated + stats.orders.migrated
    const totalErrors = stats.employees.errors + stats.locations.errors + stats.vendors.errors + stats.branches.errors + stats.orders.errors
    
    console.log(`\nTotal: ${totalMigrated} addresses migrated, ${totalErrors} errors`)
    console.log('\n✅ Migration complete!')
    console.log('\n⚠️  Note: Address collection can now be dropped if all migrations were successful.')
    console.log('    Run: db.addresses.drop() in MongoDB shell\n')

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

