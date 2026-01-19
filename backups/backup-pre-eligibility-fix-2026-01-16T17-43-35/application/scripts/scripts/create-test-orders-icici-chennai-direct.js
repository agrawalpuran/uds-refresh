/**
 * Script to create 2 test orders for ICICI Chennai branch employees
 * Each order will have at least 2 catalog items
 * Orders will be approved by Anjali Singh (300032) with dummy PR numbers
 * 
 * This script creates orders directly in the database
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'

// Try to read .env.local
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local, using default connection string')
}

// Decryption function
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText
    }
    
    // Check if it's encrypted (contains colon separator)
    if (!encryptedText.includes(':')) {
      return encryptedText
    }

    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }

    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = Buffer.from(parts[1], 'base64')
    const key = getKey()

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])

    return decrypted.toString('utf8')
  } catch (error) {
    console.warn('Decryption failed:', error.message)
    return encryptedText
  }
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
    const productVendorsCollection = db.collection('productvendors')
    const vendorsCollection = db.collection('vendors')

    console.log('🔍 Step 1: Finding ICICI Bank company...')
    let company = await companiesCollection.findOne({ id: 'COMP-ICICI' })
    if (!company) {
      company = await companiesCollection.findOne({ name: { $regex: /icici/i } })
    }
    if (!company) {
      throw new Error('ICICI Bank company not found')
    }
    console.log(`✅ Found company: ${company.name} (${company.id})\n`)

    console.log('🔍 Step 2: Finding Chennai branch...')
    let chennaiBranch = await branchesCollection.findOne({
      $or: [
        { companyId: company._id },
        { companyId: company._id.toString() },
        { companyId: company.id }
      ],
      name: { $regex: /chennai/i }
    })

    if (!chennaiBranch) {
      console.log('   Creating Chennai branch...')
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
    }
    console.log(`✅ Found branch: ${chennaiBranch.name}\n`)

    console.log('🔍 Step 3: Finding Chennai branch employees...')
    let employees = await employeesCollection.find({
      companyId: company._id,
      branchId: chennaiBranch._id,
      status: 'active'
    }).limit(2).toArray()

    if (employees.length < 2) {
      const allEmployees = await employeesCollection.find({
        companyId: company._id,
        status: 'active'
      }).limit(2).toArray()
      
      if (allEmployees.length >= 2) {
        employees = allEmployees
        for (const emp of employees) {
          await employeesCollection.updateOne(
            { _id: emp._id },
            { $set: { branchId: chennaiBranch._id } }
          )
        }
      }
    }

    if (employees.length < 2) {
      throw new Error(`Need at least 2 employees. Found: ${employees.length}`)
    }

    console.log(`✅ Found ${employees.length} employees:`)
    employees.forEach((emp, idx) => {
      console.log(`   ${idx + 1}. ${emp.employeeId || emp.id}`)
    })
    console.log()

    console.log('🔍 Step 4: Finding catalog items/products...')
    let products = await uniformsCollection.find({
      companyId: company._id
    }).limit(4).toArray()

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

    if (products.length < 2) {
      const anyProducts = await uniformsCollection.find({}).limit(4).toArray()
      if (anyProducts.length >= 2) {
        products = anyProducts
      }
    }

    if (products.length < 2) {
      throw new Error(`Need at least 2 products. Found: ${products.length}`)
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
      throw new Error('Anjali Singh (300032) not found')
    }

    if (!locationAdmin.branchId || locationAdmin.branchId.toString() !== chennaiBranch._id.toString()) {
      await employeesCollection.updateOne(
        { _id: locationAdmin._id },
        { $set: { branchId: chennaiBranch._id } }
      )
    }

    console.log(`✅ Found admin: ${locationAdmin.employeeId || locationAdmin.id} - Anjali Singh`)
    console.log()

    console.log('📦 Step 6: Creating orders directly in database...\n')

    const orders = []
    const timestamp = Date.now()
    const prNumbers = [`PR-ICICI-CHN-${timestamp}-001`, `PR-ICICI-CHN-${timestamp}-002`]

    for (let i = 0; i < 2; i++) {
      const employee = employees[i]
      const employeeId = employee.employeeId || employee.id

      // Select 2 products for this order
      const orderProducts = products.slice(i * 2, (i + 1) * 2)
      if (orderProducts.length < 2) {
        orderProducts.push(...products.slice(0, 2 - orderProducts.length))
      }

      // Find vendor for products (get first vendor from productvendors)
      let vendorId = null
      let vendorName = null
      if (orderProducts.length > 0) {
        const productVendor = await productVendorsCollection.findOne({
          productId: orderProducts[0]._id
        })
        if (productVendor && productVendor.vendorId) {
          const vendor = await vendorsCollection.findOne({ _id: productVendor.vendorId })
          if (vendor) {
            vendorId = vendor.id || vendor._id.toString()
            vendorName = vendor.name
          }
        }
      }

      // If no vendor found, get first vendor
      if (!vendorId) {
        const firstVendor = await vendorsCollection.findOne({})
        if (firstVendor) {
          vendorId = firstVendor.id || firstVendor._id.toString()
          vendorName = firstVendor.name
        }
      }

      const orderItems = orderProducts.map(prod => ({
        uniformId: prod._id,
        productId: prod.id,
        uniformName: prod.name,
        size: (prod.sizes && prod.sizes.length > 0) ? prod.sizes[0] : 'M',
        quantity: 1,
        price: prod.price || 100
      }))

      const total = orderItems.reduce((sum, item) => sum + (item.price * item.quantity), 0)

      // Parse employee address or use branch address
      let shippingAddress = {
        shipping_address_line_1: chennaiBranch.address_line_1 || 'ICICI Bank, T Nagar',
        shipping_address_line_2: chennaiBranch.address_line_2 || '',
        shipping_address_line_3: chennaiBranch.address_line_3 || '',
        shipping_city: chennaiBranch.city || 'Chennai',
        shipping_state: chennaiBranch.state || 'Tamil Nadu',
        shipping_pincode: chennaiBranch.pincode || '600017',
        shipping_country: chennaiBranch.country || 'India'
      }

      // Generate order ID
      const orderId = `ORD-${timestamp}-${i + 1}`

      // Decrypt employee name fields
      let decryptedFirstName = ''
      let decryptedLastName = ''
      
      try {
        if (employee.firstName && typeof employee.firstName === 'string' && employee.firstName.includes(':')) {
          decryptedFirstName = decrypt(employee.firstName)
        } else {
          decryptedFirstName = employee.firstName || ''
        }
      } catch (error) {
        console.warn(`   ⚠️  Failed to decrypt firstName for employee ${employeeId}`)
        decryptedFirstName = employee.firstName || ''
      }

      try {
        if (employee.lastName && typeof employee.lastName === 'string' && employee.lastName.includes(':')) {
          decryptedLastName = decrypt(employee.lastName)
        } else {
          decryptedLastName = employee.lastName || ''
        }
      } catch (error) {
        console.warn(`   ⚠️  Failed to decrypt lastName for employee ${employeeId}`)
        decryptedLastName = employee.lastName || ''
      }

      const employeeName = `${decryptedFirstName} ${decryptedLastName}`.trim() || 'Employee'

      console.log(`   Creating order ${i + 1} for employee ${employeeId}:`)
      console.log(`   - Employee Name: ${employeeName}`)
      console.log(`   - Items: ${orderItems.map(item => `${item.uniformName} (${item.size})`).join(', ')}`)
      console.log(`   - Total: ₹${total}`)

      const orderDoc = {
        id: orderId,
        employeeId: employee._id,
        employeeIdNum: employeeId,
        employeeName: employeeName,
        items: orderItems,
        total: total,
        status: 'Awaiting approval',
        orderDate: new Date(),
        dispatchLocation: employee.dispatchPreference || 'standard',
        companyId: company._id,
        companyIdNum: parseInt(company.id.replace(/\D/g, '')) || 100004,
        ...shippingAddress,
        deliveryAddress: `${shippingAddress.shipping_address_line_1}, ${shippingAddress.shipping_city}`,
        estimatedDeliveryTime: '5-7 business days',
        vendorId: vendorId,
        vendorName: vendorName,
        isPersonalPayment: false,
        personalPaymentAmount: 0,
        pr_status: 'PENDING_SITE_ADMIN_APPROVAL',
        createdAt: new Date(),
        updatedAt: new Date()
      }

      const orderResult = await ordersCollection.insertOne(orderDoc)
      const createdOrder = await ordersCollection.findOne({ _id: orderResult.insertedId })

      console.log(`   ✅ Order created: ${createdOrder.id}`)
      console.log(`   - Status: ${createdOrder.status}`)
      console.log(`   - PR Status: ${createdOrder.pr_status}\n`)

      orders.push(createdOrder)
    }

    console.log('✅ Step 7: Approving orders as Anjali Singh (300032)...\n')

    const adminEmail = locationAdmin.email
    const prDate = new Date()

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i]
      const prNumber = prNumbers[i]

      console.log(`   Approving order ${i + 1} (${order.id}):`)
      console.log(`   - PR Number: ${prNumber}`)
      console.log(`   - PR Date: ${prDate.toISOString().split('T')[0]}`)
      console.log(`   - Admin: Anjali Singh (${locationAdmin.employeeId || locationAdmin.id})`)

      // Check if company requires company admin approval
      const companyDoc = await companiesCollection.findOne({ _id: company._id })
      const requiresCompanyAdminApproval = companyDoc?.require_company_admin_po_approval === true

      // Determine next status based on company workflow
      let nextPRStatus = 'SITE_ADMIN_APPROVED'
      let nextOrderStatus = 'Awaiting fulfilment'
      
      if (requiresCompanyAdminApproval) {
        nextPRStatus = 'PENDING_COMPANY_ADMIN_APPROVAL'
        nextOrderStatus = 'Awaiting approval'
        console.log(`   ℹ️  Company requires Company Admin approval - order will appear in Company Admin queue`)
      } else {
        console.log(`   ℹ️  Company does not require Company Admin approval - order moves to fulfilment`)
      }

      // Update order with approval
      await ordersCollection.updateOne(
        { _id: order._id },
        {
          $set: {
            pr_number: prNumber,
            pr_date: prDate,
            pr_status: nextPRStatus,
            site_admin_approved_by: locationAdmin._id,
            site_admin_approved_at: new Date(),
            status: nextOrderStatus,
            updatedAt: new Date()
          }
        }
      )

      const updatedOrder = await ordersCollection.findOne({ _id: order._id })
      console.log(`   ✅ Order approved successfully!`)
      console.log(`   - New Status: ${updatedOrder.status}`)
      console.log(`   - PR Status: ${updatedOrder.pr_status}`)
      console.log(`   - PR Number: ${updatedOrder.pr_number}`)
      if (requiresCompanyAdminApproval) {
        console.log(`   - ⚠️  Will appear in Company Admin approval queue\n`)
      } else {
        console.log(`   - ✅ Ready for fulfilment\n`)
      }
    }

    console.log('🎉 Test orders created and approved successfully!')
    console.log('\n📋 Final Summary:')
    console.log(`   - Company: ${company.name}`)
    console.log(`   - Branch: ${chennaiBranch.name}`)
    console.log(`   - Orders Created: ${orders.length}`)
    console.log(`   - Orders Approved by: Anjali Singh (300032)`)
    console.log(`   - PR Numbers: ${prNumbers.join(', ')}`)

    // Display final order details
    console.log('\n📦 Final Order Details:')
    for (let i = 0; i < orders.length; i++) {
      const order = await ordersCollection.findOne({ id: orders[i].id })
      console.log(`\n   Order ${i + 1}:`)
      console.log(`   - Order ID: ${order.id}`)
      console.log(`   - Employee: ${order.employeeIdNum}`)
      console.log(`   - Status: ${order.status}`)
      console.log(`   - PR Number: ${order.pr_number}`)
      console.log(`   - PR Status: ${order.pr_status}`)
      console.log(`   - Items: ${order.items.length}`)
      console.log(`   - Total: ₹${order.total}`)
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
    console.log('\n✅ Script completed successfully!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

