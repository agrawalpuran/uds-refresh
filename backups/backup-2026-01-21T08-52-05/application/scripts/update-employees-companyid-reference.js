/**
 * Script to update all employees' companyId to properly reference company _id from companies table
 * This ensures the companyId ObjectId in employees collection matches the _id in companies collection
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

// Encryption utility
const crypto = require('crypto')

let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim()
    }
  }
} catch (error) {
  console.log('Could not read ENCRYPTION_KEY from .env.local')
}

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

async function updateEmployeesCompanyIdReference() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    
    // Get all companies
    const companies = await db.collection('companies').find({}).toArray()
    console.log(`📊 Found ${companies.length} companies:`)
    const companyMap = {}
    const companyNameMap = {}
    for (const comp of companies) {
      console.log(`   - ${comp.name} (${comp.id}) - _id: ${comp._id}`)
      companyMap[comp._id.toString()] = comp
      companyNameMap[comp.name.toLowerCase().trim()] = comp
    }
    console.log('')

    // Get all employees
    const employees = await db.collection('employees').find({}).toArray()
    console.log(`📊 Found ${employees.length} employees\n`)

    let updatedCount = 0
    let alreadyCorrectCount = 0
    let errorCount = 0
    const issues = []

    for (const emp of employees) {
      try {
        const decryptedEmail = decrypt(emp.email || '')
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedCompanyName = decrypt(emp.companyName || '')
        
        let targetCompany = null
        let reason = ''
        
        // Method 1: Check if current companyId matches a valid company
        if (emp.companyId) {
          const currentCompanyIdStr = emp.companyId.toString()
          if (companyMap[currentCompanyIdStr]) {
            const currentCompany = companyMap[currentCompanyIdStr]
            // Verify companyName matches
            if (decryptedCompanyName && currentCompany.name.toLowerCase().trim() === decryptedCompanyName.toLowerCase().trim()) {
              // CompanyId is already correct
              alreadyCorrectCount++
              console.log(`✅ ${decryptedFirstName} ${decryptedLastName} (${emp.id}) - Already correct: ${currentCompany.name} (${currentCompany.id})`)
              continue
            } else {
              // CompanyId exists but name doesn't match - need to find correct company
              reason = `companyId exists but companyName mismatch: "${currentCompany.name}" vs "${decryptedCompanyName}"`
            }
          } else {
            // CompanyId doesn't match any company
            reason = `Invalid companyId: ${currentCompanyIdStr} (not found in companies)`
          }
        } else {
          reason = 'companyId is missing'
        }

        // Method 2: Find company by companyName
        if (!targetCompany && decryptedCompanyName) {
          const companyNameLower = decryptedCompanyName.toLowerCase().trim()
          if (companyNameMap[companyNameLower]) {
            targetCompany = companyNameMap[companyNameLower]
            reason = reason || 'Found via companyName match'
          }
        }

        // Method 3: Try by employee ID prefix
        if (!targetCompany && emp.id) {
          const prefix = emp.id.split('-')[0]
          if (prefix === 'IND' && companyMap[Object.keys(companyMap).find(k => companyMap[k].id === 'COMP-INDIGO')]) {
            const indigoCompany = companies.find(c => c.id === 'COMP-INDIGO')
            if (indigoCompany) {
              targetCompany = indigoCompany
              reason = reason || 'Found via employee ID prefix (IND)'
            }
          } else if (prefix === 'ICICI' && companies.find(c => c.id === 'COMP-ICICI')) {
            targetCompany = companies.find(c => c.id === 'COMP-ICICI')
            reason = reason || 'Found via employee ID prefix (ICICI)'
          } else if (prefix === 'AKA' || prefix === 'AKASA') {
            const akasaCompany = companies.find(c => c.id === 'COMP-AKASA')
            if (akasaCompany) {
              targetCompany = akasaCompany
              reason = reason || 'Found via employee ID prefix (AKA/AKASA)'
            }
          }
        }

        // Method 4: Try by email domain
        if (!targetCompany && decryptedEmail) {
          if (decryptedEmail.includes('@goindigo.in')) {
            const indigoCompany = companies.find(c => c.id === 'COMP-INDIGO')
            if (indigoCompany) {
              targetCompany = indigoCompany
              reason = reason || 'Found via email domain (@goindigo.in)'
            }
          } else if (decryptedEmail.includes('@icicibank.com')) {
            const iciciCompany = companies.find(c => c.id === 'COMP-ICICI')
            if (iciciCompany) {
              targetCompany = iciciCompany
              reason = reason || 'Found via email domain (@icicibank.com)'
            }
          } else if (decryptedEmail.includes('@akasaair.com')) {
            const akasaCompany = companies.find(c => c.id === 'COMP-AKASA')
            if (akasaCompany) {
              targetCompany = akasaCompany
              reason = reason || 'Found via email domain (@akasaair.com)'
            }
          }
        }

        // Update if needed
        if (targetCompany) {
          const targetCompanyIdStr = targetCompany._id.toString()
          const currentCompanyIdStr = emp.companyId ? emp.companyId.toString() : 'NULL'
          
          if (currentCompanyIdStr !== targetCompanyIdStr) {
            console.log(`🔧 Updating: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
            console.log(`   Reason: ${reason}`)
            console.log(`   Current companyId: ${currentCompanyIdStr}`)
            console.log(`   Setting to: ${targetCompany.name} (${targetCompany.id}) - _id: ${targetCompanyIdStr}`)

            // Update employee with correct companyId (ObjectId reference)
            await db.collection('employees').updateOne(
              { _id: emp._id },
              { 
                $set: { 
                  companyId: targetCompany._id,
                  companyName: targetCompany.name
                }
              }
            )

            updatedCount++
            console.log(`   ✅ Updated\n`)
          } else {
            alreadyCorrectCount++
            console.log(`✅ ${decryptedFirstName} ${decryptedLastName} (${emp.id}) - Already correct\n`)
          }
        } else {
          console.log(`⚠️  Cannot update: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
          console.log(`   Reason: ${reason || 'Could not determine correct company'}`)
          console.log(`   Company Name: ${decryptedCompanyName}`)
          console.log(`   Email: ${decryptedEmail}`)
          console.log(`   Current companyId: ${emp.companyId ? emp.companyId.toString() : 'NULL'}`)
          console.log(`   Could not determine correct company\n`)
          errorCount++
          issues.push({
            employeeId: emp.id,
            name: `${decryptedFirstName} ${decryptedLastName}`,
            email: decryptedEmail,
            companyName: decryptedCompanyName,
            currentCompanyId: emp.companyId ? emp.companyId.toString() : null,
            reason: reason || 'Could not determine correct company'
          })
        }
      } catch (error) {
        console.error(`❌ Error processing employee ${emp.id}:`, error.message)
        errorCount++
        issues.push({
          employeeId: emp.id,
          error: error.message
        })
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   Total employees: ${employees.length}`)
    console.log(`   Already correct: ${alreadyCorrectCount}`)
    console.log(`   Updated: ${updatedCount}`)
    console.log(`   Errors/Issues: ${errorCount}`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Employees that need manual review:`)
      for (const issue of issues) {
        console.log(`   - ${issue.name || issue.employeeId} (${issue.employeeId})`)
        if (issue.email) console.log(`     Email: ${issue.email}`)
        if (issue.companyName) console.log(`     Company Name: ${issue.companyName}`)
        if (issue.currentCompanyId) console.log(`     Current CompanyId: ${issue.currentCompanyId}`)
        console.log(`     Issue: ${issue.reason || issue.error}`)
      }
    }

    if (errorCount === 0 && updatedCount === 0) {
      console.log(`\n✅ All employees already have correct companyId references!`)
    } else if (errorCount === 0) {
      console.log(`\n✅ All fixable employees have been updated with correct companyId references!`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

updateEmployeesCompanyIdReference()

