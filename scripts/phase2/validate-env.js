/**
 * Phase 2 Environment Validation Script
 * 
 * Purpose: Validates all required environment variables and dependencies
 *          before Phase 2 data checks can be executed.
 * 
 * Safety:
 * - READ-ONLY mode enforced
 * - DRY_RUN must be 'true' to proceed
 * - Only pings database, no data access
 * 
 * Usage: node scripts/phase2/validate-env.js
 * 
 * @version 1.0.0
 * @created 2026-01-15
 */

// =============================================================================
// DRY RUN GATE - MUST BE FIRST
// =============================================================================

const DRY_RUN = process.env.DRY_RUN === 'true'

console.log('═══════════════════════════════════════════════════════════════════')
console.log('  PHASE 2 — ENVIRONMENT VALIDATION')
console.log('═══════════════════════════════════════════════════════════════════')
console.log(`  Mode: ${DRY_RUN ? '🔒 DRY RUN (Safe)' : '⚠️  LIVE MODE'}`)
console.log(`  Time: ${new Date().toISOString()}`)
console.log('═══════════════════════════════════════════════════════════════════')

if (!DRY_RUN) {
  console.error('\n❌ ERROR: DRY_RUN must be set to "true" to proceed.')
  console.error('   Set environment variable: DRY_RUN=true')
  console.error('   This is a safety measure to prevent accidental execution.\n')
  process.exit(1)
}

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

const validationResults = {
  timestamp: new Date().toISOString(),
  mode: 'DRY_RUN',
  checks: [],
  overallStatus: 'PENDING'
}

function addCheck(name, status, message, details = null) {
  const check = {
    name,
    status, // 'PASS', 'FAIL', 'WARN'
    message,
    details
  }
  validationResults.checks.push(check)
  
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'
  console.log(`\n${icon} ${name}`)
  console.log(`   Status: ${status}`)
  console.log(`   ${message}`)
  if (details) {
    console.log(`   Details: ${JSON.stringify(details)}`)
  }
  
  return status === 'PASS'
}

// =============================================================================
// CHECK 1: dotenv Package
// =============================================================================

async function checkDotenv() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 1: dotenv Package')
  console.log('─────────────────────────────────────────────────────────────────')
  
  try {
    require('dotenv')
    return addCheck(
      'dotenv Package',
      'PASS',
      'dotenv package is installed and available'
    )
  } catch (err) {
    return addCheck(
      'dotenv Package',
      'FAIL',
      'dotenv package is NOT installed',
      { fix: 'Run: npm install dotenv --save-dev' }
    )
  }
}

// =============================================================================
// CHECK 2: .env File Exists
// =============================================================================

async function checkEnvFile() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 2: .env File')
  console.log('─────────────────────────────────────────────────────────────────')
  
  const fs = require('fs')
  const path = require('path')
  
  const envPath = path.resolve(process.cwd(), '.env')
  const envLocalPath = path.resolve(process.cwd(), '.env.local')
  
  if (fs.existsSync(envPath)) {
    return addCheck(
      '.env File',
      'PASS',
      '.env file exists at project root',
      { path: envPath }
    )
  } else if (fs.existsSync(envLocalPath)) {
    return addCheck(
      '.env File',
      'PASS',
      '.env.local file exists (Next.js format)',
      { path: envLocalPath }
    )
  } else {
    return addCheck(
      '.env File',
      'FAIL',
      '.env file does NOT exist',
      { fix: 'Create .env file with MONGODB_URI variable' }
    )
  }
}

// =============================================================================
// CHECK 3: MONGODB_URI Variable
// =============================================================================

async function checkMongoURI() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 3: MONGODB_URI Variable')
  console.log('─────────────────────────────────────────────────────────────────')
  
  try {
    const fs = require('fs')
    const path = require('path')
    const dotenv = require('dotenv')
    
    // Try .env.local first (Next.js convention), then .env
    const envLocalPath = path.resolve(process.cwd(), '.env.local')
    const envPath = path.resolve(process.cwd(), '.env')
    
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath })
    } else if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath })
    }
  } catch (e) {
    // dotenv not available, check process.env directly
  }
  
  const mongoUri = process.env.MONGODB_URI
  
  if (!mongoUri) {
    return addCheck(
      'MONGODB_URI Variable',
      'FAIL',
      'MONGODB_URI environment variable is NOT set',
      { fix: 'Add MONGODB_URI=mongodb://... to .env file' }
    )
  }
  
  // Validate URI format without exposing credentials
  const uriPattern = /^mongodb(\+srv)?:\/\/.+/
  if (!uriPattern.test(mongoUri)) {
    return addCheck(
      'MONGODB_URI Variable',
      'FAIL',
      'MONGODB_URI format is invalid',
      { expected: 'mongodb://... or mongodb+srv://...' }
    )
  }
  
  // Mask the URI for logging
  const maskedUri = mongoUri.replace(/:\/\/([^:]+):([^@]+)@/, '://$1:****@')
  
  return addCheck(
    'MONGODB_URI Variable',
    'PASS',
    'MONGODB_URI is set and format is valid',
    { maskedUri }
  )
}

