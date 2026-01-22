/**
 * Initialize Global Categories Script
 * 
 * Creates default system categories in the new global Category collection.
 * These categories are used as parent categories for company-specific subcategories.
 * 
 * Usage: node scripts/initialize-global-categories.js
 */

const { MongoClient, ObjectId } = require('mongodb')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function initializeGlobalCategories() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    console.log('='.repeat(80))
    console.log('INITIALIZING GLOBAL CATEGORIES')
    console.log('='.repeat(80))
    console.log('')
    
    await client.connect()
    const db = client.db()
    console.log('✅ Connected to MongoDB')
    console.log('')
    
    const categoriesCollection = db.collection('categories')
    
    // Default system categories
    const systemCategories = [
      { name: 'Shirt', isSystemCategory: true },
      { name: 'Pant', isSystemCategory: true },
      { name: 'Shoe', isSystemCategory: true },
      { name: 'Jacket', isSystemCategory: true },
      { name: 'Accessory', isSystemCategory: true }
    ]
    
    console.log('📋 Checking for existing categories...')
    const existingCategories = await categoriesCollection.find({}).toArray()
    console.log(`   Found ${existingCategories.length} existing categories`)
    console.log('')
    
    if (existingCategories.length > 0) {
      console.log('Existing categories:')
      existingCategories.forEach(cat => {
        console.log(`   - ${cat.name} (ID: ${cat.id}, System: ${cat.isSystemCategory || false})`)
      })
      console.log('')
    }
    
    // Check which categories need to be created
    const existingNames = new Set(existingCategories.map(c => c.name.toLowerCase()))
    const categoriesToCreate = systemCategories.filter(cat => 
      !existingNames.has(cat.name.toLowerCase())
    )
    
    if (categoriesToCreate.length === 0) {
      console.log('✅ All system categories already exist. No action needed.')
      console.log('')
      return
    }
    
    console.log(`📋 Creating ${categoriesToCreate.length} missing categories...`)
    console.log('')
    
    // Find the highest existing category ID
    let maxId = 500000
    if (existingCategories.length > 0) {
      const ids = existingCategories
        .map(c => parseInt(c.id))
        .filter(id => !isNaN(id))
      if (ids.length > 0) {
        maxId = Math.max(...ids)
      }
    }
    
    let categoryIdCounter = maxId + 1
    
    for (const sysCat of categoriesToCreate) {
      // Find next available ID
      while (await categoriesCollection.findOne({ id: categoryIdCounter.toString() })) {
        categoryIdCounter++
      }
      
      const categoryDoc = {
        id: categoryIdCounter.toString(),
        name: sysCat.name,
        isSystemCategory: sysCat.isSystemCategory,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
      
      await categoriesCollection.insertOne(categoryDoc)
      console.log(`   ✅ Created category: "${sysCat.name}" (ID: ${categoryDoc.id})`)
      
      categoryIdCounter++
    }
    
    console.log('')
    console.log('='.repeat(80))
    console.log('✅ INITIALIZATION COMPLETED')
    console.log('='.repeat(80))
    console.log('')
    console.log(`Created ${categoriesToCreate.length} categories.`)
    console.log('')
    console.log('You can now:')
    console.log('  1. Access the Subcategory Management page as Company Admin')
    console.log('  2. Create subcategories under these global categories')
    console.log('  3. Assign products to subcategories')
    console.log('')
    
  } catch (error) {
    console.error('')
    console.error('='.repeat(80))
    console.error('❌ INITIALIZATION FAILED')
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

// Run initialization
initializeGlobalCategories()

