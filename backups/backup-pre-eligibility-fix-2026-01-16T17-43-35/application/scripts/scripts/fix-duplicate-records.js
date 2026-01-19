/**
 * Fix duplicate records that caused migration errors
 */

const mongoose = require('mongoose');

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/;

async function fixDuplicates() {
  await mongoose.connect('mongodb://localhost:27017/uniform-distribution');
  const db = mongoose.connection.db;
  
  console.log('============================================');
  console.log('FIXING DUPLICATE RECORDS');
  console.log('============================================');
  
  // 1. Fix productcategories duplicates
  console.log('\n1. Checking productcategories for duplicates...');
  const categories = await db.collection('productcategories').find({}).toArray();
  const categoryDuplicates = categories.filter(c => 
    c.companyId && HEX_24_REGEX.test(String(c.companyId))
  );
  
  console.log(`   Found ${categoryDuplicates.length} productcategories with hex-string companyId`);
  
  for (const cat of categoryDuplicates) {
    // Check if a valid version exists with string ID
    const validVersion = categories.find(c => 
      c.name === cat.name && 
      /^\d{6}$/.test(String(c.companyId)) &&
      c._id.toString() !== cat._id.toString()
    );
    
    if (validVersion) {
      console.log(`   Deleting duplicate: ${cat.name} (hex companyId=${cat.companyId})`);
      await db.collection('productcategories').deleteOne({ _id: cat._id });
    } else {
      // No valid version exists - need to find the correct company ID
      const companies = await db.collection('companies').find({}).toArray();
      const company = companies.find(c => c._id.toString() === String(cat.companyId));
      if (company && company.id) {
        console.log(`   Updating: ${cat.name} (hex companyId=${cat.companyId} -> ${company.id})`);
        await db.collection('productcategories').updateOne(
          { _id: cat._id },
          { $set: { companyId: company.id } }
        );
      } else {
        console.log(`   ⚠️ Company not found for: ${cat.companyId}, deleting orphaned category`);
        await db.collection('productcategories').deleteOne({ _id: cat._id });
      }
    }
  }
  
  // 2. Fix vendorinventories duplicates (productId)
  console.log('\n2. Checking vendorinventories for duplicates...');
  const inventories = await db.collection('vendorinventories').find({}).toArray();
  const inventoryDuplicates = inventories.filter(inv => 
    inv.productId && HEX_24_REGEX.test(String(inv.productId))
  );
  
  console.log(`   Found ${inventoryDuplicates.length} vendorinventories with hex-string productId`);
  
  // Build lookup map for products
  const products = await db.collection('uniforms').find({}).toArray();
  const productMap = new Map();
  for (const p of products) {
    productMap.set(p._id.toString(), p.id);
  }
  
  for (const inv of inventoryDuplicates) {
    const productIdStr = productMap.get(String(inv.productId));
    if (!productIdStr) {
      console.log(`   ⚠️ Product not found for: ${inv.productId}, deleting orphaned inventory`);
      await db.collection('vendorinventories').deleteOne({ _id: inv._id });
      continue;
    }
    
    // Check if a valid version exists
    const validVersion = inventories.find(i => 
      i.vendorId === inv.vendorId && 
      i.productId === productIdStr &&
      i._id.toString() !== inv._id.toString()
    );
    
    if (validVersion) {
      console.log(`   Deleting duplicate inventory for vendor=${inv.vendorId}, product=${inv.productId}`);
      await db.collection('vendorinventories').deleteOne({ _id: inv._id });
    } else {
      console.log(`   Updating inventory: productId ${inv.productId} -> ${productIdStr}`);
      await db.collection('vendorinventories').updateOne(
        { _id: inv._id },
        { $set: { productId: productIdStr } }
      );
    }
  }
  
  console.log('\n============================================');
  console.log('DUPLICATE FIX COMPLETE');
  console.log('============================================');
  
  await mongoose.disconnect();
}

fixDuplicates().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
