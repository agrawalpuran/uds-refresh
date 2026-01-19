/**
 * Migration script to migrate data from local MongoDB to MongoDB Atlas
 * 
 * Usage:
 *   MONGODB_URI_LOCAL="mongodb://localhost:27017/uniform-distribution" \
 *   MONGODB_URI_ATLAS="mongodb+srv://user:pass@cluster.mongodb.net/uniform-distribution" \
 *   node scripts/migrate-to-atlas.js
 */

const mongoose = require('mongoose')

const MONGODB_URI_LOCAL = process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/uniform-distribution'
const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS

if (!MONGODB_URI_ATLAS) {
  console.error('❌ Error: MONGODB_URI_ATLAS environment variable is required')
  console.error('Usage: MONGODB_URI_ATLAS="your-atlas-connection-string" node scripts/migrate-to-atlas.js')
  process.exit(1)
}

async function migrateToAtlas() {
  let localConn = null
  let atlasConn = null

  try {
    console.log('🚀 Starting migration to MongoDB Atlas...')
    console.log('📡 Connecting to local database...')
    
    // Connect to local database
    localConn = await mongoose.createConnection(MONGODB_URI_LOCAL).asPromise()
    console.log('✅ Connected to local database')

    // Import schemas
    const UniformSchema = require('../lib/models/Uniform').default.schema
    const VendorSchema = require('../lib/models/Vendor').default.schema
    const CompanySchema = require('../lib/models/Company').default.schema
    const EmployeeSchema = require('../lib/models/Employee').default.schema
    const OrderSchema = require('../lib/models/Order').default.schema
    const CompanyAdminSchema = require('../lib/models/CompanyAdmin').default.schema
    const { ProductCompany, ProductVendor, VendorCompany } = require('../lib/models/Relationship')

    // Create models for local
    const UniformLocal = localConn.model('Uniform', UniformSchema)
    const VendorLocal = localConn.model('Vendor', VendorSchema)
    const CompanyLocal = localConn.model('Company', CompanySchema)
    const EmployeeLocal = localConn.model('Employee', EmployeeSchema)
    const OrderLocal = localConn.model('Order', OrderSchema)
    const CompanyAdminLocal = localConn.model('CompanyAdmin', CompanyAdminSchema)
    const ProductCompanyLocal = localConn.model('ProductCompany', ProductCompany.schema)
    const ProductVendorLocal = localConn.model('ProductVendor', ProductVendor.schema)
    const VendorCompanyLocal = localConn.model('VendorCompany', VendorCompany.schema)

    console.log('📡 Connecting to MongoDB Atlas...')
    
    // Connect to Atlas
    atlasConn = await mongoose.createConnection(MONGODB_URI_ATLAS).asPromise()
    console.log('✅ Connected to MongoDB Atlas')

    // Create models for Atlas
    const UniformAtlas = atlasConn.model('Uniform', UniformSchema)
    const VendorAtlas = atlasConn.model('Vendor', VendorSchema)
    const CompanyAtlas = atlasConn.model('Company', CompanySchema)
    const EmployeeAtlas = atlasConn.model('Employee', EmployeeSchema)
    const OrderAtlas = atlasConn.model('Order', OrderSchema)
    const CompanyAdminAtlas = atlasConn.model('CompanyAdmin', CompanyAdminSchema)
    const ProductCompanyAtlas = atlasConn.model('ProductCompany', ProductCompany.schema)
    const ProductVendorAtlas = atlasConn.model('ProductVendor', ProductVendor.schema)
    const VendorCompanyAtlas = atlasConn.model('VendorCompany', VendorCompany.schema)

    // Clear existing data in Atlas (optional - comment out if you want to keep existing data)
    console.log('🗑️  Clearing existing data in Atlas...')
    await UniformAtlas.deleteMany({})
    await VendorAtlas.deleteMany({})
    await CompanyAtlas.deleteMany({})
    await EmployeeAtlas.deleteMany({})
    await OrderAtlas.deleteMany({})
    await CompanyAdminAtlas.deleteMany({})
    await ProductCompanyAtlas.deleteMany({})
    await ProductVendorAtlas.deleteMany({})
    await VendorCompanyAtlas.deleteMany({})
    console.log('✅ Cleared existing data')

    // Migrate data
    const collections = [
      { name: 'Uniforms', local: UniformLocal, atlas: UniformAtlas },
      { name: 'Vendors', local: VendorLocal, atlas: VendorAtlas },
      { name: 'Companies', local: CompanyLocal, atlas: CompanyAtlas },
      { name: 'Employees', local: EmployeeLocal, atlas: EmployeeAtlas },
      { name: 'Orders', local: OrderLocal, atlas: OrderAtlas },
      { name: 'CompanyAdmins', local: CompanyAdminLocal, atlas: CompanyAdminAtlas },
      { name: 'ProductCompanies', local: ProductCompanyLocal, atlas: ProductCompanyAtlas },
      { name: 'ProductVendors', local: ProductVendorLocal, atlas: ProductVendorAtlas },
      { name: 'VendorCompanies', local: VendorCompanyLocal, atlas: VendorCompanyAtlas },
    ]

    for (const { name, local, atlas } of collections) {
      console.log(`📦 Migrating ${name}...`)
      const docs = await local.find({}).lean()
      if (docs.length > 0) {
        // Remove _id to let MongoDB generate new ones, but preserve the 'id' field
        const docsToInsert = docs.map(doc => {
          const { _id, ...rest } = doc
          return rest
        })
        await atlas.insertMany(docsToInsert)
        console.log(`✅ Migrated ${docs.length} ${name}`)
      } else {
        console.log(`⚠️  No ${name} to migrate`)
      }
    }

    console.log('')
    console.log('🎉 Migration completed successfully!')
    console.log('')
    console.log('📊 Summary:')
    for (const { name, atlas } of collections) {
      const count = await atlas.countDocuments({})
      console.log(`   ${name}: ${count} documents`)
    }

  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  } finally {
    // Close connections
    if (localConn) {
      await localConn.close()
      console.log('🔌 Closed local database connection')
    }
    if (atlasConn) {
      await atlasConn.close()
      console.log('🔌 Closed Atlas database connection')
    }
  }
}

// Run migration
migrateToAtlas()
  .then(() => {
    console.log('✅ Migration script completed')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error)
    process.exit(1)
  })

