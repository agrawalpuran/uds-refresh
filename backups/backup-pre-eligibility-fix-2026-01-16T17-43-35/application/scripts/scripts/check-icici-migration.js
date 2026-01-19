/**
 * Check ICICI employees in local vs Atlas
 */

const { MongoClient } = require('mongodb')

const MONGODB_URI_LOCAL = process.env.MONGODB_URI_LOCAL || 'mongodb://localhost:27017/uniform-distribution'
const MONGODB_URI_ATLAS = process.env.MONGODB_URI_ATLAS || 'mongodb+srv://admin:Welcome%24123@cluster0.owr3ooi.mongodb.net/uniform-distribution?retryWrites=true&w=majority'

async function checkICICIMigration() {
  let localClient = null
  let atlasClient = null
  
  try {
    console.log('🔍 Checking ICICI employees migration status...')
    console.log('')
    
    // Connect to Atlas
    console.log('📡 Connecting to MongoDB Atlas...')
    atlasClient = new MongoClient(MONGODB_URI_ATLAS)
    await atlasClient.connect()
    const atlasDb = atlasClient.db()
    console.log('✅ Connected to Atlas')
    
    // Find ICICI company in Atlas
    const atlasCompanies = atlasDb.collection('companies')
    const iciciCompanyAtlas = await atlasCompanies.findOne({ 
      $or: [
        { id: '100004' },
        { name: { $regex: /icici/i } }
      ]
    })
    
    if (!iciciCompanyAtlas) {
      console.log('❌ ICICI company not found in Atlas')
      return
    }
    
    console.log(`✅ Found ICICI in Atlas: ${iciciCompanyAtlas.name} (ID: ${iciciCompanyAtlas.id})`)
    console.log('')
    
    // Get ICICI employees from Atlas
    const atlasEmployees = atlasDb.collection('employees')
    const iciciEmployeesAtlas = await atlasEmployees.find({ 
      companyId: iciciCompanyAtlas._id 
    }).toArray()
    
    console.log(`📊 ICICI employees in Atlas: ${iciciEmployeesAtlas.length}`)
    if (iciciEmployeesAtlas.length > 0) {
      console.log('Atlas employees:')
      iciciEmployeesAtlas.forEach((emp, idx) => {
        console.log(`  ${idx + 1}. ID: ${emp.id || emp.employeeId || 'N/A'}`)
        console.log(`     Email: ${emp.email ? emp.email.substring(0, 40) + '...' : 'N/A'}`)
      })
    }
    console.log('')
    
    // Try to connect to local
    try {
      console.log('📡 Connecting to local MongoDB...')
      localClient = new MongoClient(MONGODB_URI_LOCAL)
      await localClient.connect()
      const localDb = localClient.db()
      console.log('✅ Connected to local DB')
      console.log('')
      
      // Find ICICI company in local
      const localCompanies = localDb.collection('companies')
      const iciciCompanyLocal = await localCompanies.findOne({ 
        $or: [
          { id: '100004' },
          { name: { $regex: /icici/i } }
        ]
      })
      
      if (iciciCompanyLocal) {
        console.log(`✅ Found ICICI in local: ${iciciCompanyLocal.name} (ID: ${iciciCompanyLocal.id})`)
        console.log('')
        
        // Get ICICI employees from local
        const localEmployees = localDb.collection('employees')
        const iciciEmployeesLocal = await localEmployees.find({ 
          companyId: iciciCompanyLocal._id 
        }).toArray()
        
        console.log(`📊 ICICI employees in local: ${iciciEmployeesLocal.length}`)
        if (iciciEmployeesLocal.length > 0) {
          console.log('Local employees:')
          iciciEmployeesLocal.forEach((emp, idx) => {
            console.log(`  ${idx + 1}. ID: ${emp.id || emp.employeeId || 'N/A'}`)
            console.log(`     Email: ${emp.email ? emp.email.substring(0, 40) + '...' : 'N/A'}`)
          })
          console.log('')
          
          // Check which ones are missing in Atlas
          const atlasIds = new Set(iciciEmployeesAtlas.map(e => String(e.id || e.employeeId)))
          const missing = iciciEmployeesLocal.filter(e => {
            const id = String(e.id || e.employeeId)
            return !atlasIds.has(id)
          })
          
          if (missing.length > 0) {
            console.log(`⚠️  ${missing.length} ICICI employees in local but NOT in Atlas:`)
            missing.forEach((emp, idx) => {
              console.log(`  ${idx + 1}. ID: ${emp.id || emp.employeeId || 'N/A'}`)
              console.log(`     Email: ${emp.email ? emp.email.substring(0, 40) + '...' : 'N/A'}`)
            })
            console.log('')
            console.log('💡 Run migration script to push these employees to Atlas')
          } else {
            console.log('✅ All ICICI employees from local are in Atlas!')
          }
        } else {
          console.log('⚠️  No ICICI employees in local database')
        }
      } else {
        console.log('⚠️  ICICI company not found in local database')
      }
    } catch (localError) {
      console.log('⚠️  Local MongoDB not accessible:', localError.message)
      console.log('   (This is okay if you\'re only using Atlas)')
    }
    
    console.log('')
    console.log('📊 Summary:')
    console.log(`   Atlas: ${iciciEmployeesAtlas.length} ICICI employees`)
    if (localClient) {
      console.log(`   Local: ${iciciEmployeesLocal ? iciciEmployeesLocal.length : 0} ICICI employees`)
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  } finally {
    if (localClient) await localClient.close()
    if (atlasClient) await atlasClient.close()
  }
}

checkICICIMigration()

