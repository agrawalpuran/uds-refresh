/**
 * MongoDB Shell One-Liner: Convert ObjectId to String in productvendors
 * 
 * This is a MongoDB shell script (mongosh) version for quick execution.
 * 
 * Usage:
 *   mongosh "your-connection-string" --eval "$(cat scripts/migrate-productvendor-objectid-to-string-shell.js)"
 * 
 * Or copy-paste the one-liner directly into mongosh:
 */

// One-liner version (copy this into mongosh)
db.productvendors.find({}).forEach(function(doc) {
  var updateFields = {};
  var needsUpdate = false;
  
  // Check and convert vendorId
  if (doc.vendorId && doc.vendorId.constructor === ObjectId) {
    updateFields.vendorId = doc.vendorId.toString();
    needsUpdate = true;
  }
  
  // Check and convert productId
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
