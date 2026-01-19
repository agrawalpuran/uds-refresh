/**
 * CONTROLLED PRODUCT DATA RESET AND RE-SEEDING SCRIPT
 * 
 * ⚠️ WARNING: This is a DESTRUCTIVE operation.
 * This script will:
 * 1. Delete ALL existing product-related data
 * 2. Create 20 new products with realistic data
 * 
 * Execution order is critical for referential integrity.
 * 
 * Usage: node scripts/reset-and-reseed-products.js
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/)
    if (match) {
      const key = match[1].trim()
      const value = match[2].trim().replace(/^["']|["']$/g, '')
      process.env[key] = value
    }
  })
}

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Product seed data - 20 products with realistic attributes
const PRODUCT_SEED_DATA = [
  // Male Shirts (4)
  {
    name: 'Formal Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 1299,
    image: '/images/products/shirt-male-formal.jpg',
    sku: 'SHIRT-M-F-001',
    stock: 100,
    attribute1_name: 'GSM',
    attribute1_value: 350,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Slim Fit',
  },
  {
    name: 'Casual Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 999,
    image: '/images/products/shirt-male-casual.jpg',
    sku: 'SHIRT-M-C-001',
    stock: 150,
    attribute1_name: 'GSM',
    attribute1_value: 280,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Regular Fit',
  },
  {
    name: 'Polo Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL'],
    price: 799,
    image: '/images/products/shirt-male-polo.jpg',
    sku: 'SHIRT-M-P-001',
    stock: 120,
    attribute1_name: 'GSM',
    attribute1_value: 240,
    attribute2_name: 'Fabric',
    attribute2_value: 'Polyester',
    attribute3_name: 'Style',
    attribute3_value: 'Classic',
  },
  {
    name: 'T-Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 599,
    image: '/images/products/shirt-male-tshirt.jpg',
    sku: 'SHIRT-M-T-001',
    stock: 200,
    attribute1_name: 'GSM',
    attribute1_value: 180,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Regular Fit',
  },
  
  // Female Shirts (3)
  {
    name: 'Formal Shirt - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 1199,
    image: '/images/products/shirt-female-formal.jpg',
    sku: 'SHIRT-F-F-001',
    stock: 90,
    attribute1_name: 'GSM',
    attribute1_value: 320,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Fitted',
  },
  {
    name: 'Casual Shirt - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 899,
    image: '/images/products/shirt-female-casual.jpg',
    sku: 'SHIRT-F-C-001',
    stock: 110,
    attribute1_name: 'GSM',
    attribute1_value: 260,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Relaxed Fit',
  },
  {
    name: 'Blouse - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L'],
    price: 1099,
    image: '/images/products/shirt-female-blouse.jpg',
    sku: 'SHIRT-F-B-001',
    stock: 85,
    attribute1_name: 'GSM',
    attribute1_value: 300,
    attribute2_name: 'Fabric',
    attribute2_value: 'Silk Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Fitted',
  },
  
  // Unisex Shirts (1)
  {
    name: 'Unisex T-Shirt',
    category: 'shirt',
    gender: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    price: 699,
    image: '/images/products/shirt-unisex.jpg',
    sku: 'SHIRT-U-T-001',
    stock: 180,
    attribute1_name: 'GSM',
    attribute1_value: 200,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Regular Fit',
  },
  
  // Male Pants (3)
  {
    name: 'Formal Trousers - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36', '38'],
    price: 1899,
    image: '/images/products/pant-male-formal.jpg',
    sku: 'PANT-M-F-001',
    stock: 80,
    attribute1_name: 'GSM',
    attribute1_value: 280,
    attribute2_name: 'Fabric',
    attribute2_value: 'Polyester Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Slim Fit',
  },
  {
    name: 'Chinos - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36'],
    price: 1499,
    image: '/images/products/pant-male-chinos.jpg',
    sku: 'PANT-M-C-001',
    stock: 95,
    attribute1_name: 'GSM',
    attribute1_value: 250,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Regular Fit',
  },
  {
    name: 'Jeans - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36', '38', '40'],
    price: 1699,
    image: '/images/products/pant-male-jeans.jpg',
    sku: 'PANT-M-J-001',
    stock: 100,
    attribute1_name: 'GSM',
    attribute1_value: 400,
    attribute2_name: 'Fabric',
    attribute2_value: 'Denim',
    attribute3_name: 'Style',
    attribute3_value: 'Slim Fit',
  },
  
  // Female Pants (2)
  {
    name: 'Formal Trousers - Female',
    category: 'pant',
    gender: 'female',
    sizes: ['24', '26', '28', '30', '32'],
    price: 1799,
    image: '/images/products/pant-female-formal.jpg',
    sku: 'PANT-F-F-001',
    stock: 70,
    attribute1_name: 'GSM',
    attribute1_value: 260,
    attribute2_name: 'Fabric',
    attribute2_value: 'Polyester Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Straight Fit',
  },
  {
    name: 'Chinos - Female',
    category: 'pant',
    gender: 'female',
    sizes: ['24', '26', '28', '30', '32'],
    price: 1399,
    image: '/images/products/pant-female-chinos.jpg',
    sku: 'PANT-F-C-001',
    stock: 85,
    attribute1_name: 'GSM',
    attribute1_value: 240,
    attribute2_name: 'Fabric',
    attribute2_value: 'Cotton',
    attribute3_name: 'Style',
    attribute3_value: 'Tapered Fit',
  },
  
  // Shoes (4)
  {
    name: 'Leather Dress Shoes - Male',
    category: 'shoe',
    gender: 'male',
    sizes: ['7', '8', '9', '10', '11', '12'],
    price: 3499,
    image: '/images/products/shoe-male-dress.jpg',
    sku: 'SHOE-M-D-001',
    stock: 60,
    attribute1_name: 'Material',
    attribute1_value: 'Genuine Leather',
    attribute2_name: 'Sole',
    attribute2_value: 'Leather',
    attribute3_name: 'Style',
    attribute3_value: 'Oxford',
  },
  {
    name: 'Formal Shoes - Female',
    category: 'shoe',
    gender: 'female',
    sizes: ['5', '6', '7', '8', '9'],
    price: 2999,
    image: '/images/products/shoe-female-formal.jpg',
    sku: 'SHOE-F-F-001',
    stock: 55,
    attribute1_name: 'Material',
    attribute1_value: 'Genuine Leather',
    attribute2_name: 'Sole',
    attribute2_value: 'Synthetic',
    attribute3_name: 'Style',
    attribute3_value: 'Pump',
  },
  {
    name: 'Sports Shoes - Unisex',
    category: 'shoe',
    gender: 'unisex',
    sizes: ['6', '7', '8', '9', '10', '11'],
    price: 2499,
    image: '/images/products/shoe-unisex-sports.jpg',
    sku: 'SHOE-U-S-001',
    stock: 75,
    attribute1_name: 'Material',
    attribute1_value: 'Mesh & Synthetic',
    attribute2_name: 'Sole',
    attribute2_value: 'Rubber',
    attribute3_name: 'Style',
    attribute3_value: 'Athletic',
  },
  {
    name: 'Casual Shoes - Unisex',
    category: 'shoe',
    gender: 'unisex',
    sizes: ['6', '7', '8', '9', '10', '11'],
    price: 1999,
    image: '/images/products/shoe-unisex-casual.jpg',
    sku: 'SHOE-U-C-001',
    stock: 80,
    attribute1_name: 'Material',
    attribute1_value: 'Canvas',
    attribute2_name: 'Sole',
    attribute2_value: 'Rubber',
    attribute3_name: 'Style',
    attribute3_value: 'Sneaker',
  },
  
  // Jackets (2)
  {
    name: 'Blazer - Male',
    category: 'jacket',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 4499,
    image: '/images/products/jacket-male-blazer.jpg',
    sku: 'JACKET-M-B-001',
    stock: 50,
    attribute1_name: 'GSM',
    attribute1_value: 320,
    attribute2_name: 'Fabric',
    attribute2_value: 'Wool Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Single Breasted',
  },
  {
    name: 'Blazer - Female',
    category: 'jacket',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 4299,
    image: '/images/products/jacket-female-blazer.jpg',
    sku: 'JACKET-F-B-001',
    stock: 45,
    attribute1_name: 'GSM',
    attribute1_value: 300,
    attribute2_name: 'Fabric',
    attribute2_value: 'Wool Blend',
    attribute3_name: 'Style',
    attribute3_value: 'Fitted',
  },
  
  // Accessories (1)
  {
    name: 'Belt - Unisex',
    category: 'accessory',
    gender: 'unisex',
    sizes: ['S', 'M', 'L', 'XL'],
    price: 899,
    image: '/images/products/accessory-belt.jpg',
    sku: 'ACC-U-B-001',
    stock: 120,
    attribute1_name: 'Material',
    attribute1_value: 'Genuine Leather',
    attribute2_name: 'Width',
    attribute2_value: '3.5 cm',
    attribute3_name: 'Buckle',
    attribute3_value: 'Metal',
  },
]

/**
 * STEP 1: DELETE EXISTING DATA (in correct order)
 */
