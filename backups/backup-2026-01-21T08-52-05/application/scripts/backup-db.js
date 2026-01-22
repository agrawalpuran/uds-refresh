const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/uniform-distribution';

async function backupDatabase() {
  const backupDir = process.argv[2] || 'backups/db-backup';
  
  console.log('Connecting to MongoDB...');
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('Connected successfully');
    
    const db = client.db('uniform-distribution');
    
    // Get all collection names
    const collections = await db.listCollections().toArray();
    console.log(`Found ${collections.length} collections`);
    
    // Create backup directory
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    // Export each collection
    for (const collInfo of collections) {
      const collName = collInfo.name;
      console.log(`Exporting collection: ${collName}`);
      
      const collection = db.collection(collName);
      const documents = await collection.find({}).toArray();
      
      const filePath = path.join(backupDir, `${collName}.json`);
      fs.writeFileSync(filePath, JSON.stringify(documents, null, 2));
      
      console.log(`  - Exported ${documents.length} documents to ${filePath}`);
    }
    
    console.log('\n✅ Database backup completed successfully!');
    console.log(`Backup location: ${backupDir}`);
    
  } catch (error) {
    console.error('❌ Backup failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

backupDatabase();
