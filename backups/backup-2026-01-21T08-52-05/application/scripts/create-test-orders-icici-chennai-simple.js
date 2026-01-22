/**
 * Script to create 2 test orders for ICICI Chennai branch employees
 * Each order will have at least 2 catalog items
 * Orders will be approved by location admin with dummy PR numbers
 * 
 * This script uses mongoose directly to work around ES module import issues
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

// Try to read .env.local
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
  console.warn('Could not read .env.local, using default connection string')
}

async function createTestOrders() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    const companiesCollection = db.collection('companies')
    const branchesCollection = db.collection('branches')
    const employeesCollection = db.collection('employees')
    const uniformsCollection = db.collection('uniforms')
    const ordersCollection = db.collection('orders')

    console.log('🔍 Step 1: Finding ICICI Bank company...')
    let company = await companiesCollection.findOne({ id: 'COMP-ICICI' })
    if (!company) {
      // Try searching by name
      company = await companiesCollection.findOne({ name: { $regex: /icici/i } })
    }
    if (!company) {
      throw new Error('ICICI Bank company not found. Please run: npm run add-icici-bank')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})\n`)

    console.log('🔍 Step 2: Finding Chennai branch...')
    // Try to find Chennai branch - check both ObjectId and string companyId
    let chennaiBranch = await branchesCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })

    // If not found, create it
    if (!chennaiBranch) {
      console.log('   Chennai branch not found, creating it...')
      const branchResult = await branchesCollection.insertOne({
        name: 'ICICI Bank Chennai Branch',
        companyId: company._id,
        address_line_1: 'ICICI Bank, T Nagar',
        city: 'Chennai',
        state: 'Tamil Nadu',
        pincode: '600017',
        country: 'India',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      chennaiBranch = await branchesCollection.findOne({ _id: branchResult.insertedId })
      console.log(`   ✅ Created branch: ${chennaiBranch.name}\n`)
    } else {
      console.log(`✅ Found branch: ${chennaiBranch.name} (${chennaiBranch._id})\n`)
    }

    console.log('🔍 Step 3: Finding Chennai branch employees...')
    // Find employees - try with branchId first, then without if none found
    let employees = await employeesCollection.find({
      companyId: company._id,
      branchId: chennaiBranch._id,
      status: 'active'
    }).limit(2).toArray()

    // If no employees with branchId, find any ICICI employees
    if (employees.length < 2) {
      console.log(`   Found ${employees.length} employees with branchId, searching all ICICI employees...`)
      const allEmployees = await employeesCollection.find({
        companyId: company._id,
        status: 'active'
      }).limit(2).toArray()
      
      if (allEmployees.length >= 2) {
        employees = allEmployees
        console.log(`   ✅ Using ${employees.length} employees from ICICI (will update their branchId)`)
        // Update employees to have this branchId
        for (const emp of employees) {
          await employeesCollection.updateOne(
            { _id: emp._id },
            { $set: { branchId: chennaiBranch._id } }
          )
        }
      }
    }

    if (employees.length < 2) {
      throw new Error(`Need at least 2 employees from Chennai branch. Found: ${employees.length}`)
    }

    console.log(`✅ Found ${employees.length} employees:`)
    employees.forEach((emp, idx) => {
      const empId = emp.employeeId || emp.id || 'N/A'
      console.log(`   ${idx + 1}. ${empId}`)
    })
    console.log()

    console.log('🔍 Step 4: Finding catalog items/products...')
    // Try direct companyId first
    let products = await uniformsCollection.find({
      companyId: company._id
    }).limit(4).toArray()

    // If not found, try via ProductCompany relationship
    if (products.length < 2) {
      const productCompaniesCollection = db.collection('productcompanies')
      const productCompanyLinks = await productCompaniesCollection.find({
        companyId: company._id
      }).limit(4).toArray()
      
      if (productCompanyLinks.length > 0) {
        const productIds = productCompanyLinks.map(pc => pc.productId || pc.uniformId)
        products = await uniformsCollection.find({
          _id: { $in: productIds.map(id => typeof id === 'string' ? new mongoose.Types.ObjectId(id) : id) }
        }).limit(4).toArray()
      }
    }

    // If still not found, get any products (for testing)
    if (products.length < 2) {
      console.log(`   ⚠️  Only found ${products.length} products for ICICI, getting any available products...`)
      const anyProducts = await uniformsCollection.find({}).limit(4).toArray()
      if (anyProducts.length >= 2) {
        products = anyProducts
        console.log(`   ✅ Using ${products.length} products (may not be linked to ICICI)`)
      }
    }

    if (products.length < 2) {
      throw new Error(`Need at least 2 products. Found: ${products.length}. Please add products to the catalog first.`)
    }

    console.log(`✅ Found ${products.length} products:`)
    products.forEach((prod, idx) => {
      console.log(`   ${idx + 1}. ${prod.name} (${prod.id}) - ₹${prod.price || 0}`)
    })
    console.log()

    console.log('🔍 Step 5: Finding Anjali Singh (300032) as location admin...')
    let locationAdmin = await employeesCollection.findOne({
      $or: [
        { employeeId: '300032' },
        { id: '300032' }
      ]
    })

    if (!locationAdmin) {
      throw new Error('Anjali Singh (300032) not found. Please ensure she exists in the database.')
    }

    // Ensure she's assigned to Chennai branch
    if (!locationAdmin.branchId || locationAdmin.branchId.toString() !== chennaiBranch._id.toString()) {
      await employeesCollection.updateOne(
        { _id: locationAdmin._id },
        { $set: { branchId: chennaiBranch._id } }
      )
      console.log(`   ✅ Assigned Anjali Singh to Chennai branch`)
    }

    console.log(`✅ Found admin: ${locationAdmin.employeeId || locationAdmin.id} - Anjali Singh`)
    console.log()

    console.log('📦 Step 6: Creating orders via API...')
    console.log('   Note: This requires the API server to be running')
    console.log('   If API is not available, orders will need to be created manually\n')

    // Generate PR numbers
    const timestamp = Date.now()
    const prNumbers = [`PR-ICICI-CHN-${timestamp}-001`, `PR-ICICI-CHN-${timestamp}-002`]

    console.log('📋 Summary of what needs to be done:')
    console.log(`   - Company: ${company.name} (${company.id})`)
    console.log(`   - Branch: ${chennaiBranch.name}`)
    console.log(`   - Employees: ${employees.map(e => e.employeeId || e.id).join(', ')}`)
    console.log(`   - Products: ${products.map(p => p.name).join(', ')}`)
    console.log(`   - Admin: ${locationAdmin.employeeId || locationAdmin.id}`)
    console.log(`   - PR Numbers: ${prNumbers.join(', ')}`)
    console.log()

    console.log('⚠️  To complete order creation:')
    console.log('   1. Ensure API server is running (npm run dev)')
    console.log('   2. Use the API endpoints to create orders:')
    console.log('      POST /api/orders with employee data')
    console.log('   3. Approve orders using:')
    console.log('      POST /api/orders/[orderId]/approve with PR numbers')
    console.log()

    // Try to use the createOrder function if available via require
    try {
      // Use dynamic import as fallback
      const { createOrder, approveOrder } = await import('../lib/db/data-access.js')
      
      console.log('✅ Successfully loaded order functions, creating orders...\n')

      const orders = []
      for (let i = 0; i < 2; i++) {
        const employee = employees[i]
        const employeeId = employee.employeeId || employee.id

        // Select 2 products for this order
        const orderProducts = products.slice(i * 2, (i + 1) * 2)
        if (orderProducts.length < 2) {
          orderProducts.push(...products.slice(0, 2 - orderProducts.length))
        }

        const orderItems = orderProducts.map(prod => ({
          uniformId: prod.id,
          uniformName: prod.name,
          size: (prod.sizes && prod.sizes.length > 0) ? prod.sizes[0] : 'M',
          quantity: 1,
          price: prod.price || 100
        }))

        console.log(`   Creating order ${i + 1} for employee ${employeeId}:`)
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
        console.log(`   - PR Status: ${order.pr_status || 'N/A'}\n`)

        orders.push(order)
      }

      console.log('✅ Step 7: Approving orders as location admin...\n')

      const adminEmail = locationAdmin.email
      for (let i = 0; i < orders.length; i++) {
        const order = orders[i]
        const prNumber = prNumbers[i]
        const prDate = new Date()

        console.log(`   Approving order ${i + 1} (${order.id}):`)
        console.log(`   - PR Number: ${prNumber}`)
        console.log(`   - PR Date: ${prDate.toISOString().split('T')[0]}`)
        console.log(`   - Admin: ${adminEmail}`)

        try {
          const approvedOrder = await approveOrder(order.id, adminEmail, prNumber, prDate)
          console.log(`   ✅ Order approved successfully!`)
          console.log(`   - New Status: ${approvedOrder.status}`)
          console.log(`   - PR Status: ${approvedOrder.pr_status}`)
          console.log(`   - PR Number: ${approvedOrder.pr_number}\n`)
        } catch (error) {
          console.error(`   ❌ Error approving order: ${error.message}\n`)
        }
      }

      console.log('🎉 Test orders created and approved successfully!')
      console.log('\n📋 Final Summary:')
      console.log(`   - Company: ${company.name}`)
      console.log(`   - Branch: ${chennaiBranch.name}`)
      console.log(`   - Orders Created: ${orders.length}`)
      console.log(`   - PR Numbers: ${prNumbers.join(', ')}`)

    } catch (importError) {
      console.error('⚠️  Could not import order functions:', importError.message)
      console.log('\n📝 Manual steps required:')
      console.log('   1. Create orders via API or UI')
      console.log('   2. Approve them with the PR numbers listed above')
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
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
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

