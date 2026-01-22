/**
 * Simple migration script - defines schemas inline to avoid import issues
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Define schemas inline
const UniformSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  category: { type: String, enum: ['shirt', 'pant', 'shoe', 'jacket', 'accessory'], required: true },
  gender: { type: String, enum: ['male', 'female', 'unisex'], required: true },
  sizes: [String],
  price: { type: Number, required: true },
  image: { type: String, required: true },
  sku: { type: String, required: true, unique: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  stock: { type: Number, required: true, default: 0 },
  companyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Company' }],
}, { timestamps: true })

const VendorSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  secondaryColor: { type: String, required: true },
  accentColor: { type: String, required: true },
  theme: { type: String, enum: ['light', 'dark', 'custom'], default: 'light' },
}, { timestamps: true })

const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  logo: { type: String, required: true },
  website: { type: String, required: true },
  primaryColor: { type: String, required: true },
  showPrices: { type: Boolean, default: false, required: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', index: true },
}, { timestamps: true })

const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: String, required: true, unique: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  designation: { type: String, required: true },
  gender: { type: String, enum: ['male', 'female'], required: true },
  location: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  mobile: { type: String, required: true },
  shirtSize: { type: String, required: true },
  pantSize: { type: String, required: true },
  shoeSize: { type: String, required: true },
  address: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  companyName: { type: String, required: true },
  eligibility: {
    shirt: { type: Number, required: true, default: 0 },
    pant: { type: Number, required: true, default: 0 },
    shoe: { type: Number, required: true, default: 0 },
    jacket: { type: Number, required: true, default: 0 },
  },
  dispatchPreference: { type: String, enum: ['direct', 'central', 'regional'], required: true },
  status: { type: String, enum: ['active', 'inactive'], default: 'active' },
  period: { type: String, required: true },
}, { timestamps: true })

const OrderItemSchema = new mongoose.Schema({
  uniformId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform', required: true },
  uniformName: { type: String, required: true },
  size: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
})

const OrderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName: { type: String, required: true },
  items: [OrderItemSchema],
  total: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'], default: 'pending' },
  orderDate: { type: Date, required: true, default: Date.now },
  dispatchLocation: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
  deliveryAddress: { type: String, required: true },
  estimatedDeliveryTime: { type: String, required: true },
}, { timestamps: true })

const ProductCompanySchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true })
ProductCompanySchema.index({ productId: 1, companyId: 1 }, { unique: true })

const ProductVendorSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Uniform', required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
}, { timestamps: true })
ProductVendorSchema.index({ productId: 1, vendorId: 1 }, { unique: true })

const VendorCompanySchema = new mongoose.Schema({
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
}, { timestamps: true })
VendorCompanySchema.index({ vendorId: 1, companyId: 1 }, { unique: true })

// Create models
const Uniform = mongoose.models.Uniform || mongoose.model('Uniform', UniformSchema)
const Vendor = mongoose.models.Vendor || mongoose.model('Vendor', VendorSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Order = mongoose.models.Order || mongoose.model('Order', OrderSchema)
const ProductCompany = mongoose.models.ProductCompany || mongoose.model('ProductCompany', ProductCompanySchema)
const ProductVendor = mongoose.models.ProductVendor || mongoose.model('ProductVendor', ProductVendorSchema)
const VendorCompany = mongoose.models.VendorCompany || mongoose.model('VendorCompany', VendorCompanySchema)

// Mock data embedded directly (to avoid TypeScript import issues)
const mockVendors = [
  {
    id: 'VEND-001',
    name: 'UniformPro Inc',
    email: 'contact@uniformpro.com',
    phone: '+1-555-0101',
    logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200',
    website: 'https://uniformpro.com',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    accentColor: '#3b82f6',
    theme: 'light'
  },
  {
    id: 'VEND-002',
    name: 'Footwear Plus',
    email: 'info@footwearplus.com',
    phone: '+1-555-0102',
    logo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200',
    website: 'https://footwearplus.com',
    primaryColor: '#059669',
    secondaryColor: '#047857',
    accentColor: '#10b981',
    theme: 'light'
  },
  {
    id: 'VEND-003',
    name: 'Elite Uniforms',
    email: 'sales@eliteuniforms.com',
    phone: '+1-555-0103',
    logo: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200',
    website: 'https://eliteuniforms.com',
    primaryColor: '#7c3aed',
    secondaryColor: '#6d28d9',
    accentColor: '#8b5cf6',
    theme: 'light'
  }
]

const mockCompanies = [
  {
    id: 'COMP-INDIGO',
    name: 'Indigo',
    logo: 'https://www.goindigo.in/content/dam/indigov2/6e-website/global/logo.svg',
    website: 'https://www.goindigo.in',
    primaryColor: '#004080',
    showPrices: false
  },
  {
    id: 'COMP-AKASA',
    name: 'Akasa Air',
    logo: 'https://www.akasaair.com/images/akasa-logo.svg',
    website: 'https://www.akasaair.com',
    primaryColor: '#FF6B35',
    showPrices: false
  },
  {
    id: 'COMP-AIRINDIA',
    name: 'Air India',
    logo: 'https://www.airindia.com/images/air-india-logo.svg',
    website: 'https://www.airindia.com',
    primaryColor: '#FF0000',
    showPrices: false
  }
]

const mockUniforms = [
  {
    id: '1',
    name: 'Formal Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 25.99,
    image: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=400&h=400&fit=crop',
    sku: 'SHIRT-M-001',
    vendorId: 'VEND-001',
    stock: 150,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '2',
    name: 'Formal Shirt - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 24.99,
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400',
    sku: 'SHIRT-F-001',
    vendorId: 'VEND-001',
    stock: 120,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '3',
    name: 'Formal Trousers - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36', '38'],
    price: 35.99,
    image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400',
    sku: 'PANT-M-001',
    vendorId: 'VEND-001',
    stock: 200,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '4',
    name: 'Formal Trousers - Female',
    category: 'pant',
    gender: 'female',
    sizes: ['26', '28', '30', '32', '34'],
    price: 34.99,
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400',
    sku: 'PANT-F-001',
    vendorId: 'VEND-001',
    stock: 180,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '5',
    name: 'Leather Dress Shoes - Male',
    category: 'shoe',
    gender: 'male',
    sizes: ['7', '8', '9', '10', '11', '12'],
    price: 79.99,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400',
    sku: 'SHOE-M-001',
    vendorId: 'VEND-002',
    stock: 100,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA', 'COMP-AIRINDIA']
  },
  {
    id: '6',
    name: 'Formal Heels - Female',
    category: 'shoe',
    gender: 'female',
    sizes: ['5', '6', '7', '8', '9'],
    price: 69.99,
    image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400',
    sku: 'SHOE-F-001',
    vendorId: 'VEND-002',
    stock: 90,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA', 'COMP-AIRINDIA']
  },
  {
    id: '7',
    name: 'Blazer - Male',
    category: 'jacket',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 89.99,
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
    sku: 'JACKET-M-001',
    vendorId: 'VEND-001',
    stock: 80,
    companyIds: ['COMP-INDIGO']
  },
  {
    id: '8',
    name: 'Blazer - Female',
    category: 'jacket',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 84.99,
    image: 'https://images.unsplash.com/photo-1591047139829-91fce775fc99?w=400',
    sku: 'JACKET-F-001',
    vendorId: 'VEND-001',
    stock: 75,
    companyIds: ['COMP-INDIGO']
  }
]

const mockProductCompanies = [
  { productId: '1', companyId: 'COMP-INDIGO' },
  { productId: '2', companyId: 'COMP-INDIGO' },
  { productId: '3', companyId: 'COMP-INDIGO' },
  { productId: '4', companyId: 'COMP-INDIGO' },
  { productId: '7', companyId: 'COMP-INDIGO' },
  { productId: '8', companyId: 'COMP-INDIGO' },
  { productId: '1', companyId: 'COMP-AKASA' },
  { productId: '2', companyId: 'COMP-AKASA' },
  { productId: '3', companyId: 'COMP-AKASA' },
  { productId: '4', companyId: 'COMP-AKASA' },
  { productId: '5', companyId: 'COMP-INDIGO' },
  { productId: '6', companyId: 'COMP-INDIGO' },
  { productId: '5', companyId: 'COMP-AKASA' },
  { productId: '6', companyId: 'COMP-AKASA' },
  { productId: '5', companyId: 'COMP-AIRINDIA' },
  { productId: '6', companyId: 'COMP-AIRINDIA' }
]

const mockProductVendors = [
  { productId: '1', vendorId: 'VEND-001' },
  { productId: '2', vendorId: 'VEND-001' },
  { productId: '3', vendorId: 'VEND-001' },
  { productId: '4', vendorId: 'VEND-001' },
  { productId: '7', vendorId: 'VEND-001' },
  { productId: '8', vendorId: 'VEND-001' },
  { productId: '5', vendorId: 'VEND-002' },
  { productId: '6', vendorId: 'VEND-002' }
]

const mockVendorCompanies = [
  { vendorId: 'VEND-001', companyId: 'COMP-INDIGO' },
  { vendorId: 'VEND-001', companyId: 'COMP-AKASA' },
  { vendorId: 'VEND-002', companyId: 'COMP-INDIGO' },
  { vendorId: 'VEND-002', companyId: 'COMP-AKASA' },
  { vendorId: 'VEND-002', companyId: 'COMP-AIRINDIA' }
]

// Mock employees (first 5 for each company to keep it manageable)
const mockEmployees = [
  {
    id: 'IND-001',
    employeeId: 'EMP-000001',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    designation: 'Pilot',
    gender: 'male',
    location: 'Delhi Base',
    email: 'rajesh.kumar@goindigo.in',
    mobile: '+91-9876543210',
    shirtSize: 'L',
    pantSize: '34',
    shoeSize: '10',
    address: 'A-123, Sector 15, Noida, Uttar Pradesh 201301',
    companyId: 'COMP-INDIGO',
    companyName: 'Indigo',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025'
  },
  {
    id: 'IND-002',
    employeeId: 'EMP-000002',
    firstName: 'Priya',
    lastName: 'Sharma',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Mumbai Base',
    email: 'priya.sharma@goindigo.in',
    mobile: '+91-9876543211',
    shirtSize: 'M',
    pantSize: '28',
    shoeSize: '7',
    address: 'B-456, Andheri West, Mumbai, Maharashtra 400053',
    companyId: 'COMP-INDIGO',
    companyName: 'Indigo',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025'
  },
  {
    id: 'IND-003',
    employeeId: 'EMP-000003',
    firstName: 'Amit',
    lastName: 'Patel',
    designation: 'Co-Pilot',
    gender: 'male',
    location: 'Bangalore Base',
    email: 'amit.patel@goindigo.in',
    mobile: '+91-9876543212',
    shirtSize: 'XL',
    pantSize: '36',
    shoeSize: '11',
    address: 'C-789, Koramangala, Bangalore, Karnataka 560095',
    companyId: 'COMP-INDIGO',
    companyName: 'Indigo',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025'
  },
  {
    id: 'AKA-001',
    employeeId: 'EMP-000004',
    firstName: 'Arjun',
    lastName: 'Menon',
    designation: 'Pilot',
    gender: 'male',
    location: 'Mumbai Base',
    email: 'arjun.menon@akasaair.com',
    mobile: '+91-9876543220',
    shirtSize: 'XL',
    pantSize: '36',
    shoeSize: '11',
    address: 'K-852, Juhu, Mumbai, Maharashtra 400049',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025'
  },
  {
    id: 'AKA-002',
    employeeId: 'EMP-000005',
    firstName: 'Meera',
    lastName: 'Krishnan',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Delhi Base',
    email: 'meera.krishnan@akasaair.com',
    mobile: '+91-9876543221',
    shirtSize: 'S',
    pantSize: '30',
    shoeSize: '6',
    address: 'L-963, Vasant Kunj, New Delhi 110070',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025'
  }
]

// Mock orders (sample data)
const mockOrders = [
  {
    id: 'ORD-001',
    employeeId: 'IND-001',
    employeeName: 'Rajesh Kumar',
    items: [
      { uniformId: '1', uniformName: 'Formal Shirt - Male', size: 'L', quantity: 2, price: 25.99 },
      { uniformId: '3', uniformName: 'Formal Trousers - Male', size: '34', quantity: 1, price: 35.99 }
    ],
    total: 87.97,
    status: 'confirmed',
    orderDate: '2024-01-15',
    dispatchLocation: 'Delhi Base',
    companyId: 'COMP-INDIGO',
    deliveryAddress: 'A-123, Sector 15, Noida, Uttar Pradesh 201301',
    estimatedDeliveryTime: '3-5 business days'
  },
  {
    id: 'ORD-002',
    employeeId: 'IND-002',
    employeeName: 'Priya Sharma',
    items: [
      { uniformId: '2', uniformName: 'Formal Shirt - Female', size: 'M', quantity: 3, price: 24.99 }
    ],
    total: 74.97,
    status: 'delivered',
    orderDate: '2024-01-10',
    dispatchLocation: 'Mumbai Base',
    companyId: 'COMP-INDIGO',
    deliveryAddress: 'B-456, Andheri West, Mumbai, Maharashtra 400053',
    estimatedDeliveryTime: '3-5 business days'
  }
]

async function migrate() {
  try {
    console.log('🚀 Starting migration script...')
    console.log('🔄 Connecting to MongoDB...')
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Clear existing data
    console.log('🗑️  Clearing existing data...')
    await Uniform.deleteMany({})
    await Vendor.deleteMany({})
    await Company.deleteMany({})
    await Employee.deleteMany({})
    await Order.deleteMany({})
    await ProductCompany.deleteMany({})
    await ProductVendor.deleteMany({})
    await VendorCompany.deleteMany({})
    console.log('✅ Cleared existing data')

    // Create maps to store MongoDB ObjectIds
    const vendorIdMap = new Map()
    const companyIdMap = new Map()
    const productIdMap = new Map()
    const employeeIdMap = new Map()

    // 1. Migrate Vendors
    console.log('📦 Migrating Vendors...')
    for (const vendor of mockVendors) {
      const vendorDoc = await Vendor.create({
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        phone: vendor.phone,
        logo: vendor.logo,
        website: vendor.website,
        primaryColor: vendor.primaryColor,
        secondaryColor: vendor.secondaryColor,
        accentColor: vendor.accentColor,
        theme: vendor.theme,
      })
      vendorIdMap.set(vendor.id, vendorDoc._id)
    }
    console.log(`✅ Migrated ${mockVendors.length} vendors`)

    // 2. Migrate Companies
    console.log('🏢 Migrating Companies...')
    for (const company of mockCompanies) {
      const companyDoc = await Company.create({
        id: company.id,
        name: company.name,
        logo: company.logo,
        website: company.website,
        primaryColor: company.primaryColor,
      })
      companyIdMap.set(company.id, companyDoc._id)
    }
    console.log(`✅ Migrated ${mockCompanies.length} companies`)

    // 3. Migrate Products (Uniforms)
    console.log('👕 Migrating Products...')
    for (const product of mockUniforms) {
      const vendorObjectId = vendorIdMap.get(product.vendorId)
      if (!vendorObjectId) {
        console.warn(`⚠️  Vendor ${product.vendorId} not found for product ${product.id}`)
        continue
      }

      const companyObjectIds = product.companyIds
        .map((cid) => companyIdMap.get(cid))
        .filter((id) => id !== undefined)

      const productDoc = await Uniform.create({
        id: product.id,
        name: product.name,
        category: product.category,
        gender: product.gender,
        sizes: product.sizes,
        price: product.price,
        image: product.image,
        sku: product.sku,
        vendorId: vendorObjectId,
        stock: product.stock,
        companyIds: companyObjectIds,
      })
      productIdMap.set(product.id, productDoc._id)
    }
    console.log(`✅ Migrated ${mockUniforms.length} products`)

    // 4. Migrate Employees
    console.log('👥 Migrating Employees...')
    for (const employee of mockEmployees) {
      const companyObjectId = companyIdMap.get(employee.companyId)
      if (!companyObjectId) {
        console.warn(`⚠️  Company ${employee.companyId} not found for employee ${employee.id}`)
        continue
      }

      const employeeDoc = await Employee.create({
        id: employee.id,
        employeeId: employee.employeeId || `EMP-${String(Date.now()).slice(-6)}`,
        firstName: employee.firstName,
        lastName: employee.lastName,
        designation: employee.designation,
        gender: employee.gender,
        location: employee.location,
        email: employee.email,
        mobile: employee.mobile,
        shirtSize: employee.shirtSize,
        pantSize: employee.pantSize,
        shoeSize: employee.shoeSize,
        address: employee.address,
        companyId: companyObjectId,
        companyName: employee.companyName,
        eligibility: employee.eligibility,
        dispatchPreference: employee.dispatchPreference,
        status: employee.status,
        period: employee.period,
        dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining) : new Date('2025-10-01T00:00:00.000Z'),
      })
      employeeIdMap.set(employee.id, employeeDoc._id)
    }
    console.log(`✅ Migrated ${mockEmployees.length} employees`)

    // 5. Migrate Orders
    console.log('📋 Migrating Orders...')
    for (const order of mockOrders) {
      const employeeObjectId = employeeIdMap.get(order.employeeId)
      const companyObjectId = companyIdMap.get(order.companyId)
      
      if (!employeeObjectId || !companyObjectId) {
        console.warn(`⚠️  Employee or Company not found for order ${order.id}`)
        continue
      }

      const orderItems = order.items.map((item) => {
        const productObjectId = productIdMap.get(item.uniformId)
        if (!productObjectId) {
          console.warn(`⚠️  Product ${item.uniformId} not found for order ${order.id}`)
          return null
        }
        return {
          uniformId: productObjectId,
          uniformName: item.uniformName,
          size: item.size,
          quantity: item.quantity,
          price: item.price,
        }
      }).filter((item) => item !== null)

      await Order.create({
        id: order.id,
        employeeId: employeeObjectId,
        employeeName: order.employeeName,
        items: orderItems,
        total: order.total,
        status: order.status,
        orderDate: new Date(order.orderDate),
        dispatchLocation: order.dispatchLocation,
        companyId: companyObjectId,
        deliveryAddress: order.deliveryAddress,
        estimatedDeliveryTime: order.estimatedDeliveryTime,
      })
    }
    console.log(`✅ Migrated ${mockOrders.length} orders`)

    // 6. Migrate Relationships
    console.log('🔗 Migrating Relationships...')

    // Product-Company relationships
    let pcCount = 0
    for (const rel of mockProductCompanies) {
      const productObjectId = productIdMap.get(rel.productId)
      const companyObjectId = companyIdMap.get(rel.companyId)
      
      if (productObjectId && companyObjectId) {
        try {
          await ProductCompany.create({
            productId: productObjectId,
            companyId: companyObjectId,
          })
          pcCount++
        } catch (e) {
          // Ignore duplicate key errors
          if (e.code !== 11000) {
            console.warn(`Error creating product-company relationship:`, e.message)
          }
        }
      }
    }
    console.log(`✅ Migrated ${pcCount} product-company relationships`)

    // Product-Vendor relationships
    let pvCount = 0
    for (const rel of mockProductVendors) {
      const productObjectId = productIdMap.get(rel.productId)
      const vendorObjectId = vendorIdMap.get(rel.vendorId)
      
      if (productObjectId && vendorObjectId) {
        try {
          await ProductVendor.create({
            productId: productObjectId,
            vendorId: vendorObjectId,
          })
          pvCount++
        } catch (e) {
          if (e.code !== 11000) {
            console.warn(`Error creating product-vendor relationship:`, e.message)
          }
        }
      }
    }
    console.log(`✅ Migrated ${pvCount} product-vendor relationships`)

    // Vendor-Company relationships
    let vcCount = 0
    for (const rel of mockVendorCompanies) {
      const vendorObjectId = vendorIdMap.get(rel.vendorId)
      const companyObjectId = companyIdMap.get(rel.companyId)
      
      if (vendorObjectId && companyObjectId) {
        try {
          await VendorCompany.create({
            vendorId: vendorObjectId,
            companyId: companyObjectId,
          })
          vcCount++
        } catch (e) {
          if (e.code !== 11000) {
            console.warn(`Error creating vendor-company relationship:`, e.message)
          }
        }
      }
    }
    console.log(`✅ Migrated ${vcCount} vendor-company relationships`)

    console.log('\n🎉 Migration completed successfully!')
    console.log('\nSummary:')
    console.log(`- ${mockVendors.length} Vendors`)
    console.log(`- ${mockCompanies.length} Companies`)
    console.log(`- ${mockUniforms.length} Products`)
    console.log(`- ${mockEmployees.length} Employees`)
    console.log(`- ${mockOrders.length} Orders`)
    console.log(`- ${pcCount} Product-Company relationships`)
    console.log(`- ${pvCount} Product-Vendor relationships`)
    console.log(`- ${vcCount} Vendor-Company relationships`)
    
    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close()
    }
    process.exit(1)
  }
}

migrate()

