/**
 * Migration Script: ProductCategory → Category + Subcategory
 * 
 * This script migrates the existing company-specific categories to:
 * 1. Global categories (Category model)
 * 2. Company-specific subcategories (Subcategory model)
 * 3. Product-subcategory mappings (ProductSubcategoryMapping model)
 * 4. Designation-subcategory eligibilities (DesignationSubcategoryEligibility model)
 * 
 * Usage: node scripts/migrate-to-subcategories.js
 * 
 * WARNING: This is a one-time migration. Run with caution.
 */

const { MongoClient, ObjectId } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function migrateToSubcategories() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('MIGRATION: ProductCategory → Category + Subcategory')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    // Step 1: Collect all unique category names from existing ProductCategory collection
    console.log('📋 Step 1: Collecting unique category names...')
    const existingCategories = await db.collection('productcategories').find({}).toArray()
    console.log(`   Found ${existingCategories.length} existing category records`)
    
    const uniqueCategoryNames = new Set()
    const categoryByCompany = new Map() // Map: companyId -> [categories]
    
    for (const cat of existingCategories) {
      uniqueCategoryNames.add(cat.name.toLowerCase())
      
      const companyId = cat.companyId?.toString() || cat.companyId
      if (!categoryByCompany.has(companyId)) {
        categoryByCompany.set(companyId, [])
      }
      categoryByCompany.get(companyId).push(cat)
    }
    
    console.log(`   Found ${uniqueCategoryNames.size} unique category names`)
    console.log(`   Found ${categoryByCompany.size} companies with categories`)
    console.log('')
    
    // Step 2: Create global categories
    console.log('📋 Step 2: Creating global categories...')
    const categoriesCollection = db.collection('categories')
    const globalCategories = new Map() // Map: categoryName -> categoryId
    
    let categoryIdCounter = 500001
    
    for (const categoryName of uniqueCategoryNames) {
      // Check if global category already exists
      const existing = await categoriesCollection.findOne({
        name: { $regex: new RegExp(`^${categoryName}$`, 'i') }
      })
      
      if (existing) {
        console.log(`   ✅ Category "${categoryName}" already exists (ID: ${existing.id})`)
        globalCategories.set(categoryName.toLowerCase(), existing)
        continue
      }
      
      // Determine if it's a system category
      const systemCategoryNames = ['shirt', 'pant', 'trouser', 'shoe', 'jacket', 'blazer', 'accessory']
      const isSystemCategory = systemCategoryNames.includes(categoryName.toLowerCase())
      
      // Create global category
      const categoryDoc = {
        id: categoryIdCounter.toString(),
        name: categoryName.charAt(0).toUpperCase() + categoryName.slice(1), // Capitalize first letter
        isSystemCategory,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      const result = await categoriesCollection.insertOne(categoryDoc)
      categoryDoc._id = result.insertedId
      
      globalCategories.set(categoryName.toLowerCase(), categoryDoc)
      console.log(`   ✅ Created global category: "${categoryDoc.name}" (ID: ${categoryDoc.id})`)
      
      categoryIdCounter++
    }
    console.log('')
    
    // Step 3: Create subcategories for each company
    console.log('📋 Step 3: Creating company-specific subcategories...')
    const subcategoriesCollection = db.collection('subcategories')
    let subcategoryIdCounter = 600001
    let subcategoriesCreated = 0
    
    for (const [companyId, companyCategories] of categoryByCompany.entries()) {
      const company = await db.collection('companies').findOne({
        $or: [
          { _id: ObjectId.isValid(companyId) ? new ObjectId(companyId) : null },
          { id: companyId }
        ]
      })
      
      if (!company) {
        console.log(`   ⚠️  Company not found: ${companyId}, skipping...`)
        continue
      }
      
      console.log(`   Processing company: ${company.name} (${company.id})`)
      
      for (const oldCategory of companyCategories) {
        const categoryName = oldCategory.name.toLowerCase()
        const globalCategory = globalCategories.get(categoryName)
        
        if (!globalCategory) {
          console.log(`   ⚠️  Global category not found for: ${categoryName}, skipping...`)
          continue
        }
        
        // Check if subcategory already exists
        const existing = await subcategoriesCollection.findOne({
          parentCategoryId: globalCategory._id,
          companyId: company._id,
          name: { $regex: new RegExp(`^${oldCategory.name}$`, 'i') }
        })
        
        if (existing) {
          console.log(`     ✅ Subcategory "${oldCategory.name}" already exists`)
          continue
        }
        
        // Create subcategory
        const subcategoryDoc = {
          id: subcategoryIdCounter.toString(),
          name: oldCategory.name,
          parentCategoryId: globalCategory._id,
          companyId: company._id,
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date()
        }
        
        await subcategoriesCollection.insertOne(subcategoryDoc)
        subcategoriesCreated++
        console.log(`     ✅ Created subcategory: "${oldCategory.name}" (ID: ${subcategoryDoc.id})`)
        
        subcategoryIdCounter++
      }
    }
    console.log(`   Created ${subcategoriesCreated} subcategories`)
    console.log('')
    
    // Step 4: Create product-subcategory mappings
    console.log('📋 Step 4: Creating product-subcategory mappings...')
    const mappingsCollection = db.collection('productsubcategorymappings')
    let mappingsCreated = 0
    
    // Get all products with categoryId
    const products = await db.collection('uniforms').find({
      categoryId: { $exists: true, $ne: null }
    }).toArray()
    
    console.log(`   Found ${products.length} products with categoryId`)
    
    for (const product of products) {
      if (!product.categoryId) continue
      
      // Find the old category
      const oldCategory = await db.collection('productcategories').findOne({
        _id: product.categoryId instanceof ObjectId ? product.categoryId : new ObjectId(product.categoryId)
      })
      
      if (!oldCategory) {
        console.log(`   ⚠️  Category not found for product ${product.id}, skipping...`)
        continue
      }
      
      // Find the company
      const companyId = oldCategory.companyId?.toString() || oldCategory.companyId
      const company = await db.collection('companies').findOne({
        $or: [
          { _id: ObjectId.isValid(companyId) ? new ObjectId(companyId) : null },
          { id: companyId }
        ]
      })
      
      if (!company) {
        console.log(`   ⚠️  Company not found: ${companyId}, skipping...`)
        continue
      }
      
      // Find the subcategory
      const categoryName = oldCategory.name.toLowerCase()
      const globalCategory = globalCategories.get(categoryName)
      
      if (!globalCategory) {
        console.log(`   ⚠️  Global category not found: ${categoryName}, skipping...`)
        continue
      }
      
      const subcategory = await subcategoriesCollection.findOne({
        parentCategoryId: globalCategory._id,
        companyId: company._id,
        name: { $regex: new RegExp(`^${oldCategory.name}$`, 'i') }
      })
      
      if (!subcategory) {
        console.log(`   ⚠️  Subcategory not found for product ${product.id}, skipping...`)
        continue
      }
      
      // Check if mapping already exists
      const existingMapping = await mappingsCollection.findOne({
        productId: product._id,
        subCategoryId: subcategory._id,
        companyId: company._id
      })
      
      if (existingMapping) {
        console.log(`     ✅ Mapping already exists for product ${product.id}`)
        continue
      }
      
      // Create mapping
      const mappingDoc = {
        productId: product._id,
        subCategoryId: subcategory._id,
        companyId: company._id,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await mappingsCollection.insertOne(mappingDoc)
      mappingsCreated++
      console.log(`     ✅ Created mapping: Product ${product.id} → Subcategory ${subcategory.name} (Company: ${company.name})`)
    }
    console.log(`   Created ${mappingsCreated} product-subcategory mappings`)
    console.log('')
    
    // Step 5: Migrate designation eligibilities (if needed)
    console.log('📋 Step 5: Migration of designation eligibilities...')
    console.log('   NOTE: This step requires manual review and may need custom logic')
    console.log('   based on your specific eligibility structure.')
    console.log('   Please review DesignationProductEligibility records and migrate manually.')
    console.log('')
    
    // Summary
    console.log('='.repeat(80))
    console.log('✅ MIGRATION COMPLETED')
    console.log('='.repeat(80))
    console.log('')
    console.log('Summary:')
    console.log(`  Global categories: ${globalCategories.size}`)
    console.log(`  Subcategories created: ${subcategoriesCreated}`)
    console.log(`  Product-subcategory mappings: ${mappingsCreated}`)
    console.log('')
    console.log('Next Steps:')
    console.log('  1. Review the migrated data')
    console.log('  2. Manually migrate designation eligibilities if needed')
    console.log('  3. Update UI to use new subcategory structure')
    console.log('  4. Test thoroughly before removing old ProductCategory model')
    console.log('')
    
  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('❌ MIGRATION FAILED')
    console.error('='.repeat(80))
    console.error('')
    console.error('Error:', error.message)
    console.error('')
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
    console.error('')
    process.exit(1)
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

// Run migration
migrateToSubcategories()

