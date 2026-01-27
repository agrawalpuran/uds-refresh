/**
 * Script to fix employee 300004's email encryption
 * The email was encrypted with a different key and needs to be re-encrypted
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

// Encryption setup - same as lib/utils/encryption.ts
const algorithm = 'aes-256-cbc';
const key = (process.env.ENCRYPTION_KEY || 'uds-default-encryption-key-32chr').padEnd(32, '0').slice(0, 32);
const keyBuffer = Buffer.from(key, 'utf8');

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, keyBuffer, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const [ivHex, encrypted] = text.split(':');
    const iv = Buffer.from(ivHex, 'base64');
    const decipher = crypto.createDecipheriv(algorithm, keyBuffer, iv);
    let decrypted = decipher.update(encrypted, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    return null; // Couldn't decrypt
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds';
  console.log('Connecting to MongoDB...\n');
  
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  // Get employee 300004
  const emp = await db.collection('employees').findOne({ id: '300004' });
  
  console.log('=== Employee 300004 Current State ===');
  console.log('Email (raw):', emp.email);
  console.log('FirstName (raw):', emp.firstName);
  console.log('LastName (raw):', emp.lastName);
  
  const decryptedEmail = decrypt(emp.email);
  console.log('Decrypted email:', decryptedEmail || 'CANNOT DECRYPT');
  
  // Set the correct email - admin@akasaair.com
  const newEmail = 'admin@akasaair.com';
  const newFirstName = 'Arjun';
  const newLastName = 'Menon';
  
  console.log('\n=== Fixing Employee 300004 ===');
  console.log('Setting email to:', newEmail);
  console.log('Setting name to:', newFirstName, newLastName);
  
  // Encrypt the new values
  const encryptedEmail = encrypt(newEmail);
  const encryptedFirstName = encrypt(newFirstName);
  const encryptedLastName = encrypt(newLastName);
  
  console.log('Encrypted email:', encryptedEmail);
  
  // Update the employee
  const result = await db.collection('employees').updateOne(
    { id: '300004' },
    { 
      $set: { 
        email: encryptedEmail,
        firstName: encryptedFirstName,
        lastName: encryptedLastName
      } 
    }
  );
  
  console.log('Update result:', result.modifiedCount > 0 ? 'SUCCESS' : 'No change');
  
  // Verify
  const updated = await db.collection('employees').findOne({ id: '300004' });
  console.log('\n=== Verification ===');
  console.log('New email (raw):', updated.email);
  console.log('Decrypted email:', decrypt(updated.email));
  console.log('Decrypted name:', decrypt(updated.firstName), decrypt(updated.lastName));
  
  await mongoose.disconnect();
  console.log('\nDone! You can now log in with admin@akasaair.com');
}

main().catch(console.error);
