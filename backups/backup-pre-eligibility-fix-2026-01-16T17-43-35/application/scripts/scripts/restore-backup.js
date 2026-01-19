#!/usr/bin/env node
/**
 * Restore Script for Uniform Distribution System Backup
 * 
 * This script restores a complete backup including:
 * 1. Application source code
 * 2. MongoDB database
 * 
 * Usage:
 *   npm run restore-backup [backup-path]
 *   node scripts/restore-backup.js [backup-path]
 * 
 * Examples:
 *   node scripts/restore-backup.js backups/backup-2025-01-15T10-30-00
 *   node scripts/restore-backup.js backups/backup-2025-01-15T10-30-00.zip
 */

const mongoose = require('mongoose')
const { exec } = require('child_process')
const { promisify } = require('util')
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

const execAsync = promisify(exec)

// Load environment variables
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local')
  let mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution'
  
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8')
    const mongoMatch = envContent.match(/MONGODB_URI=(.+)/)
    if (mongoMatch) {
      mongoUri = mongoMatch[1].trim().replace(/^["']|["']$/g, '')
    }
  }
  
  return mongoUri
}

// Extract database connection details
function parseMongoUri(uri) {
  let dbName = 'uniform-distribution'
  let connectionString = uri
  
  const dbMatch = uri.match(/\/([^/?]+)(\?|$)/)
  if (dbMatch) {
    dbName = dbMatch[1]
  }
  
  return { dbName, connectionString }
}

// Extract archive if needed
function extractArchive(backupPath) {
  if (backupPath.endsWith('.zip')) {
    console.log(`📦 Extracting archive: ${backupPath}`)
    
    const extractDir = backupPath.replace('.zip', '-extracted')
    if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir, { recursive: true })
    }
    
    const zip = new AdmZip(backupPath)
    zip.extractAllTo(extractDir, true)
    
    // Find the actual backup directory inside
    const extractedContents = fs.readdirSync(extractDir)
    const backupDir = extractedContents.find(item => {
      const itemPath = path.join(extractDir, item)
      return fs.statSync(itemPath).isDirectory() && item.startsWith('backup-')
    })
    
    if (backupDir) {
      return path.join(extractDir, backupDir)
    }
    
    return extractDir
  }
  
  return backupPath
}

// Restore application code
async function restoreApplicationCode(backupDir, targetDir) {
  console.log('\n📦 Step 1: Restoring application code...')
  
  const appBackupDir = path.join(backupDir, 'application')
  
  if (!fs.existsSync(appBackupDir)) {
    throw new Error(`Application backup not found: ${appBackupDir}`)
  }
  
  console.log(`   Source: ${appBackupDir}`)
  console.log(`   Target: ${targetDir}`)
  
  // Copy files
  const filesToCopy = fs.readdirSync(appBackupDir)
  
  for (const file of filesToCopy) {
    const src = path.join(appBackupDir, file)
    const dest = path.join(targetDir, file)
    
    // Skip certain files that shouldn't be overwritten
    if (file === '.env.local' || file === 'node_modules' || file === '.next') {
      console.log(`   ⏭️  Skipping: ${file}`)
      continue
    }
    
    const stat = fs.statSync(src)
    
    if (stat.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true })
      }
      copyDirectory(src, dest)
      console.log(`   ✅ Copied directory: ${file}`)
    } else {
      fs.copyFileSync(src, dest)
      console.log(`   ✅ Copied file: ${file}`)
    }
  }
  
  // Check for .env.local.template
  const envTemplate = path.join(appBackupDir, '.env.local.template')
  if (fs.existsSync(envTemplate)) {
    const envLocal = path.join(targetDir, '.env.local')
    if (!fs.existsSync(envLocal)) {
      fs.copyFileSync(envTemplate, envLocal)
      console.log('   ⚠️  Created .env.local from template - PLEASE UPDATE WITH YOUR CREDENTIALS')
    }
  }
  
  console.log('✅ Application code restored')
  console.log('   💡 Next steps:')
  console.log('      1. Update .env.local with your actual credentials')
  console.log('      2. Run: npm install')
  console.log('      3. Run: npm run build')
}

// Recursive directory copy
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true })
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true })
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// Restore database
async function restoreDatabase(backupDir, targetUri) {
  console.log('\n🗄️  Step 2: Restoring MongoDB database...')
  
  const dbBackupDir = path.join(backupDir, 'database')
  
  if (!fs.existsSync(dbBackupDir)) {
    throw new Error(`Database backup not found: ${dbBackupDir}`)
  }
  
  const { dbName, connectionString } = parseMongoUri(targetUri)
  console.log(`   Target database: ${dbName}`)
  console.log(`   Target connection: ${connectionString.includes('@') ? 'MongoDB Atlas' : 'Local MongoDB'}`)
  
  // Check for mongodump backup (directory structure)
  const backupContents = fs.readdirSync(dbBackupDir)
  const mongodumpDir = backupContents.find(item => {
    const itemPath = path.join(dbBackupDir, item)
    return fs.statSync(itemPath).isDirectory() && item === dbName
  })
  
  if (mongodumpDir) {
    // Use mongorestore
    try {
      await execAsync('mongorestore --version')
      console.log('   Using mongorestore (official MongoDB tool)...')
      
      const restoreCommand = `mongorestore --uri="${targetUri}" --drop "${path.join(dbBackupDir, dbName)}"`
      const { stdout, stderr } = await execAsync(restoreCommand)
      
      if (stderr && !stderr.includes('finished')) {
        console.warn('   Warning:', stderr)
      }
      
      console.log('✅ Database restored using mongorestore')
      return { method: 'mongorestore', success: true }
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log('   mongorestore not found, using code-based restore...')
      } else {
        console.warn('   mongorestore failed, trying code-based restore...')
      }
    }
  }
  
  // Fallback to code-based restore
  return await codeBasedRestore(dbBackupDir, targetUri)
}

