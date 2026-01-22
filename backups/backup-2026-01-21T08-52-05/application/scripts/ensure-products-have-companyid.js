/**
 * Script to ensure all products have companyId associations
 * Checks both:
 * 1. companyIds field in Uniform model
 * 2. ProductCompany relationship table
 * Ensures they are in sync
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
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

async function ensureProductsHaveCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all products
    const products = await db.collection('uniforms').find({}).toArray()
    console.log(`Found ${products.length} products\n`)

    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    const companyMap = new Map()
    companies.forEach(c => {
      companyMap.set(c._id.toString(), c)
      if (c.id) {
        companyMap.set(c.id, c)
      }
    })
    console.log(`Found ${companies.length} companies: ${companies.map(c => c.id || c.name).join(', ')}\n`)

    // Get all ProductCompany relationships
    const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
    const productCompanyMap = new Map() // productId -> Set of companyIds
    
    productCompanyLinks.forEach(link => {
      const productIdStr = link.productId?.toString()
      const companyIdStr = link.companyId?.toString()
      
      if (productIdStr && companyIdStr) {
        if (!productCompanyMap.has(productIdStr)) {
          productCompanyMap.set(productIdStr, new Set())
        }
        productCompanyMap.get(productIdStr).add(companyIdStr)
      }
    })
    
    console.log(`Found ${productCompanyLinks.length} ProductCompany relationships\n`)

    let fixedCount = 0
    let updatedCount = 0
    let errorCount = 0
    const issues = []

    for (const product of products) {
      const productId = product.id || product._id.toString()
      const productIdStr = product._id.toString()
      
      // Get companyIds from product document
      const productCompanyIds = product.companyIds || []
      const productCompanyIdsStr = productCompanyIds.map(id => id.toString ? id.toString() : String(id))
      
      // Get companyIds from ProductCompany relationships
      const relationshipCompanyIds = productCompanyMap.get(productIdStr) || new Set()
      const relationshipCompanyIdsStr = Array.from(relationshipCompanyIds)
      
      // Check if product has any company associations
      const hasCompanyIds = productCompanyIdsStr.length > 0
      const hasRelationships = relationshipCompanyIdsStr.length > 0
      
      if (!hasCompanyIds && !hasRelationships) {
        // Product has no company associations - link to all companies
        console.log(`⚠️  Product ${productId} (${product.name}) has no company associations`)
        
        try {
          // Link to all companies
          const allCompanyObjectIds = companies.map(c => c._id)
          
          // Update product's companyIds field
          await db.collection('uniforms').updateOne(
            { _id: product._id },
            { $set: { companyIds: allCompanyObjectIds } }
          )
          
          // Create ProductCompany relationships for all companies
          for (const company of companies) {
            await db.collection('productcompanies').updateOne(
              { productId: product._id, companyId: company._id },
              { $set: { productId: product._id, companyId: company._id } },
              { upsert: true }
            )
          }
          
          console.log(`✅ Linked product ${productId} to all ${companies.length} companies`)
          fixedCount++
        } catch (error) {
          console.error(`❌ Error linking product ${productId}:`, error.message)
          issues.push({
            product: productId,
            productName: product.name,
            issue: 'Failed to link to companies',
            error: error.message
          })
          errorCount++
        }
      } else {
        // Product has some associations - check if they're in sync
        const productSet = new Set(productCompanyIdsStr)
        const relationshipSet = new Set(relationshipCompanyIdsStr)
        
        // Check if sets match
        const setsMatch = productCompanyIdsStr.length === relationshipCompanyIdsStr.length &&
          productCompanyIdsStr.every(id => relationshipSet.has(id)) &&
          relationshipCompanyIdsStr.every(id => productSet.has(id))
        
        if (!setsMatch) {
          console.log(`⚠️  Product ${productId} (${product.name}) has mismatched company associations`)
          console.log(`   companyIds field: [${productCompanyIdsStr.join(', ')}]`)
          console.log(`   ProductCompany relationships: [${relationshipCompanyIdsStr.join(', ')}]`)
          
          try {
            // Use ProductCompany relationships as source of truth (they're more reliable)
            const correctCompanyIds = relationshipCompanyIdsStr
              .map(idStr => {
                // Find company ObjectId
                const company = companies.find(c => 
                  c._id.toString() === idStr || c.id === idStr
                )
                return company ? company._id : null
              })
              .filter(id => id !== null)
            
            if (correctCompanyIds.length > 0) {
              // Update product's companyIds field to match relationships
              await db.collection('uniforms').updateOne(
                { _id: product._id },
                { $set: { companyIds: correctCompanyIds } }
              )
              
              console.log(`✅ Synced product ${productId} companyIds field with relationships`)
              updatedCount++
            } else if (productCompanyIdsStr.length > 0) {
              // Use companyIds field as source of truth
              const correctCompanyIds = productCompanyIdsStr
                .map(idStr => {
                  const company = companies.find(c => 
                    c._id.toString() === idStr || c.id === idStr
                  )
                  return company ? company._id : null
                })
                .filter(id => id !== null)
              
              // Create missing ProductCompany relationships
              for (const companyId of correctCompanyIds) {
                await db.collection('productcompanies').updateOne(
                  { productId: product._id, companyId: companyId },
                  { $set: { productId: product._id, companyId: companyId } },
                  { upsert: true }
                )
              }
              
              console.log(`✅ Created ProductCompany relationships for product ${productId}`)
              updatedCount++
            }
          } catch (error) {
            console.error(`❌ Error syncing product ${productId}:`, error.message)
            issues.push({
              product: productId,
              productName: product.name,
              issue: 'Failed to sync company associations',
              error: error.message
            })
            errorCount++
          }
        } else {
          // Verify all companyIds are valid
          const invalidCompanyIds = []
          for (const companyIdStr of productCompanyIdsStr) {
            const company = companies.find(c => 
              c._id.toString() === companyIdStr || c.id === companyIdStr
            )
            if (!company) {
              invalidCompanyIds.push(companyIdStr)
            }
          }
          
          if (invalidCompanyIds.length > 0) {
            console.log(`⚠️  Product ${productId} (${product.name}) has invalid companyIds: [${invalidCompanyIds.join(', ')}]`)
            
            try {
              // Remove invalid companyIds
              const validCompanyIds = productCompanyIdsStr
                .filter(idStr => !invalidCompanyIds.includes(idStr))
                .map(idStr => {
                  const company = companies.find(c => 
                    c._id.toString() === idStr || c.id === idStr
                  )
                  return company ? company._id : null
                })
                .filter(id => id !== null)
              
              await db.collection('uniforms').updateOne(
                { _id: product._id },
                { $set: { companyIds: validCompanyIds } }
              )
              
              // Remove invalid ProductCompany relationships
              for (const invalidId of invalidCompanyIds) {
                await db.collection('productcompanies').deleteMany({
                  productId: product._id,
                  companyId: mongoose.Types.ObjectId.isValid(invalidId) ? new mongoose.Types.ObjectId(invalidId) : invalidId
                })
              }
              
              console.log(`✅ Removed invalid companyIds from product ${productId}`)
              updatedCount++
            } catch (error) {
              console.error(`❌ Error removing invalid companyIds:`, error.message)
              issues.push({
                product: productId,
                productName: product.name,
                issue: 'Failed to remove invalid companyIds',
                error: error.message
              })
              errorCount++
            }
          } else {
            console.log(`✓ Product ${productId} (${product.name}): Valid company associations (${productCompanyIdsStr.length} companies)`)
          }
        }
      }
    }

    // Print summary
    console.log('\n=== SUMMARY ===')
    console.log(`Total products: ${products.length}`)
    console.log(`Fixed (linked to companies): ${fixedCount}`)
    console.log(`Updated (synced associations): ${updatedCount}`)
    console.log(`Errors: ${errorCount}`)
    console.log(`Already valid: ${products.length - fixedCount - updatedCount - errorCount}`)

    if (issues.length > 0) {
      console.log('\n=== ISSUES ===')
      issues.forEach((issue, idx) => {
        console.log(`\n${idx + 1}. Product: ${issue.product} (${issue.productName})`)
        console.log(`   Issue: ${issue.issue}`)
        if (issue.error) {
          console.log(`   Error: ${issue.error}`)
        }
      })
    }

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
  } catch (error) {
    console.error('Error:', error)
    process.exit(1)
  }
}

ensureProductsHaveCompanyId()

