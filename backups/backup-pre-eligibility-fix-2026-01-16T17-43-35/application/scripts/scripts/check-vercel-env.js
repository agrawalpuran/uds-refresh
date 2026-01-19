/**
 * Check Vercel Environment Variable Configuration
 * This script helps verify what needs to be set in Vercel
 */

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://admin:Welcome$123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

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

function extractPassword(uri) {
  const match = uri.match(/\/\/([^:]+):([^@]+)@/)
  return match ? match[2] : null
}

function generateCorrectedUri(uri) {
  const match = uri.match(/^(mongodb\+srv:\/\/)([^:]+):([^@]+)@(.+)$/)
  if (!match) return null
  
  const [, protocol, username, password, rest] = match
  const encodedPassword = urlEncodePassword(password)
  
  return `${protocol}${username}:${encodedPassword}@${rest}`
}

console.log('🔍 Vercel Environment Variable Checker')
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')

const password = extractPassword(MONGODB_URI)
const needsEncoding = password && /[%$@#&+=\? ]/.test(password)

console.log('Current Connection String:')
const masked = MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
console.log(masked)
console.log('')

if (needsEncoding) {
  console.log('⚠️  Password needs URL encoding!')
  console.log('')
  console.log('Original password:', password)
  console.log('Encoded password:', urlEncodePassword(password))
  console.log('')
  
  const corrected = generateCorrectedUri(MONGODB_URI)
  console.log('✅ Corrected Connection String for Vercel:')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('')
  console.log('Variable Name: MONGODB_URI')
  console.log('Variable Value:')
  console.log(corrected)
  console.log('')
  console.log('📋 Copy this value to Vercel:')
  console.log('   1. Go to Vercel Dashboard')
  console.log('   2. Your Project → Settings → Environment Variables')
  console.log('   3. Add/Edit: MONGODB_URI')
  console.log('   4. Paste the value above')
  console.log('   5. Select all environments (Production, Preview, Development)')
  console.log('   6. Save and redeploy')
  console.log('')
} else {
  console.log('✅ Connection string format is correct!')
  console.log('')
  console.log('📋 Use this in Vercel:')
  console.log('')
  console.log('Variable Name: MONGODB_URI')
  console.log('Variable Value:')
  console.log(MONGODB_URI)
  console.log('')
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
console.log('')