async function deleteExistingData() {
  console.log('\n========================================')
  console.log('STEP 1: DELETING EXISTING DATA')
  console.log('========================================\n')
  
  let deletedCounts = {}
  
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  try {
    // 1. Delete DesignationProductEligibility
    console.log('1️⃣  Deleting DesignationProductEligibility records...')
    const eligibilityResult = await db.collection('designationproducteligibilities').deleteMany({})
    deletedCounts.designationProductEligibility = eligibilityResult.deletedCount
    console.log(`   ✅ Deleted ${eligibilityResult.deletedCount} DesignationProductEligibility records`)
    
    // 2. Delete VendorInventory
    console.log('2️⃣  Deleting VendorInventory records...')
    const inventoryResult = await db.collection('vendorinventories').deleteMany({})
    deletedCounts.vendorInventory = inventoryResult.deletedCount
    console.log(`   ✅ Deleted ${inventoryResult.deletedCount} VendorInventory records`)
    
    // 3. Delete ProductVendor relationships
    console.log('3️⃣  Deleting ProductVendor relationships...')
    const productVendorResult = await db.collection('productvendors').deleteMany({})
    deletedCounts.productVendor = productVendorResult.deletedCount
    console.log(`   ✅ Deleted ${productVendorResult.deletedCount} ProductVendor relationships`)
    
    // 4. Delete ProductCompany relationships
    console.log('4️⃣  Deleting ProductCompany relationships...')
    const productCompanyResult = await db.collection('productcompanies').deleteMany({})
    deletedCounts.productCompany = productCompanyResult.deletedCount
    console.log(`   ✅ Deleted ${productCompanyResult.deletedCount} ProductCompany relationships`)
    
    // 5. Delete Uniform (products)
    console.log('5️⃣  Deleting Uniform (product) records...')
    const uniformResult = await db.collection('uniforms').deleteMany({})
    deletedCounts.uniform = uniformResult.deletedCount
    console.log(`   ✅ Deleted ${uniformResult.deletedCount} Uniform records`)
    
    console.log('\n✅ Deletion completed successfully!\n')
    return deletedCounts
    
  } catch (error) {
    console.error('\n❌ ERROR during deletion:', error)
    throw error
  }
}

