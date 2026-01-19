/**
 * CRITICAL DATA OPERATION — PURGE ALL ORDERS AND RESET EMPLOYEE ELIGIBILITY
 * 
 * This script:
 * 1. Deletes ALL orders from the database
 * 2. Resets ALL employee eligibility based on their designation eligibility rules
 * 
 * WARNING: This is a DESTRUCTIVE operation.
 * - All orders will be permanently deleted
 * - All employee eligibility will be reset based on current designation eligibility configuration
 */

const { MongoClient, ObjectId } = require('mongodb')
const fs = require('fs')
const path = require('path')

// Try to load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local')
let MONGODB_URI = 'mongodb://localhost:27017/uniform-distribution'

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8')
  const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
  if (mongoMatch) {
    MONGODB_URI = mongoMatch[1].trim()
  }
}

// Override with process.env if available
MONGODB_URI = process.env.MONGODB_URI || MONGODB_URI

// Import encryption utility
let decrypt
try {
  const encryptionModule = require('../lib/utils/encryption')
  decrypt = encryptionModule.decrypt
} catch (error) {
  console.warn('⚠️  Could not load encryption utility. Designation decryption may fail.')
  decrypt = (str) => str // Fallback: return as-is
}

// Helper function to normalize category names
function normalizeCategoryName(categoryName) {
  if (!categoryName) return ''
  const normalized = categoryName.trim().toLowerCase()
  
  // Map variations to standard names
  if (normalized === 'trouser' || normalized === 'trousers') return 'pant'
  if (normalized === 'blazer') return 'jacket'
  
  return normalized
}

// Helper function to convert renewal frequency to months
function convertToMonths(itemElig) {
  if (!itemElig) return 6 // Default
  
  const { renewalFrequency, renewalUnit } = itemElig
  if (!renewalFrequency) return 6
  
  if (renewalUnit === 'years') {
    return renewalFrequency * 12
  }
  return renewalFrequency || 6
}

