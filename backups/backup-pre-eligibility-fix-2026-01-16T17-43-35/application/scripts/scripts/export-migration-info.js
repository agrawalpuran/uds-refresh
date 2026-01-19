/**
 * Script to export critical migration information from old laptop
 * Run this on your OLD laptop before migration
 * This will create a file with all critical information needed for migration
 */

const fs = require('fs')
const path = require('path')

console.log('📤 Exporting Migration Information\n')
console.log('='.repeat(60))

const migrationInfo = {
  timestamp: new Date().toISOString(),
  nodeVersion: process.version,
  npmVersion: require('child_process').execSync('npm --version', { encoding: 'utf8' }).trim(),
  projectPath: __dirname.replace(/\\scripts$/, ''),
  environment: {},
  criticalFiles: [],
  notes: []
}

// Read .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  console.log('✅ Reading .env.local...')
  const envContent = fs.readFileSync(envPath, 'utf8')
  
  // Extract MONGODB_URI (mask password)
  const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
  if (mongoMatch) {
    const uri = mongoMatch[1].trim()
    // Mask password in URI
    const maskedUri = uri.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
    migrationInfo.environment.MONGODB_URI = uri
    migrationInfo.environment.MONGODB_URI_MASKED = maskedUri
    console.log(`   ✓ MongoDB URI found: ${maskedUri}`)
  }
  
  // Extract ENCRYPTION_KEY
  const keyMatch = envContent.match(/ENCRYPTION_KEY=(.+)/)
  if (keyMatch) {
    migrationInfo.environment.ENCRYPTION_KEY = keyMatch[1].trim()
    console.log('   ✓ Encryption key found')
    console.log('   ⚠ IMPORTANT: Keep this key safe!')
  }
  
  // Extract PORT
  const portMatch = envContent.match(/PORT=(.+)/)
  if (portMatch) {
    migrationInfo.environment.PORT = portMatch[1].trim()
    console.log(`   ✓ Port: ${portMatch[1].trim()}`)
  }
} else {
  console.log('⚠ .env.local not found')
  migrationInfo.notes.push('.env.local file not found - you will need to create it on new laptop')
}

// Check critical files
console.log('\n✅ Checking critical files...')
const criticalFiles = [
  'package.json',
  'next.config.js',
  'lib/db/data-access.ts',
  'app/dashboard/company/page.tsx',
]

criticalFiles.forEach(file => {
  const filePath = path.join(__dirname, '..', file)
  if (fs.existsSync(filePath)) {
    migrationInfo.criticalFiles.push({ file, exists: true })
    console.log(`   ✓ ${file}`)
  } else {
    migrationInfo.criticalFiles.push({ file, exists: false })
    console.log(`   ✗ ${file} missing`)
  }
})

// Check package.json for dependencies
console.log('\n✅ Reading package.json...')
const packageJsonPath = path.join(__dirname, '..', 'package.json')
if (fs.existsSync(packageJsonPath)) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  migrationInfo.dependencies = {
    name: packageJson.name,
    version: packageJson.version,
    dependenciesCount: Object.keys(packageJson.dependencies || {}).length,
    devDependenciesCount: Object.keys(packageJson.devDependencies || {}).length,
  }
  console.log(`   ✓ Project: ${packageJson.name} v${packageJson.version}`)
  console.log(`   ✓ Dependencies: ${migrationInfo.dependencies.dependenciesCount} + ${migrationInfo.dependencies.devDependenciesCount} dev`)
}

// Save migration info
const outputPath = path.join(__dirname, '..', 'MIGRATION_INFO.json')
fs.writeFileSync(outputPath, JSON.stringify(migrationInfo, null, 2))

console.log('\n' + '='.repeat(60))
console.log('\n✅ Migration information exported!')
console.log(`\n📄 File created: ${outputPath}`)
console.log('\n📋 Next steps:')
console.log('   1. Copy this file to your new laptop')
console.log('   2. Use the information to set up .env.local')
console.log('   3. ⚠ IMPORTANT: Keep ENCRYPTION_KEY secure!')
console.log('\n⚠ SECURITY WARNING:')
console.log('   - MIGRATION_INFO.json contains sensitive information')
console.log('   - Delete it after migration is complete')
console.log('   - Do not commit it to version control')
console.log('\n')

