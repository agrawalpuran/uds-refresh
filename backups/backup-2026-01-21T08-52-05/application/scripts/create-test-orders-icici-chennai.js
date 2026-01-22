/**
 * Script to create 2 test orders for ICICI Chennai branch employees
 * Each order will have at least 2 catalog items
 * Orders will be approved by location admin with dummy PR numbers
 */

const mongoose = require('mongoose')

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Import models - using require for CommonJS
let Company, Employee, Uniform, Branch, Order
let createOrder, approveOrder

// Dynamic import for ES modules
async function loadModules() {
  if (!Company) {
    const companyModule = await import('../lib/models/Company.js')
    Company = companyModule.default
  }
  if (!Employee) {
    const employeeModule = await import('../lib/models/Employee.js')
    Employee = employeeModule.default
  }
  if (!Uniform) {
    const uniformModule = await import('../lib/models/Uniform.js')
    Uniform = uniformModule.default
  }
  if (!Branch) {
    const branchModule = await import('../lib/models/Branch.js')
    Branch = branchModule.default
  }
  if (!Order) {
    const orderModule = await import('../lib/models/Order.js')
    Order = orderModule.default
  }
  if (!createOrder) {
    const dataAccessModule = await import('../lib/db/data-access.js')
    createOrder = dataAccessModule.createOrder
    approveOrder = dataAccessModule.approveOrder
  }
}

async function connectDB() {
  if (mongoose.connection.readyState === 1) {
    console.log('✅ Already connected to MongoDB')
    return
  }
  await mongoose.connect(MONGODB_URI)
  console.log('✅ Connected to MongoDB')
}

