/**
 * Add companyId to existing ProductVendor links based on ProductCompany relationships
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

mongoose.connect(MONGODB_URI).then(async () => {
  const db = mongoose.connection.db
  
  console.log('='.repeat(80))
  console.log('ADDING COMPANYID TO PRODUCTVENDOR LINKS')
  console.log('='.repeat(80))
  console.log()
  
  // Get all ProductVendor links without companyId
  const linksWithoutCompanyId = await db.collection('productvendors').find({
    companyId: { $exists: false }
  }).toArray()
  
  console.log(`Found ${linksWithoutCompanyId.length} ProductVendor links without companyId`)
  console.log()
  
  // Check and update indexes
  console.log('Checking indexes...')
  const indexes = await db.collection('productvendors').indexes()
  console.log('Current indexes:', indexes.map(i => i.key))
  
  // Drop old unique index if it exists (productId_1_vendorId_1)
  const oldIndexName = 'productId_1_vendorId_1'
  const hasOldIndex = indexes.some(i => i.name === oldIndexName)
  if (hasOldIndex) {
    console.log(`⚠️  Old unique index '${oldIndexName}' found - dropping it`)
    await db.collection('productvendors').dropIndex(oldIndexName)
    console.log(`✓ Dropped old index`)
  }
  
  // Create new unique index with companyId
  const newIndexName = 'productId_1_vendorId_1_companyId_1'
  const hasNewIndex = indexes.some(i => i.name === newIndexName)
  if (!hasNewIndex) {
    console.log(`Creating new unique index: productId + vendorId + companyId`)
    await db.collection('productvendors').createIndex(
      { productId: 1, vendorId: 1, companyId: 1 },
      { unique: true, name: newIndexName }
    )
    console.log(`✓ Created new index`)
  } else {
    console.log(`✓ New index already exists`)
  }
  console.log()
  
  if (linksWithoutCompanyId.length === 0) {
    console.log('✓ All ProductVendor links already have companyId')
    await mongoose.disconnect()
    return
  }
  
  // Get all ProductCompany links to map product -> companies
  const productCompanyLinks = await db.collection('productcompanies').find({}).toArray()
  console.log(`Found ${productCompanyLinks.length} ProductCompany links`)
  console.log()
  
  // Create a map: productId -> [companyIds]
  const productToCompanies = new Map()
  productCompanyLinks.forEach(pc => {
    const productIdStr = pc.productId.toString()
    if (!productToCompanies.has(productIdStr)) {
      productToCompanies.set(productIdStr, [])
    }
    productToCompanies.get(productIdStr).push(pc.companyId)
  })
  
  let updatedCount = 0
  let skippedCount = 0
  
  for (const link of linksWithoutCompanyId) {
    const productIdStr = link.productId.toString()
    const companies = productToCompanies.get(productIdStr)
    
    if (!companies || companies.length === 0) {
      console.log(`⚠️  Product ${productIdStr} has no ProductCompany links - skipping`)
      skippedCount++
      continue
    }
    
    // If product is linked to multiple companies, we need to create separate ProductVendor links
    // For now, let's update the existing link with the first company
    // In a real scenario, you might want to create multiple links
    const companyId = companies[0]
    
    console.log(`Updating ProductVendor link:`)
    console.log(`  - productId: ${productIdStr}`)
    console.log(`  - vendorId: ${link.vendorId.toString()}`)
    console.log(`  - Adding companyId: ${companyId.toString()}`)
    
    // Check if a link with this productId + vendorId + companyId already exists
    const existing = await db.collection('productvendors').findOne({
      productId: link.productId,
      vendorId: link.vendorId,
      companyId: companyId
    })
    
    if (existing) {
      console.log(`  ⚠️  Link with this productId + vendorId + companyId already exists - deleting old link`)
      await db.collection('productvendors').deleteOne({ _id: link._id })
    } else {
      // Update the link to add companyId
      await db.collection('productvendors').updateOne(
        { _id: link._id },
        { $set: { companyId: companyId } }
      )
      updatedCount++
    }
    
    // If product is linked to multiple companies, create additional ProductVendor links
    if (companies.length > 1) {
      console.log(`  ℹ️  Product is linked to ${companies.length} companies - creating additional links`)
      for (let i = 1; i < companies.length; i++) {
        const additionalCompanyId = companies[i]
        
        // Check if link already exists
        const existingAdditional = await db.collection('productvendors').findOne({
          productId: link.productId,
          vendorId: link.vendorId,
          companyId: additionalCompanyId
        })
        
        if (!existingAdditional) {
          await db.collection('productvendors').insertOne({
            productId: link.productId,
            vendorId: link.vendorId,
            companyId: additionalCompanyId,
            createdAt: new Date(),
            updatedAt: new Date()
          })
          console.log(`    ✓ Created link for company ${additionalCompanyId.toString()}`)
          updatedCount++
        } else {
          console.log(`    ⚠️  Link already exists for company ${additionalCompanyId.toString()}`)
        }
      }
    }
    
    console.log()
  }
  
  console.log('='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))
  console.log(`✓ Updated/Created: ${updatedCount} ProductVendor link(s)`)
  console.log(`⚠️  Skipped: ${skippedCount} link(s)`)
  console.log()
  
  // Verify the update
  const remainingWithoutCompanyId = await db.collection('productvendors').countDocuments({
    companyId: { $exists: false }
  })
  const totalWithCompanyId = await db.collection('productvendors').countDocuments({
    companyId: { $exists: true }
  })
  
  console.log('Verification:')
  console.log(`  - Links with companyId: ${totalWithCompanyId}`)
  console.log(`  - Links without companyId: ${remainingWithoutCompanyId} ${remainingWithoutCompanyId > 0 ? '❌' : '✓'}`)
  
  await mongoose.disconnect()
  console.log()
  console.log('✓ Done!')
}).catch(error => {
  console.error('Error:', error)
  process.exit(1)
})

