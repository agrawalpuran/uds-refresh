/**
 * Test the email lookup API endpoint
 */

async function testEmailAPI() {
  const email = 'anjali.sharma@icicibank.com'
  const baseUrl = process.env.VERCEL_URL || 'http://localhost:3001'
  
  console.log(`🔍 Testing email lookup API for: ${email}`)
  console.log(`Base URL: ${baseUrl}`)
  console.log('')
  
  try {
    const url = `${baseUrl}/api/employees?email=${encodeURIComponent(email)}`
    console.log(`📡 Calling: ${url}`)
    console.log('')
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    
    console.log(`Status: ${response.status} ${response.statusText}`)
    console.log('')
    
    if (response.status === 404) {
      console.log('❌ Employee not found (404)')
      const text = await response.text()
      console.log('Response:', text)
    } else if (response.ok) {
      const data = await response.json()
      console.log('✅ Employee found!')
      console.log('Data:', JSON.stringify(data, null, 2))
    } else {
      const text = await response.text()
      console.log('❌ Error response:')
      console.log(text)
    }
  } catch (error) {
    console.error('❌ Error calling API:', error.message)
    console.log('')
    console.log('💡 This might be because:')
    console.log('   1. Server is not running locally')
    console.log('   2. Vercel URL is not set correctly')
    console.log('   3. Network error')
  }
}

testEmailAPI()
