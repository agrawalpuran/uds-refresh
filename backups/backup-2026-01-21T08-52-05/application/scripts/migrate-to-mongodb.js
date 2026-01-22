/**
 * Migration script to populate MongoDB with initial data from mock data
 * Run with: node scripts/migrate-to-mongodb.js
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

async function migrate() {
  try {
    console.log('🚀 Starting migration script...')
    console.log('🔄 Connecting to MongoDB...')
    
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB successfully')

    // Import models
    const Uniform = require('../lib/models/Uniform').default
    const Vendor = require('../lib/models/Vendor').default
    const Company = require('../lib/models/Company').default
    const Employee = require('../lib/models/Employee').default
    const Order = require('../lib/models/Order').default
    const { ProductCompany, ProductVendor, VendorCompany } = require('../lib/models/Relationship')
    
    // Import mock data
    const {
      mockUniforms,
      mockVendors,
      mockCompanies,
      mockEmployees,
      mockOrders,
      mockProductCompanies,
      mockProductVendors,
      mockVendorCompanies,
    } = require('../lib/data')

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
    for (const rel of mockProductCompanies) {
      const productObjectId = productIdMap.get(rel.productId)
      const companyObjectId = companyIdMap.get(rel.companyId)
      
      if (productObjectId && companyObjectId) {
        await ProductCompany.create({
          productId: productObjectId,
          companyId: companyObjectId,
        })
      }
    }
    console.log(`✅ Migrated ${mockProductCompanies.length} product-company relationships`)

    // Product-Vendor relationships
    for (const rel of mockProductVendors) {
      const productObjectId = productIdMap.get(rel.productId)
      const vendorObjectId = vendorIdMap.get(rel.vendorId)
      
      if (productObjectId && vendorObjectId) {
        await ProductVendor.create({
          productId: productObjectId,
          vendorId: vendorObjectId,
        })
      }
    }
    console.log(`✅ Migrated ${mockProductVendors.length} product-vendor relationships`)

    // Vendor-Company relationships
    for (const rel of mockVendorCompanies) {
      const vendorObjectId = vendorIdMap.get(rel.vendorId)
      const companyObjectId = companyIdMap.get(rel.companyId)
      
      if (vendorObjectId && companyObjectId) {
        await VendorCompany.create({
          vendorId: vendorObjectId,
          companyId: companyObjectId,
        })
      }
    }
    console.log(`✅ Migrated ${mockVendorCompanies.length} vendor-company relationships`)

    console.log('\n🎉 Migration completed successfully!')
    await mongoose.connection.close()
    process.exit(0)
  } catch (error) {
    console.error('❌ Migration failed:', error)
    await mongoose.connection.close()
    process.exit(1)
  }
}

migrate()






