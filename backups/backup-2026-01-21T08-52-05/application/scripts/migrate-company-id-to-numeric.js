/**
 * Migration script to convert company IDs from string format (e.g., 'COMP-INDIGO')
 * to numeric format (e.g., 1, 2, 3)
 * 
 * This script:
 * 1. Assigns numeric IDs to each company
 * 2. Updates Company documents with numeric IDs
 * 3. Updates all code references that use company string IDs
 * 
 * Note: ObjectId references (companyId fields in Employee, Order, etc.) remain unchanged
 * as they reference the _id field, not the id field.
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')

// Try to read .env.local file manually
let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read .env.local, using default or environment variable')
}

async function migrateCompanyIdToNumeric() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('Connected to MongoDB\n')

    const db = mongoose.connection.db
    if (!db) {
      throw new Error('Database connection failed')
    }

    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`Found ${companies.length} companies\n`)

    if (companies.length === 0) {
      console.log('No companies found. Exiting.')
      await mongoose.disconnect()
      return
    }

    // Create mapping: old string ID -> new numeric ID
    const idMapping = new Map()
    let nextNumericId = 1

    // Sort companies by name for consistent ordering
    companies.sort((a, b) => (a.name || '').localeCompare(b.name || ''))

    for (const company of companies) {
      const oldId = company.id
      const newId = nextNumericId++
      idMapping.set(oldId, newId)
      idMapping.set(company._id.toString(), newId) // Also map by ObjectId string
      console.log(`Mapping: ${oldId} -> ${newId} (${company.name})`)
    }

    console.log(`\nCreated ${idMapping.size / 2} ID mappings\n`)

    // Step 1: Update Company documents
    console.log('Step 1: Updating Company documents...')
    let companyUpdateCount = 0
    for (const company of companies) {
      const newId = idMapping.get(company.id)
      if (newId) {
        await db.collection('companies').updateOne(
          { _id: company._id },
          { $set: { id: newId } }
        )
        console.log(`✓ Updated company ${company.name}: ${company.id} -> ${newId}`)
        companyUpdateCount++
      }
    }
    console.log(`Updated ${companyUpdateCount} companies\n`)

    // Step 2: Check for any code references that might need updating
    // (This is informational - actual code changes need to be done manually)
    console.log('Step 2: Checking for references in data...\n')

    // Note: The following collections use ObjectId references (companyId field),
    // which reference _id, not id, so they don't need updating:
    // - employees.companyId (ObjectId)
    // - orders.companyId (ObjectId)
    // - productcompanies.companyId (ObjectId)
    // - designationproducteligibilities.companyId (ObjectId)
    // - branches.companyId (ObjectId)
    // - uniforms.companyIds (Array of ObjectIds)

    // However, we should check if any documents store the string ID anywhere
    console.log('Checking for string ID references in other collections...\n')

    // Check employees for any string ID references (unlikely, but check)
    const employees = await db.collection('employees').find({}).toArray()
    let employeeCheckCount = 0
    for (const emp of employees) {
      // Check if companyName matches any old ID (unlikely but possible)
      const companyName = emp.companyName
      if (companyName && idMapping.has(companyName)) {
        console.log(`⚠️  Employee ${emp.id || emp.employeeId}: companyName "${companyName}" matches old company ID`)
        employeeCheckCount++
      }
    }
    if (employeeCheckCount === 0) {
      console.log('✓ No employees have companyName matching old company IDs')
    }

    // Verify the migration
    console.log('\n=== VERIFICATION ===')
    const updatedCompanies = await db.collection('companies').find({}).toArray()
    console.log('\nUpdated companies:')
    for (const company of updatedCompanies) {
      const isNumeric = typeof company.id === 'number' || /^\d+$/.test(String(company.id))
      const status = isNumeric ? '✓' : '✗'
      console.log(`  ${status} ${company.name}: id = ${company.id} (type: ${typeof company.id})`)
    }

    // Print summary
    console.log('\n=== MIGRATION SUMMARY ===')
    console.log(`Total companies: ${companies.length}`)
    console.log(`Companies updated: ${companyUpdateCount}`)
    console.log(`\nID Mappings:`)
    for (const [oldId, newId] of Array.from(idMapping.entries()).slice(0, idMapping.size / 2)) {
      const company = companies.find(c => c.id === oldId || c._id.toString() === oldId)
      console.log(`  ${oldId} -> ${newId} (${company?.name || 'Unknown'})`)
    }

    console.log('\n=== IMPORTANT NOTES ===')
    console.log('1. Company.id field is now numeric')
    console.log('2. ObjectId references (companyId fields) in other collections remain unchanged')
    console.log('3. You need to update the Company model schema to use Number type for id field')
    console.log('4. Update all code that uses company.id to handle numeric values')
    console.log('5. Update API endpoints and frontend code that reference company string IDs')

    await mongoose.disconnect()
    console.log('\nDisconnected from MongoDB')
    console.log('\nMigration completed successfully!')
  } catch (error) {
    console.error('Error during migration:', error)
    process.exit(1)
  }
}

// Run migration
migrateCompanyIdToNumeric()

