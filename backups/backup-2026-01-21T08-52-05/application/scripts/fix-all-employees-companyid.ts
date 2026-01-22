/**
 * Script to check and fix all employees' companyId associations
 * Ensures every employee has a valid companyId
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

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'
const IV_LENGTH = 16

function decrypt(text: string): string {
  if (!text || !text.includes(':')) {
    return text
  }
  try {
    const parts = text.split(':')
    const iv = Buffer.from(parts.shift()!, 'hex')
    const encryptedText = parts.join(':')
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY.slice(0, 32)), iv)
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (error) {
    return text
  }
}

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)

async function fixAllEmployeesCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all companies
    const companies = await Company.find({}).lean()
    console.log(`📊 Found ${companies.length} companies:`)
    const companyMap: Record<string, any> = {}
    for (const comp of companies) {
      console.log(`   - ${comp.name} (${comp.id}) - _id: ${comp._id}`)
      companyMap[comp.id] = comp
      companyMap[comp.name.toLowerCase()] = comp
    }
    console.log('')

    // Get all employees
    const allEmployees = await Employee.find({})
      .populate('companyId', 'id name')
      .lean()

    console.log(`📊 Found ${allEmployees.length} employees\n`)

    let fixedCount = 0
    let errorCount = 0
    const issues: any[] = []

    for (const emp of allEmployees) {
      try {
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedEmail = decrypt(emp.email || '')
        const decryptedCompanyName = decrypt(emp.companyName || '')
        
        let needsFix = false
        let targetCompany: any = null
        let reason = ''

        // Check if companyId is missing or invalid
        if (!emp.companyId) {
          needsFix = true
          reason = 'companyId is null/undefined'
        } else if (typeof emp.companyId === 'object' && emp.companyId !== null) {
          // Check if populated company exists
          const populatedCompanyId = emp.companyId._id || emp.companyId.id
          if (!populatedCompanyId) {
            needsFix = true
            reason = 'populated companyId is invalid'
          }
        }

        // Try to find the correct company
        if (needsFix || !targetCompany) {
          // Method 1: Try by companyName
          if (decryptedCompanyName) {
            const companyNameLower = decryptedCompanyName.toLowerCase()
            if (companyMap[companyNameLower]) {
              targetCompany = companyMap[companyNameLower]
            }
          }

          // Method 2: Try by employee ID prefix (e.g., IND-xxx -> Indigo)
          if (!targetCompany && emp.id) {
            const prefix = emp.id.split('-')[0]
            if (prefix === 'IND' && companyMap['COMP-INDIGO']) {
              targetCompany = companyMap['COMP-INDIGO']
            } else if (prefix === 'ICICI' && companyMap['COMP-ICICI']) {
              targetCompany = companyMap['COMP-ICICI']
            } else if (prefix === 'AKASA' && companyMap['COMP-AKASA']) {
              targetCompany = companyMap['COMP-AKASA']
            }
          }

          // Method 3: Try by email domain
          if (!targetCompany && decryptedEmail) {
            if (decryptedEmail.includes('@goindigo.in') && companyMap['COMP-INDIGO']) {
              targetCompany = companyMap['COMP-INDIGO']
            } else if (decryptedEmail.includes('@icicibank.com') && companyMap['COMP-ICICI']) {
              targetCompany = companyMap['COMP-ICICI']
            } else if (decryptedEmail.includes('@akasaair.com') && companyMap['COMP-AKASA']) {
              targetCompany = companyMap['COMP-AKASA']
            }
          }
        }

        if (needsFix) {
          if (targetCompany) {
            console.log(`🔧 Fixing: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
            console.log(`   Reason: ${reason}`)
            console.log(`   Current companyId: ${emp.companyId}`)
            console.log(`   Setting to: ${targetCompany.name} (${targetCompany.id})`)

            // Update employee
            await Employee.findOneAndUpdate(
              { _id: emp._id },
              { 
                $set: { 
                  companyId: targetCompany._id,
                  companyName: targetCompany.name
                }
              }
            )

            fixedCount++
            console.log(`   ✅ Fixed\n`)
          } else {
            console.log(`⚠️  Cannot fix: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
            console.log(`   Reason: ${reason}`)
            console.log(`   Company Name: ${decryptedCompanyName}`)
            console.log(`   Could not determine correct company\n`)
            errorCount++
            issues.push({
              employeeId: emp.id,
              name: `${decryptedFirstName} ${decryptedLastName}`,
              email: decryptedEmail,
              companyName: decryptedCompanyName,
              reason
            })
          }
        } else {
          // Verify the companyId is valid
          let isValid = false
          if (typeof emp.companyId === 'object' && emp.companyId !== null) {
            const companyId = emp.companyId._id || emp.companyId.id
            if (companyId) {
              // Check if this companyId exists in our company map
              for (const comp of companies) {
                if (comp._id.toString() === companyId.toString()) {
                  isValid = true
                  break
                }
              }
            }
          } else if (emp.companyId) {
            // It's a string/ObjectId, check if it matches any company
            for (const comp of companies) {
              if (comp._id.toString() === emp.companyId.toString()) {
                isValid = true
                break
              }
            }
          }

          if (!isValid) {
            console.log(`⚠️  Invalid companyId: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
            console.log(`   CompanyId: ${emp.companyId}`)
            
            // Try to fix with companyName
            if (decryptedCompanyName) {
              const companyNameLower = decryptedCompanyName.toLowerCase()
              if (companyMap[companyNameLower]) {
                targetCompany = companyMap[companyNameLower]
                console.log(`   Fixing to: ${targetCompany.name} (${targetCompany.id})`)
                
                await Employee.findOneAndUpdate(
                  { _id: emp._id },
                  { 
                    $set: { 
                      companyId: targetCompany._id,
                      companyName: targetCompany.name
                    }
                  }
                )
                
                fixedCount++
                console.log(`   ✅ Fixed\n`)
              } else {
                errorCount++
                issues.push({
                  employeeId: emp.id,
                  name: `${decryptedFirstName} ${decryptedLastName}`,
                  email: decryptedEmail,
                  companyName: decryptedCompanyName,
                  reason: 'Invalid companyId and cannot determine correct company'
                })
                console.log(`   ❌ Could not fix\n`)
              }
            }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error processing employee ${emp.id}:`, error.message)
        errorCount++
      }
    }

    console.log(`\n📊 Summary:`)
    console.log(`   Total employees: ${allEmployees.length}`)
    console.log(`   Fixed: ${fixedCount}`)
    console.log(`   Errors: ${errorCount}`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Employees that need manual review:`)
      for (const issue of issues) {
        console.log(`   - ${issue.name} (${issue.employeeId})`)
        console.log(`     Email: ${issue.email}`)
        console.log(`     Company Name: ${issue.companyName}`)
        console.log(`     Issue: ${issue.reason}`)
      }
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error: any) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

fixAllEmployeesCompanyId()

