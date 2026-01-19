/**
 * SendGridProvider
 * 
 * Concrete implementation for SendGrid email provider.
 * Uses SendGrid API v3 for sending emails.
 */

import { EmailProvider, SendEmailPayload, SendEmailResult, EmailStatusResult, HealthCheckResult } from './EmailProvider'

export interface SendGridConfig {
  apiKey: string // SendGrid API key
  fromName?: string // Default "From" name
  fromEmail: string // Default "From" email (must be verified in SendGrid)
  replyTo?: string // Default Reply-To email
}

export class SendGridProvider implements EmailProvider {
  readonly providerId: string
  readonly providerCode: string = 'SENDGRID'
  readonly providerName: string = 'SendGrid Email Provider'

  private config: SendGridConfig | null = null
  private apiKey: string | null = null

  constructor(providerId: string) {
    this.providerId = providerId
  }

  /**
   * Initialize SendGrid provider with API key
   */
  async initialize(config: SendGridConfig): Promise<void> {
    this.config = config
    this.apiKey = config.apiKey

    if (!this.apiKey) {
      throw new Error('SendGrid API key is required')
    }

    // Verify API key by making a test request
    try {
      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        throw new Error(`SendGrid API key validation failed: ${response.statusText}`)
      }

      console.log(`[SendGridProvider] ✅ SendGrid API key validated`)
    } catch (error: any) {
      console.error(`[SendGridProvider] ❌ SendGrid initialization failed:`, error.message)
      throw new Error(`SendGrid initialization failed: ${error.message}`)
    }
  }

  /**
   * Send email via SendGrid API
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    try {
      if (!this.apiKey || !this.config) {
        throw new Error('SendGridProvider not initialized')
      }

      // Prepare SendGrid API payload
      const sendGridPayload: any = {
        personalizations: [
          {
            to: Array.isArray(payload.to)
              ? payload.to.map(email => ({ email }))
              : [{ email: payload.to }],
            ...(payload.cc && {
              cc: Array.isArray(payload.cc)
                ? payload.cc.map(email => ({ email }))
                : [{ email: payload.cc }],
            }),
            ...(payload.bcc && {
              bcc: Array.isArray(payload.bcc)
                ? payload.bcc.map(email => ({ email }))
                : [{ email: payload.bcc }],
            }),
          },
        ],
        from: {
          email: payload.fromEmail,
          name: payload.fromName || this.config.fromName,
        },
        subject: payload.subject,
        content: [
          {
            type: 'text/html',
            value: payload.body,
          },
          {
            type: 'text/plain',
            value: this.stripHtml(payload.body),
          },
        ],
        ...(payload.replyTo || this.config.replyTo
          ? { reply_to: { email: payload.replyTo || this.config.replyTo } }
          : {}),
      }

      // Add tracking options
      if (payload.trackOpens || payload.trackClicks) {
        sendGridPayload.tracking_settings = {
          click_tracking: {
            enable: payload.trackClicks || false,
          },
          open_tracking: {
            enable: payload.trackOpens || false,
          },
        }
      }

      // Add attachments if provided
      if (payload.attachments && payload.attachments.length > 0) {
        sendGridPayload.attachments = payload.attachments.map(att => ({
          content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
          filename: att.filename,
          type: att.contentType || 'application/octet-stream',
          disposition: 'attachment',
        }))
      }

      // Send email via SendGrid API
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sendGridPayload),
      })

      if (!response.ok) {
        const errorBody = await response.text()
        throw new Error(`SendGrid API error: ${response.status} ${response.statusText} - ${errorBody}`)
      }

      // Extract message ID from response headers
      const messageId = response.headers.get('x-message-id') || undefined

      return {
        success: true,
        messageId,
        providerResponse: {
          status: response.status,
          statusText: response.statusText,
        },
      }
    } catch (error: any) {
      console.error('[SendGridProvider] Error sending email:', error)
      return {
        success: false,
        error: error.message || 'Unknown error',
        errorCode: error.code || 'SENDGRID_ERROR',
      }
    }
  }

  /**
   * Get email status from SendGrid (requires webhook setup)
   * Note: This is a placeholder - actual implementation requires webhook handling
   */
  async getEmailStatus(messageId: string): Promise<EmailStatusResult> {
    // SendGrid doesn't provide a direct API to check status
    // Status updates come via webhooks
    // This would need to be implemented with a webhook handler
    return {
      success: false,
      status: 'FAILED',
      error: 'SendGrid status check requires webhook implementation',
    }
  }

  /**
   * Health check for SendGrid API
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.apiKey) {
        return {
          success: false,
          error: 'SendGridProvider not initialized',
        }
      }

      const response = await fetch('https://api.sendgrid.com/v3/user/profile', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        return {
          success: true,
          message: 'SendGrid API is healthy',
        }
      } else {
        return {
          success: false,
          error: `SendGrid API returned ${response.status}`,
        }
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'SendGrid health check failed',
      }
    }
  }

  /**
   * Validate email address format
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  /**
   * Strip HTML tags to create plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  }
}

