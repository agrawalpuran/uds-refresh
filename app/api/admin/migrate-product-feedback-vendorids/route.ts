import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import mongoose from 'mongoose'
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
      objectIdFormat: 0,
      stringIdFormat: 0,
      missingVendorId: 0,
      invalidFormat: 0
    }

    // Check ProductFeedback records
    const productFeedbacks = await db.collection('productfeedbacks').find({}).toArray()
    stats.total = productFeedbacks.length
    
    for (const feedback of productFeedbacks) {
      if (!feedback.vendorId) {
        stats.missingVendorId++
        continue
      }
      
      const vendorIdIsObjectId = feedback.vendorId instanceof mongoose.Types.ObjectId || 
                                 (typeof feedback.vendorId === 'object' && feedback.vendorId !== null)
      
      if (vendorIdIsObjectId) {
        stats.objectIdFormat++
      } else {
        const stringId = String(feedback.vendorId)
        if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
          stats.stringIdFormat++
        } else {
          stats.invalidFormat++
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      needsMigration: stats.objectIdFormat > 0 || stats.invalidFormat > 0
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
      migrated: 0,
      skipped: 0,
      errors: [] as string[]
    }

    console.log('[Migration] Starting ProductFeedback vendorId migration...')
    const productFeedbacks = await db.collection('productfeedbacks').find({}).toArray()
    results.total = productFeedbacks.length
    
    for (const feedback of productFeedbacks) {
      try {
        // Skip if vendorId is missing
        if (!feedback.vendorId) {
          results.skipped++
          continue
        }
        
        let needsMigration = false
        let vendorStringId: string | null = null
        
        // Check if vendorId is an ObjectId
        if (feedback.vendorId instanceof mongoose.Types.ObjectId || (typeof feedback.vendorId === 'object' && feedback.vendorId !== null)) {
          // It's an ObjectId - need to migrate
          const vendor = await Vendor.findById(feedback.vendorId).select('id').lean()
          if (vendor && vendor.id) {
            vendorStringId = vendor.id
            needsMigration = true
          } else {
            results.errors.push(`Vendor not found for ObjectId: ${feedback.vendorId} (feedback _id: ${feedback._id})`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(feedback.vendorId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            vendorStringId = stringId
            // Already correct format - skip
            results.skipped++
            continue
          } else {
            // Invalid format - try to find vendor by this ID
            const vendor = await Vendor.findOne({ id: stringId }).select('id').lean()
            if (vendor && vendor.id) {
              vendorStringId = vendor.id
              needsMigration = true
            } else {
              results.errors.push(`Invalid vendorId format: ${stringId} (feedback _id: ${feedback._id})`)
              continue
            }
          }
        }
        
        if (needsMigration && vendorStringId) {
          // Update the record to use string ID
          await db.collection('productfeedbacks').updateOne(
            { _id: feedback._id },
            { 
              $set: { 
                vendorId: vendorStringId
              }
            }
          )
          results.migrated++
          console.log(`[Migration] ✓ Migrated ProductFeedback ${feedback._id} vendorId: ${feedback.vendorId} -> ${vendorStringId}`)
        }
      } catch (error) {
    const err = error as any;
        results.errors.push(`Error migrating ProductFeedback ${feedback._id}: ${error.message}`)
        console.error(`[Migration] ❌ Error migrating ProductFeedback ${feedback._id}:`, error)
      }
    }

    console.log('[Migration] ProductFeedback vendorId migration completed:', results)
    
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
