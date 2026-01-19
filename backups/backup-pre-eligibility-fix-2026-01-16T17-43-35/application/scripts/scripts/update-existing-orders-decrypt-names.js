/**
 * Update existing orders to have decrypted employee names
 * This fixes orders that were created with encrypted names
 */

const mongoose = require('mongoose')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

let MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
let ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-32-characters!!'

try {
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      MONGODB_URI = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
    const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
    if (keyMatch) {
      ENCRYPTION_KEY = keyMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
} catch (error) {
  console.warn('Could not read .env.local')
}

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8')
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()
  }
  return key
}

function decrypt(encryptedText) {
  try {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText
    }
    if (!encryptedText.includes(':')) {
      return encryptedText
    }
    const parts = encryptedText.split(':')
    if (parts.length !== 2) {
      return encryptedText
    }
    const iv = Buffer.from(parts[0], 'base64')
    const encrypted = Buffer.from(parts[1], 'base64')
    const key = getKey()
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
    let decrypted = decipher.update(encrypted)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString('utf8')
  } catch (error) {
    return encryptedText
  }
}

async function updateOrders() {
  try {
    console.log('🔌 Connecting to MongoDB...')
    await mongoose.connect(MONGODB_URI)
    console.log('✅ Connected to MongoDB\n')

    const db = mongoose.connection.db
    const ordersCollection = db.collection('orders')
    const employeesCollection = db.collection('employees')

    // Find orders with encrypted employee names (containing colons)
    const orders = await ordersCollection.find({
      employeeName: { $regex: /:/ }
    }).toArray()

    console.log(`📦 Found ${orders.length} orders with potentially encrypted employee names\n`)

    let updatedCount = 0
    for (const order of orders) {
      // Get employee to decrypt name
      const employee = await employeesCollection.findOne({ _id: order.employeeId })
      if (!employee) {
        console.log(`   ⚠️  Employee not found for order ${order.id}, skipping...`)
        continue
      }

      // Decrypt employee name
      let decryptedFirstName = ''
      let decryptedLastName = ''
      
      try {
        if (employee.firstName && typeof employee.firstName === 'string' && employee.firstName.includes(':')) {
          decryptedFirstName = decrypt(employee.firstName)
        } else {
          decryptedFirstName = employee.firstName || ''
        }
      } catch (error) {
        decryptedFirstName = employee.firstName || ''
      }

      try {
        if (employee.lastName && typeof employee.lastName === 'string' && employee.lastName.includes(':')) {
          decryptedLastName = decrypt(employee.lastName)
        } else {
          decryptedLastName = employee.lastName || ''
        }
      } catch (error) {
        decryptedLastName = employee.lastName || ''
      }

      const decryptedEmployeeName = `${decryptedFirstName} ${decryptedLastName}`.trim() || 'Employee'

      // Update order with decrypted name
      await ordersCollection.updateOne(
        { _id: order._id },
        { $set: { employeeName: decryptedEmployeeName } }
      )

      console.log(`   ✅ Updated order ${order.id}:`)
      console.log(`      Old: ${order.employeeName}`)
      console.log(`      New: ${decryptedEmployeeName}`)
      updatedCount++
    }

    console.log(`\n🎉 Updated ${updatedCount} orders with decrypted employee names!`)

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  } finally {
    await mongoose.disconnect()
    console.log('\n🔌 Disconnected from MongoDB')
  }
}

updateOrders()
  .then(() => {
    console.log('\n✅ Script completed!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error)
    process.exit(1)
  })

