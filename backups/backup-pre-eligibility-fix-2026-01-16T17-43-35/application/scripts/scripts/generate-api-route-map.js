/**
 * API Route Map Generator
 * Scans all API routes and generates a comprehensive route map
 */

const fs = require('fs')
const path = require('path')

const API_DIR = path.join(__dirname, '..', 'app', 'api')

// Route map structure
const routeMap = []

// Scan directory recursively
function scanDirectory(dir, basePath = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    const relativePath = path.relative(API_DIR, fullPath)
    
    if (entry.isDirectory()) {
      scanDirectory(fullPath, basePath)
    } else if (entry.name === 'route.ts' || entry.name === 'route.js') {
      const routePath = '/' + relativePath.replace(/\\/g, '/').replace(/\/route\.(ts|js)$/, '')
      const routeInfo = analyzeRoute(fullPath, routePath)
      if (routeInfo) {
        routeMap.push(routeInfo)
      }
    }
  }
}

// Analyze a route file to extract methods and parameters
function analyzeRoute(filePath, routePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const methods = []
    
    // Extract HTTP methods
    if (content.includes('export async function GET')) methods.push('GET')
    if (content.includes('export async function POST')) methods.push('POST')
    if (content.includes('export async function PUT')) methods.push('PUT')
    if (content.includes('export async function DELETE')) methods.push('DELETE')
    if (content.includes('export async function PATCH')) methods.push('PATCH')
    
    if (methods.length === 0) return null
    
    // Extract dynamic segments
    const dynamicSegments = routePath.match(/\[(\w+)\]/g) || []
    const params = dynamicSegments.map(s => s.replace(/[\[\]]/g, ''))
    
    // Extract query parameters (from searchParams.get)
    const queryParams = []
    const queryMatches = content.matchAll(/searchParams\.get\(['"]([\w]+)['"]\)/g)
    for (const match of queryMatches) {
      if (!queryParams.includes(match[1])) {
        queryParams.push(match[1])
      }
    }
    
    // Extract body parameters (from request.json())
    const bodyParams = []
    const bodyMatches = content.match(/const\s+body\s*=\s*await\s+request\.json\(\)/s)
    if (bodyMatches) {
      // Try to extract destructured properties
      const destructureMatches = content.match(/const\s*\{\s*([^}]+)\s*\}\s*=\s*body/g)
      if (destructureMatches) {
        destructureMatches.forEach(match => {
          const props = match.match(/\{([^}]+)\}/)[1].split(',').map(p => p.trim().split(':')[0].trim())
          props.forEach(p => {
            if (!bodyParams.includes(p)) bodyParams.push(p)
          })
        })
      }
    }
    
    // Check for authentication
    const requiresAuth = content.includes('validateAndGetCompanyId') || 
                        content.includes('isCompanyAdmin') ||
                        content.includes('getEmployeeByEmail')
    
    return {
      path: routePath,
      file: filePath,
      methods,
      params,
      queryParams,
      bodyParams,
      requiresAuth,
      hasStringIdQueries: content.includes('findOne({ id:') || content.includes('find({ id:'),
      hasObjectIdFallback: content.includes('findById(') || content.includes('new mongoose.Types.ObjectId') || content.includes('ObjectId.isValid')
    }
  } catch (error) {
    console.error(`Error analyzing ${filePath}:`, error.message)
    return null
  }
}

// Main execution
console.log('🔍 Scanning API routes...')
scanDirectory(API_DIR)

// Sort by path
routeMap.sort((a, b) => a.path.localeCompare(b.path))

// Generate report
const report = {
  timestamp: new Date().toISOString(),
  totalRoutes: routeMap.length,
  routes: routeMap,
  summary: {
    byMethod: {
      GET: routeMap.filter(r => r.methods.includes('GET')).length,
      POST: routeMap.filter(r => r.methods.includes('POST')).length,
      PUT: routeMap.filter(r => r.methods.includes('PUT')).length,
      DELETE: routeMap.filter(r => r.methods.includes('DELETE')).length,
      PATCH: routeMap.filter(r => r.methods.includes('PATCH')).length,
    },
    requiresAuth: routeMap.filter(r => r.requiresAuth).length,
    hasObjectIdFallback: routeMap.filter(r => r.hasObjectIdFallback).length,
    hasStringIdQueries: routeMap.filter(r => r.hasStringIdQueries).length,
  }
}

// Save route map
const outputPath = path.join(__dirname, '..', 'api-route-map.json')
fs.writeFileSync(outputPath, JSON.stringify(report, null, 2))

console.log(`✅ Generated route map: ${outputPath}`)
console.log(`   Total routes: ${routeMap.length}`)
console.log(`   Routes with ObjectId fallback: ${report.summary.hasObjectIdFallback}`)
console.log(`   Routes with string ID queries: ${report.summary.hasStringIdQueries}`)

// Print summary
console.log('\n📊 Route Summary by Method:')
Object.entries(report.summary.byMethod).forEach(([method, count]) => {
  if (count > 0) {
    console.log(`   ${method}: ${count}`)
  }
})

// List routes with ObjectId fallback (potential issues)
if (report.summary.hasObjectIdFallback > 0) {
  console.log('\n⚠️  Routes with potential ObjectId fallback:')
  routeMap.filter(r => r.hasObjectIdFallback).forEach(r => {
    console.log(`   ${r.path} (${r.methods.join(', ')})`)
  })
}
