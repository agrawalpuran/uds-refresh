/**
 * SMTPProvider
 * 
 * Concrete implementation for SMTP email provider.
 * Supports standard SMTP servers (Gmail, Outlook, custom SMTP, etc.)
 */

import { EmailProvider, SendEmailPayload, SendEmailResult, HealthCheckResult } from './EmailProvider'
import nodemailer, { Transporter, TransportOptions } from 'nodemailer'

export interface SMTPConfig {
  host: string // SMTP server host
  port: number // SMTP server port (usually 587 for TLS, 465 for SSL, 25 for unencrypted)
  secure: boolean // Use SSL (true for port 465, false for others)
  auth: {
    user: string // SMTP username/email
    pass: string // SMTP password/app password
  }
  fromName?: string // Default "From" name
  fromEmail: string // Default "From" email
  replyTo?: string // Default Reply-To email
  // Optional: Custom TLS options
  tls?: {
    rejectUnauthorized?: boolean
    ciphers?: string
  }
}

export class SMTPProvider implements EmailProvider {
  readonly providerId: string
  readonly providerCode: string = 'SMTP'
  readonly providerName: string = 'SMTP Email Provider'

  private config: SMTPConfig | null = null
  private transporter: Transporter | null = null

  constructor(providerId: string) {
    this.providerId = providerId
  }

  /**
   * Initialize SMTP provider with configuration
   */
  async initialize(config: SMTPConfig): Promise<void> {
    this.config = config

    // Create nodemailer transporter
    const transportOptions: TransportOptions = {
      host: config.host,
      port: config.port,
      secure: config.secure, // true for 465, false for other ports
      auth: {
        user: config.auth.user,
        pass: config.auth.pass,
      },
    }

    // Add TLS options if provided
    if (config.tls) {
      transportOptions.tls = config.tls
    }

    this.transporter = nodemailer.createTransport(transportOptions)

    // Verify connection
    try {
      await this.transporter.verify()
      console.log(`[SMTPProvider] ✅ SMTP connection verified for ${config.host}`)
    } catch (error: any) {
      console.error(`[SMTPProvider] ❌ SMTP connection failed:`, error.message)
      throw new Error(`SMTP connection failed: ${error.message}`)
    }
  }

  /**
   * Send email via SMTP
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    try {
      if (!this.transporter || !this.config) {
        throw new Error('SMTPProvider not initialized')
      }

      // Prepare email options
      const mailOptions = {
        from: payload.fromName
          ? `${payload.fromName} <${payload.fromEmail}>`
          : payload.fromEmail,
        to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
        cc: payload.cc ? (Array.isArray(payload.cc) ? payload.cc.join(', ') : payload.cc) : undefined,
        bcc: payload.bcc ? (Array.isArray(payload.bcc) ? payload.bcc.join(', ') : payload.bcc) : undefined,
        subject: payload.subject,
        html: payload.body, // Assume HTML body
        text: this.stripHtml(payload.body), // Plain text fallback
        replyTo: payload.replyTo || this.config.replyTo || payload.fromEmail,
        attachments: payload.attachments?.map(att => ({
          filename: att.filename,
          content: att.content,
          contentType: att.contentType,
        })),
      }

      // Send email
      const info = await this.transporter.sendMail(mailOptions)

      return {
        success: true,
        messageId: info.messageId,
        providerResponse: {
          accepted: info.accepted,
          rejected: info.rejected,
          response: info.response,
        },
      }
    } catch (error: any) {
      console.error('[SMTPProvider] Error sending email:', error)
      return {
        success: false,
        error: error.message || 'Unknown error',
        errorCode: error.code || 'SMTP_ERROR',
      }
    }
  }

  /**
   * Health check for SMTP connection
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.transporter) {
        return {
          success: false,
          error: 'SMTPProvider not initialized',
        }
      }

      await this.transporter.verify()
      return {
        success: true,
        message: 'SMTP connection healthy',
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'SMTP health check failed',
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

