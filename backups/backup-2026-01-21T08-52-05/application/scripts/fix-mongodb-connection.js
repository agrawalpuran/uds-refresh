/**
 * Fix MongoDB Connection Issues
 * This script verifies the connection string and provides guidance
 */

const fs = require('fs')
const path = require('path')

console.log('🔧 Fixing MongoDB Connection Issues...\n')
console.log('='.repeat(60))

// Check env.local file
const envLocalPath = path.join(process.cwd(), 'env.local')
console.log('\n1️⃣ Checking env.local file...')

if (!fs.existsSync(envLocalPath)) {
  console.error('❌ env.local file not found!')
  console.error('   💡 Create env.local with your MongoDB connection string')
  process.exit(1)
}

const envContent = fs.readFileSync(envLocalPath, 'utf8')
const lines = envContent.split('\n')

let mongodbUri = null
let activeLine = null

for (const line of lines) {
  const trimmed = line.trim()
  // Find active (non-commented) MONGODB_URI
  if (trimmed.startsWith('MONGODB_URI=') && !trimmed.startsWith('#MONGODB_URI=')) {
    activeLine = line
    const match = trimmed.match(/^MONGODB_URI=(.+)$/)
    if (match) {
      mongodbUri = match[1].trim()
      // Remove quotes if present
      mongodbUri = mongodbUri.replace(/^["']|["']$/g, '')
    }
    break
  }
}

if (!mongodbUri) {
  console.error('❌ No active MONGODB_URI found in env.local!')
  console.error('   💡 Make sure you have: MONGODB_URI=mongodb://...')
  console.error('   💡 And it is NOT commented out with #')
  process.exit(1)
}

console.log(`   ✅ Found MONGODB_URI: ${mongodbUri.substring(0, 50)}...`)

// Validate format
console.log('\n2️⃣ Validating connection string format...')
if (!mongodbUri.match(/^mongodb(\+srv)?:\/\//)) {
  console.error('❌ INVALID FORMAT!')
  console.error(`   Current: ${mongodbUri}`)
  console.error('   💡 Connection string must start with:')
  console.error('      - mongodb:// (for local MongoDB)')
  console.error('      - mongodb+srv:// (for MongoDB Atlas)')
  console.error('\n   💡 Example for local:')
  console.error('      MONGODB_URI=mongodb://localhost:27017/uniform-distribution')
  console.error('\n   💡 Example for Atlas:')
  console.error('      MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/uniform-distribution?retryWrites=true&w=majority')
  process.exit(1)
}

console.log('   ✅ Format is valid')

// Check for common issues
console.log('\n3️⃣ Checking for common issues...')

if (mongodbUri.includes('<password>') || mongodbUri.includes('<username>')) {
  console.error('❌ Connection string contains placeholders!')
  console.error('   💡 Replace <username> and <password> with actual values')
  process.exit(1)
}

if (mongodbUri.includes('mongodb+srv://') && !mongodbUri.includes('@')) {
  console.error('❌ Atlas connection string missing credentials!')
  console.error('   💡 Format: mongodb+srv://username:password@cluster...')
  process.exit(1)
}

if (mongodbUri.length < 20) {
  console.error('❌ Connection string seems too short!')
  console.error('   💡 Check if it was cut off or incomplete')
  process.exit(1)
}

console.log('   ✅ No obvious issues found')

// Summary
console.log('\n' + '='.repeat(60))
console.log('\n✅ Connection string looks good!')
console.log('\n💡 Next Steps:')
console.log('   1. RESTART your Next.js server:')
console.log('      - Stop the current server (Ctrl+C)')
console.log('      - Run: npm run dev')
console.log('\n   2. The server needs to restart to pick up environment variables')
console.log('\n   3. After restart, check the server console for:')
console.log('      ✅ MongoDB Connected Successfully')
console.log('\n   4. If you see errors, check:')
console.log('      - MongoDB service is running (for local)')
console.log('      - Network access is configured (for Atlas)')
console.log('      - Username/password are correct')
console.log('      - Database name is correct')

console.log('\n📝 Your current connection string:')
console.log(`   ${mongodbUri.includes('localhost') ? '📍 Local MongoDB' : '☁️  MongoDB Atlas'}`)
console.log(`   ${mongodbUri.substring(0, 80)}...`)

console.log('\n✅ Diagnosis complete!')