/**
 * STEP 2: VALIDATE DELETION
 */
async function validateDeletion() {
  console.log('\n========================================')
  console.log('STEP 2: VALIDATING DELETION')
  console.log('========================================\n')
  
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  const counts = {
    designationProductEligibility: await db.collection('designationproducteligibilities').countDocuments({}),
    vendorInventory: await db.collection('vendorinventories').countDocuments({}),
    productVendor: await db.collection('productvendors').countDocuments({}),
    productCompany: await db.collection('productcompanies').countDocuments({}),
    uniform: await db.collection('uniforms').countDocuments({}),
  }
  
  console.log('Record counts after deletion:')
  console.log(`  - DesignationProductEligibility: ${counts.designationProductEligibility}`)
  console.log(`  - VendorInventory: ${counts.vendorInventory}`)
  console.log(`  - ProductVendor: ${counts.productVendor}`)
  console.log(`  - ProductCompany: ${counts.productCompany}`)
  console.log(`  - Uniform: ${counts.uniform}`)
  
  // Check if any records remain
  const hasRemainingRecords = Object.values(counts).some(count => count > 0)
  
  if (hasRemainingRecords) {
    console.error('\n❌ VALIDATION FAILED: Some records still exist!')
    console.error('   STOPPING execution. Please investigate.')
    throw new Error('Deletion validation failed - records still exist')
  }
  
  console.log('\n✅ Validation passed: All tables are empty\n')
  return counts
}

