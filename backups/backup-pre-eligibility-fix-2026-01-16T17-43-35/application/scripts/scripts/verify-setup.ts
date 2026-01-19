/**
 * Script to verify UDS application setup on new laptop
 * Run this after migration to ensure everything is configured correctly
 */

const fs = require('fs')
const path = require('path')

console.log('🔍 UDS Application Setup Verification\n')
console.log('=' .repeat(60))

let allChecksPassed = true

// Check 1: Node.js version
console.log('\n✅ Check 1: Node.js Installation')
try {
  const nodeVersion = process.version
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0])
  if (majorVersion >= 18) {
    console.log(`   ✓ Node.js ${nodeVersion} installed (v18+ required)`)
  } else {
    console.log(`   ✗ Node.js ${nodeVersion} installed (v18+ required)`)
    allChecksPassed = false
  }
} catch (error) {
  console.log('   ✗ Node.js not found')
  allChecksPassed = false
}

// Check 2: npm version
console.log('\n✅ Check 2: npm Installation')
try {
  const { execSync } = require('child_process')
  const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim()
  console.log(`   ✓ npm ${npmVersion} installed`)
} catch (error) {
  console.log('   ✗ npm not found')
  allChecksPassed = false
}

// Check 3: Required files
console.log('\n✅ Check 3: Required Files')
const requiredFiles = [
  'package.json',
  'next.config.js',
  '.env.local',
  'lib/db/data-access.ts',
  'app/dashboard/company/page.tsx',
]

requiredFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file)
  if (fs.existsSync(filePath)) {
    console.log(`   ✓ ${file} exists`)
  } else {
    console.log(`   ✗ ${file} missing`)
    allChecksPassed = false
  }
})

// Check 4: Environment variables
console.log('\n✅ Check 4: Environment Variables')
try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    
    // Check for MONGODB_URI
    if (envContent.includes('MONGODB_URI=')) {
      const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
      if (mongoMatch && mongoMatch[1].trim()) {
        console.log('   ✓ MONGODB_URI is set')
      } else {
        console.log('   ✗ MONGODB_URI is empty')
        allChecksPassed = false
      }
    } else {
      console.log('   ✗ MONGODB_URI not found')
      allChecksPassed = false
    }
    
    // Check for ENCRYPTION_KEY
    if (envContent.includes('ENCRYPTION_KEY=')) {
      const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
      if (keyMatch && keyMatch[1].trim()) {
        console.log('   ✓ ENCRYPTION_KEY is set')
      } else {
        console.log('   ⚠ ENCRYPTION_KEY is empty (will use default)')
      }
    } else {
      console.log('   ⚠ ENCRYPTION_KEY not found (will use default)')
    }
    
    // Check for PORT
    if (envContent.includes('PORT=')) {
      const portMatch = envContent.match(/PORT=(.+)/)
      if (portMatch && portMatch[1].trim()) {
        console.log(`   ✓ PORT is set to ${portMatch[1].trim()}`)
      }
    } else {
      console.log('   ℹ PORT not set (will use default 3000)')
    }
  } else {
    console.log('   ✗ .env.local file not found')
    allChecksPassed = false
  }
} catch (error) {
  console.log(`   ✗ Error reading .env.local: ${error.message}`)
  allChecksPassed = false
}

// Check 5: node_modules
console.log('\n✅ Check 5: Dependencies')
const nodeModulesPath = path.join(__dirname, '..', 'node_modules')
if (fs.existsSync(nodeModulesPath)) {
  const nodeModules = fs.readdirSync(nodeModulesPath)
  if (nodeModules.length > 0) {
    console.log(`   ✓ node_modules exists (${nodeModules.length} packages)`)
    
    // Check for key dependencies
    const keyDeps = ['next', 'react', 'mongoose', 'crypto']
    keyDeps.forEach(dep => {
      const depPath = path.join(nodeModulesPath, dep)
      if (fs.existsSync(depPath)) {
        console.log(`   ✓ ${dep} installed`)
      } else {
        console.log(`   ✗ ${dep} missing - run 'npm install'`)
        allChecksPassed = false
      }
    })
  } else {
    console.log('   ✗ node_modules is empty - run "npm install"')
    allChecksPassed = false
  }
} else {
  console.log('   ✗ node_modules not found - run "npm install"')
  allChecksPassed = false
}

// Check 6: Database connection (optional)
console.log('\n✅ Check 6: Database Connection (Optional)')
console.log('   ℹ This will attempt to connect to MongoDB...')
try {
  const mongoose = require('mongoose')
  const envPath = path.join(__dirname, '..', '.env.local')
  let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim()
    }
  }
  
  mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 5000 })
    .then(() => {
      console.log('   ✓ Successfully connected to MongoDB')
      mongoose.disconnect()
    })
    .catch((error: any) => {
      console.log(`   ✗ Failed to connect to MongoDB: ${error.message}`)
      console.log('   ℹ This might be okay if MongoDB is not running or connection string is incorrect')
      // Don't fail the check for this
    })
} catch (error: any) {
  console.log(`   ⚠ Could not test database connection: ${error.message}`)
  console.log('   ℹ Make sure mongoose is installed: npm install')
}

// Summary
console.log('\n' + '='.repeat(60))
if (allChecksPassed) {
  console.log('\n✅ All critical checks passed!')
  console.log('\n📋 Next steps:')
  console.log('   1. Run: npm run dev')
  console.log('   2. Open: http://localhost:3001')
  console.log('   3. Test login with your credentials')
} else {
  console.log('\n⚠️  Some checks failed. Please fix the issues above.')
  console.log('\n📋 Common fixes:')
  console.log('   - Missing files: Copy from backup')
  console.log('   - Missing dependencies: Run "npm install"')
  console.log('   - Missing .env.local: Create file with MONGODB_URI and ENCRYPTION_KEY')
}
console.log('\n')

