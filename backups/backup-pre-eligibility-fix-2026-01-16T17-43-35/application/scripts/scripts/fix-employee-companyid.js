/**
 * Fix script to repair employee companyId references
 * Matches employees to companies and updates invalid companyId references
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Load environment variables
let MONGODB_URI = process.env.MONGODB_URI
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'

if (!MONGODB_URI) {
  try {
    const envPath = path.join(__dirname, '..', '.env.local')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8')
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch) {
        MONGODB_URI = mongoMatch[1].trim()
      }
      const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
      if (keyMatch) {
        ENCRYPTION_KEY = keyMatch[1].trim()
      }
    }
  } catch (error) {
    console.error('Could not read .env.local file')
  }
}

if (!MONGODB_URI) {
  console.error('❌ Error: MONGODB_URI environment variable is required')
  console.error('Set it in env.local file or as environment variable')
  process.exit(1)
}

// Decrypt function
function decrypt(text) {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift(), 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

async function fixEmployeeCompanyId() {
  try {
    console.log('🔧 Fixing Employee companyId References')
    console.log('='.repeat(60))
    console.log('')
    
    // Connect to MongoDB
    console.log('📡 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    })
    console.log('✅ Connected to MongoDB')
    console.log(`   Database: ${mongoose.connection.db.databaseName}`)
    console.log('')
    
    const db = mongoose.connection.db
    
    // Get all companies and create lookup maps
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`📊 Found ${companies.length} companies`)
    
    // Create lookup maps
    const companyById = {} // id -> company
    const companyByObjectId = {} // _id -> company
    const companyByName = {} // name (lowercase) -> company
    
    for (const company of companies) {
      if (company.id) {
        companyById[company.id] = company
      }
      companyByObjectId[company._id.toString()] = company
      if (company.name) {
        companyByName[company.name.toLowerCase().trim()] = company
      }
    }
    
    console.log(`   Companies with id field: ${Object.keys(companyById).length}`)
    console.log('')
    
    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Found ${employees.length} employees`)
    console.log('')
    
    // Find employees with issues
    let fixedCount = 0
    let skippedCount = 0
    const issues = []
    
    for (const employee of employees) {
      if (!employee.companyId) {
        // Employee has no companyId - try to find by company name in employee data
        // This is a fallback - we can't always determine company from employee data
        issues.push({
          employee: employee.id,
          email: employee.email,
          issue: 'No companyId',
          action: 'skipped'
        })
        skippedCount++
        continue
      }
      
      const companyIdStr = employee.companyId.toString()
      
      // Check if it's already a numeric ID
      if (/^\d{6}$/.test(companyIdStr)) {
        // It's already a numeric ID - check if company exists
        if (companyById[companyIdStr]) {
          // Valid numeric ID - no fix needed
          continue
        } else {
          // Invalid numeric ID - company doesn't exist
          issues.push({
            employee: employee.id,
            email: employee.email,
            companyId: companyIdStr,
            issue: 'Invalid numeric companyId',
            action: 'needs_manual_fix'
          })
          skippedCount++
          continue
        }
      }
      
      // Check if it's an ObjectId
      if (/^[0-9a-fA-F]{24}$/.test(companyIdStr)) {
        const company = companyByObjectId[companyIdStr]
        
        if (!company) {
          // ObjectId doesn't match any company - try to match by email domain
          let matchedCompany = null
          let matchReason = ''
          
          try {
            const decryptedEmail = decrypt(employee.email || '')
            if (decryptedEmail && decryptedEmail.includes('@')) {
              const emailDomain = decryptedEmail.toLowerCase()
              
              // Match by email domain
              if (emailDomain.includes('@goindigo.in')) {
                matchedCompany = companies.find(c => 
                  c.name && c.name.toLowerCase().includes('indigo')
                )
                if (matchedCompany) matchReason = 'Matched by email domain (@goindigo.in → IndiGo)'
              } else if (emailDomain.includes('@icicibank.com')) {
                matchedCompany = companies.find(c => 
                  c.name && c.name.toLowerCase().includes('icici')
                )
                if (matchedCompany) matchReason = 'Matched by email domain (@icicibank.com → ICICI Bank)'
              } else if (emailDomain.includes('@akasaair.com')) {
                matchedCompany = companies.find(c => 
                  c.name && c.name.toLowerCase().includes('akasa')
                )
                if (matchedCompany) matchReason = 'Matched by email domain (@akasaair.com → Akasa Air)'
              }
            }
          } catch (error) {
            // Decryption failed, skip email matching
          }
          
          if (matchedCompany && matchedCompany.id) {
            // Found company by email domain - update employee
            try {
              await db.collection('employees').updateOne(
                { _id: employee._id },
                { $set: { companyId: matchedCompany.id } }
              )
              
              console.log(`✅ Fixed: Employee ${employee.id}`)
              console.log(`   ${matchReason}`)
              console.log(`   Updated companyId: ${companyIdStr} → ${matchedCompany.id} (${matchedCompany.name})`)
              fixedCount++
              continue
            } catch (error) {
              console.error(`❌ Error fixing employee ${employee.id}:`, error.message)
            }
          }
          
          // No match found
          issues.push({
            employee: employee.id,
            email: employee.email,
            companyId: companyIdStr,
            issue: 'ObjectId does not match any company and could not match by email domain',
            action: 'needs_manual_fix'
          })
          skippedCount++
          continue
        }
        
        if (!company.id) {
          // Company exists but missing id field
          issues.push({
            employee: employee.id,
            email: employee.email,
            companyId: companyIdStr,
            companyName: company.name,
            issue: 'Company missing id field',
            action: 'run_fix_company_ids_first'
          })
          skippedCount++
          continue
        }
        
        // Company exists and has id field - convert ObjectId to numeric ID
        try {
          await db.collection('employees').updateOne(
            { _id: employee._id },
            { $set: { companyId: company.id } }
          )
          
          console.log(`✅ Fixed: Employee ${employee.id} (${employee.email || 'N/A'})`)
          console.log(`   Updated companyId: ${companyIdStr} → ${company.id} (${company.name})`)
          fixedCount++
        } catch (error) {
          console.error(`❌ Error fixing employee ${employee.id}:`, error.message)
          skippedCount++
        }
      }
    }
    
    console.log('')
    console.log('📋 Summary')
    console.log('='.repeat(60))
    console.log(`   Fixed: ${fixedCount} employees`)
    console.log(`   Skipped: ${skippedCount} employees`)
    console.log('')
    
    if (issues.length > 0) {
      console.log('⚠️  Issues Found:')
      const needsManualFix = issues.filter(i => i.action === 'needs_manual_fix')
      const needsCompanyIdFix = issues.filter(i => i.action === 'run_fix_company_ids_first')
      
      if (needsCompanyIdFix.length > 0) {
        console.log(`   - ${needsCompanyIdFix.length} employees need companies to have id fields first`)
        console.log('     💡 Run: node scripts/fix-company-ids.js first, then run this script again')
      }
      
      if (needsManualFix.length > 0) {
        console.log(`   - ${needsManualFix.length} employees need manual fix (invalid companyId references)`)
        console.log('     These employees have companyId values that don\'t match any company')
      }
      
      if (needsManualFix.length > 0 || needsCompanyIdFix.length > 0) {
        console.log('')
        console.log('   Sample issues:')
        issues.slice(0, 5).forEach(issue => {
          console.log(`      - Employee ${issue.employee}: ${issue.issue}`)
        })
        if (issues.length > 5) {
          console.log(`      ... and ${issues.length - 5} more`)
        }
      }
    }
    
    console.log('')
    console.log('✅ Fix complete!')
    console.log('')
    
    await mongoose.disconnect()
    console.log('✅ Disconnected from MongoDB')
    
  } catch (error) {
    console.error('❌ Error:', error)
    process.exit(1)
  }
}

fixEmployeeCompanyId()
