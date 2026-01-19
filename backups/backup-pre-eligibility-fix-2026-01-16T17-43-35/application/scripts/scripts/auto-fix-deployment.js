/**
 * Automated Deployment Fix Script
 * Checks MongoDB connection, connection string format, and provides fixes
 */

const mongoose = require('mongoose')
const readline = require('readline')

// Get connection string from environment or use default
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome$123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

// URL encode special characters
function urlEncodePassword(password) {
  return password
    .replace(/%/g, '%25')
    .replace(/\$/g, '%24')
    .replace(/@/g, '%40')
    .replace(/#/g, '%23')
    .replace(/&/g, '%26')
    .replace(/\+/g, '%2B')
    .replace(/=/g, '%3D')
    .replace(/\?/g, '%3F')
    .replace(/ /g, '%20')
}

// Extract password from connection string
function extractPassword(uri) {
  const match = uri.match(/\/\/([^:]+):([^@]+)@/)
  if (match) {
    return match[2]
  }
  return null
}

// Check if password needs encoding
function needsEncoding(password) {
  const specialChars = /[%$@#&+=\? ]/
  return specialChars.test(password)
}

// Generate corrected connection string
function generateCorrectedUri(uri) {
  const match = uri.match(/^(mongodb\+srv:\/\/)([^:]+):([^@]+)@(.+)$/)
  if (!match) return null
  
  const [, protocol, username, password, rest] = match
  const encodedPassword = urlEncodePassword(password)
  
  return `${protocol}${username}:${encodedPassword}@${rest}`
}

// Test connection
async function testConnection(uri) {
  try {
    console.log('🔌 Testing connection...')
    const opts = {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    }
    
    await mongoose.connect(uri, opts)
    const db = mongoose.connection.db
    
    // Get collection counts
    const collections = await db.listCollections().toArray()
    const counts = {}
    
    for (const col of collections) {
      try {
        counts[col.name] = await db.collection(col.name).countDocuments()
      } catch (err) {
        counts[col.name] = 0
      }
    }
    
    await mongoose.disconnect()
    
    return {
      success: true,
      database: db.databaseName,
      collections: collections.length,
      counts
    }
  } catch (error) {
    return {
      success: false,
      error: error.message
    }
  }
}

// Main function
async function runAutoFix() {
  console.log('🚀 Automated Deployment Fix Script')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  
  // Step 1: Analyze connection string
  console.log('📋 Step 1: Analyzing Connection String')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  const maskedUri = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
  console.log(`Current URI: ${maskedUri}`)
  console.log('')
  
  const password = extractPassword(MONGODB_URI)
  const needsEncodingCheck = password && needsEncoding(password)
  
  console.log('Connection String Analysis:')
  console.log(`  ✅ Protocol: ${MONGODB_URI.startsWith('mongodb+srv://') ? 'Correct (mongodb+srv://)' : '❌ Incorrect'}`)
  console.log(`  ${needsEncodingCheck ? '⚠️' : '✅'} Password Encoding: ${needsEncodingCheck ? 'Needs URL encoding' : 'OK'}`)
  console.log(`  ✅ Database Name: ${MONGODB_URI.includes('/uniform-distribution') ? 'Present' : '❌ Missing'}`)
  console.log(`  ✅ Options: ${MONGODB_URI.includes('retryWrites=true') ? 'Present' : '❌ Missing'}`)
  console.log('')
  
  // Step 2: Generate corrected connection string if needed
  let correctedUri = MONGODB_URI
  if (needsEncodingCheck) {
    console.log('🔧 Step 2: Generating Corrected Connection String')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    
    correctedUri = generateCorrectedUri(MONGODB_URI)
    const correctedMasked = correctedUri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
    
    console.log('Original password:', password)
    console.log('Encoded password:', urlEncodePassword(password))
    console.log('')
    console.log('Corrected URI:')
    console.log(correctedMasked)
    console.log('')
    console.log('📝 Use this corrected URI in Vercel:')
    console.log(correctedUri)
    console.log('')
  } else {
    console.log('✅ Step 2: Connection String Format is Correct')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')
  }
  
  // Step 3: Test connection with original URI
  console.log('🧪 Step 3: Testing Connection (Original URI)')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  const originalTest = await testConnection(MONGODB_URI)
  
  if (originalTest.success) {
    console.log('✅ Connection successful with original URI!')
    console.log(`   Database: ${originalTest.database}`)
    console.log(`   Collections: ${originalTest.collections}`)
    console.log('')
    console.log('Document counts:')
    Object.entries(originalTest.counts).forEach(([name, count]) => {
      console.log(`   ${name}: ${count} documents`)
    })
    console.log('')
  } else {
    console.log('❌ Connection failed with original URI')
    console.log(`   Error: ${originalTest.error}`)
    console.log('')
    
    // Test with corrected URI if different
    if (correctedUri !== MONGODB_URI) {
      console.log('🧪 Step 4: Testing Connection (Corrected URI)')
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
      
      const correctedTest = await testConnection(correctedUri)
      
      if (correctedTest.success) {
        console.log('✅ Connection successful with corrected URI!')
        console.log(`   Database: ${correctedTest.database}`)
        console.log(`   Collections: ${correctedTest.collections}`)
        console.log('')
        console.log('💡 This confirms the password encoding fix works!')
        console.log('')
      } else {
        console.log('❌ Connection still failed with corrected URI')
        console.log(`   Error: ${correctedTest.error}`)
        console.log('')
        console.log('💡 This might be a network access issue in MongoDB Atlas')
        console.log('')
      }
    }
  }
  
  // Step 4: Generate report
  console.log('📊 Step 4: Deployment Fix Report')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  
  const issues = []
  const fixes = []
  
  if (needsEncodingCheck) {
    issues.push('Password contains special characters that need URL encoding')
    fixes.push({
      action: 'Update MONGODB_URI in Vercel',
      value: correctedUri,
      location: 'Vercel Dashboard → Settings → Environment Variables'
    })
  }
  
  if (!originalTest.success && !MONGODB_URI.includes('mongodb+srv://')) {
    issues.push('Connection string format is incorrect')
    fixes.push({
      action: 'Use mongodb+srv:// protocol for Atlas',
      value: 'mongodb+srv://...',
      location: 'Connection string'
    })
  }
  
  if (originalTest.success) {
    console.log('✅ Connection Test: PASSED')
    console.log('   Your connection string works correctly!')
    console.log('')
    console.log('📝 Action Items:')
    console.log('   1. Verify MONGODB_URI is set in Vercel dashboard')
    console.log('   2. Ensure MongoDB Atlas Network Access allows 0.0.0.0/0')
    console.log('   3. Check Vercel deployment logs after deployment')
    console.log('')
  } else {
    console.log('❌ Connection Test: FAILED')
    console.log('')
    
    if (issues.length > 0) {
      console.log('⚠️  Issues Found:')
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`)
      })
      console.log('')
    }
    
    if (fixes.length > 0) {
      console.log('🔧 Fixes Required:')
      fixes.forEach((fix, index) => {
        console.log(`   ${index + 1}. ${fix.action}`)
        console.log(`      Location: ${fix.location}`)
        if (fix.value) {
          console.log(`      Value: ${fix.value.substring(0, 80)}...`)
        }
        console.log('')
      })
    }
  }
  
  // Step 5: Generate Vercel environment variable instructions
  console.log('📝 Step 5: Vercel Environment Variable Setup')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('To set MONGODB_URI in Vercel:')
  console.log('')
  console.log('1. Go to: https://vercel.com/dashboard')
  console.log('2. Select your project')
  console.log('3. Go to: Settings → Environment Variables')
  console.log('4. Add new variable:')
  console.log('   Name: MONGODB_URI')
  console.log(`   Value: ${needsEncodingCheck ? correctedUri : MONGODB_URI}`)
  console.log('   Environments: Production, Preview, Development (select all)')
  console.log('5. Click "Save"')
  console.log('6. Redeploy your application')
  console.log('')
  
  // Step 6: MongoDB Atlas checklist
  console.log('📝 Step 6: MongoDB Atlas Checklist')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Verify these settings in MongoDB Atlas:')
  console.log('')
  console.log('✅ Network Access:')
  console.log('   1. Go to: MongoDB Atlas → Network Access')
  console.log('   2. Ensure "0.0.0.0/0" is in IP Access List')
  console.log('   3. This allows connections from anywhere (including Vercel)')
  console.log('')
  console.log('✅ Database Access:')
  console.log('   1. Go to: MongoDB Atlas → Database Access')
  console.log('   2. Verify user "admin" exists')
  console.log('   3. Ensure user has proper permissions')
  console.log('')
  console.log('✅ Cluster Status:')
  console.log('   1. Go to: MongoDB Atlas → Clusters')
  console.log('   2. Verify cluster is running (not paused)')
  console.log('')
  
  // Summary
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('📋 SUMMARY')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  
  if (originalTest.success) {
    console.log('✅ Connection works! Data is accessible.')
    console.log('')
    console.log('Next steps:')
    console.log('   1. Set MONGODB_URI in Vercel (use the connection string above)')
    console.log('   2. Verify MongoDB Atlas Network Access')
    console.log('   3. Redeploy on Vercel')
    console.log('   4. Check Vercel logs for "✅ MongoDB Connected"')
  } else if (needsEncodingCheck && correctedUri !== MONGODB_URI) {
    console.log('⚠️  Password encoding issue detected!')
    console.log('')
    console.log('Fix:')
    console.log(`   Use this corrected connection string in Vercel:`)
    console.log(`   ${correctedUri}`)
    console.log('')
    console.log('After fixing:')
    console.log('   1. Set corrected MONGODB_URI in Vercel')
    console.log('   2. Redeploy application')
    console.log('   3. Check Vercel logs')
  } else {
    console.log('❌ Connection failed. Check the error above.')
    console.log('')
    console.log('Common fixes:')
    console.log('   1. Verify MongoDB Atlas Network Access (allow 0.0.0.0/0)')
    console.log('   2. Check username and password')
    console.log('   3. Verify cluster is running')
  }
  
  console.log('')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
}

// Run the script
runAutoFix()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Script error:', error)
    process.exit(1)
  })