async function createTestOrders() {
  try {
    // Load ES modules first
    await loadModules()
    await connectDB()

    console.log('\n🔍 Step 1: Finding ICICI Bank company...')
    const company = await Company.findOne({ id: 'COMP-ICICI' }).lean()
    if (!company) {
      throw new Error('ICICI Bank company not found. Please run: npm run add-icici-bank')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})`)

    console.log('\n🔍 Step 2: Finding Chennai branch...')
    const chennaiBranch = await Branch.findOne({ 
      companyId: company._id,
      name: { $regex: /chennai/i }
    }).lean()
    
    if (!chennaiBranch) {
      throw new Error('Chennai branch not found for ICICI Bank')
    }
    console.log(`✅ Found branch: ${chennaiBranch.name} (${chennaiBranch._id})`)

    console.log('\n🔍 Step 3: Finding Chennai branch employees...')
    const employees = await Employee.find({
      companyId: company._id,
      branchId: chennaiBranch._id,
      status: 'active'
    }).limit(2).lean()

    if (employees.length < 2) {
      throw new Error(`Need at least 2 employees from Chennai branch. Found: ${employees.length}`)
    }

    console.log(`✅ Found ${employees.length} employees:`)
    employees.forEach((emp, idx) => {
      console.log(`   ${idx + 1}. ${emp.employeeId || emp.id} - ${emp.firstName || 'N/A'} ${emp.lastName || ''}`)
    })

    console.log('\n🔍 Step 4: Finding catalog items/products...')
    // Find products for ICICI company
    const products = await Uniform.find({
      companyId: company._id
    }).limit(4).lean()

    if (products.length < 2) {
      throw new Error(`Need at least 2 products for ICICI. Found: ${products.length}`)
    }

    console.log(`✅ Found ${products.length} products:`)
    products.forEach((prod, idx) => {
      console.log(`   ${idx + 1}. ${prod.name} (${prod.id}) - ₹${prod.price || 0}`)
    })

    console.log('\n🔍 Step 5: Finding location admin for Chennai branch...')
    const locationAdmin = await Employee.findOne({
      companyId: company._id,
      branchId: chennaiBranch._id,
      designation: { $regex: /admin|manager|head/i },
      status: 'active'
    }).lean()

    if (!locationAdmin) {
      // Try to find any admin from the company
      const companyAdmin = await Employee.findOne({
        companyId: company._id,
        designation: { $regex: /admin|manager|head/i },
        status: 'active'
      }).lean()

      if (!companyAdmin) {
        throw new Error('No location admin or company admin found for approval')
      }
      console.log(`⚠️  Using company admin: ${companyAdmin.employeeId || companyAdmin.id} (${companyAdmin.email})`)
      var adminEmail = companyAdmin.email
      var adminEmployeeId = companyAdmin.employeeId || companyAdmin.id
    } else {
      console.log(`✅ Found location admin: ${locationAdmin.employeeId || locationAdmin.id} (${locationAdmin.email})`)
      var adminEmail = locationAdmin.email
      var adminEmployeeId = locationAdmin.employeeId || locationAdmin.id
    }

    console.log('\n📦 Step 6: Creating orders...')

    const orders = []
    const prNumbers = [`PR-ICICI-CHN-${Date.now()}-001`, `PR-ICICI-CHN-${Date.now()}-002`]

    for (let i = 0; i < 2; i++) {
      const employee = employees[i]
      const employeeId = employee.employeeId || employee.id

      // Select 2-3 products for this order
      const orderProducts = products.slice(i * 2, (i + 1) * 2)
      if (orderProducts.length < 2) {
        // If not enough products, reuse some
        orderProducts.push(...products.slice(0, 2 - orderProducts.length))
      }

      const orderItems = orderProducts.map(prod => ({
        uniformId: prod.id,
        uniformName: prod.name,
        size: prod.sizes && prod.sizes.length > 0 ? prod.sizes[0] : 'M',
        quantity: 1,
        price: prod.price || 100
      }))

      console.log(`\n   Creating order ${i + 1} for employee ${employeeId}:`)
      console.log(`   - Items: ${orderItems.map(item => `${item.uniformName} (${item.size})`).join(', ')}`)

      const order = await createOrder({
        employeeId: employeeId,
        items: orderItems,
        deliveryAddress: employee.address || chennaiBranch.address_line_1 || 'ICICI Bank, T Nagar, Chennai',
        estimatedDeliveryTime: '5-7 business days',
        dispatchLocation: employee.dispatchPreference || 'standard',
        usePersonalAddress: false
      })

      console.log(`   ✅ Order created: ${order.id}`)
      console.log(`   - Status: ${order.status}`)
      console.log(`   - PR Status: ${order.pr_status || 'N/A'}`)
      
      orders.push(order)
    }

    console.log('\n✅ Step 7: Approving orders as location admin...')

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      const prNumber = prNumbers[i]
      const prDate = new Date()

      console.log(`\n   Approving order ${i + 1} (${order.id}):`)
      console.log(`   - PR Number: ${prNumber}`)
      console.log(`   - PR Date: ${prDate.toISOString().split('T')[0]}`)
      console.log(`   - Admin: ${adminEmail}`)

      try {
        const approvedOrder = await approveOrder(order.id, adminEmail, prNumber, prDate)
        console.log(`   ✅ Order approved successfully!`)
        console.log(`   - New Status: ${approvedOrder.status}`)
        console.log(`   - PR Status: ${approvedOrder.pr_status}`)
        console.log(`   - PR Number: ${approvedOrder.pr_number}`)
      } catch (error) {
        console.error(`   ❌ Error approving order: ${error.message}`)
        // Continue with next order
      }
    }

    console.log('\n🎉 Test orders created successfully!')
    console.log('\n📋 Summary:')
    console.log(`   - Company: ${company.name}`)
    console.log(`   - Branch: ${chennaiBranch.name}`)
    console.log(`   - Orders Created: ${orders.length}`)
    console.log(`   - Orders Approved: ${orders.filter(o => o.pr_status === 'SITE_ADMIN_APPROVED' || o.pr_status === 'PENDING_COMPANY_ADMIN_APPROVAL').length}`)
    console.log(`   - PR Numbers: ${prNumbers.join(', ')}`)

    // Display final order details
    console.log('\n📦 Final Order Details:')
    for (let i = 0; i < orders.length; i++) {
      const order = await Order.findById(orders[i]._id).lean()
      console.log(`\n   Order ${i + 1}:`)
      console.log(`   - Order ID: ${order.id}`)
      console.log(`   - Employee: ${order.employeeIdNum || 'N/A'}`)
      console.log(`   - Status: ${order.status}`)
      console.log(`   - PR Number: ${order.pr_number || 'N/A'}`)
      console.log(`   - PR Status: ${order.pr_status || 'N/A'}`)
      console.log(`   - Items: ${order.items.length}`)
      console.log(`   - Total: ₹${order.total}`)
    }

  } catch (error) {
    console.error('\n❌ Error creating test orders:', error)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

// Run the script
createTestOrders()
  .then(() => {
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