// Code-based database restore
async function codeBasedRestore(backupDir, targetUri) {
  console.log('   Using code-based restore method...')
  
  const backupFile = path.join(backupDir, `${parseMongoUri(targetUri).dbName}-backup.json`)
  
  if (!fs.existsSync(backupFile)) {
    throw new Error(`Backup file not found: ${backupFile}`)
  }
  
  try {
    const backupData = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
    console.log(`   ✅ Loaded backup data (${Object.keys(backupData.collections).length} collections)`)
    
    await mongoose.connect(targetUri)
    console.log('   ✅ Connected to target database')
    
    const db = mongoose.connection.db
    
    // Drop existing database (optional - comment out if you want to merge)
    // await db.dropDatabase()
    // console.log('   ⚠️  Dropped existing database')
    
    // Restore collections
    for (const [collectionName, collectionData] of Object.entries(backupData.collections)) {
      console.log(`   Restoring collection: ${collectionName} (${collectionData.count} documents)`)
      
      const collection = db.collection(collectionName)
      
      // Drop existing collection
      await collection.drop().catch(() => {
        // Collection might not exist, that's okay
      })
      
      // Insert documents
      if (collectionData.documents && collectionData.documents.length > 0) {
        await collection.insertMany(collectionData.documents)
      }
      
      // Restore indexes
      if (collectionData.indexes && collectionData.indexes.length > 0) {
        for (const index of collectionData.indexes) {
          if (index.name !== '_id_') { // Skip default _id index
            try {
              await collection.createIndex(index.key, index)
            } catch (err) {
              console.warn(`      ⚠️  Could not restore index ${index.name}: ${err.message}`)
            }
          }
        }
      }
      
      console.log(`   ✅ ${collectionName}: ${collectionData.count} documents restored`)
    }
    
    await mongoose.disconnect()
    console.log('✅ Database restored using code-based method')
    return { method: 'code-based', success: true }
  } catch (error) {
    console.error('❌ Code-based restore failed:', error.message)
    await mongoose.disconnect().catch(() => {})
    throw error
  }
}

// Main restore function
async function main() {
  const args = process.argv.slice(2)
  
  if (args.length === 0) {
    console.error('❌ Error: Backup path required')
    console.log('\nUsage:')
    console.log('  node scripts/restore-backup.js <backup-path>')
    console.log('\nExamples:')
    console.log('  node scripts/restore-backup.js backups/backup-2025-01-15T10-30-00')
    console.log('  node scripts/restore-backup.js backups/backup-2025-01-15T10-30-00.zip')
    process.exit(1)
  }
  
  const backupPath = path.resolve(args[0])
  
  if (!fs.existsSync(backupPath)) {
    console.error(`❌ Error: Backup path not found: ${backupPath}`)
    process.exit(1)
  }
  
  console.log('🚀 Starting restore process...')
  console.log('='.repeat(60))
  console.log(`📁 Backup path: ${backupPath}`)
  
  // Extract if archive
  const backupDir = extractArchive(backupPath)
  
  if (!fs.existsSync(backupDir)) {
    console.error(`❌ Error: Backup directory not found: ${backupDir}`)
    process.exit(1)
  }
  
  // Check for README
  const readmePath = path.join(backupDir, 'README.md')
  if (fs.existsSync(readmePath)) {
    console.log('\n📖 Backup README found. Review restore instructions:')
    console.log(`   ${readmePath}\n`)
  }
  
  // Confirm restore
  console.log('⚠️  WARNING: This will restore the backup to the current project directory')
  console.log('   Make sure you have a backup of your current data!')
  console.log('\n   Press Ctrl+C to cancel, or wait 5 seconds to continue...')
  
  await new Promise(resolve => setTimeout(resolve, 5000))
  
  try {
    const projectRoot = path.resolve(__dirname, '..')
    const targetUri = loadEnv()
    
    // Restore application code
    await restoreApplicationCode(backupDir, projectRoot)
    
    // Restore database
    await restoreDatabase(backupDir, targetUri)
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ RESTORE COMPLETE!')
    console.log('='.repeat(60))
    console.log('\n💡 Next steps:')
    console.log('   1. Update .env.local with your actual credentials')
    console.log('   2. Run: npm install')
    console.log('   3. Run: npm run build')
    console.log('   4. Run: npm run dev')
    console.log('   5. Verify: node scripts/test-mongodb-connection.js')
    
  } catch (error) {
    console.error('\n❌ Restore failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}

module.exports = { main, restoreDatabase, restoreApplicationCode }

