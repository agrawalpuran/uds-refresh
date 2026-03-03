/**
 * Email Hash Migration Script
 *
 * Populates the emailHash field on all Employee records for O(1) email lookups.
 * Decrypts each employee's email, normalizes it, computes SHA-256 hash, and stores it.
 *
 * Usage: npx tsx scripts/migrate-email-hash.ts
 *        npx tsx scripts/migrate-email-hash.ts --dry-run
 */

import mongoose from 'mongoose'
import crypto from 'crypto'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
const isDryRun = process.argv.includes('--dry-run')

function hashEmail(email: string): string {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex')
}

async function main() {
  console.log(`Connecting to MongoDB...`)
  console.log(`Mode: ${isDryRun ? 'DRY RUN (no writes)' : 'LIVE'}`)

  await mongoose.connect(MONGODB_URI)
  const db = mongoose.connection.db
  if (!db) throw new Error('Database connection failed')

  const { decrypt } = require('../lib/utils/encryption')
  const collection = db.collection('employees')
  const allEmployees = await collection.find({}).toArray()

  console.log(`Found ${allEmployees.length} employees`)

  let updated = 0
  let skipped = 0
  let failed = 0
  const hashMap = new Map<string, string>()

  for (const emp of allEmployees) {
    const empId = emp.id || emp.employeeId || emp._id?.toString()

    if (emp.emailHash) {
      skipped++
      continue
    }

    let plainEmail: string | null = null

    if (!emp.email) {
      console.warn(`  [SKIP] Employee ${empId}: no email field`)
      skipped++
      continue
    }

    const emailValue = emp.email as string

    if (!emailValue.includes(':')) {
      plainEmail = emailValue.trim().toLowerCase()
    } else {
      try {
        const decrypted = decrypt(emailValue)
        if (decrypted && decrypted !== emailValue && !decrypted.includes(':') && decrypted.includes('@')) {
          plainEmail = decrypted.trim().toLowerCase()
        }
      } catch {
        // Try both formats handled by decrypt()
      }
    }

    if (!plainEmail) {
      console.warn(`  [FAIL] Employee ${empId}: could not resolve email`)
      failed++
      continue
    }

    const hash = hashEmail(plainEmail)

    if (hashMap.has(hash)) {
      console.warn(`  [DUPE] Employee ${empId}: email "${plainEmail}" collides with employee ${hashMap.get(hash)}`)
      failed++
      continue
    }

    hashMap.set(hash, empId)

    if (!isDryRun) {
      await collection.updateOne({ _id: emp._id }, { $set: { emailHash: hash } })
    }

    updated++
    if (updated % 100 === 0) {
      console.log(`  Progress: ${updated} updated...`)
    }
  }

  console.log(`\nMigration complete:`)
  console.log(`  Updated:  ${updated}`)
  console.log(`  Skipped:  ${skipped} (already had emailHash or no email)`)
  console.log(`  Failed:   ${failed} (could not decrypt or duplicate)`)
  console.log(`  Total:    ${allEmployees.length}`)

  if (isDryRun) {
    console.log(`\nThis was a DRY RUN. Re-run without --dry-run to apply changes.`)
  }

  await mongoose.disconnect()
  process.exit(0)
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
