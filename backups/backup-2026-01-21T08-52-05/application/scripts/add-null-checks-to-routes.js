/**
 * Add Null Checks to API Routes
 * Automatically adds null checks after data-access function calls
 */

const fs = require('fs')
const path = require('path')
const { glob } = require('glob')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

// Map of data-access functions to their null check messages
const DATA_ACCESS_FUNCTIONS = {
  'getCompanyById': { message: 'Company not found', varName: 'company' },
  'getProductById': { message: 'Product not found', varName: 'product' },
  'getVendorById': { message: 'Vendor not found', varName: 'vendor' },
  'getLocationById': { message: 'Location not found', varName: 'location' },
  'getEmployeeById': { message: 'Employee not found', varName: 'employee' },
  'getBranchById': { message: 'Branch not found', varName: 'branch' },
  'getEmployeeByEmail': { message: 'Employee not found', varName: 'employee' },
  'getVendorByEmail': { message: 'Vendor not found', varName: 'vendor' },
  'getCompanyByAdminEmail': { message: 'Company not found', varName: 'company' },
  'getLocationByAdminEmail': { message: 'Location not found', varName: 'location' },
  'getBranchByAdminEmail': { message: 'Branch not found', varName: 'branch' },
  'getIndentById': { message: 'Indent not found', varName: 'indent' },
  'getOrderById': { message: 'Order not found', varName: 'order' },
  'getReturnRequestById': { message: 'Return request not found', varName: 'returnRequest' },
  'getPurchaseOrderById': { message: 'Purchase order not found', varName: 'purchaseOrder' },
  'getInvoiceById': { message: 'Invoice not found', varName: 'invoice' },
  'getGRNById': { message: 'GRN not found', varName: 'grn' },
  'getShipmentById': { message: 'Shipment not found', varName: 'shipment' },
}

async function findApiRoutes() {
  const routeFiles = await glob('**/route.ts', {
    cwd: API_DIR,
    absolute: true
  })
  return routeFiles
}

function addNullChecks(content, filePath) {
  let modified = false
  let changes = []
  
  // Pattern: const varName = await functionName(...)
  for (const [funcName, { message, varName }] of Object.entries(DATA_ACCESS_FUNCTIONS)) {
    // Match: const varName = await funcName(...)
    const pattern = new RegExp(
      `(const|let)\\s+(${varName})\\s*=\\s*await\\s+${funcName}\\s*\\([^)]*\\)`,
      'g'
    )
    
    let match
    while ((match = pattern.exec(content)) !== null) {
      const fullMatch = match[0]
      const actualVarName = match[2]
      const startPos = match.index
      const endPos = startPos + fullMatch.length
      
      // Check if null check already exists
      const afterMatch = content.substring(endPos, endPos + 200)
      if (afterMatch.includes(`if (!${actualVarName})`) || 
          afterMatch.includes(`if (${actualVarName} === null`) ||
          afterMatch.includes(`if (${actualVarName} == null`)) {
        continue // Already has null check
      }
      
      // Find the next line after the assignment
      const nextLineStart = content.indexOf('\n', endPos)
      if (nextLineStart === -1) continue
      
      // Check if there's already a return statement or another check
      const nextLines = content.substring(nextLineStart, nextLineStart + 100)
      if (nextLines.trim().startsWith('if (!')) continue
      
      // Insert null check
      const nullCheck = `\n    if (!${actualVarName}) {
      return NextResponse.json({ error: '${message}' }, { status: 404 })
    }`
      
      content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
      modified = true
      changes.push(`Added null check for ${funcName}`)
      
      // Reset regex to avoid infinite loop
      pattern.lastIndex = nextLineStart + nullCheck.length
    }
  }
  
  // Also check for Model.findOne/findById patterns
  const modelPatterns = [
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+(\w+)\.findOne\(\s*\{\s*id:\s*[^}]+\s*\}\s*\)/g, type: 'findOne' },
    { pattern: /(const|let)\s+(\w+)\s*=\s*await\s+(\w+)\.findById\(\s*[^)]+\s*\)/g, type: 'findById' },
  ]
  
  for (const { pattern, type } of modelPatterns) {
    let match
    while ((match = pattern.exec(content)) !== null) {
      const varName = match[2]
      const modelName = match[3]
      const startPos = match.index
      const endPos = startPos + match[0].length
      
      // Skip if it's a common model name that doesn't need checking
      if (['mongoose', 'db', 'connection'].includes(modelName.toLowerCase())) {
        continue
      }
      
      // Check if null check already exists
      const afterMatch = content.substring(endPos, endPos + 200)
      if (afterMatch.includes(`if (!${varName})`) || 
          afterMatch.includes(`if (${varName} === null`)) {
        continue
      }
      
      // Find the next line
      const nextLineStart = content.indexOf('\n', endPos)
      if (nextLineStart === -1) continue
      
      // Insert null check
      const nullCheck = `\n    if (!${varName}) {
      return NextResponse.json({ error: '${modelName} not found' }, { status: 404 })
    }`
      
      content = content.substring(0, nextLineStart) + nullCheck + content.substring(nextLineStart)
      modified = true
      changes.push(`Added null check for ${modelName}.${type}`)
      
      pattern.lastIndex = nextLineStart + nullCheck.length
    }
  }
  
  return { content, modified, changes }
}

function fixRoute(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8')
    const originalContent = content
    
    const result = addNullChecks(content, filePath)
    
    if (result.modified) {
      fs.writeFileSync(filePath, result.content, 'utf8')
      return { fixed: true, changes: result.changes, file: path.relative(API_DIR, filePath) }
    }
    
    return { fixed: false, changes: [], file: path.relative(API_DIR, filePath) }
  } catch (error) {
    return { fixed: false, error: error.message, file: path.relative(API_DIR, filePath) }
  }
}

async function main() {
  console.log('🔧 Adding Null Checks to API Routes')
  console.log('='.repeat(80))
  console.log('')
  
  const routes = await findApiRoutes()
  console.log(`Found ${routes.length} API route files`)
  console.log('')
  
  const results = []
  for (const route of routes) {
    const result = fixRoute(route)
    results.push(result)
    if (result.fixed) {
      console.log(`✅ Fixed: ${result.file}`)
      if (result.changes.length > 0) {
        result.changes.forEach(change => console.log(`   - ${change}`))
      }
    }
  }
  
  const fixed = results.filter(r => r.fixed).length
  const errors = results.filter(r => r.error).length
  
  console.log('')
  console.log('='.repeat(80))
  console.log(`✅ Fixed: ${fixed} files`)
  if (errors > 0) {
    console.log(`❌ Errors: ${errors} files`)
  }
  console.log('')
}

main().catch(console.error)
