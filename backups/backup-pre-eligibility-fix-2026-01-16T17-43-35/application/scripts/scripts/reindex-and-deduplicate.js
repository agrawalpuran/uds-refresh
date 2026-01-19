const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Encryption utility (simplified for script use)
let decrypt = null
try {
  const encryptionPath = path.join(__dirname, '..', 'lib', 'utils', 'encryption.ts')
  const encryptionJsPath = path.join(__dirname, '..', 'lib', 'utils', 'encryption.js')
  if (fs.existsSync(encryptionJsPath)) {
    const encryption = require(encryptionJsPath)
    decrypt = encryption.decrypt
  }
} catch (e) {
  console.warn('⚠️  Encryption utility not available, email normalization will be limited')
}

// Read .env.local to get connection string
function getMongoUri() {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/MONGODB_URI=(.+)/)
    if (match) {
      return match[1].trim()
    }
  }
  return process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
}

const MONGODB_URI = getMongoUri()

// Helper to decrypt email for comparison
function tryDecryptEmail(encryptedEmail) {
  try {
    if (!encryptedEmail || typeof encryptedEmail !== 'string') return encryptedEmail
    if (!encryptedEmail.includes(':')) return encryptedEmail // Not encrypted
    return decrypt(encryptedEmail)
  } catch (e) {
    return encryptedEmail // Return original if decryption fails
  }
}

// Helper to normalize email for comparison
function normalizeEmail(email) {
  if (!email) return null
  const decrypted = tryDecryptEmail(email)
  return decrypted ? decrypted.trim().toLowerCase() : null
}

// Helper to normalize phone for comparison
function normalizePhone(phone) {
  if (!phone) return null
  try {
    const decrypted = tryDecryptEmail(phone) // Reuse decrypt function
    return decrypted ? decrypted.replace(/\D/g, '') : null // Remove non-digits
  } catch (e) {
    return phone ? phone.replace(/\D/g, '') : null
  }
}

async function detectDuplicates(collection, uniqueFields, options = {}) {
  const db = mongoose.connection.db
  const coll = db.collection(collection)
  const { normalizeFn = null, groupByFn = null } = options
  
  const duplicates = []
  
  if (groupByFn) {
    // Custom grouping function
    const allDocs = await coll.find({}).toArray()
    const groups = new Map()
    
    for (const doc of allDocs) {
      const key = groupByFn(doc)
      if (key) {
        if (!groups.has(key)) {
          groups.set(key, [])
        }
        groups.get(key).push(doc)
      }
    }
    
    for (const [key, docs] of groups.entries()) {
      if (docs.length > 1) {
        duplicates.push({ key, docs })
      }
    }
  } else {
    // Standard field-based grouping
    for (const field of uniqueFields) {
      const pipeline = [
        { $group: { _id: `$${field}`, count: { $sum: 1 }, docs: { $push: '$$ROOT' } } },
        { $match: { count: { $gt: 1 } } }
      ]
      
      const results = await coll.aggregate(pipeline).toArray()
      
      for (const result of results) {
        if (result.docs && result.docs.length > 1) {
          duplicates.push({
            field,
            value: result._id,
            docs: result.docs
          })
        }
      }
    }
  }
  
  return duplicates
}

