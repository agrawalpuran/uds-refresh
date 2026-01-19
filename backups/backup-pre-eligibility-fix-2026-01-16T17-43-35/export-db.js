// Database Export Script
// Run with: node scripts/export-db-backup.js

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution';
const BACKUP_DIR = 'backups/backup-pre-eligibility-fix-2026-01-16T17-43-35/database';

async function exportCollections() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
    
    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();
    
    console.log('Found ' + collections.length + ' collections');
    
    for (const collInfo of collections) {
        const collName = collInfo.name;
        console.log('Exporting: ' + collName + '...');
        
        const collection = db.collection(collName);
        const documents = await collection.find({}).toArray();
        
        const outputPath = path.join(BACKUP_DIR, collName + '.json');
        fs.writeFileSync(outputPath, JSON.stringify(documents, null, 2));
        
        console.log('   Exported ' + documents.length + ' documents to ' + collName + '.json');
    }
    
    console.log('\\nDatabase export complete!');
    await mongoose.disconnect();
}

exportCollections().catch(err => {
    console.error('Export failed:', err);
    process.exit(1);
});
