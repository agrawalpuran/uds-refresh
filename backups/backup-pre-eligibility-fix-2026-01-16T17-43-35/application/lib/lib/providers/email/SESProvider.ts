/**
 * SESProvider
 * 
 * Concrete implementation for AWS SES (Simple Email Service) provider.
 * Uses AWS SES API for sending emails.
 */

import { EmailProvider, SendEmailPayload, SendEmailResult, EmailStatusResult, HealthCheckResult } from './EmailProvider'

export interface SESConfig {
  accessKeyId: string // AWS Access Key ID
  secretAccessKey: string // AWS Secret Access Key
  region: string // AWS region (e.g., 'us-east-1', 'ap-south-1')
  fromName?: string // Default "From" name
  fromEmail: string // Default "From" email (must be verified in SES)
  replyTo?: string // Default Reply-To email
}

export class SESProvider implements EmailProvider {
  readonly providerId: string
  readonly providerCode: string = 'SES'
  readonly providerName: string = 'AWS SES Email Provider'

  private config: SESConfig | null = null
  private awsCredentials: { accessKeyId: string; secretAccessKey: string } | null = null
  private region: string | null = null

  constructor(providerId: string) {
    this.providerId = providerId
  }

  /**
   * Initialize SES provider with AWS credentials
   */
  async initialize(config: SESConfig): Promise<void> {
    this.config = config
    this.awsCredentials = {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    }
    this.region = config.region

    if (!this.awsCredentials.accessKeyId || !this.awsCredentials.secretAccessKey) {
      throw new Error('AWS credentials are required')
    }

    // Verify credentials by making a test request
    try {
      await this.makeSESRequest('GetSendQuota', {})
      console.log(`[SESProvider] ✅ AWS SES credentials validated for region ${this.region}`)
    } catch (error: any) {
      console.error(`[SESProvider] ❌ AWS SES initialization failed:`, error.message)
      throw new Error(`AWS SES initialization failed: ${error.message}`)
    }
  }

  /**
   * Send email via AWS SES
   */
  async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    try {
      if (!this.awsCredentials || !this.region || !this.config) {
        throw new Error('SESProvider not initialized')
      }

      // Prepare SES API payload
      const sesPayload: any = {
        Source: payload.fromName
          ? `${payload.fromName} <${payload.fromEmail}>`
          : payload.fromEmail,
        Destination: {
          ToAddresses: Array.isArray(payload.to) ? payload.to : [payload.to],
          ...(payload.cc && {
            CcAddresses: Array.isArray(payload.cc) ? payload.cc : [payload.cc],
          }),
          ...(payload.bcc && {
            BccAddresses: Array.isArray(payload.bcc) ? payload.bcc : [payload.bcc],
          }),
        },
        Message: {
          Subject: {
            Data: payload.subject,
            Charset: 'UTF-8',
          },
          Body: {
            Html: {
              Data: payload.body,
              Charset: 'UTF-8',
            },
            Text: {
              Data: this.stripHtml(payload.body),
              Charset: 'UTF-8',
            },
          },
        },
        ...(payload.replyTo || this.config.replyTo
          ? { ReplyToAddresses: [payload.replyTo || this.config.replyTo] }
          : {}),
      }

      // Send email via SES API
      const response = await this.makeSESRequest('SendEmail', sesPayload)

      return {
        success: true,
        messageId: response.MessageId,
        providerResponse: response,
      }
    } catch (error: any) {
      console.error('[SESProvider] Error sending email:', error)
      return {
        success: false,
        error: error.message || 'Unknown error',
        errorCode: error.code || 'SES_ERROR',
      }
    }
  }

  /**
   * Get email status from SES (requires SNS notifications setup)
   * Note: This is a placeholder - actual implementation requires SNS webhook handling
   */
  async getEmailStatus(messageId: string): Promise<EmailStatusResult> {
    // SES doesn't provide a direct API to check status
    // Status updates come via SNS notifications
    // This would need to be implemented with an SNS webhook handler
    return {
      success: false,
      status: 'FAILED',
      error: 'SES status check requires SNS webhook implementation',
    }
  }

  /**
   * Health check for AWS SES
   */
  async healthCheck(): Promise<HealthCheckResult> {
    try {
      if (!this.awsCredentials || !this.region) {
        return {
          success: false,
          error: 'SESProvider not initialized',
        }
      }

      await this.makeSESRequest('GetSendQuota', {})
      return {
        success: true,
        message: 'AWS SES is healthy',
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'AWS SES health check failed',
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
   * Make AWS SES API request using AWS Signature Version 4
   * This is a simplified implementation - in production, use AWS SDK
   */
  private async makeSESRequest(action: string, payload: any): Promise<any> {
    if (!this.awsCredentials || !this.region) {
      throw new Error('SESProvider not initialized')
    }

    // For production, use AWS SDK (@aws-sdk/client-ses)
    // This is a placeholder implementation
    const { SESClient, SendEmailCommand, GetSendQuotaCommand } = await import('@aws-sdk/client-ses')
    
    const sesClient = new SESClient({
      region: this.region,
      credentials: {
        accessKeyId: this.awsCredentials.accessKeyId,
        secretAccessKey: this.awsCredentials.secretAccessKey,
      },
    })

    let command
    if (action === 'SendEmail') {
      command = new SendEmailCommand(payload)
    } else if (action === 'GetSendQuota') {
      command = new GetSendQuotaCommand({})
    } else {
      throw new Error(`Unsupported SES action: ${action}`)
    }

    const response = await sesClient.send(command)
    return response
  }

  /**
   * Strip HTML tags to create plain text version
   */
  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
  }
}

