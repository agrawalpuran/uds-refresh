/**
 * Test getEmployeeByEmail by calling the API directly
 * This simulates what the frontend does
 */

const http = require('http')

const email = 'vikram.gupta6@icicibank.com'
const url = `http://localhost:3001/api/employees?email=${encodeURIComponent(email)}`

console.log(`🔍 Testing API: ${url}`)
console.log('')

const req = http.get(url, (res) => {
  let data = ''
  
  res.on('data', (chunk) => {
    data += chunk
  })
  
  res.on('end', () => {
    if (res.statusCode === 200) {
      try {
        const employee = JSON.parse(data)
        console.log('✅ SUCCESS! Employee found:')
        console.log(`   ID: ${employee.id}`)
        console.log(`   Name: ${employee.firstName} ${employee.lastName}`)
        console.log(`   Email: ${employee.email}`)
      } catch (error) {
        console.log('Response:', data)
      }
    } else if (res.statusCode === 404) {
      console.log('❌ 404 - Employee not found')
      console.log('')
      console.log('This means getEmployeeByEmail is returning null')
      console.log('Check server console for decryption fallback logs')
    } else {
      console.log(`Status: ${res.statusCode}`)
      console.log('Response:', data)
    }
  })
})

req.on('error', (error) => {
  console.error('❌ Request error:', error.message)
  console.log('')
  console.log('Make sure the server is running on port 3001')
})

req.end()