// =============================================================================
// CHECK 4: mongoose Package
// =============================================================================

async function checkMongoose() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 4: mongoose Package')
  console.log('─────────────────────────────────────────────────────────────────')
  
  try {
    const mongoose = require('mongoose')
    return addCheck(
      'mongoose Package',
      'PASS',
      `mongoose package is installed (v${mongoose.version})`,
      { version: mongoose.version }
    )
  } catch (err) {
    return addCheck(
      'mongoose Package',
      'FAIL',
      'mongoose package is NOT installed',
      { fix: 'Run: npm install mongoose' }
    )
  }
}

// =============================================================================
// CHECK 5: Database Ping (Read-Only)
// =============================================================================

async function checkDatabasePing() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 5: Database Connectivity (Ping Only)')
  console.log('─────────────────────────────────────────────────────────────────')
  
  try {
    const fs = require('fs')
    const path = require('path')
    const dotenv = require('dotenv')
    
    // Try .env.local first (Next.js convention), then .env
    const envLocalPath = path.resolve(process.cwd(), '.env.local')
    const envPath = path.resolve(process.cwd(), '.env')
    
    if (fs.existsSync(envLocalPath)) {
      dotenv.config({ path: envLocalPath })
    } else if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath })
    }
  } catch (e) {}
  
  const mongoUri = process.env.MONGODB_URI
  if (!mongoUri) {
    return addCheck(
      'Database Ping',
      'FAIL',
      'Cannot ping - MONGODB_URI not set'
    )
  }
  
  try {
    const { MongoClient } = require('mongodb')
    
    // Create client with read-only settings
    const client = new MongoClient(mongoUri, {
      readPreference: 'secondaryPreferred',
      retryWrites: false,
      maxPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    })
    
    console.log('   Attempting connection (5 second timeout)...')
    
    await client.connect()
    
    // Ping only - no data access
    const adminDb = client.db().admin()
    const pingResult = await adminDb.ping()
    
    await client.close()
    
    return addCheck(
      'Database Ping',
      'PASS',
      'Database is reachable and responding',
      { pingResult }
    )
  } catch (err) {
    return addCheck(
      'Database Ping',
      'FAIL',
      'Database connection failed',
      { error: err.message }
    )
  }
}

// =============================================================================
// CHECK 6: Reports Directory
// =============================================================================

async function checkReportsDir() {
  console.log('\n─────────────────────────────────────────────────────────────────')
  console.log('CHECK 6: Reports Directory')
  console.log('─────────────────────────────────────────────────────────────────')
  
  const fs = require('fs')
  const path = require('path')
  
  const reportsDir = path.resolve(process.cwd(), 'reports')
  
  if (fs.existsSync(reportsDir)) {
    return addCheck(
      'Reports Directory',
      'PASS',
      '/reports directory exists',
      { path: reportsDir }
    )
  } else {
    // Create directory in dry run mode
    fs.mkdirSync(reportsDir, { recursive: true })
    return addCheck(
      'Reports Directory',
      'PASS',
      '/reports directory created',
      { path: reportsDir }
    )
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

async function main() {
  let allPassed = true
  
  // Run all checks
  allPassed = await checkDotenv() && allPassed
  allPassed = await checkEnvFile() && allPassed
  allPassed = await checkMongoURI() && allPassed
  allPassed = await checkMongoose() && allPassed
  allPassed = await checkDatabasePing() && allPassed
  allPassed = await checkReportsDir() && allPassed
  
  // Set overall status
  validationResults.overallStatus = allPassed ? 'PASS' : 'FAIL'
  
  // Summary
  console.log('\n═══════════════════════════════════════════════════════════════════')
  console.log('  VALIDATION SUMMARY')
  console.log('═══════════════════════════════════════════════════════════════════')
  
  const passed = validationResults.checks.filter(c => c.status === 'PASS').length
  const failed = validationResults.checks.filter(c => c.status === 'FAIL').length
  const warned = validationResults.checks.filter(c => c.status === 'WARN').length
  
  console.log(`\n  Total Checks: ${validationResults.checks.length}`)
  console.log(`  ✅ Passed: ${passed}`)
  console.log(`  ❌ Failed: ${failed}`)
  console.log(`  ⚠️  Warnings: ${warned}`)
  console.log(`\n  Overall: ${allPassed ? '✅ READY FOR PHASE 2' : '❌ NOT READY - FIX ISSUES ABOVE'}`)
  
  // Save results
  const fs = require('fs')
  const path = require('path')
  const resultsPath = path.resolve(process.cwd(), 'reports', 'env-validation-results.json')
  fs.writeFileSync(resultsPath, JSON.stringify(validationResults, null, 2))
  console.log(`\n  Results saved to: ${resultsPath}`)
  
  console.log('\n═══════════════════════════════════════════════════════════════════')
  
  process.exit(allPassed ? 0 : 1)
}

main().catch(err => {
  console.error('\n❌ Unexpected error:', err.message)
  process.exit(1)
})