async function purgeOrdersAndResetEligibility() {
  const client = new MongoClient(MONGODB_URI)
  
  try {
    await client.connect()
    console.log('✅ Connected to MongoDB')
    
    const db = client.db()
    
    // ============================================================
    // PART 1: PURGE ALL ORDERS
    // ============================================================
    console.log('\n📦 PART 1: Purging all orders...')
    
    const ordersCollection = db.collection('orders')
    const totalOrders = await ordersCollection.countDocuments({})
    console.log(`   Total orders found: ${totalOrders}`)
    
    if (totalOrders > 0) {
      console.log('\n⚠️  WARNING: This will delete ALL orders permanently!')
      console.log('   Press Ctrl+C to cancel, or wait 10 seconds to proceed...')
      await new Promise(resolve => setTimeout(resolve, 10000))
      
      console.log('\n🗑️  Deleting all orders...')
      const deleteResult = await ordersCollection.deleteMany({})
      console.log(`   ✅ Deleted ${deleteResult.deletedCount} orders`)
      
      // Verify deletion
      const remainingOrders = await ordersCollection.countDocuments({})
      if (remainingOrders === 0) {
        console.log('   ✅ All orders have been deleted')
      } else {
        console.log(`   ⚠️  Warning: ${remainingOrders} orders still remain`)
      }
    } else {
      console.log('   ✅ No orders found. Nothing to delete.')
    }
    
    // ============================================================
    // PART 2: RESET EMPLOYEE ELIGIBILITY BASED ON DESIGNATION
    // ============================================================
    console.log('\n👥 PART 2: Resetting employee eligibility based on designation...')
    
    // Get all active employees
    const employeesCollection = db.collection('employees')
    const allEmployees = await employeesCollection.find({ status: 'active' })
      .project({ _id: 1, id: 1, employeeId: 1, companyId: 1, designation: 1, gender: 1 })
      .toArray()
    
    console.log(`   Total active employees: ${allEmployees.length}`)
    
    if (allEmployees.length === 0) {
      console.log('   ✅ No employees found. Nothing to reset.')
      return
    }
    
    // Get all companies
    const companiesCollection = db.collection('companies')
    const companies = await companiesCollection.find({})
      .project({ _id: 1, id: 1, name: 1 })
      .toArray()
    
    const companyMap = new Map()
    companies.forEach(company => {
      companyMap.set(company._id.toString(), company)
    })
    
    // Get all active designation subcategory eligibilities
    const eligibilitiesCollection = db.collection('designationsubcategoryeligibilities')
    const allEligibilities = await eligibilitiesCollection.find({ status: 'active' }).toArray()
    
    console.log(`   Total active designation eligibilities: ${allEligibilities.length}`)
    
    // Get all subcategories
    const subcategoriesCollection = db.collection('subcategories')
    const allSubcategories = await subcategoriesCollection.find({}).toArray()
    
    // Get all categories
    const categoriesCollection = db.collection('productcategories')
    const allCategories = await categoriesCollection.find({}).toArray()
    
    const categoryMap = new Map()
    allCategories.forEach(cat => {
      categoryMap.set(cat._id.toString(), cat)
    })
    
    const subcategoryCategoryMap = new Map()
    allSubcategories.forEach(sub => {
      const categoryId = sub.parentCategoryId?.toString()
      const category = categoryMap.get(categoryId)
      const categoryName = category?.name || ''
      subcategoryCategoryMap.set(sub._id.toString(), normalizeCategoryName(categoryName))
    })
    
    // Group eligibilities by company, designation, and gender
    const eligibilityMap = new Map() // key: `${companyId}_${designation}_${gender}`
    
    for (const elig of allEligibilities) {
      const companyId = elig.companyId?.toString()
      const designation = elig.designationId || ''
      const gender = elig.gender || 'unisex'
      const key = `${companyId}_${designation}_${gender}`
      
      if (!eligibilityMap.has(key)) {
        eligibilityMap.set(key, [])
      }
      eligibilityMap.get(key).push(elig)
    }
    
    console.log('\n🔄 Processing employees...')
    
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    
    for (const emp of allEmployees) {
      try {
        // Get employee designation (decrypt if needed)
        let designation = emp.designation
        if (designation && typeof designation === 'string' && designation.includes(':')) {
          try {
            designation = decrypt(designation)
          } catch (error) {
            console.log(`   ⚠️  Could not decrypt designation for employee ${emp.id || emp.employeeId}`)
            // Continue with encrypted designation
          }
        }
        
        if (!designation || !designation.trim()) {
          console.log(`   ⚠️  Employee ${emp.id || emp.employeeId} has no designation. Skipping.`)
          skippedCount++
          continue
        }
        
        const normalizedDesignation = designation.trim()
        const companyId = emp.companyId?.toString()
        const gender = emp.gender || 'unisex'
        
        // Find matching eligibility
        // Try exact match first
        let matchingEligibilities = eligibilityMap.get(`${companyId}_${normalizedDesignation}_${gender}`) || []
        
        // If no exact match, try unisex
        if (matchingEligibilities.length === 0 && gender !== 'unisex') {
          matchingEligibilities = eligibilityMap.get(`${companyId}_${normalizedDesignation}_unisex`) || []
        }
        
        if (matchingEligibilities.length === 0) {
          console.log(`   ⚠️  No eligibility found for employee ${emp.id || emp.employeeId} (Designation: ${normalizedDesignation}, Gender: ${gender}). Resetting to defaults.`)
          
          // Reset to defaults if no eligibility found
          await employeesCollection.updateOne(
            { _id: emp._id },
            {
              $set: {
                eligibility: {
                  shirt: 0,
                  pant: 0,
                  shoe: 0,
                  jacket: 0
                },
                cycleDuration: {
                  shirt: 6,
                  pant: 6,
                  shoe: 6,
                  jacket: 12
                },
                eligibilityResetDates: {}
              }
            }
          )
          updatedCount++
          continue
        }
        
        // Aggregate eligibility by category
        const categoryEligibility = {
          shirt: { quantity: 0, renewalFrequency: 6 },
          pant: { quantity: 0, renewalFrequency: 6 },
          shoe: { quantity: 0, renewalFrequency: 6 },
          jacket: { quantity: 0, renewalFrequency: 12 }
        }
        
        for (const elig of matchingEligibilities) {
          const subcategoryId = elig.subCategoryId?.toString()
          const categoryName = subcategoryCategoryMap.get(subcategoryId) || ''
          const normalizedCategory = normalizeCategoryName(categoryName)
          
          const quantity = elig.quantity || 0
          // Convert renewalFrequency + renewalUnit to months
          const renewalFrequency = elig.renewalFrequency || 6
          const renewalUnit = elig.renewalUnit || 'months'
          const cycleDurationMonths = renewalUnit === 'years' ? renewalFrequency * 12 : renewalFrequency
          
          // Map to legacy categories
          if (normalizedCategory === 'shirt') {
            categoryEligibility.shirt.quantity = Math.max(categoryEligibility.shirt.quantity, quantity)
            categoryEligibility.shirt.renewalFrequency = cycleDurationMonths
          } else if (normalizedCategory === 'pant' || normalizedCategory === 'trouser') {
            categoryEligibility.pant.quantity = Math.max(categoryEligibility.pant.quantity, quantity)
            categoryEligibility.pant.renewalFrequency = cycleDurationMonths
          } else if (normalizedCategory === 'shoe') {
            categoryEligibility.shoe.quantity = Math.max(categoryEligibility.shoe.quantity, quantity)
            categoryEligibility.shoe.renewalFrequency = cycleDurationMonths
          } else if (normalizedCategory === 'jacket' || normalizedCategory === 'blazer') {
            categoryEligibility.jacket.quantity = Math.max(categoryEligibility.jacket.quantity, quantity)
            categoryEligibility.jacket.renewalFrequency = cycleDurationMonths
          }
        }
        
        // Update employee eligibility
        await employeesCollection.updateOne(
          { _id: emp._id },
          {
            $set: {
              eligibility: {
                shirt: categoryEligibility.shirt.quantity,
                pant: categoryEligibility.pant.quantity,
                shoe: categoryEligibility.shoe.quantity,
                jacket: categoryEligibility.jacket.quantity
              },
              cycleDuration: {
                shirt: categoryEligibility.shirt.renewalFrequency,
                pant: categoryEligibility.pant.renewalFrequency,
                shoe: categoryEligibility.shoe.renewalFrequency,
                jacket: categoryEligibility.jacket.renewalFrequency
              },
              eligibilityResetDates: {} // Clear reset dates
            }
          }
        )
        
        updatedCount++
        
        if (updatedCount % 10 === 0) {
          console.log(`   ✅ Updated ${updatedCount} employees...`)
        }
      } catch (error) {
        console.error(`   ❌ Error processing employee ${emp.id || emp.employeeId}:`, error.message)
        errorCount++
      }
    }
    
    console.log('\n📊 Summary:')
    console.log(`   Total employees processed: ${allEmployees.length}`)
    console.log(`   Successfully updated: ${updatedCount}`)
    console.log(`   Skipped (no designation): ${skippedCount}`)
    console.log(`   Errors: ${errorCount}`)
    
    // Verify a few employees
    console.log('\n🔍 Sample verification (checking 3 random employees)...')
    const sampleEmployees = await employeesCollection.find({ status: 'active' })
      .project({ id: 1, employeeId: 1, eligibility: 1, cycleDuration: 1 })
      .limit(3)
      .toArray()
    sampleEmployees.forEach((emp, index) => {
      console.log(`\n   Employee ${index + 1} (ID: ${emp.id || emp.employeeId}):`)
      console.log(`      eligibility: ${JSON.stringify(emp.eligibility || {})}`)
      console.log(`      cycleDuration: ${JSON.stringify(emp.cycleDuration || {})}`)
    })
    
    console.log('\n✅ Script completed successfully!')
    
  } catch (error) {
    console.error('\n❌ An error occurred:', error)
    throw error
  } finally {
    await client.close()
    console.log('\n✅ Database connection closed')
  }
}

// Run the script
purgeOrdersAndResetEligibility()
  .then(() => {
    console.log('\n✅ Script execution completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error)
    process.exit(1)
  })

