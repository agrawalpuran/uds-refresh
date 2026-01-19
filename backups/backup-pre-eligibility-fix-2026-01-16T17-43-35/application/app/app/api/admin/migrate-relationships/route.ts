import { NextResponse } from 'next/server'
import { connectDB } from '@/lib/db/connect'
import mongoose from 'mongoose'
import Uniform from '@/lib/models/Uniform'
import Company from '@/lib/models/Company'
import Vendor from '@/lib/models/Vendor'

export async function GET(request: Request) {
  try {
    await connectDB()
    
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json({ error: 'Database connection not available' }, { status: 500 })
    }

    const stats = {
      productCompanies: {
        total: 0,
        objectIdFormat: 0,
        stringIdFormat: 0,
        invalidFormat: 0
      },
      productVendors: {
        total: 0,
        objectIdFormat: 0,
        stringIdFormat: 0,
        invalidFormat: 0
      }
    }

    // Check ProductCompany relationships
    const productCompanyRelationships = await db.collection('productcompanies').find({}).toArray()
    stats.productCompanies.total = productCompanyRelationships.length
    
    for (const rel of productCompanyRelationships) {
      const productIdIsObjectId = rel.productId instanceof mongoose.Types.ObjectId || (typeof rel.productId === 'object' && rel.productId !== null)
      const companyIdIsObjectId = rel.companyId instanceof mongoose.Types.ObjectId || (typeof rel.companyId === 'object' && rel.companyId !== null)
      
      if (productIdIsObjectId || companyIdIsObjectId) {
        stats.productCompanies.objectIdFormat++
      } else {
        const productIdStr = String(rel.productId)
        const companyIdStr = String(rel.companyId)
        if (/^[A-Za-z0-9_-]{1,50}$/.test(productIdStr) && /^[A-Za-z0-9_-]{1,50}$/.test(companyIdStr)) {
          stats.productCompanies.stringIdFormat++
        } else {
          stats.productCompanies.invalidFormat++
        }
      }
    }

    // Check ProductVendor relationships
    const productVendorRelationships = await db.collection('productvendors').find({}).toArray()
    stats.productVendors.total = productVendorRelationships.length
    
    for (const rel of productVendorRelationships) {
      const productIdIsObjectId = rel.productId instanceof mongoose.Types.ObjectId || (typeof rel.productId === 'object' && rel.productId !== null)
      const vendorIdIsObjectId = rel.vendorId instanceof mongoose.Types.ObjectId || (typeof rel.vendorId === 'object' && rel.vendorId !== null)
      
      if (productIdIsObjectId || vendorIdIsObjectId) {
        stats.productVendors.objectIdFormat++
      } else {
        const productIdStr = String(rel.productId)
        const vendorIdStr = String(rel.vendorId)
        if (/^[A-Za-z0-9_-]{1,50}$/.test(productIdStr) && /^[A-Za-z0-9_-]{1,50}$/.test(vendorIdStr)) {
          stats.productVendors.stringIdFormat++
        } else {
          stats.productVendors.invalidFormat++
        }
      }
    }

    return NextResponse.json({
      success: true,
      stats,
      needsMigration: stats.productCompanies.objectIdFormat > 0 || stats.productVendors.objectIdFormat > 0 || 
                      stats.productCompanies.invalidFormat > 0 || stats.productVendors.invalidFormat > 0
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
      productCompanies: {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: [] as string[]
      },
      productVendors: {
        total: 0,
        migrated: 0,
        skipped: 0,
        errors: [] as string[]
      }
    }

    // ========== MIGRATE PRODUCTCOMPANY RELATIONSHIPS ==========
    console.log('[Migration] Starting ProductCompany migration...')
    const productCompanyRelationships = await db.collection('productcompanies').find({}).toArray()
    results.productCompanies.total = productCompanyRelationships.length
    
    for (const rel of productCompanyRelationships) {
      try {
        let needsMigration = false
        let productStringId: string | null = null
        let companyStringId: string | null = null
        
        // Check productId
        if (rel.productId instanceof mongoose.Types.ObjectId || (typeof rel.productId === 'object' && rel.productId !== null)) {
          // It's an ObjectId - need to migrate
          const product = await Uniform.findById(rel.productId).select('id').lean()
          if (product && product.id) {
            productStringId = product.id
            needsMigration = true
          } else {
            results.productCompanies.errors.push(`Product not found for ObjectId: ${rel.productId}`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(rel.productId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            productStringId = stringId
          } else {
            // Invalid format - try to find product by this ID
            const product = await Uniform.findOne({ id: stringId }).select('id').lean()
            if (product && product.id) {
              productStringId = product.id
              needsMigration = true
            } else {
              results.productCompanies.errors.push(`Invalid productId format: ${stringId}`)
              continue
            }
          }
        }
        
        // Check companyId
        if (rel.companyId instanceof mongoose.Types.ObjectId || (typeof rel.companyId === 'object' && rel.companyId !== null)) {
          // It's an ObjectId - need to migrate
          const company = await Company.findById(rel.companyId).select('id').lean()
          if (company && company.id) {
            companyStringId = company.id
            needsMigration = true
          } else {
            results.productCompanies.errors.push(`Company not found for ObjectId: ${rel.companyId}`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(rel.companyId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            companyStringId = stringId
          } else {
            // Invalid format - try to find company by this ID
            const company = await Company.findOne({ id: stringId }).select('id').lean()
            if (company && company.id) {
              companyStringId = company.id
              needsMigration = true
            } else {
              results.productCompanies.errors.push(`Invalid companyId format: ${stringId}`)
              continue
            }
          }
        }
        
        if (needsMigration && productStringId && companyStringId) {
          // Check if a relationship with string IDs already exists
          const existingRel = await db.collection('productcompanies').findOne({
            productId: productStringId,
            companyId: companyStringId
          })
          
          if (existingRel && existingRel._id.toString() !== rel._id.toString()) {
            // Relationship already exists with string IDs - delete the ObjectId one
            await db.collection('productcompanies').deleteOne({ _id: rel._id })
            results.productCompanies.skipped++
            console.log(`[Migration] Skipped duplicate ProductCompany: productId=${productStringId}, companyId=${companyStringId}`)
          } else {
            // Update the relationship to use string IDs
            await db.collection('productcompanies').updateOne(
              { _id: rel._id },
              { 
                $set: { 
                  productId: productStringId,
                  companyId: companyStringId
                }
              }
            )
            results.productCompanies.migrated++
            console.log(`[Migration] Migrated ProductCompany: ${rel._id} -> productId=${productStringId}, companyId=${companyStringId}`)
          }
        } else {
          results.productCompanies.skipped++
        }
      } catch (error) {
    const err = error as any;
        results.productCompanies.errors.push(`Error migrating ProductCompany ${rel._id}: ${error.message}`)
        console.error(`[Migration] Error migrating ProductCompany ${rel._id}:`, error)
      }
    }

    // ========== MIGRATE PRODUCTVENDOR RELATIONSHIPS ==========
    console.log('[Migration] Starting ProductVendor migration...')
    const productVendorRelationships = await db.collection('productvendors').find({}).toArray()
    results.productVendors.total = productVendorRelationships.length
    
    for (const rel of productVendorRelationships) {
      try {
        let needsMigration = false
        let productStringId: string | null = null
        let vendorStringId: string | null = null
        
        // Check productId
        if (rel.productId instanceof mongoose.Types.ObjectId || (typeof rel.productId === 'object' && rel.productId !== null)) {
          // It's an ObjectId - need to migrate
          const product = await Uniform.findById(rel.productId).select('id').lean()
          if (product && product.id) {
            productStringId = product.id
            needsMigration = true
          } else {
            results.productVendors.errors.push(`Product not found for ObjectId: ${rel.productId}`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(rel.productId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            productStringId = stringId
          } else {
            // Invalid format - try to find product by this ID
            const product = await Uniform.findOne({ id: stringId }).select('id').lean()
            if (product && product.id) {
              productStringId = product.id
              needsMigration = true
            } else {
              results.productVendors.errors.push(`Invalid productId format: ${stringId}`)
              continue
            }
          }
        }
        
        // Check vendorId
        if (rel.vendorId instanceof mongoose.Types.ObjectId || (typeof rel.vendorId === 'object' && rel.vendorId !== null)) {
          // It's an ObjectId - need to migrate
          const vendor = await Vendor.findById(rel.vendorId).select('id').lean()
          if (vendor && vendor.id) {
            vendorStringId = vendor.id
            needsMigration = true
          } else {
            results.productVendors.errors.push(`Vendor not found for ObjectId: ${rel.vendorId}`)
            continue
          }
        } else {
          // It's already a string ID
          const stringId = String(rel.vendorId)
          // Validate it's a 6-digit numeric string
          if (/^[A-Za-z0-9_-]{1,50}$/.test(stringId)) {
            vendorStringId = stringId
          } else {
            // Invalid format - try to find vendor by this ID
            const vendor = await Vendor.findOne({ id: stringId }).select('id').lean()
            if (vendor && vendor.id) {
              vendorStringId = vendor.id
              needsMigration = true
            } else {
              results.productVendors.errors.push(`Invalid vendorId format: ${stringId}`)
              continue
            }
          }
        }
        
        if (needsMigration && productStringId && vendorStringId) {
          // Check if a relationship with string IDs already exists
          const existingRel = await db.collection('productvendors').findOne({
            productId: productStringId,
            vendorId: vendorStringId
          })
          
          if (existingRel && existingRel._id.toString() !== rel._id.toString()) {
            // Relationship already exists with string IDs - delete the ObjectId one
            await db.collection('productvendors').deleteOne({ _id: rel._id })
            results.productVendors.skipped++
            console.log(`[Migration] Skipped duplicate ProductVendor: productId=${productStringId}, vendorId=${vendorStringId}`)
          } else {
            // Update the relationship to use string IDs
            await db.collection('productvendors').updateOne(
              { _id: rel._id },
              { 
                $set: { 
                  productId: productStringId,
                  vendorId: vendorStringId
                }
              }
            )
            results.productVendors.migrated++
            console.log(`[Migration] Migrated ProductVendor: ${rel._id} -> productId=${productStringId}, vendorId=${vendorStringId}`)
          }
        } else {
          results.productVendors.skipped++
        }
      } catch (error) {
    const err = error as any;
        results.productVendors.errors.push(`Error migrating ProductVendor ${rel._id}: ${error.message}`)
        console.error(`[Migration] Error migrating ProductVendor ${rel._id}:`, error)
      }
    }

    console.log('[Migration] Migration completed:', results)
    
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
