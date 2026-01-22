/**
 * Migrate Company, Uniform, and Employee IDs to 6-digit numeric format
 * Updates all related collections: ProductCompany, ProductVendor, Orders, etc.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'

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
  console.warn('Could not read .env.local')
}

async function migrateAllIds() {
  try {
    console.log('Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection not available')
    }

    console.log('='.repeat(80))
    console.log('MIGRATING ALL IDs TO 6-DIGIT NUMERIC FORMAT')
    console.log('='.repeat(80))
    console.log()

    // ========== STEP 1: MIGRATE COMPANIES ==========
    console.log('STEP 1: MIGRATING COMPANY IDs')
    console.log('='.repeat(80))
    const companies = await db.collection('companies').find({}).sort({ _id: 1 }).toArray()
    const companyIdMap = new Map() // oldId -> newId
    let nextCompanyId = 100001

    companies.forEach((company) => {
      const oldId = String(company.id)
      const newId = String(nextCompanyId).padStart(6, '0')
      companyIdMap.set(oldId, { newId, company })
      console.log(`   ${company.name}: "${oldId}" → "${newId}"`)
      nextCompanyId++
    })

    // Update companies
    let updatedCompanies = 0
    for (const [oldId, mapping] of companyIdMap.entries()) {
      const result = await db.collection('companies').updateOne(
        { _id: mapping.company._id },
        { $set: { id: mapping.newId } }
      )
      if (result.modifiedCount > 0) updatedCompanies++
    }
    console.log(`✅ Updated ${updatedCompanies} company document(s)\n`)

    // ========== STEP 2: MIGRATE UNIFORMS/PRODUCTS ==========
    console.log('STEP 2: MIGRATING UNIFORM/PRODUCT IDs')
    console.log('='.repeat(80))
    const uniforms = await db.collection('uniforms').find({}).sort({ _id: 1 }).toArray()
    const uniformIdMap = new Map() // oldId -> newId
    let nextUniformId = 200001

    uniforms.forEach((uniform) => {
      const oldId = String(uniform.id)
      const newId = String(nextUniformId).padStart(6, '0')
      uniformIdMap.set(oldId, { newId, uniform })
      console.log(`   ${uniform.name}: "${oldId}" → "${newId}"`)
      nextUniformId++
    })

    // Update uniforms
    let updatedUniforms = 0
    for (const [oldId, mapping] of uniformIdMap.entries()) {
      const result = await db.collection('uniforms').updateOne(
        { _id: mapping.uniform._id },
        { $set: { id: mapping.newId } }
      )
      if (result.modifiedCount > 0) updatedUniforms++
    }
    console.log(`✅ Updated ${updatedUniforms} uniform document(s)\n`)

    // ========== STEP 3: MIGRATE EMPLOYEES ==========
    console.log('STEP 3: MIGRATING EMPLOYEE IDs')
    console.log('='.repeat(80))
    const employees = await db.collection('employees').find({}).sort({ _id: 1 }).toArray()
    const employeeIdMap = new Map() // oldId -> newId
    let nextEmployeeId = 300001

    employees.forEach((employee) => {
      const oldId = String(employee.id || employee.employeeId)
      const newId = String(nextEmployeeId).padStart(6, '0')
      employeeIdMap.set(oldId, { newId, employee })
      console.log(`   ${employee.firstName} ${employee.lastName}: "${oldId}" → "${newId}"`)
      nextEmployeeId++
    })

    // Update employees (both id and employeeId fields)
    let updatedEmployees = 0
    for (const [oldId, mapping] of employeeIdMap.entries()) {
      const result = await db.collection('employees').updateOne(
        { _id: mapping.employee._id },
        { $set: { id: mapping.newId, employeeId: mapping.newId } }
      )
      if (result.modifiedCount > 0) updatedEmployees++
    }
    console.log(`✅ Updated ${updatedEmployees} employee document(s)\n`)

    // ========== STEP 4: UPDATE RELATED COLLECTIONS ==========
    console.log('STEP 4: UPDATING RELATED COLLECTIONS')
    console.log('='.repeat(80))

    // Update ProductCompany - companyId references
    const productCompanies = await db.collection('productcompanies').find({}).toArray()
    let updatedPC = 0
    for (const pc of productCompanies) {
      if (pc.companyId) {
        const company = companies.find(c => c._id.toString() === pc.companyId.toString())
        if (company) {
          const oldCompanyId = String(company.id)
          const newCompanyId = companyIdMap.get(oldCompanyId)?.newId
          if (newCompanyId) {
            // Find company by new ID to get new _id
            const newCompany = await db.collection('companies').findOne({ id: newCompanyId })
            if (newCompany) {
              await db.collection('productcompanies').updateOne(
                { _id: pc._id },
                { $set: { companyId: newCompany._id } }
              )
              updatedPC++
            }
          }
        }
      }
    }
    console.log(`✅ Updated ${updatedPC} ProductCompany reference(s)`)

    // Update ProductVendor - productId references
    const productVendors = await db.collection('productvendors').find({}).toArray()
    let updatedPV = 0
    for (const pv of productVendors) {
      if (pv.productId) {
        const uniform = uniforms.find(u => u._id.toString() === pv.productId.toString())
        if (uniform) {
          const oldUniformId = String(uniform.id)
          const newUniformId = uniformIdMap.get(oldUniformId)?.newId
          if (newUniformId) {
            const newUniform = await db.collection('uniforms').findOne({ id: newUniformId })
            if (newUniform) {
              await db.collection('productvendors').updateOne(
                { _id: pv._id },
                { $set: { productId: newUniform._id } }
              )
              updatedPV++
            }
          }
        }
      }
    }
    console.log(`✅ Updated ${updatedPV} ProductVendor reference(s)`)

    // Update Orders - companyId, employeeId, and items.productId references
    const orders = await db.collection('orders').find({}).toArray()
    let updatedOrders = 0
    for (const order of orders) {
      const updates = {}
      
      // Update companyId
      if (order.companyId) {
        const company = companies.find(c => c._id.toString() === order.companyId.toString())
        if (company) {
          const oldCompanyId = String(company.id)
          const newCompanyId = companyIdMap.get(oldCompanyId)?.newId
          if (newCompanyId) {
            const newCompany = await db.collection('companies').findOne({ id: newCompanyId })
            if (newCompany) updates.companyId = newCompany._id
          }
        }
      }

      // Update employeeId
      if (order.employeeId) {
        const employee = employees.find(e => e._id.toString() === order.employeeId.toString())
        if (employee) {
          const oldEmployeeId = String(employee.id || employee.employeeId)
          const newEmployeeId = employeeIdMap.get(oldEmployeeId)?.newId
          if (newEmployeeId) {
            const newEmployee = await db.collection('employees').findOne({ id: newEmployeeId })
            if (newEmployee) updates.employeeId = newEmployee._id
          }
        }
      }

      // Update items.productId
      if (order.items && Array.isArray(order.items)) {
        const updatedItems = []
        for (const item of order.items) {
          if (item.productId) {
            const uniform = uniforms.find(u => u._id.toString() === item.productId.toString())
            if (uniform) {
              const oldUniformId = String(uniform.id)
              const newUniformId = uniformIdMap.get(oldUniformId)?.newId
              if (newUniformId) {
                const newUniform = await db.collection('uniforms').findOne({ id: newUniformId })
                if (newUniform) {
                  updatedItems.push({ ...item, productId: newUniform._id })
                  continue
                }
              }
            }
          }
          updatedItems.push(item)
        }
        if (JSON.stringify(updatedItems) !== JSON.stringify(order.items)) {
          updates.items = updatedItems
        }
      }

      if (Object.keys(updates).length > 0) {
        await db.collection('orders').updateOne(
          { _id: order._id },
          { $set: updates }
        )
        updatedOrders++
      }
    }
    console.log(`✅ Updated ${updatedOrders} Order document(s)`)

    // Update Employees - companyId references
    const employeesToUpdate = await db.collection('employees').find({ companyId: { $exists: true } }).toArray()
    let updatedEmpCompany = 0
    for (const emp of employeesToUpdate) {
      if (emp.companyId) {
        const company = companies.find(c => c._id.toString() === emp.companyId.toString())
        if (company) {
          const oldCompanyId = String(company.id)
          const newCompanyId = companyIdMap.get(oldCompanyId)?.newId
          if (newCompanyId) {
            const newCompany = await db.collection('companies').findOne({ id: newCompanyId })
            if (newCompany) {
              await db.collection('employees').updateOne(
                { _id: emp._id },
                { $set: { companyId: newCompany._id } }
              )
              updatedEmpCompany++
            }
          }
        }
      }
    }
    console.log(`✅ Updated ${updatedEmpCompany} Employee companyId reference(s)`)

    // Update Uniforms - companyIds array
    const uniformsToUpdate = await db.collection('uniforms').find({ companyIds: { $exists: true, $ne: [] } }).toArray()
    let updatedUniformCompany = 0
    for (const uniform of uniformsToUpdate) {
      if (uniform.companyIds && Array.isArray(uniform.companyIds)) {
        const newCompanyIds = []
        for (const cid of uniform.companyIds) {
          const company = companies.find(c => c._id.toString() === cid.toString())
          if (company) {
            const oldCompanyId = String(company.id)
            const newCompanyId = companyIdMap.get(oldCompanyId)?.newId
            if (newCompanyId) {
              const newCompany = await db.collection('companies').findOne({ id: newCompanyId })
              if (newCompany && newCompany._id) {
                newCompanyIds.push(newCompany._id)
              }
            }
          } else {
            newCompanyIds.push(cid)
          }
        }
        
        if (JSON.stringify(newCompanyIds) !== JSON.stringify(uniform.companyIds)) {
          await db.collection('uniforms').updateOne(
            { _id: uniform._id },
            { $set: { companyIds: newCompanyIds } }
          )
          updatedUniformCompany++
        }
      }
    }
    console.log(`✅ Updated ${updatedUniformCompany} Uniform companyIds reference(s)\n`)

    // ========== VERIFICATION ==========
    console.log('='.repeat(80))
    console.log('VERIFICATION')
    console.log('='.repeat(80))

    // Verify companies
    const companiesAfter = await db.collection('companies').find({}).toArray()
    const nonNumericCompanies = companiesAfter.filter(c => !/^\d{6}$/.test(String(c.id)))
    console.log(`Companies: ${companiesAfter.length} total, ${nonNumericCompanies.length} non-numeric`)

    // Verify uniforms
    const uniformsAfter = await db.collection('uniforms').find({}).toArray()
    const nonNumericUniforms = uniformsAfter.filter(u => !/^\d{6}$/.test(String(u.id)))
    console.log(`Uniforms: ${uniformsAfter.length} total, ${nonNumericUniforms.length} non-numeric`)

    // Verify employees
    const employeesAfter = await db.collection('employees').find({}).toArray()
    const nonNumericEmployees = employeesAfter.filter(e => !/^\d{6}$/.test(String(e.id)) || !/^\d{6}$/.test(String(e.employeeId)))
    console.log(`Employees: ${employeesAfter.length} total, ${nonNumericEmployees.length} non-numeric`)

    if (nonNumericCompanies.length === 0 && nonNumericUniforms.length === 0 && nonNumericEmployees.length === 0) {
      console.log('\n✅ SUCCESS: All IDs are now 6-digit numeric!')
    } else {
      console.log('\n⚠️  WARNING: Some IDs are still non-numeric')
    }

    await mongoose.disconnect()
    console.log('\n✅ Disconnected from MongoDB')
    console.log('\n🎉 Migration complete!')
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

migrateAllIds()

