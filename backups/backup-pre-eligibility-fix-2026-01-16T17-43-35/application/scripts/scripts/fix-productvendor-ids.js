/**
 * Migration script to fix ProductVendor records that have ObjectId strings
 * instead of proper 6-digit string IDs
 */

const mongoose = require('mongoose');

async function fixProductVendorIds() {
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  console.log('Starting ProductVendor ID migration...');
  
  // Mapping from ObjectId strings to proper string IDs
  const productMapping = {
    '6942765c1cab48e899e8bfdd': '200007',  // Heels - Female
    '6942765c1cab48e899e8bfe1': '200008',  // Sneakers - Unisex
    '6942765c1cab48e899e8bfd9': '200006',  // Loafers - Male
    '694a5661c98a028c74a82104': '200015',  // Formal Shoes - Female
    '694a5661c98a028c74a82109': '200020',  // Belt - Unisex
    '6942765c1cab48e899e8bfe9': '200010',  // Tie - Unisex
  };
  
  const vendorMapping = {
    '6929b9d9a2fdaf5e8d099e3e': '100002',  // Footwear Plus
    '695fada695142f4e3a385514': '100001',  // UniformPro Inc
  };
  
  // Get all ProductVendor links
  const allLinks = await db.collection('productvendors').find({}).toArray();
  console.log(`Found ${allLinks.length} ProductVendor records`);
  
  let updated = 0;
  for (const link of allLinks) {
    const newProductId = productMapping[link.productId];
    const newVendorId = vendorMapping[link.vendorId];
    
    if (newProductId || newVendorId) {
      const updateFields = {};
      if (newProductId) updateFields.productId = newProductId;
      if (newVendorId) updateFields.vendorId = newVendorId;
      
      await db.collection('productvendors').updateOne(
        { _id: link._id },
        { $set: updateFields }
      );
      
      console.log(`Updated: productId ${link.productId} -> ${newProductId || link.productId}, vendorId ${link.vendorId} -> ${newVendorId || link.vendorId}`);
      updated++;
    }
  }
  
  console.log(`\nMigration complete. Total records updated: ${updated}`);
  
  // Verify the fix
  const verifyLinks = await db.collection('productvendors').find({}).toArray();
  console.log('\nVerification - All ProductVendor records:');
  verifyLinks.forEach(link => {
    const isValid = /^\d{6}$/.test(link.productId) && /^\d{6}$/.test(link.vendorId);
    console.log(`  productId: ${link.productId}, vendorId: ${link.vendorId} - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
  });
  
  await mongoose.disconnect();
}

fixProductVendorIds().catch(console.error);
