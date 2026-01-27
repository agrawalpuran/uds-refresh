/**
 * Script to fix employee 300004's email encryption
 * Uses the EXACT SAME key derivation as the server (lib/utils/encryption.ts)
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config({ path: '.env.local' });

// Encryption setup - EXACT SAME as lib/utils/encryption.ts
const algorithm = 'aes-256-cbc';
const IV_LENGTH = 16;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!';

// CRITICAL: Use the SAME key derivation as the server
function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY, 'utf8');
  // If key is not 32 bytes, hash it to get 32 bytes (SAME AS SERVER)
  if (key.length !== 32) {
    return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
  }
  return key;
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKey();
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('base64') + ':' + encrypted;
}

function decrypt(text) {
  if (!text || !text.includes(':')) return text;
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    const key = getKey();
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(parts[1], 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.log('Decryption failed:', e.message);
    return null;
  }
}

async function main() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/uds';
  console.log('Connecting to MongoDB...');
  console.log('Using ENCRYPTION_KEY:', ENCRYPTION_KEY.substring(0, 20) + '...');
  console.log('Key length:', ENCRYPTION_KEY.length);
  console.log('Using SHA256 hash:', ENCRYPTION_KEY.length !== 32 ? 'YES' : 'NO');
  
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  
  // Test encryption/decryption round-trip
  const testEmail = 'admin@akasaair.com';
  const encrypted = encrypt(testEmail);
  const decrypted = decrypt(encrypted);
  console.log('\n=== Encryption Test ===');
  console.log('Original:', testEmail);
  console.log('Encrypted:', encrypted);
  console.log('Decrypted:', decrypted);
  console.log('Round-trip success:', decrypted === testEmail ? 'YES' : 'NO');
  
  if (decrypted !== testEmail) {
    console.error('FATAL: Encryption round-trip failed! Aborting.');
    process.exit(1);
  }
  
  // Get employee 300004
  const emp = await db.collection('employees').findOne({ id: '300004' });
  
  console.log('\n=== Employee 300004 Current State ===');
  console.log('Email (raw):', emp.email);
  const currentDecrypted = decrypt(emp.email);
  console.log('Decrypted email:', currentDecrypted || 'CANNOT DECRYPT');
  
  // Update the employee with properly encrypted data
  const newEmail = 'admin@akasaair.com';
  const newFirstName = 'Arjun';
  const newLastName = 'Menon';
  
  console.log('\n=== Fixing Employee 300004 ===');
  console.log('Setting email to:', newEmail);
  
  const encryptedEmail = encrypt(newEmail);
  const encryptedFirstName = encrypt(newFirstName);
  const encryptedLastName = encrypt(newLastName);
  
  console.log('Encrypted email:', encryptedEmail);
  console.log('Verification decrypt:', decrypt(encryptedEmail));
  
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
  console.log('\nDone! Try logging in with admin@akasaair.com now.');
}

main().catch(console.error);
