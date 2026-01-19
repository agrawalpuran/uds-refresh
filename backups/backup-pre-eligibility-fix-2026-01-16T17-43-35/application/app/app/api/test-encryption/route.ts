/**
 * CRITICAL DIAGNOSTIC: Test encryption key loading in Next.js runtime
 * This endpoint verifies that the encryption key is loaded correctly
 * and that encryption/decryption works as expected
 */

import { NextResponse } from 'next/server'
import { encrypt, decrypt } from '@/lib/utils/encryption'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    // Get the key (same way as encryption.ts does)
    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production-32-chars!!'
    
    // Test encryption/decryption
    const testEmail = 'test@example.com'
    const encrypted = encrypt(testEmail)
    const decrypted = decrypt(encrypted)
    
    // Return diagnostic info (masked for security)
    return NextResponse.json({
      success: true,
      keyLoaded: !!process.env.ENCRYPTION_KEY,
      keyLength: ENCRYPTION_KEY.length,
      keyPrefix: ENCRYPTION_KEY.substring(0, 10) + '...',
      encryptionWorks: encrypted !== testEmail && encrypted.includes(':'),
      decryptionWorks: decrypted === testEmail,
      roundTripWorks: decrypted === testEmail,
      testEmail: testEmail,
      encryptedSample: encrypted.substring(0, 50) + '...',
      decryptedResult: decrypted,
      message: decrypted === testEmail 
        ? '✅ Encryption/decryption works correctly' 
        : '❌ Encryption/decryption failed!'
    })
  } catch (error) {
    const err = error as any;
    console.error('API Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
}
}}}}
