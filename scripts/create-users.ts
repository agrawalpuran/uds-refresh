/**
 * User Migration Script
 * 
 * Creates User records from existing Employee, CompanyAdmin, LocationAdmin, Branch, and Vendor data.
 * Authentication is OTP-based, so no password is needed.
 * 
 * Usage: npx tsx scripts/create-users.ts
 * 
 * Role mapping:
 * - CompanyAdmin records → role: 'company_admin'
 * - LocationAdmin records → role: 'location_admin'  
 * - Branch with adminId → role: 'branch_admin'
 * - Vendor records → role: 'vendor'
 * - Remaining Employee records → role: 'employee'
 * - Super admin email (from env or hardcoded) → role: 'super_admin'
 */

import mongoose from 'mongoose'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const SUPER_ADMIN_EMAILS = ['agrawalpuran@gmail.com']

import User from '../lib/models/User'
import '../lib/models/Company'
import '../lib/models/Vendor'

async function main() {
  console.log('=== User Migration Script ===')
  console.log(`Connecting to: ${MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')}`)

  await mongoose.connect(MONGODB_URI)
  console.log('Connected to MongoDB')

  const db = mongoose.connection.db!

  let created = 0
  let skipped = 0
  let errors = 0
  const processedEmails = new Set<string>()

  // Helper to decrypt email if encrypted
  let decryptFn: (text: string) => string
  try {
    const { decrypt } = require('../lib/utils/encryption')
    decryptFn = decrypt
  } catch {
    decryptFn = (text: string) => text
  }

  function decryptIfNeeded(value: string): string {
    if (!value) return value
    if (value.includes(':')) {
      try {
        return decryptFn(value)
      } catch {
        return value
      }
    }
    return value
  }

  async function createUser(data: {
    email: string
    role: string
    companyId?: string
    vendorId?: string
    employeeId?: string
  }) {
    const email = data.email.trim().toLowerCase()
    if (!email || processedEmails.has(email)) {
      skipped++
      return
    }
    processedEmails.add(email)

    try {
      const existing = await User.findOne({ email })
      if (existing) {
        console.log(`  SKIP (exists): ${email} [${existing.role}]`)
        skipped++
        return
      }

      await User.create({
        email,
        role: data.role,
        companyId: data.companyId,
        vendorId: data.vendorId,
        employeeId: data.employeeId,
        isActive: true,
      })
      console.log(`  CREATE: ${email} [${data.role}]${data.companyId ? ` company=${data.companyId}` : ''}${data.vendorId ? ` vendor=${data.vendorId}` : ''}`)
      created++
    } catch (err: any) {
      if (err.code === 11000) {
        console.log(`  SKIP (duplicate): ${email}`)
        skipped++
      } else {
        console.error(`  ERROR: ${email} - ${err.message}`)
        errors++
      }
    }
  }

  // 1. Super Admins
  console.log('\n--- Super Admins ---')
  for (const email of SUPER_ADMIN_EMAILS) {
    await createUser({ email, role: 'super_admin' })
  }

  // 2. Company Admins (from CompanyAdmin collection)
  console.log('\n--- Company Admins ---')
  const companyAdmins = await db.collection('companyadmins').find({}).toArray()
  console.log(`Found ${companyAdmins.length} company admin records`)

  for (const ca of companyAdmins) {
    const employee = await db.collection('employees').findOne({ id: ca.employeeId })
    if (employee?.email) {
      const email = decryptIfNeeded(employee.email)
      await createUser({
        email,
        role: 'company_admin',
        companyId: ca.companyId,
        employeeId: ca.employeeId,
      })
    } else {
      console.log(`  SKIP: CompanyAdmin employeeId=${ca.employeeId} - no email found`)
      skipped++
    }
  }

  // 3. Location Admins (from LocationAdmin collection)
  console.log('\n--- Location Admins ---')
  const locationAdmins = await db.collection('locationadmins').find({}).toArray()
  console.log(`Found ${locationAdmins.length} location admin records`)

  for (const la of locationAdmins) {
    const employee = await db.collection('employees').findOne({ id: la.employeeId })
    if (employee?.email) {
      const email = decryptIfNeeded(employee.email)
      if (!processedEmails.has(email.trim().toLowerCase())) {
        await createUser({
          email,
          role: 'location_admin',
          companyId: employee.companyId?.toString(),
          employeeId: la.employeeId,
        })
      } else {
        console.log(`  SKIP (already processed): ${email} [location_admin]`)
        skipped++
      }
    } else {
      console.log(`  SKIP: LocationAdmin employeeId=${la.employeeId} - no email found`)
      skipped++
    }
  }

  // 4. Branch Admins (from branches with adminId)
  console.log('\n--- Branch Admins ---')
  const branches = await db.collection('branches').find({ adminId: { $exists: true, $ne: null } }).toArray()
  console.log(`Found ${branches.length} branches with adminId`)

  for (const branch of branches) {
    if (!branch.adminId) continue
    const employee = await db.collection('employees').findOne({ id: branch.adminId })
    if (employee?.email) {
      const email = decryptIfNeeded(employee.email)
      if (!processedEmails.has(email.trim().toLowerCase())) {
        await createUser({
          email,
          role: 'branch_admin',
          companyId: branch.companyId?.toString(),
          employeeId: branch.adminId,
        })
      } else {
        console.log(`  SKIP (already processed): ${email} [branch_admin]`)
        skipped++
      }
    } else {
      console.log(`  SKIP: Branch adminId=${branch.adminId} - no email found`)
      skipped++
    }
  }

  // 5. Vendors
  console.log('\n--- Vendors ---')
  const vendors = await db.collection('vendors').find({}).toArray()
  console.log(`Found ${vendors.length} vendors`)

  for (const vendor of vendors) {
    if (vendor.email) {
      await createUser({
        email: vendor.email,
        role: 'vendor',
        vendorId: vendor.id,
      })
    }
  }

  // 6. Remaining Employees (those not already created as admins)
  console.log('\n--- Employees ---')
  const employees = await db.collection('employees').find({ email: { $exists: true, $ne: null } }).toArray()
  console.log(`Found ${employees.length} employees with email`)

  for (const emp of employees) {
    if (emp.email) {
      const email = decryptIfNeeded(emp.email)
      const companyId = typeof emp.companyId === 'object' && emp.companyId
        ? emp.companyId.toString()
        : emp.companyId
      await createUser({
        email,
        role: 'employee',
        companyId: companyId,
        employeeId: emp.id,
      })
    }
  }

  console.log('\n=== Migration Complete ===')
  console.log(`Created: ${created}`)
  console.log(`Skipped: ${skipped}`)
  console.log(`Errors:  ${errors}`)
  console.log(`Total processed emails: ${processedEmails.size}`)
  console.log(`Auth method: OTP (no passwords)`)

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
