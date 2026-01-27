/**
 * Script to set up Akasa Air company admin
 * Sets the adminId on the company to the employee ID
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: '.env.local' });

// Simple encryption functions (same as in lib/utils/encryption.ts)
const crypto = require('crypto');
const algorithm = 'aes-256-cbc';
const key = process.env.ENCRYPTION_KEY || 'uds-default-encryption-key-32chr';
const keyBuffer = Buffer.from(key.padEnd(32, '0').slice(0, 32), 'utf8');

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'base64');
  const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
  let decrypted = decipher.update(encrypted, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds';
  console.log('Connecting to MongoDB...');
  
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  // Find Akasa Air company
  const akasa = await db.collection('companies').findOne({ id: '100002' });
  console.log('\n=== Akasa Air Company ===');
  console.log('Current adminId:', akasa?.adminId || 'NOT SET');
  
  // Find employee 300004 (likely Arjun Menon)
  const emp300004 = await db.collection('employees').findOne({ id: '300004' });
  console.log('\n=== Employee 300004 ===');
  if (emp300004) {
    try {
      console.log('Name:', decrypt(emp300004.firstName), decrypt(emp300004.lastName));
      console.log('Email:', decrypt(emp300004.email));
    } catch (e) {
      console.log('Name:', emp300004.firstName, emp300004.lastName);
      console.log('Email:', emp300004.email);
    }
  }
  
  // Find all Akasa Air employees with decrypted names
  const allEmployees = await db.collection('employees').find({ companyId: '100002' }).toArray();
  console.log('\n=== All Akasa Air Employees ===');
  for (const emp of allEmployees) {
    let firstName = emp.firstName;
    let lastName = emp.lastName;
    let email = emp.email;
    
    try {
      firstName = decrypt(emp.firstName);
    } catch (e) {}
    try {
      lastName = decrypt(emp.lastName);
    } catch (e) {}
    try {
      email = decrypt(emp.email);
    } catch (e) {}
    
    console.log(`${emp.id}: ${firstName} ${lastName} - ${email}`);
  }
  
  // Ask user which employee should be the admin
  console.log('\n=== Setting Admin ===');
  console.log('Setting employee 300004 as Company Admin for Akasa Air...');
  
  // Update the company with adminId
  const result = await db.collection('companies').updateOne(
    { id: '100002' },
    { $set: { adminId: '300004' } }
  );
  
  console.log('Update result:', result.modifiedCount > 0 ? 'SUCCESS' : 'No change (maybe already set)');
  
  // Verify the update
  const updated = await db.collection('companies').findOne({ id: '100002' });
  console.log('Updated adminId:', updated?.adminId);
  
  await mongoose.disconnect();
  console.log('\nDone!');
}

main().catch(console.error);
