/**
 * WhatsApp Webhook API Endpoint
 * Receives incoming WhatsApp messages and processes them through the state machine
 */

import { NextRequest, NextResponse } from 'next/server'
import { processMessage } from '@/lib/whatsapp/state-handler'
import { sendWhatsAppMessage } from '@/lib/whatsapp/message-sender'

/**
 * POST /api/whatsapp/webhook
 * 
 * Handles incoming WhatsApp messages
 * 
 * Twilio sends form-encoded data: application/x-www-form-urlencoded
 * Format: From=whatsapp%3A%2B919876543210&Body=Hello&MessageSid=SM123
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST(request: NextRequest) {
  try {

  // CRITICAL: Always return 200 immediately to prevent Error 11200
  // Process asynchronously - never block the response
  
  const startTime = Date.now()
  let body: any = {}
  let whatsappNumber: string | undefined
  let messageText: string = ''
  let messageId: string = `msg_${Date.now()}`
  
  try {
    // Step 1: Read request body safely (can only be read once in Next.js)
    const contentType = request.headers.get('content-type') || ''
    
    try {
      // Twilio sends form-encoded data
      if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('form-data')) {
        const formData = await request.formData()
        body = Object.fromEntries(formData.entries())
        console.log('[WhatsApp Webhook] ✅ Parsed form-encoded data')
      } 
      // JSON payload (other providers)
      else if (contentType.includes('application/json')) {
        body = await request.json()
        console.log('[WhatsApp Webhook] ✅ Parsed JSON payload')
      }
      // Unknown content type - try form data first (Twilio default)
      else {
        try {
          const formData = await request.formData()
          body = Object.fromEntries(formData.entries())
          console.log('[WhatsApp Webhook] ✅ Parsed as form data (default)')
        } catch (formError) {
          // If form data fails, try JSON
          try {
            body = await request.json()
            console.log('[WhatsApp Webhook] ✅ Parsed as JSON (fallback)')
          } catch (jsonError) {
            // If both fail, use empty body (still return 200)
            console.warn('[WhatsApp Webhook] ⚠️ Could not parse body, using empty object')
            body = {}
          }
        }
      }
    } catch (parseError: any) {
      // Log error but continue - we'll return 200 anyway
      console.error('[WhatsApp Webhook] ❌ Body parse error:', parseError.message)
      body = {}
    }
    
    // Step 2: Extract message data (handle multiple field name variations)
    whatsappNumber = body.from || body.phoneNumber || body.sender || body.From || body.FromNumber || ''
    messageText = body.message || body.text || body.body || body.Body || body.MessageBody || ''
    messageId = body.messageId || body.id || body.MessageSid || body.SmsMessageSid || body.Sid || messageId
    
    // Normalize phone number (remove 'whatsapp:' prefix if present)
    if (whatsappNumber && typeof whatsappNumber === 'string') {
      whatsappNumber = whatsappNumber.replace(/^whatsapp:/i, '').trim()
    }
    
    // Step 3: Log request details (for debugging)
    const responseTime = Date.now() - startTime
    console.log('[WhatsApp Webhook] 📥 Request received:', {
      contentType,
      hasBody: Object.keys(body).length > 0,
      phoneNumber: whatsappNumber ? whatsappNumber.substring(0, 10) + '...' : 'missing',
      messageLength: messageText.length,
      messageId,
      responseTime: `${responseTime}ms`
    })
    
    // Step 4: Return 200 IMMEDIATELY (before any processing)
    // This is CRITICAL - Twilio requires fast response
    const response = NextResponse.json(
      {
        success: true,
        acknowledged: true,
        messageId: messageId,
        timestamp: new Date().toISOString()
      },
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': `${responseTime}ms`
        }
      }
    )
    
    // Step 5: Process message asynchronously (fire and forget)
    // This runs in background and doesn't block the response
    if (whatsappNumber && messageText && messageText.trim().length > 0) {
      // Process in background - don't await (use Promise without await)
      processMessage(whatsappNumber, messageText)
        .then((responseText) => {
          console.log(`[WhatsApp Webhook] ✅ Response generated: ${responseText.substring(0, 50)}...`)
          return sendWhatsAppMessage(whatsappNumber, responseText)
        })
        .then((sendResult) => {
          if (sendResult.success) {
            console.log(`[WhatsApp Webhook] ✅ Message sent: ${sendResult.messageId}`)
          } else {
            console.error(`[WhatsApp Webhook] ❌ Send failed: ${sendResult.error}`)
          }
        })
        .catch((processError: any) => {
          console.error('[WhatsApp Webhook] ❌ Processing error:', processError.message)
          console.error('[WhatsApp Webhook] Stack:', processError.stack)
        })
    } else {
      console.warn('[WhatsApp Webhook] ⚠️ Missing phone or message - skipping processing')
      if (!whatsappNumber) {
        console.warn('[WhatsApp Webhook] ⚠️ Phone number missing. Body keys:', Object.keys(body))
      }
      if (!messageText || messageText.trim().length === 0) {
        console.warn('[WhatsApp Webhook] ⚠️ Message text missing or empty')
      }
    }
    
    // Step 6: Return response immediately (this happens before async processing)
    return response
    
  } catch (error) {
    const err = error as any;
    // CRITICAL: Always return 200, even on unexpected errors
    // This prevents Twilio from retrying and causing more errors
    const responseTime = Date.now() - startTime
    console.error('[WhatsApp Webhook] ❌ Unexpected error:', error.message)
    console.error('[WhatsApp Webhook] Stack:', error.stack)
    
    return NextResponse.json(
      {
        success: true,
        acknowledged: true,
        error: 'Error occurred but acknowledged',
        timestamp: new Date().toISOString()
      },
      {
        status: 200, // ALWAYS 200
        headers: {
          'Content-Type': 'application/json',
          'X-Response-Time': `${responseTime}ms`
        }
      }
    )
  } catch (error) {
    const err = error as any;
    console.error(`[API] Error in POST handler:`, error)
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

/**
 * GET /api/whatsapp/webhook
 * 
 * Webhook verification endpoint (for providers that require it)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get('hub.mode')
    const token = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')
    
    // Webhook verification (for Meta/Facebook)
    const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'your_verify_token_here'
    
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
      console.log('[WhatsApp Webhook] Verification successful')
      return new NextResponse(challenge, { status: 200 })
    }
    
    // For Twilio or other GET requests, just return success
    console.log('[WhatsApp Webhook] GET request received')
    return NextResponse.json({ 
      message: 'WhatsApp webhook endpoint',
      status: 'active'
    }, { status: 200 })
  } catch (error) {
    const err = error as any;
    console.error('[WhatsApp Webhook] GET error:', error)
    return NextResponse.json({ 
      message: 'WhatsApp webhook endpoint',
      status: 'active'
    }, { status: 200 })
}}}}}}}}
