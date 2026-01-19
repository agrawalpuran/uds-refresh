/**
 * WhatsApp Message Sender
 * Handles sending messages via WhatsApp providers (Twilio, Meta, etc.)
 */

// Twilio integration
async function sendViaTwilio(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_WHATSAPP_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    console.error('[WhatsApp Message Sender] Twilio credentials not configured')
    return {
      success: false,
      error: 'Twilio credentials not configured',
    }
  }

  try {
    const twilio = require('twilio')
    const client = twilio(accountSid, authToken)

    // Format phone number for WhatsApp
    const toWhatsApp = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`

    const result = await client.messages.create({
      from: fromNumber,
      to: toWhatsApp,
      body: message,
    })

    console.log(`[WhatsApp Message Sender] Message sent via Twilio: ${result.sid}`)

    return {
      success: true,
      messageId: result.sid,
    }
  } catch (error: any) {
    console.error('[WhatsApp Message Sender] Twilio error:', error)
    return {
      success: false,
      error: error.message || 'Failed to send message via Twilio',
    }
  }
}

// Meta/Facebook WhatsApp Business API integration
async function sendViaMeta(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID
  const accessToken = process.env.META_ACCESS_TOKEN
  const apiVersion = process.env.META_API_VERSION || 'v18.0'

  if (!phoneNumberId || !accessToken) {
    console.error('[WhatsApp Message Sender] Meta credentials not configured')
    return {
      success: false,
      error: 'Meta credentials not configured',
    }
  }

  try {
    // Remove + and any spaces from phone number
    const cleanPhone = to.replace(/[\s\+]/g, '')

    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: cleanPhone,
          type: 'text',
          text: {
            body: message,
          },
        }),
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('[WhatsApp Message Sender] Meta API error:', data)
      return {
        success: false,
        error: data.error?.message || 'Failed to send message via Meta',
      }
    }

    console.log(`[WhatsApp Message Sender] Message sent via Meta: ${data.messages?.[0]?.id}`)

    return {
      success: true,
      messageId: data.messages?.[0]?.id,
    }
  } catch (error: any) {
    console.error('[WhatsApp Message Sender] Meta error:', error)
    return {
      success: false,
      error: error.message || 'Failed to send message via Meta',
    }
  }
}

/**
 * Send WhatsApp message via configured provider
 */
export async function sendWhatsAppMessage(
  to: string,
  message: string
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const provider = process.env.WHATSAPP_PROVIDER || 'twilio'

  console.log(`[WhatsApp Message Sender] Sending message to ${to} via ${provider}`)

  switch (provider.toLowerCase()) {
    case 'twilio':
      return await sendViaTwilio(to, message)

    case 'meta':
    case 'facebook':
      return await sendViaMeta(to, message)

    default:
      console.warn(
        `[WhatsApp Message Sender] Unknown provider: ${provider}. Message not sent.`
      )
      return {
        success: false,
        error: `Unknown provider: ${provider}`,
      }
  }
}

