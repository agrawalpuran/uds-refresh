/**
 * Seed Test Database
 * Creates test data in the database for API testing
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Load environment variables from .env.local
let MONGODB_URI = process.env.MONGODB_URI
if (!MONGODB_URI) {
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
    console.error('Could not read .env.local file')
  }
}

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found in environment variables')
  process.exit(1)
}

// Test data matching mock IDs
const testData = {
  company: {
    id: '100001',
    name: 'Test Company',
    email: 'test@company.com',
    phone: '1234567890',
    address_line_1: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    country: 'India',
    showPrices: true,
    allowPersonalPayments: false,
    allowPersonalAddressDelivery: false,
    enableEmployeeOrder: true,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  employee: {
    id: '300001',
    employeeId: 'EMP001',
    email: 'employee@test.com',
    firstName: 'John',
    lastName: 'Doe',
    companyId: '100001',
    locationId: '400001',
    designation: 'Manager',
    gender: 'male',
    status: 'active',
    joiningDate: new Date('2020-01-01'),
    cycleStartDate: new Date('2024-01-01'),
    createdAt: new Date(),
    updatedAt: new Date()
  },
  location: {
    id: '400001',
    name: 'Test Location',
    companyId: '100001',
    adminId: '300001',
    address_line_1: '456 Location St',
    city: 'Location City',
    state: 'Location State',
    pincode: '654321',
    country: 'India',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  vendor: {
    id: '100001',
    name: 'Test Vendor',
    email: 'vendor@test.com',
    phone: '9876543210',
    address_line_1: '789 Vendor St',
    city: 'Vendor City',
    state: 'Vendor State',
    pincode: '789012',
    country: 'India',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  product: {
    id: '200001',
    name: 'Test Product',
    sku: 'PROD-001',
    categoryId: '500001',
    price: 1000,
    gender: 'male',
    image: 'https://example.com/image.jpg',
    status: 'active',
    companyIds: ['100001'],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  category: {
    id: '500001',
    name: 'Test Category',
    companyId: '100001',
    renewalUnit: 'months',
    isSystemCategory: false,
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  branch: {
    id: '600001',
    name: 'Test Branch',
    companyId: '100001',
    adminId: '300001',
    address_line_1: '789 Branch St',
    city: 'Branch City',
    state: 'Branch State',
    pincode: '789012',
    country: 'India',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date()
  }
}

async function seedDatabase() {
  try {
    console.log('🔌 Connecting to database...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to database')
    console.log('')
    
    // Get models using mongoose.model() (they should be registered)
    // If not registered, we'll use the collection directly
    const Company = mongoose.models.Company || mongoose.model('Company', new mongoose.Schema({}, { strict: false }))
    const Employee = mongoose.models.Employee || mongoose.model('Employee', new mongoose.Schema({}, { strict: false }))
    const Location = mongoose.models.Location || mongoose.model('Location', new mongoose.Schema({}, { strict: false }))
    const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', new mongoose.Schema({}, { strict: false }))
    const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', new mongoose.Schema({}, { strict: false }))
    const ProductCategory = mongoose.models.ProductCategory || mongoose.model('ProductCategory', new mongoose.Schema({}, { strict: false }))
    const Branch = mongoose.models.Branch || mongoose.model('Branch', new mongoose.Schema({}, { strict: false }))
    
    // Clear existing test data
    console.log('🧹 Cleaning existing test data...')
    await Company.deleteMany({ id: { $in: ['100001'] } }).catch(() => {})
    await Employee.deleteMany({ id: { $in: ['300001'] } }).catch(() => {})
    await Location.deleteMany({ id: { $in: ['400001'] } }).catch(() => {})
    await Vendor.deleteMany({ id: { $in: ['100001'] } }).catch(() => {})
    await Uniform.deleteMany({ id: { $in: ['200001'] } }).catch(() => {})
    await ProductCategory.deleteMany({ id: { $in: ['500001'] } }).catch(() => {})
    await Branch.deleteMany({ id: { $in: ['600001'] } }).catch(() => {})
    console.log('✅ Cleaned existing test data')
    console.log('')
    
    // Create test data in order (respecting dependencies)
    console.log('🌱 Seeding test data...')
    
    // Use collection.insertOne for more control
    const db = mongoose.connection.db
    
    // 1. Company (no dependencies)
    console.log('  Creating company...')
    await db.collection('companies').deleteOne({ id: '100001' })
    await db.collection('companies').insertOne(testData.company)
    console.log(`  ✅ Company created: ${testData.company.id}`)
    
    // 2. Category (depends on company)
    console.log('  Creating category...')
    await db.collection('productcategories').deleteOne({ id: '500001' })
    await db.collection('productcategories').insertOne(testData.category)
    console.log(`  ✅ Category created: ${testData.category.id}`)
    
    // 3. Employee (depends on company)
    console.log('  Creating employee...')
    await db.collection('employees').deleteOne({ id: '300001' })
    await db.collection('employees').insertOne(testData.employee)
    console.log(`  ✅ Employee created: ${testData.employee.id}`)
    
    // 4. Location (depends on company, employee)
    console.log('  Creating location...')
    await db.collection('locations').deleteOne({ id: '400001' })
    await db.collection('locations').insertOne(testData.location)
    console.log(`  ✅ Location created: ${testData.location.id}`)
    
    // 5. Vendor (no dependencies)
    console.log('  Creating vendor...')
    await db.collection('vendors').deleteOne({ id: '100001' })
    await db.collection('vendors').insertOne(testData.vendor)
    console.log(`  ✅ Vendor created: ${testData.vendor.id}`)
    
    // 6. Product (depends on category, company)
    console.log('  Creating product...')
    await db.collection('uniforms').deleteOne({ id: '200001' })
    await db.collection('uniforms').insertOne(testData.product)
    console.log(`  ✅ Product created: ${testData.product.id}`)
    
    // 7. Branch (depends on company, employee)
    console.log('  Creating branch...')
    await db.collection('branches').deleteOne({ id: '600001' })
    await db.collection('branches').insertOne(testData.branch)
    console.log(`  ✅ Branch created: ${testData.branch.id}`)
    
    // 8. Company Admin (make employee a company admin)
    console.log('  Creating company admin...')
    await db.collection('companyadmins').deleteMany({ employeeId: '300001', companyId: '100001' })
    await db.collection('companyadmins').insertOne({
      id: '700001',
      companyId: '100001',
      employeeId: '300001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Company Admin created: employee 300001 is admin of company 100001`)
    
    // 9. Location Admin (make employee a location admin)
    console.log('  Creating location admin...')
    await db.collection('locationadmins').deleteMany({ employeeId: '300001', locationId: '400001' })
    await db.collection('locationadmins').insertOne({
      id: '800001',
      locationId: '400001',
      employeeId: '300001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Location Admin created: employee 300001 is admin of location 400001`)
    
    // 10. Product-Company Relationship
    console.log('  Creating product-company relationship...')
    await db.collection('productcompanies').deleteMany({ productId: '200001', companyId: '100001' })
    await db.collection('productcompanies').insertOne({
      id: '900001',
      productId: '200001',
      companyId: '100001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Product-Company relationship created`)
    
    // 11. Product-Vendor Relationship
    console.log('  Creating product-vendor relationship...')
    await db.collection('productvendors').deleteMany({ productId: '200001', vendorId: '100001' })
    await db.collection('productvendors').insertOne({
      id: '900002',
      productId: '200001',
      vendorId: '100001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Product-Vendor relationship created`)
    
    // 12. Vendor-Company Relationship (if needed)
    console.log('  Creating vendor-company relationship...')
    await db.collection('vendorcompanies').deleteMany({ vendorId: '100001', companyId: '100001' })
    await db.collection('vendorcompanies').insertOne({
      id: '900003',
      vendorId: '100001',
      companyId: '100001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Vendor-Company relationship created`)
    
    // 13. Subcategory (for product-subcategory mappings)
    const Subcategory = mongoose.models.Subcategory || mongoose.model('Subcategory', new mongoose.Schema({}, { strict: false }))
    console.log('  Creating subcategory...')
    await db.collection('subcategories').deleteOne({ id: '600001' })
    await db.collection('subcategories').insertOne({
      id: '600001',
      name: 'Test Subcategory',
      parentCategoryId: '500001',
      companyId: '100001',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Subcategory created: 600001`)
    
    // 14. Product-Subcategory Mapping
    console.log('  Creating product-subcategory mapping...')
    await db.collection('productsubcategorymappings').deleteMany({ productId: '200001', subCategoryId: '600001' })
    await db.collection('productsubcategorymappings').insertOne({
      id: '900004',
      productId: '200001',
      subCategoryId: '600001',
      companyId: '100001',
      createdAt: new Date(),
      updatedAt: new Date()
    })
    console.log(`  ✅ Product-Subcategory mapping created`)
    
    console.log('')
    console.log('✅ Test data seeded successfully!')
    console.log('')
    console.log('Test Data Summary:')
    console.log(`  Company: ${testData.company.id} (${testData.company.name})`)
    console.log(`  Employee: ${testData.employee.id} (${testData.employee.email})`)
    console.log(`  Location: ${testData.location.id} (${testData.location.name})`)
    console.log(`  Vendor: ${testData.vendor.id} (${testData.vendor.name})`)
    console.log(`  Product: ${testData.product.id} (${testData.product.name})`)
    console.log(`  Category: ${testData.category.id} (${testData.category.name})`)
    console.log(`  Branch: ${testData.branch.id} (${testData.branch.name})`)
    
  } catch (error) {
    console.error('❌ Error seeding database:', error)
    throw error
  } finally {
    await mongoose.disconnect()
    console.log('')
    console.log('🔌 Disconnected from database')
  }
}

// Run if executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('')
      console.log('✅ Seeding complete!')
      process.exit(0)
    })
    .catch(error => {
      console.error('❌ Seeding failed:', error)
      process.exit(1)
    })
}

module.exports = { seedDatabase, testData }
