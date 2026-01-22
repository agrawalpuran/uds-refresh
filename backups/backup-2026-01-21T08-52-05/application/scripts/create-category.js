/**
 * Script to create a new product category
 * 
 * Usage: node scripts/create-category.js
 * 
 * Edit the variables below before running:
 * - companyId: Your company ID (e.g., "100001")
 * - categoryName: Name of the category (e.g., "T-Shirt")
 * - renewalUnit: "months" or "years" (default: "months")
 */

const { MongoClient, ObjectId } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// ===== CONFIGURATION - EDIT THESE VALUES =====
const companyId = '100001' // Your company ID
const categoryName = 'T-Shirt' // Category name
const renewalUnit = 'months' // 'months' or 'years'
// =============================================

async function createCategory() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('CREATE PRODUCT CATEGORY')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    console.log('Configuration:')
    console.log(`  Company ID: ${companyId}`)
    console.log(`  Category Name: ${categoryName}`)
    console.log(`  Renewal Unit: ${renewalUnit}`)
    console.log('')
    
    // Find company
    console.log('🔍 Finding company...')
    const company = await db.collection('companies').findOne({
      $or: [
        { id: companyId },
        { _id: ObjectId.isValid(companyId) ? new ObjectId(companyId) : null }
      ]
    })
    
    if (!company) {
      console.error('❌ Company not found')
      console.error(`   Searched for ID: ${companyId}`)
      console.error('   Please check your company ID')
      return
    }
    
    console.log(`✅ Company found: ${company.name} (ID: ${company.id})`)
    console.log('')
    
    // Check if category exists
    console.log('🔍 Checking if category already exists...')
    const existing = await db.collection('productcategories').findOne({
      companyId: company._id,
      name: { $regex: new RegExp(`^${categoryName}$`, 'i') }
    })
    
    if (existing) {
      console.error('❌ Category already exists')
      console.error(`   Name: ${existing.name}`)
      console.error(`   ID: ${existing.id}`)
      console.error(`   Status: ${existing.status}`)
      return
    }
    
    console.log('✅ Category name is available')
    console.log('')
    
    // Generate unique ID
    console.log('🔍 Generating unique category ID...')
    let categoryId = 500001
    while (await db.collection('productcategories').findOne({ id: categoryId.toString() })) {
      categoryId++
    }
    console.log(`✅ Generated ID: ${categoryId}`)
    console.log('')
    
    // Create category
    console.log('📝 Creating category...')
    const category = {
      id: categoryId.toString(),
      name: categoryName.trim(),
      companyId: company._id,
      renewalUnit: renewalUnit === 'years' ? 'years' : 'months',
      isSystemCategory: false,
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    }
    
    const result = await db.collection('productcategories').insertOne(category)
    
    console.log('✅ Category created successfully!')
    console.log('')
    console.log('Category Details:')
    console.log(`  ID: ${category.id}`)
    console.log(`  Name: ${category.name}`)
    console.log(`  Company: ${company.name} (${company.id})`)
    console.log(`  Renewal Unit: ${category.renewalUnit}`)
    console.log(`  System Category: ${category.isSystemCategory}`)
    console.log(`  Status: ${category.status}`)
    console.log(`  MongoDB _id: ${result.insertedId}`)
    console.log('')
    console.log('='.repeat(80))
    console.log('✅ SUCCESS')
    console.log('='.repeat(80))
    console.log('')
    console.log('Next Steps:')
    console.log('  1. The category is now available for use in products')
    console.log('  2. You can assign it to products when creating/editing them')
    console.log('  3. Add it to designation eligibility rules if needed')
    console.log('')
    
  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('❌ ERROR')
    console.error('='.repeat(80))
    console.error('')
    console.error('Error:', error.message)
    console.error('')
    if (error.stack) {
      console.error('Stack:', error.stack)
    }
  } finally {
    await client.close()
    console.log('Database connection closed')
  }
}

// Run the script
createCategory()

