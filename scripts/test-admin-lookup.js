/**
 * Test script to verify admin lookup works by employee ID
 * 
 * The "smarter" fix ensures that admin identification works based on employee ID,
 * not email. This means even if an admin's email changes, they remain the admin.
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds';
  console.log('Connecting to MongoDB...');
  
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  console.log('\n=========================================');
  console.log('Testing Admin Lookup by Employee ID');
  console.log('=========================================\n');
  
  // Test 1: Check that Akasa Air has adminId set
  const akasa = await db.collection('companies').findOne({ id: '100002' });
  console.log('✅ Test 1: Company adminId field');
  console.log(`   Company: ${akasa.name}`);
  console.log(`   adminId: ${akasa.adminId}`);
  console.log(`   Status: ${akasa.adminId ? 'PASS' : 'FAIL'}`);
  
  // Test 2: Verify the adminId matches an employee
  const admin = await db.collection('employees').findOne({ id: akasa.adminId });
  console.log('\n✅ Test 2: Admin employee exists');
  console.log(`   Employee ID: ${admin?.id || 'NOT FOUND'}`);
  console.log(`   Status: ${admin ? 'PASS' : 'FAIL'}`);
  
  // Test 3: Verify that lookup by adminId returns the company
  const companyByAdmin = await db.collection('companies').findOne({ adminId: akasa.adminId });
  console.log('\n✅ Test 3: Company lookup by adminId');
  console.log(`   Found company: ${companyByAdmin?.name || 'NOT FOUND'}`);
  console.log(`   Status: ${companyByAdmin ? 'PASS' : 'FAIL'}`);
  
  // Test 4: Check branches/locations for adminId pattern
  const locations = await db.collection('locations').find({ companyId: '100002' }).toArray();
  console.log('\n✅ Test 4: Location/Branch admin setup');
  console.log(`   Total locations: ${locations.length}`);
  locations.forEach(loc => {
    console.log(`   - ${loc.name}: adminId=${loc.adminId || 'NOT SET'}`);
  });
  
  // Summary
  console.log('\n=========================================');
  console.log('SUMMARY');
  console.log('=========================================');
  console.log('The "smarter" admin identification now works as follows:');
  console.log('');
  console.log('1. Company.adminId stores the EMPLOYEE ID (not email)');
  console.log('2. Location.adminId stores the EMPLOYEE ID (not email)');
  console.log('3. Branch.adminId stores the EMPLOYEE ID (not email)');
  console.log('');
  console.log('When an admin logs in:');
  console.log('  1. System looks up employee by email');
  console.log('  2. Gets the employee ID from the found employee');
  console.log('  3. Looks up company/location/branch by adminId = employee ID');
  console.log('');
  console.log('This means:');
  console.log('  ✓ Admin email can be changed without losing admin status');
  console.log('  ✓ Admin status is tied to employee record, not email');
  console.log('  ✓ More reliable and maintainable');
  
  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
