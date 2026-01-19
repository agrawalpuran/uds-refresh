# Quick Reference: productvendors ObjectId to String Migration

## 🚀 Quick Start

### 1. Preview Changes (Dry Run)
```bash
node scripts/migrate-productvendor-objectid-to-string.js --dry-run
```

### 2. Execute Migration
```bash
node scripts/migrate-productvendor-objectid-to-string.js
```

### 3. MongoDB Shell One-Liner
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
    db.productvendors.updateOne({ _id: doc._id }, { $set: updateFields });
    print("Updated: " + doc._id);
  }
});
print("Done!");
```

## ✅ What It Does

- Converts `vendorId` from ObjectId → String
- Converts `productId` from ObjectId → String
- Preserves all other fields
- Safe: Uses `$set` operator (no document replacement)

## 🔍 Verify After Migration

```javascript
// Should return 0 (no ObjectIds remaining)
db.productvendors.find({
  $or: [
    { vendorId: { $type: "objectId" } },
    { productId: { $type: "objectId" } }
  ]
}).count()

// Should match total count (all strings)
db.productvendors.find({
  $and: [
    { vendorId: { $type: "string" } },
    { productId: { $type: "string" } }
  ]
}).count()
```

## 📋 Files

- **Main Script**: `scripts/migrate-productvendor-objectid-to-string.js`
- **Shell Script**: `scripts/migrate-productvendor-objectid-to-string-shell.js`
- **Full Guide**: `scripts/MIGRATE_PRODUCTVENDOR_OBJECTID_TO_STRING.md`