/**
 * STEP 3: CREATE NEW PRODUCTS
 */
async function createProducts() {
  console.log('\n========================================')
  console.log('STEP 3: CREATING 20 NEW PRODUCTS')
  console.log('========================================\n')
  
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  const createdProducts = []
  let productIdCounter = 200001 // Start from 200001
  
  for (let i = 0; i < PRODUCT_SEED_DATA.length; i++) {
    const productData = PRODUCT_SEED_DATA[i]
    const productId = String(productIdCounter).padStart(6, '0')
    
    try {
      // Check if SKU already exists (shouldn't, but safety check)
      const existingBySku = await db.collection('uniforms').findOne({ sku: productData.sku })
      if (existingBySku) {
        console.error(`   ⚠️  SKU ${productData.sku} already exists, skipping...`)
        continue
      }
      
      // Check if product ID already exists (shouldn't, but safety check)
      const existingById = await db.collection('uniforms').findOne({ id: productId })
      if (existingById) {
        console.error(`   ⚠️  Product ID ${productId} already exists, skipping...`)
        productIdCounter++
        continue
      }
      
      const productToCreate = {
        id: productId,
        name: productData.name,
        category: productData.category,
        gender: productData.gender,
        sizes: productData.sizes,
        price: productData.price,
        image: productData.image,
        sku: productData.sku,
        stock: productData.stock || 0,
        companyIds: [],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      
      // Add optional attributes only if name is provided
      if (productData.attribute1_name) {
        productToCreate.attribute1_name = productData.attribute1_name
        productToCreate.attribute1_value = productData.attribute1_value || null
      }
      if (productData.attribute2_name) {
        productToCreate.attribute2_name = productData.attribute2_name
        productToCreate.attribute2_value = productData.attribute2_value || null
      }
      if (productData.attribute3_name) {
        productToCreate.attribute3_name = productData.attribute3_name
        productToCreate.attribute3_value = productData.attribute3_value || null
      }
      
      console.log(`   [DEBUG] Attempting to insert product ${i + 1}: ${productData.name}`)
      console.log(`   [DEBUG] Product data:`, JSON.stringify(productToCreate, null, 2))
      
      const insertResult = await db.collection('uniforms').insertOne(productToCreate)
      
      if (!insertResult.insertedId) {
        throw new Error('Insert failed - no insertedId returned')
      }
      
      console.log(`   [DEBUG] Insert successful, insertedId: ${insertResult.insertedId}`)
      
      // Verify the product was actually inserted - check immediately
      const verifyProduct = await db.collection('uniforms').findOne({ id: productId })
      if (!verifyProduct) {
        console.error(`   [DEBUG] Product NOT found immediately after insertion!`)
        console.error(`   [DEBUG] Checking by _id: ${insertResult.insertedId}`)
        const verifyById = await db.collection('uniforms').findOne({ _id: insertResult.insertedId })
        if (!verifyById) {
          throw new Error(`Product was not found after insertion (ID: ${productId}, _id: ${insertResult.insertedId})`)
        } else {
          console.log(`   [DEBUG] Found by _id, but not by id field. id field value: ${verifyById.id}`)
        }
      } else {
        console.log(`   [DEBUG] Product verified after insertion: ${verifyProduct.name}`)
      }
      
      createdProducts.push({
        id: productId,
        name: productData.name,
        sku: productData.sku,
        category: productData.category,
        gender: productData.gender,
      })
      
      console.log(`   ✅ Created product ${i + 1}/20: ${productData.name} (ID: ${productId}, SKU: ${productData.sku}, InsertedId: ${insertResult.insertedId})`)
      productIdCounter++
      
    } catch (error) {
      console.error(`   ❌ Failed to create product ${i + 1}: ${productData.name}`)
      console.error(`      Error: ${error.message}`)
      console.error(`      Stack: ${error.stack}`)
      // Continue with next product instead of stopping
    }
  }
  
  console.log(`\n✅ Created ${createdProducts.length} products successfully\n`)
  return createdProducts
}

/**
 * STEP 4: VALIDATE CREATION
 */
async function validateCreation() {
  console.log('\n========================================')
  console.log('STEP 4: VALIDATING CREATION')
  console.log('========================================\n')
  
  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database connection not available')
  }
  
  const productCount = await db.collection('uniforms').countDocuments({})
  console.log(`Total products in database: ${productCount}`)
  
  if (productCount !== 20) {
    console.warn(`⚠️  Expected 20 products, but found ${productCount}`)
  } else {
    console.log('✅ Product count matches expected (20)')
  }
  
  // Show sample products
  const sampleProducts = await db.collection('uniforms')
    .find({})
    .project({ id: 1, name: 1, sku: 1, category: 1, gender: 1, price: 1 })
    .limit(3)
    .toArray()
  
  console.log('\nSample products created:')
  sampleProducts.forEach((p, idx) => {
    console.log(`  ${idx + 1}. ${p.name}`)
    console.log(`     ID: ${p.id}, SKU: ${p.sku}, Category: ${p.category}, Gender: ${p.gender}, Price: ₹${p.price}`)
  })
  
  return { productCount, sampleProducts }
}

