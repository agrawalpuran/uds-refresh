# Migration Guide: Convert ObjectId to String in productvendors Collection

## Overview
This migration converts `vendorId` and `productId` fields from ObjectId format to string format in the `productvendors` collection.

## Why This Migration?
- The schema expects `vendorId` and `productId` to be string types (6-digit numeric strings)
- Some documents may have been created with ObjectId types
- This migration ensures consistency across all documents

## Prerequisites
- MongoDB connection string configured in `.env.local` as `MONGODB_URI`
- Node.js installed
- Access to the MongoDB database

## Migration Scripts

### Option 1: Node.js Script (Recommended)
**File:** `scripts/migrate-productvendor-objectid-to-string.js`

**Dry Run (Preview Changes):**
```bash
node scripts/migrate-productvendor-objectid-to-string.js --dry-run
```

**Execute Migration:**
```bash
node scripts/migrate-productvendor-objectid-to-string.js
```

**Features:**
- ✅ Dry-run mode to preview changes
- ✅ Detailed logging of each update
- ✅ Safety checks to prevent accidental data loss
- ✅ Error handling and summary report
- ✅ Only updates fields that need conversion

### Option 2: MongoDB Shell One-Liner (Quick Fix)
**File:** `scripts/migrate-productvendor-objectid-to-string-shell.js`

**Using mongosh:**
```bash
mongosh "your-connection-string" --eval "$(cat scripts/migrate-productvendor-objectid-to-string-shell.js)"
```

**Or copy-paste directly into mongosh:**
```javascript
db.productvendors.find({}).forEach(function(doc) {
  var updateFields = {};
  var needsUpdate = false;
  
  if (doc.vendorId && doc.vendorId.constructor === ObjectId) {
    updateFields.vendorId = doc.vendorId.toString();
    needsUpdate = true;
  }
  
  if (doc.productId && doc.productId.constructor === ObjectId) {
    updateFields.productId = doc.productId.toString();
    needsUpdate = true;
  }
  
  if (needsUpdate) {
    db.productvendors.updateOne(
      { _id: doc._id },
      { $set: updateFields }
    );
    print("Updated document: " + doc._id);
  }
});
print("Migration completed!");
```

## What Gets Updated?

### Fields Updated:
- ✅ `vendorId`: ObjectId → String
- ✅ `productId`: ObjectId → String

### Fields Preserved:
- ✅ `_id`: Never modified
- ✅ `createdAt`: Preserved
- ✅ `updatedAt`: Preserved (automatically updated by MongoDB)
- ✅ All other fields: Preserved

## Safety Features

1. **Dry-Run Mode**: Preview changes before applying
2. **Selective Updates**: Only updates fields that are ObjectId types
3. **No Document Replacement**: Uses `$set` operator, not document replacement
4. **Error Handling**: Continues processing even if individual updates fail
5. **Detailed Logging**: Shows exactly what's being changed

## Expected Output

### Dry Run:
```
📊 Starting migration: Convert ObjectId to String in productvendors
🔍 Mode: DRY RUN (no changes will be made)
────────────────────────────────────────────────────────────
📋 Found 150 total documents in productvendors collection
  🔄 Document 507f1f77bcf86cd799439011: Converting vendorId from ObjectId to string
  🔄 Document 507f1f77bcf86cd799439012: Converting productId from ObjectId to string
  ...

────────────────────────────────────────────────────────────
📊 Migration Summary:
   Total documents processed: 150
   📝 Documents that would be updated: 45
   ⏭️  Documents that would be skipped: 105

⚠️  DRY RUN MODE - No changes were made to the database
   Run without --dry-run to apply changes
```

### Live Run:
```
📊 Starting migration: Convert ObjectId to String in productvendors
🔍 Mode: LIVE (changes will be saved)
────────────────────────────────────────────────────────────
📋 Found 150 total documents in productvendors collection
  ✅ Updated document 507f1f77bcf86cd799439011
  ✅ Updated document 507f1f77bcf86cd799439012
  ...

────────────────────────────────────────────────────────────
📊 Migration Summary:
   Total documents processed: 150
   ✅ Documents updated: 45
   ⏭️  Documents skipped: 105
   ❌ Errors: 0

✅ Migration completed successfully!
```

## Verification

After running the migration, verify the changes:

```javascript
// Check for any remaining ObjectId types
db.productvendors.find({
  $or: [
    { vendorId: { $type: "objectId" } },
    { productId: { $type: "objectId" } }
  ]
}).count()

// Should return 0

// Verify all are strings
db.productvendors.find({
  $and: [
    { vendorId: { $type: "string" } },
    { productId: { $type: "string" } }
  ]
}).count()

// Should match total document count
```

## Rollback

If you need to rollback (not recommended unless absolutely necessary):

⚠️ **Warning**: Rollback is complex because we don't know the original ObjectId values. 
Only rollback if you have a backup of the original data.

## Troubleshooting

### Error: "MongoDB connection failed"
- Check your `MONGODB_URI` in `.env.local`
- Verify network connectivity
- Check MongoDB Atlas IP whitelist (if using Atlas)

### Error: "Cannot read property 'toString' of null"
- Some documents may have null values
- The script handles this, but check your data if errors occur

### No documents updated
- All documents may already be in string format
- Check a sample document: `db.productvendors.findOne()`

## Support

If you encounter issues:
1. Run with `--dry-run` first to preview changes
2. Check the logs for specific error messages
3. Verify your MongoDB connection
4. Ensure you have write permissions on the collection
