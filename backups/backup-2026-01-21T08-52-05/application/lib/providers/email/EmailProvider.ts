/**
 * EmailProvider Interface
 * 
 * Provider-agnostic interface for email operations.
 * All email provider-specific logic is isolated behind this abstraction.
 * 
 * This interface follows the same pattern as LogisticsProvider for consistency.
 */

export interface SendEmailPayload {
  to: string | string[] // Recipient email address(es)
  cc?: string | string[] // CC email address(es)
  bcc?: string | string[] // BCC email address(es)
  subject: string // Email subject
  body: string // Email body (HTML or plain text)
  fromName?: string // Display name for "From" field
  fromEmail: string // "From" email address
  replyTo?: string // Reply-To email address
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
  // Template variables (for providers that support template rendering)
  templateVariables?: Record<string, any>
  // Tracking options
  trackOpens?: boolean
  trackClicks?: boolean
}

export interface SendEmailResult {
  success: boolean
  messageId?: string // Provider's message ID
  providerResponse?: any // Raw response from provider
  error?: string
  errorCode?: string
}

export interface EmailStatusResult {
  success: boolean
  status: 'SENT' | 'DELIVERED' | 'BOUNCED' | 'REJECTED' | 'OPENED' | 'CLICKED' | 'FAILED'
  deliveredAt?: Date
  openedAt?: Date
  clickedAt?: Date
  bounceReason?: string
  error?: string
  rawResponse?: any
}

export interface HealthCheckResult {
  success: boolean
  message?: string
  error?: string
  rawResponse?: any
}

/**
 * EmailProvider Interface
 * 
 * All email providers must implement this interface.
 * This ensures provider-agnostic execution throughout the system.
 */
export interface EmailProvider {
  /**
   * Provider identifier
   */
  readonly providerId: string
  readonly providerCode: string
  readonly providerName: string

  /**
   * Initialize the provider with credentials
   * @param config Provider-specific configuration (decrypted)
   */
  initialize(config: any): Promise<void>

  /**
   * Send an email
   * @param payload Email payload
   */
  sendEmail(payload: SendEmailPayload): Promise<SendEmailResult>

  /**
   * Get status of a sent email (if supported by provider)
   * @param messageId Provider's message ID
   */
  getEmailStatus?(messageId: string): Promise<EmailStatusResult>

  /**
   * Health check for provider API/service
   */
  healthCheck(): Promise<HealthCheckResult>

  /**
   * Validate email address format
   * @param email Email address to validate
   */
  validateEmail?(email: string): boolean
}