/**
 * MAIN EXECUTION
 */
async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗')
  console.log('║  PRODUCT DATA RESET AND RE-SEEDING SCRIPT                  ║')
  console.log('║  ⚠️  WARNING: This is a DESTRUCTIVE operation              ║')
  console.log('╚════════════════════════════════════════════════════════════╝\n')
  
  try {
    // Connect to database
    console.log('Connecting to database...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')
    
    // STEP 1: Delete existing data
    const deletedCounts = await deleteExistingData()
    
    // STEP 2: Validate deletion
    await validateDeletion()
    
    // STEP 3: Create new products
    const createdProducts = await createProducts()
    
    // STEP 4: Validate creation
    const validation = await validateCreation()
    
    // Final summary
    console.log('\n╔════════════════════════════════════════════════════════════╗')
    console.log('║  OPERATION COMPLETED SUCCESSFULLY                         ║')
    console.log('╚════════════════════════════════════════════════════════════╝\n')
    
    console.log('DELETION SUMMARY:')
    console.log(`  - DesignationProductEligibility: ${deletedCounts.designationProductEligibility} records deleted`)
    console.log(`  - VendorInventory: ${deletedCounts.vendorInventory} records deleted`)
    console.log(`  - ProductVendor: ${deletedCounts.productVendor} records deleted`)
    console.log(`  - ProductCompany: ${deletedCounts.productCompany} records deleted`)
    console.log(`  - Uniform: ${deletedCounts.uniform} records deleted`)
    
    console.log('\nCREATION SUMMARY:')
    console.log(`  - Products created: ${createdProducts.length}/20`)
    console.log(`  - Total products in database: ${validation.productCount}`)
    
    console.log('\n✅ System is ready for use. Products can now be:')
    console.log('   - Linked to companies via Super Admin → Relationships')
    console.log('   - Linked to vendors via Super Admin → Relationships')
    console.log('   - Assigned eligibility rules via Company Admin → Designation Eligibility')
    console.log('   - Inventory will be auto-created when products are linked to vendors\n')
    
  } catch (error) {
    console.error('\n❌ FATAL ERROR:', error)
    console.error('\n⚠️  Operation failed. Please review the errors above.')
    process.exit(1)
  } finally {
    await mongoose.connection.close()
    console.log('Database connection closed.')
    process.exit(0)
  }
}

// Run the script
main()

