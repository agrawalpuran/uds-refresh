/**
 * Script to ensure all employees have companyId based on their organization
 * Uses multiple methods:
 * 1. If employee has branchId, get companyId from branch
 * 2. Match by companyName
 * 3. Match by email domain
 * 4. Match by employee ID prefix
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

const IV_LENGTH = 16

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

// Branch Schema
const BranchSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
}, { timestamps: true })

// Employee Schema
const EmployeeSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  employeeId: { type: String, required: true, unique: true, index: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  email: { type: String, required: true, unique: true, index: true },
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  companyName: { type: String, required: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', index: true },
  branchName: { type: String },
}, { timestamps: true })

// Company Schema
const CompanySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
}, { timestamps: true })

const Employee = mongoose.models.Employee || mongoose.model('Employee', EmployeeSchema)
const Company = mongoose.models.Company || mongoose.model('Company', CompanySchema)
const Branch = mongoose.models.Branch || mongoose.model('Branch', BranchSchema)

async function ensureEmployeesCompanyId() {
  try {
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    // Get all companies
    const companies = await Company.find({}).lean()
    console.log(`📊 Found ${companies.length} companies:`)
    const companyMap = {}
    const companyNameMap = {}
    for (const comp of companies) {
      console.log(`   - ${comp.name} (${comp.id}) - _id: ${comp._id}`)
      companyMap[comp.id] = comp
      companyMap[comp._id.toString()] = comp
      companyNameMap[comp.name.toLowerCase().trim()] = comp
    }
    console.log('')

    // Get all branches with their companyId
    const branches = await Branch.find({}).lean()
    const branchMap = {}
    for (const branch of branches) {
      branchMap[branch._id.toString()] = branch
    }
    console.log(`📊 Found ${branches.length} branches\n`)

    // Get all employees
    const allEmployees = await Employee.find({})
      .populate('companyId', 'id name')
      .populate('branchId', 'id name companyId')
      .lean()

    console.log(`📊 Found ${allEmployees.length} employees\n`)

    let fixedCount = 0
    let alreadyCorrectCount = 0
    let errorCount = 0
    const issues = []

    for (const emp of allEmployees) {
      try {
        const decryptedFirstName = decrypt(emp.firstName || '')
        const decryptedLastName = decrypt(emp.lastName || '')
        const decryptedEmail = decrypt(emp.email || '')
        const decryptedCompanyName = decrypt(emp.companyName || '')
        
        let targetCompany = null
        let reason = ''
        let needsFix = false

        // Method 1: Check if employee has branchId, get companyId from branch
        if (emp.branchId) {
          const branchIdStr = typeof emp.branchId === 'object' && emp.branchId._id 
            ? emp.branchId._id.toString() 
            : emp.branchId.toString()
          
          const branch = branchMap[branchIdStr]
          if (branch && branch.companyId) {
            const branchCompanyId = branch.companyId.toString()
            if (companyMap[branchCompanyId]) {
              targetCompany = companyMap[branchCompanyId]
              reason = 'Found via branchId -> branch.companyId'
            }
          }
        }

        // Method 2: Check current companyId is valid
        if (!targetCompany && emp.companyId) {
          const currentCompanyId = typeof emp.companyId === 'object' && emp.companyId._id
            ? emp.companyId._id.toString()
            : emp.companyId.toString()
          
          if (companyMap[currentCompanyId]) {
            const currentCompany = companyMap[currentCompanyId]
            // Verify companyName matches
            const currentCompanyName = typeof emp.companyId === 'object' && emp.companyId.name
              ? emp.companyId.name
              : currentCompany.name
            
            const decryptedCurrentName = decrypt(currentCompanyName || '')
            if (decryptedCurrentName.toLowerCase().trim() === decryptedCompanyName.toLowerCase().trim()) {
              // CompanyId is correct and matches companyName
              alreadyCorrectCount++
              continue
            } else {
              // CompanyId exists but name doesn't match - need to fix
              needsFix = true
              reason = `companyId exists but companyName mismatch: "${decryptedCurrentName}" vs "${decryptedCompanyName}"`
            }
          } else {
            // CompanyId doesn't exist in our company map
            needsFix = true
            reason = 'Invalid companyId reference'
          }
        }

        // Method 3: Try to find by companyName
        if (!targetCompany && decryptedCompanyName) {
          const companyNameLower = decryptedCompanyName.toLowerCase().trim()
          if (companyNameMap[companyNameLower]) {
            targetCompany = companyNameMap[companyNameLower]
            reason = reason || 'Found via companyName match'
          }
        }

        // Method 4: Try by employee ID prefix
        if (!targetCompany && emp.id) {
          const prefix = emp.id.split('-')[0]
          if (prefix === 'IND' && companyMap['COMP-INDIGO']) {
            targetCompany = companyMap['COMP-INDIGO']
            reason = reason || 'Found via employee ID prefix (IND)'
          } else if (prefix === 'ICICI' && companyMap['COMP-ICICI']) {
            targetCompany = companyMap['COMP-ICICI']
            reason = reason || 'Found via employee ID prefix (ICICI)'
          } else if (prefix === 'AKASA' && companyMap['COMP-AKASA']) {
            targetCompany = companyMap['COMP-AKASA']
            reason = reason || 'Found via employee ID prefix (AKASA)'
          }
        }

        // Method 5: Try by email domain
        if (!targetCompany && decryptedEmail) {
          if (decryptedEmail.includes('@goindigo.in') && companyMap['COMP-INDIGO']) {
            targetCompany = companyMap['COMP-INDIGO']
            reason = reason || 'Found via email domain (@goindigo.in)'
          } else if (decryptedEmail.includes('@icicibank.com') && companyMap['COMP-ICICI']) {
            targetCompany = companyMap['COMP-ICICI']
            reason = reason || 'Found via email domain (@icicibank.com)'
          } else if (decryptedEmail.includes('@akasaair.com') && companyMap['COMP-AKASA']) {
            targetCompany = companyMap['COMP-AKASA']
            reason = reason || 'Found via email domain (@akasaair.com)'
          }
        }

        // Update if needed
        if (needsFix || !emp.companyId || (targetCompany && emp.companyId && targetCompany._id.toString() !== emp.companyId.toString())) {
          if (targetCompany) {
            console.log(`🔧 Fixing: ${decryptedFirstName} ${decryptedLastName} (${emp.id})`)
            console.log(`   Reason: ${reason}`)
            console.log(`   Current companyId: ${emp.companyId ? (typeof emp.companyId === 'object' ? emp.companyId._id : emp.companyId) : 'NULL'}`)
            console.log(`   Setting to: ${targetCompany.name} (${targetCompany.id}) - _id: ${targetCompany._id}`)

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
            console.log(`   Reason: ${reason || 'Could not determine correct company'}`)
            console.log(`   Company Name: ${decryptedCompanyName}`)
            console.log(`   Email: ${decryptedEmail}`)
            console.log(`   BranchId: ${emp.branchId ? (typeof emp.branchId === 'object' ? emp.branchId._id : emp.branchId) : 'N/A'}`)
            console.log(`   Could not determine correct company\n`)
            errorCount++
            issues.push({
              employeeId: emp.id,
              name: `${decryptedFirstName} ${decryptedLastName}`,
              email: decryptedEmail,
              companyName: decryptedCompanyName,
              branchId: emp.branchId ? (typeof emp.branchId === 'object' ? emp.branchId._id : emp.branchId) : null,
              reason: reason || 'Could not determine correct company'
            })
          }
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
    console.log(`   Total employees: ${allEmployees.length}`)
    console.log(`   Already correct: ${alreadyCorrectCount}`)
    console.log(`   Fixed: ${fixedCount}`)
    console.log(`   Errors/Issues: ${errorCount}`)

    if (issues.length > 0) {
      console.log(`\n⚠️  Employees that need manual review:`)
      for (const issue of issues) {
        console.log(`   - ${issue.name || issue.employeeId} (${issue.employeeId})`)
        if (issue.email) console.log(`     Email: ${issue.email}`)
        if (issue.companyName) console.log(`     Company Name: ${issue.companyName}`)
        if (issue.branchId) console.log(`     BranchId: ${issue.branchId}`)
        console.log(`     Issue: ${issue.reason || issue.error}`)
      }
    }

    if (errorCount === 0 && fixedCount === 0) {
      console.log(`\n✅ All employees already have correct companyId!`)
    } else if (errorCount === 0) {
      console.log(`\n✅ All fixable employees have been updated!`)
    }

    await mongoose.disconnect()
    console.log('\n✅ MongoDB Disconnected')
  } catch (error) {
    console.error('❌ Error:', error)
    await mongoose.disconnect()
    process.exit(1)
  }
}

ensureEmployeesCompanyId()

