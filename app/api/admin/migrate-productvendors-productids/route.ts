import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import mongoose from 'mongoose'
import Uniform from '@/lib/models/Uniform'
import Vendor from '@/lib/models/Vendor'

export async function GET(request: Request) {
  try {
    await connectDB()
    
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
    }

    const stats = {
      total: 0,
      productIdObjectIdFormat: 0,
      productIdStringIdFormat: 0,
      vendorIdObjectIdFormat: 0,
      vendorIdStringIdFormat: 0,
      missingProductId: 0,
      missingVendorId: 0,
      invalidFormat: 0
    }

    // Check ProductVendor records
    const productVendors = await db.collection('productvendors').find({}).toArray()
    stats.total = productVendors.length
    
    for (const pv of productVendors) {
      // Check productId
      if (!pv.productId) {
        stats.missingProductId++
      } else {
        const productIdIsObjectId = pv.productId instanceof mongoose.Types.ObjectId || 
                                    (typeof pv.productId === 'object' && pv.productId !== null)
        
        if (productIdIsObjectId) {
          stats.productIdObjectIdFormat++
        } else {
          const stringId = String(pv.productId)
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            stats.productIdStringIdFormat++
          } else {
            stats.invalidFormat++
          }
        }
      }
      
      // Check vendorId
      if (!pv.vendorId) {
        stats.missingVendorId++
      } else {
        const vendorIdIsObjectId = pv.vendorId instanceof mongoose.Types.ObjectId || 
                                  (typeof pv.vendorId === 'object' && pv.vendorId !== null)
        
        if (vendorIdIsObjectId) {
          stats.vendorIdObjectIdFormat++
        } else {
          const stringId = String(pv.vendorId)
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            stats.vendorIdStringIdFormat++
          } else {
            stats.invalidFormat++
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      needsMigration: stats.productIdObjectIdFormat > 0 || stats.vendorIdObjectIdFormat > 0 || stats.invalidFormat > 0
    }, { status: 200 })
    
  } catch (error) {
    const err = error as any;
    console.error('[Migration] Stats check failed:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await connectDB()
    
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
    }

    const results = {
      total: 0,
      productIdMigrated: 0,
      vendorIdMigrated: 0,
      skipped: 0,
      errors: [] as string[]
    }

    console.log('[Migration] Starting ProductVendor productId and vendorId migration...')
    const productVendors = await db.collection('productvendors').find({}).toArray()
    results.total = productVendors.length
    
    for (const pv of productVendors) {
      try {
        let needsUpdate = false
        let productStringId: string | null = null
        let vendorStringId: string | null = null
        
        // Check and migrate productId
        if (!pv.productId) {
          results.errors.push(`ProductVendor record ${pv._id} has missing productId`)
          continue
        }
        
        if (pv.productId instanceof mongoose.Types.ObjectId || (typeof pv.productId === 'object' && pv.productId !== null)) {
          // It's an ObjectId - need to migrate
          const product = await Uniform.findById(pv.productId).select('id').lean()
          if (product && product.id) {
            productStringId = product.id
            needsUpdate = true
          } else {
            results.errors.push(`Product not found for ObjectId: ${pv.productId} (ProductVendor _id: ${pv._id})`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(pv.productId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            productStringId = stringId
          } else {
            // Invalid format - try to find product by this ID
            const product = await Uniform.findOne({ id: stringId }).select('id').lean()
            if (product && product.id) {
              productStringId = product.id
              needsUpdate = true
            } else {
              results.errors.push(`Invalid productId format: ${stringId} (ProductVendor _id: ${pv._id})`)
              continue
            }
          }
        }
        
        // Check and migrate vendorId
        if (!pv.vendorId) {
          results.errors.push(`ProductVendor record ${pv._id} has missing vendorId`)
          continue
        }
        
        if (pv.vendorId instanceof mongoose.Types.ObjectId || (typeof pv.vendorId === 'object' && pv.vendorId !== null)) {
          // It's an ObjectId - need to migrate
          const vendor = await Vendor.findById(pv.vendorId).select('id').lean()
          if (vendor && vendor.id) {
            vendorStringId = vendor.id
            needsUpdate = true
          } else {
            results.errors.push(`Vendor not found for ObjectId: ${pv.vendorId} (ProductVendor _id: ${pv._id})`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(pv.vendorId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            vendorStringId = stringId
          } else {
            // Invalid format - try to find vendor by this ID
            const vendor = await Vendor.findOne({ id: stringId }).select('id').lean()
            if (vendor && vendor.id) {
              vendorStringId = vendor.id
              needsUpdate = true
            } else {
              results.errors.push(`Invalid vendorId format: ${stringId} (ProductVendor _id: ${pv._id})`)
              continue
            }
          }
        }
        
        if (needsUpdate && productStringId && vendorStringId) {
          // Update the record to use string IDs
          await db.collection('productvendors').updateOne(
            { _id: pv._id },
            { 
              $set: { 
                productId: productStringId,
                vendorId: vendorStringId
              }
            }
          )
          if (pv.productId instanceof mongoose.Types.ObjectId || (typeof pv.productId === 'object' && pv.productId !== null)) {
            results.productIdMigrated++
          }
          if (pv.vendorId instanceof mongoose.Types.ObjectId || (typeof pv.vendorId === 'object' && pv.vendorId !== null)) {
            results.vendorIdMigrated++
          }
          console.log(`[Migration] ✓ Migrated ProductVendor ${pv._id} productId: ${pv.productId} -> ${productStringId}, vendorId: ${pv.vendorId} -> ${vendorStringId}`)
        } else {
          results.skipped++
        }
      } catch (error) {
    const err = error as any;
        results.errors.push(`Error migrating ProductVendor ${pv._id}: ${error.message}`)
        console.error(`[Migration] ❌ Error migrating ProductVendor ${pv._id}:`, error)
      }
    }

    console.log('[Migration] ProductVendor migration completed:', results)
    
    return NextResponse.json({
      success: true,
      message: 'Migration completed',
      results
    }, { status: 200 })
    
  } catch (error) {
    const err = error as any;
    console.error('[Migration] Migration failed:', error)
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
