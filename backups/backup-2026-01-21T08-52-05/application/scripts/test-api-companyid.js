/**
 * Script to test what the API actually returns for companyId
 */

const http = require('http')

const email = 'vikram.singh@goindigo.in'
const url = `http://localhost:3001/api/employees?email=${encodeURIComponent(email)}`

console.log('Testing API endpoint:', url)
console.log('')

http.get(url, (res) => {
  let data = ''
  
  res.on('data', (chunk) => {
    data += chunk
  })
  
  res.on('end', () => {
    try {
      const employee = JSON.parse(data)
      console.log('✅ API Response:')
      console.log('   Employee ID:', employee.id)
      console.log('   Employee Email:', employee.email)
      console.log('   Company ID (raw):', employee.companyId)
      console.log('   Company ID type:', typeof employee.companyId)
      console.log('   Company ID isObject:', typeof employee.companyId === 'object')
      console.log('   Company ID isNull:', employee.companyId === null)
      console.log('   Company ID isUndefined:', employee.companyId === undefined)
      
      if (employee.companyId) {
        if (typeof employee.companyId === 'object') {
          console.log('   Company ID keys:', Object.keys(employee.companyId))
          console.log('   Company ID.id:', employee.companyId.id)
          console.log('   Company ID._id:', employee.companyId._id)
        } else {
          console.log('   Company ID string:', employee.companyId)
        }
      }
      
      console.log('   Company Name:', employee.companyName)
      console.log('')
      console.log('📋 Full employee object (first 500 chars):')
      console.log(JSON.stringify(employee, null, 2).substring(0, 500))
    } catch (error) {
      console.error('❌ Error parsing response:', error)
      console.log('Raw response:', data)
    }
  })
}).on('error', (error) => {
  console.error('❌ Error making request:', error.message)
})