async function deduplicateEmployees(db) {
  console.log('\n📋 Processing: employees')
  const coll = db.collection('employees')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  // Check duplicates by id
  const idDups = await detectDuplicates('employees', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  // Check duplicates by employeeId
  const empIdDups = await detectDuplicates('employees', ['employeeId'])
  console.log(`   Duplicates by employeeId: ${empIdDups.length} groups`)
  
  // Check duplicates by email (normalized)
  const allEmployees = await coll.find({}).toArray()
  const emailGroups = new Map()
  
  for (const emp of allEmployees) {
    const normalizedEmail = normalizeEmail(emp.email)
    if (normalizedEmail) {
      if (!emailGroups.has(normalizedEmail)) {
        emailGroups.set(normalizedEmail, [])
      }
      emailGroups.get(normalizedEmail).push(emp)
    }
  }
  
  const emailDups = Array.from(emailGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([email, docs]) => ({ field: 'email', value: email, docs }))
  
  console.log(`   Duplicates by email (normalized): ${emailDups.length} groups`)
  
  // Deduplicate
  let removed = 0
  
  // Remove duplicates by id (keep most recent)
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const keep = docs[0]
    const remove = docs.slice(1)
    
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  // Remove duplicates by employeeId (keep most recent)
  for (const dup of empIdDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const keep = docs[0]
    const remove = docs.slice(1)
    
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  // Remove duplicates by email (keep most recent)
  for (const dup of emailDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const keep = docs[0]
    const remove = docs.slice(1)
    
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate employee(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  // Reindex
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateCompanies(db) {
  console.log('\n📋 Processing: companies')
  const coll = db.collection('companies')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('companies', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  let removed = 0
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate company/companies`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateVendors(db) {
  console.log('\n📋 Processing: vendors')
  const coll = db.collection('vendors')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('vendors', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  const emailDups = await detectDuplicates('vendors', ['email'])
  console.log(`   Duplicates by email: ${emailDups.length} groups`)
  
  let removed = 0
  for (const dup of [...idDups, ...emailDups]) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate vendor(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateUniforms(db) {
  console.log('\n📋 Processing: uniforms')
  const coll = db.collection('uniforms')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('uniforms', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  const skuDups = await detectDuplicates('uniforms', ['sku'])
  console.log(`   Duplicates by sku: ${skuDups.length} groups`)
  
  let removed = 0
  for (const dup of [...idDups, ...skuDups]) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate uniform(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateOrders(db) {
  console.log('\n📋 Processing: orders')
  const coll = db.collection('orders')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('orders', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  let removed = 0
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate order(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateVendorInventories(db) {
  console.log('\n📋 Processing: vendorinventories')
  const coll = db.collection('vendorinventories')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('vendorinventories', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  // Check compound unique: (vendorId, productId)
  const allInventories = await coll.find({}).toArray()
  const compoundGroups = new Map()
  
  for (const inv of allInventories) {
    const key = `${inv.vendorId}_${inv.productId}`
    if (!compoundGroups.has(key)) {
      compoundGroups.set(key, [])
    }
    compoundGroups.get(key).push(inv)
  }
  
  const compoundDups = Array.from(compoundGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ field: 'vendorId+productId', value: key, docs }))
  
  console.log(`   Duplicates by (vendorId, productId): ${compoundDups.length} groups`)
  
  let removed = 0
  
  // Remove duplicates by id
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  // Remove compound duplicates (keep most recent, merge inventory if needed)
  for (const dup of compoundDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const keep = docs[0]
    const remove = docs.slice(1)
    
    // Merge sizeInventory from duplicates into keep
    for (const doc of remove) {
      if (doc.sizeInventory && typeof doc.sizeInventory === 'object') {
        const removeInv = doc.sizeInventory instanceof Map 
          ? Object.fromEntries(doc.sizeInventory)
          : doc.sizeInventory
        const keepInv = keep.sizeInventory instanceof Map
          ? Object.fromEntries(keep.sizeInventory)
          : keep.sizeInventory || {}
        
        for (const [size, qty] of Object.entries(removeInv)) {
          keepInv[size] = (keepInv[size] || 0) + (qty || 0)
        }
        
        keep.sizeInventory = keepInv
        keep.totalStock = Object.values(keepInv).reduce((sum, qty) => sum + (qty || 0), 0)
      }
      
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
    
    // Update the kept document with merged inventory
    await coll.updateOne(
      { _id: keep._id },
      { 
        $set: { 
          sizeInventory: keep.sizeInventory,
          totalStock: keep.totalStock,
          updatedAt: new Date()
        }
      }
    )
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate inventory record(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateReturnRequests(db) {
  console.log('\n📋 Processing: returnrequests')
  const coll = db.collection('returnrequests')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('returnrequests', ['returnRequestId'])
  console.log(`   Duplicates by returnRequestId: ${idDups.length} groups`)
  
  let removed = 0
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate return request(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateCompanyAdmins(db) {
  console.log('\n📋 Processing: companyadmins')
  const coll = db.collection('companyadmins')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  // Check compound unique: (companyId, employeeId)
  const allAdmins = await coll.find({}).toArray()
  const compoundGroups = new Map()
  
  for (const admin of allAdmins) {
    const key = `${admin.companyId}_${admin.employeeId}`
    if (!compoundGroups.has(key)) {
      compoundGroups.set(key, [])
    }
    compoundGroups.get(key).push(admin)
  }
  
  const compoundDups = Array.from(compoundGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ field: 'companyId+employeeId', value: key, docs }))
  
  console.log(`   Duplicates by (companyId, employeeId): ${compoundDups.length} groups`)
  
  let removed = 0
  for (const dup of compoundDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate admin record(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateLocationAdmins(db) {
  console.log('\n📋 Processing: locationadmins')
  const coll = db.collection('locationadmins')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  // Check compound unique: (locationId, employeeId)
  const allAdmins = await coll.find({}).toArray()
  const compoundGroups = new Map()
  
  for (const admin of allAdmins) {
    const key = `${admin.locationId}_${admin.employeeId}`
    if (!compoundGroups.has(key)) {
      compoundGroups.set(key, [])
    }
    compoundGroups.get(key).push(admin)
  }
  
  const compoundDups = Array.from(compoundGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ field: 'locationId+employeeId', value: key, docs }))
  
  console.log(`   Duplicates by (locationId, employeeId): ${compoundDups.length} groups`)
  
  let removed = 0
  for (const dup of compoundDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate admin record(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateDesignationEligibilities(db) {
  console.log('\n📋 Processing: designationproducteligibilities')
  const coll = db.collection('designationproducteligibilities')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  const idDups = await detectDuplicates('designationproducteligibilities', ['id'])
  console.log(`   Duplicates by id: ${idDups.length} groups`)
  
  let removed = 0
  for (const dup of idDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate eligibility record(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateProductCompanies(db) {
  console.log('\n📋 Processing: productcompanies')
  const coll = db.collection('productcompanies')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  // Check compound unique: (productId, companyId)
  const allLinks = await coll.find({}).toArray()
  const compoundGroups = new Map()
  
  for (const link of allLinks) {
    const productId = link.productId?.toString() || link.productId
    const companyId = link.companyId?.toString() || link.companyId
    const key = `${productId}_${companyId}`
    if (!compoundGroups.has(key)) {
      compoundGroups.set(key, [])
    }
    compoundGroups.get(key).push(link)
  }
  
  const compoundDups = Array.from(compoundGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ field: 'productId+companyId', value: key, docs }))
  
  console.log(`   Duplicates by (productId, companyId): ${compoundDups.length} groups`)
  
  let removed = 0
  for (const dup of compoundDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate relationship(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function deduplicateProductVendors(db) {
  console.log('\n📋 Processing: productvendors')
  const coll = db.collection('productvendors')
  const total = await coll.countDocuments()
  console.log(`   Total documents: ${total}`)
  
  // Check compound unique: (productId, vendorId)
  const allLinks = await coll.find({}).toArray()
  const compoundGroups = new Map()
  
  for (const link of allLinks) {
    const productId = link.productId?.toString() || link.productId
    const vendorId = link.vendorId?.toString() || link.vendorId
    const key = `${productId}_${vendorId}`
    if (!compoundGroups.has(key)) {
      compoundGroups.set(key, [])
    }
    compoundGroups.get(key).push(link)
  }
  
  const compoundDups = Array.from(compoundGroups.entries())
    .filter(([_, docs]) => docs.length > 1)
    .map(([key, docs]) => ({ field: 'productId+vendorId', value: key, docs }))
  
  console.log(`   Duplicates by (productId, vendorId): ${compoundDups.length} groups`)
  
  let removed = 0
  for (const dup of compoundDups) {
    const docs = dup.docs.sort((a, b) => {
      const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
      const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
      return bTime - aTime
    })
    const remove = docs.slice(1)
    for (const doc of remove) {
      await coll.deleteOne({ _id: doc._id })
      removed++
    }
  }
  
  if (removed > 0) {
    console.log(`   ✅ Removed ${removed} duplicate relationship(s)`)
  } else {
    console.log(`   ✅ No duplicates found`)
  }
  
  try {
    await coll.reIndex()
    console.log(`   ✅ Reindexed collection`)
  } catch (e) {
    console.log(`   ⚠️  Reindex warning: ${e.message}`)
  }
  
  return { removed, total: await coll.countDocuments() }
}

async function reindexAllCollections(db) {
  console.log('\n🔄 Checking and rebuilding indexes for all collections...\n')
  
  const collections = await db.listCollections().toArray()
  const results = []
  
  for (const collInfo of collections) {
    const collName = collInfo.name
    const coll = db.collection(collName)
    
    try {
      console.log(`   Checking indexes: ${collName}`)
      
      // Get current indexes
      const indexes = await coll.indexes()
      const indexCount = indexes.length
      
      // Rebuild indexes using MongoDB command
      try {
        await db.command({ reIndex: collName })
        const count = await coll.countDocuments()
        results.push({ collection: collName, status: 'success', count, indexes: indexCount })
        console.log(`   ✅ ${collName} (${count} documents, ${indexCount} indexes)`)
      } catch (reindexError) {
        // If reIndex command fails, just verify indexes exist
        if (reindexError.message.includes('not supported') || reindexError.message.includes('no such command')) {
          const count = await coll.countDocuments()
          results.push({ collection: collName, status: 'verified', count, indexes: indexCount })
          console.log(`   ✅ ${collName} (${count} documents, ${indexCount} indexes - verified)`)
        } else {
          throw reindexError
        }
      }
    } catch (e) {
      results.push({ collection: collName, status: 'error', error: e.message })
      console.log(`   ⚠️  ${collName}: ${e.message}`)
    }
  }
  
  return results
}

async function main() {
  let connection = null
  
  try {
    console.log('🔄 Starting Database Reindexing & Deduplication\n')
    console.log('='.repeat(80))
    
    // Connect to MongoDB
    console.log('\n📡 Connecting to MongoDB...')
    console.log(`   URI: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}\n`)
    
    connection = await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    
    console.log('✅ Connected successfully!\n')
    
    const db = mongoose.connection.db
    console.log(`📊 Database: ${db.databaseName}\n`)
    
    // Step 1: Deduplicate critical collections
    console.log('='.repeat(80))
    console.log('STEP 1: Deduplication')
    console.log('='.repeat(80))
    
    const dedupResults = {
      employees: await deduplicateEmployees(db),
      companies: await deduplicateCompanies(db),
      vendors: await deduplicateVendors(db),
      uniforms: await deduplicateUniforms(db),
      orders: await deduplicateOrders(db),
      vendorinventories: await deduplicateVendorInventories(db),
      returnrequests: await deduplicateReturnRequests(db),
      companyadmins: await deduplicateCompanyAdmins(db),
      locationadmins: await deduplicateLocationAdmins(db),
      designationproducteligibilities: await deduplicateDesignationEligibilities(db),
      productcompanies: await deduplicateProductCompanies(db),
      productvendors: await deduplicateProductVendors(db),
    }
    
    // Step 2: Reindex all collections
    console.log('\n' + '='.repeat(80))
    console.log('STEP 2: Reindexing All Collections')
    console.log('='.repeat(80))
    
    const reindexResults = await reindexAllCollections(db)
    
    // Summary
    console.log('\n' + '='.repeat(80))
    console.log('📊 SUMMARY')
    console.log('='.repeat(80))
    
    let totalRemoved = 0
    for (const [collection, result] of Object.entries(dedupResults)) {
      totalRemoved += result.removed
      if (result.removed > 0) {
        console.log(`   ${collection.padEnd(35)} Removed: ${result.removed.toString().padStart(3)} | Final: ${result.total.toString().padStart(3)}`)
      }
    }
    
    if (totalRemoved === 0) {
      console.log('\n   ✅ No duplicates found in any collection')
    } else {
      console.log(`\n   ✅ Total duplicates removed: ${totalRemoved}`)
    }
    
    const successReindex = reindexResults.filter(r => r.status === 'success').length
    const errorReindex = reindexResults.filter(r => r.status === 'error').length
    
    console.log(`\n   ✅ Reindexed: ${successReindex} collection(s)`)
    if (errorReindex > 0) {
      console.log(`   ⚠️  Reindex errors: ${errorReindex} collection(s)`)
    }
    
    console.log('\n✅ Database reindexing and deduplication completed successfully!')
    console.log('\n💡 Next steps:')
    console.log('   1. Restart your application server')
    console.log('   2. Test login and critical flows')
    console.log('   3. Verify inventory numbers are accurate')
    console.log('   4. Check that orders and replacements reconcile correctly')
    
  } catch (error) {
    console.error('\n❌ Operation failed:')
    console.error(`   ${error.message}`)
    console.error(error.stack)
    process.exit(1)
  } finally {
    if (connection) {
      await mongoose.connection.close()
      console.log('\n🔌 Database connection closed.')
    }
  }
}

// Run the script
main().catch(console.error)

