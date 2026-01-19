const https = require('https')
const http = require('http')

// Get Vercel URL from command line or use placeholder
const vercelUrl = process.argv[2] || process.env.VERCEL_URL || 'your-project-name.vercel.app'

console.log('🔍 Verifying Vercel Deployment...')
console.log('📍 URL:', `https://${vercelUrl}`)
console.log('')

async function checkUrl(url) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    const req = protocol.get(url, { timeout: 10000 }, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: data.substring(0, 500) // First 500 chars
        })
      })
    })
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })
  })
}

async function verifyDeployment() {
  const baseUrl = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`
  
  console.log('📋 Running Checks...')
  console.log('')
  
  // Check 1: Homepage
  try {
    console.log('1️⃣  Checking homepage...')
    const homeResponse = await checkUrl(baseUrl)
    if (homeResponse.status === 200) {
      console.log('   ✅ Homepage loads successfully (Status: 200)')
    } else {
      console.log(`   ⚠️  Homepage returned status: ${homeResponse.status}`)
    }
  } catch (error) {
    console.log(`   ❌ Homepage failed: ${error.message}`)
  }
  console.log('')
  
  // Check 2: API Products endpoint
  try {
    console.log('2️⃣  Checking API endpoint (/api/products)...')
    const apiResponse = await checkUrl(`${baseUrl}/api/products`)
    if (apiResponse.status === 200) {
      console.log('   ✅ API endpoint accessible (Status: 200)')
      try {
        const jsonData = JSON.parse(apiResponse.body)
        console.log(`   📊 Response: ${Array.isArray(jsonData) ? `${jsonData.length} items` : 'Valid JSON'}`)
      } catch {
        console.log('   ⚠️  Response is not valid JSON')
      }
    } else {
      console.log(`   ⚠️  API returned status: ${apiResponse.status}`)
    }
  } catch (error) {
    console.log(`   ❌ API endpoint failed: ${error.message}`)
    console.log('   💡 This might indicate MongoDB connection issue')
  }
  console.log('')
  
  // Check 3: API Companies endpoint
  try {
    console.log('3️⃣  Checking API endpoint (/api/companies)...')
    const companiesResponse = await checkUrl(`${baseUrl}/api/companies`)
    if (companiesResponse.status === 200) {
      console.log('   ✅ Companies API accessible (Status: 200)')
      try {
        const jsonData = JSON.parse(companiesResponse.body)
        console.log(`   📊 Response: ${Array.isArray(jsonData) ? `${jsonData.length} companies` : 'Valid JSON'}`)
      } catch {
        console.log('   ⚠️  Response is not valid JSON')
      }
    } else {
      console.log(`   ⚠️  API returned status: ${companiesResponse.status}`)
    }
  } catch (error) {
    console.log(`   ❌ Companies API failed: ${error.message}`)
  }
  console.log('')
  
  // Check 4: Login page
  try {
    console.log('4️⃣  Checking login page...')
    const loginResponse = await checkUrl(`${baseUrl}/login`)
    if (loginResponse.status === 200) {
      console.log('   ✅ Login page loads (Status: 200)')
    } else {
      console.log(`   ⚠️  Login page returned status: ${loginResponse.status}`)
    }
  } catch (error) {
    console.log(`   ❌ Login page failed: ${error.message}`)
  }
  console.log('')
  
  console.log('✅ Verification complete!')
  console.log('')
  console.log('📝 Next Steps:')
  console.log('   1. Check Vercel dashboard for build logs')
  console.log('   2. Verify MONGODB_URI environment variable is set')
  console.log('   3. Test login functionality manually')
  console.log('   4. Check browser console for errors')
  console.log('')
  console.log('💡 If API endpoints fail, check:')
  console.log('   - MONGODB_URI in Vercel environment variables')
  console.log('   - MongoDB Atlas network access (0.0.0.0/0)')
  console.log('   - Connection string format')
}

// Run verification
if (vercelUrl === 'your-project-name.vercel.app') {
  console.log('⚠️  Please provide your Vercel URL:')
  console.log('   node scripts/verify-vercel-deployment.js your-project-name.vercel.app')
  console.log('')
  console.log('   Or set VERCEL_URL environment variable:')
  console.log('   $env:VERCEL_URL="your-project-name.vercel.app"')
  console.log('   node scripts/verify-vercel-deployment.js')
  process.exit(1)
}

verifyDeployment().catch(console.error)



