/**
 * EmailProvider - Simple Gmail SMTP wrapper using nodemailer
 * 
 * Phase 1: Simple, synchronous email sending for low-volume notifications.
 * Uses Gmail SMTP with App Password authentication.
 * 
 * Environment Variables Required:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-email@gmail.com
 *   SMTP_PASS=your-app-password (16-character app password from Google)
 *   SMTP_FROM_NAME=UDS Notifications
 *   SMTP_FROM_EMAIL=your-email@gmail.com
 */

import nodemailer, { Transporter } from 'nodemailer'

// =============================================================================
// TYPES
// =============================================================================

export interface EmailPayload {
  to: string
  subject: string
  body: string // HTML body
  fromName?: string
  fromEmail?: string
}

export interface EmailResult {
  success: boolean
  messageId?: string
  error?: string
  errorCode?: string // Categorized error code
  errorDetails?: Record<string, any> // Additional error context
}

// Error codes for categorization
export const EMAIL_ERROR_CODES = {
  MISSING_CREDENTIALS: 'MISSING_CREDENTIALS',
  INVALID_RECIPIENT: 'INVALID_RECIPIENT',
  MISSING_FIELDS: 'MISSING_FIELDS',
  AUTH_FAILED: 'AUTH_FAILED',
  CONNECTION_FAILED: 'CONNECTION_FAILED',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMITED: 'RATE_LIMITED',
  REJECTED: 'REJECTED',
  UNKNOWN: 'UNKNOWN',
} as const

// =============================================================================
// STATE
// =============================================================================

// Singleton transporter instance
let transporter: Transporter | null = null

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Classify SMTP error into a readable error code
 */
function classifySmtpError(error: any): { code: string; details: Record<string, any> } {
  const message = (error.message || '').toLowerCase()
  const responseCode = error.responseCode || error.code
  
  // Authentication errors
  if (
    message.includes('invalid login') ||
    message.includes('authentication') ||
    message.includes('auth') ||
    responseCode === 535
  ) {
    return {
      code: EMAIL_ERROR_CODES.AUTH_FAILED,
      details: {
        hint: 'Check SMTP_USER and SMTP_PASS. For Gmail, use App Password (not regular password)',
        responseCode,
      },
    }
  }

  // Connection errors
  if (
    message.includes('econnrefused') ||
    message.includes('enotfound') ||
    message.includes('connection') ||
    message.includes('socket')
  ) {
    return {
      code: EMAIL_ERROR_CODES.CONNECTION_FAILED,
      details: {
        hint: 'Check SMTP_HOST and SMTP_PORT. Ensure network allows outbound SMTP',
        responseCode,
      },
    }
  }

  // Timeout
  if (message.includes('timeout') || message.includes('etimedout')) {
    return {
      code: EMAIL_ERROR_CODES.TIMEOUT,
      details: {
        hint: 'SMTP server did not respond in time. Check network connectivity',
        responseCode,
      },
    }
  }

  // Rate limiting
  if (
    message.includes('rate') ||
    message.includes('too many') ||
    message.includes('limit') ||
    responseCode === 450 ||
    responseCode === 452
  ) {
    return {
      code: EMAIL_ERROR_CODES.RATE_LIMITED,
      details: {
        hint: 'Sending too many emails. Wait and try again later',
        responseCode,
      },
    }
  }

  // Recipient rejection
  if (
    message.includes('recipient') ||
    message.includes('mailbox') ||
    message.includes('user unknown') ||
    responseCode === 550 ||
    responseCode === 553
  ) {
    return {
      code: EMAIL_ERROR_CODES.INVALID_RECIPIENT,
      details: {
        hint: 'Recipient email may be invalid or not accepting mail',
        responseCode,
      },
    }
  }

  // Generic rejection
  if (responseCode >= 500 && responseCode < 600) {
    return {
      code: EMAIL_ERROR_CODES.REJECTED,
      details: {
        hint: 'Email was rejected by the server',
        responseCode,
      },
    }
  }

  // Unknown
  return {
    code: EMAIL_ERROR_CODES.UNKNOWN,
    details: {
      originalError: error.message,
      responseCode,
      errorCode: error.code,
    },
  }
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Strip HTML tags to create plain text version
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Get or create nodemailer transporter (singleton)
 * Uses Gmail SMTP with TLS on port 587
 */
function getTransporter(): Transporter {
  if (transporter) {
    return transporter
  }

  const host = process.env.SMTP_HOST || 'smtp.gmail.com'
  const port = parseInt(process.env.SMTP_PORT || '587', 10)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS

  if (!user || !pass) {
    console.error('[EmailProvider] ❌ SMTP credentials missing:', {
      hasUser: !!user,
      hasPass: !!pass,
      hint: 'Set SMTP_USER and SMTP_PASS environment variables',
    })
    throw new Error('SMTP_USER and SMTP_PASS environment variables are required')
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false, // TLS on port 587
    auth: { user, pass },
    tls: {
      rejectUnauthorized: true,
    },
    // Connection timeout settings
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 30000, // 30 seconds for sending
  })

  console.log(`[EmailProvider] ✅ SMTP transporter created`, {
    host,
    port,
    user: user.substring(0, 3) + '***', // Mask email
  })
  return transporter
}

/**
 * Send email via Gmail SMTP
 * Simple, synchronous send - no retries or queuing
 */
export async function sendEmail(payload: EmailPayload): Promise<EmailResult> {
  const { to, subject, body, fromName, fromEmail } = payload
  const startTime = Date.now()

  // Validate required fields
  if (!to || !subject || !body) {
    console.error('[EmailProvider] ❌ Missing required fields:', {
      hasTo: !!to,
      hasSubject: !!subject,
      hasBody: !!body,
    })
    return {
      success: false,
      error: 'Missing required fields: to, subject, or body',
      errorCode: EMAIL_ERROR_CODES.MISSING_FIELDS,
    }
  }

  // Validate email format
  if (!isValidEmail(to)) {
    console.error('[EmailProvider] ❌ Invalid email format:', {
      to,
      hint: 'Email format should be: user@domain.com',
    })
    return {
      success: false,
      error: `Invalid email format: ${to}`,
      errorCode: EMAIL_ERROR_CODES.INVALID_RECIPIENT,
    }
  }

  try {
    const transport = getTransporter()

    // Build "from" address
    const defaultFromName = process.env.SMTP_FROM_NAME || 'UDS Notifications'
    const defaultFromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER
    const from = `${fromName || defaultFromName} <${fromEmail || defaultFromEmail}>`

    console.log(`[EmailProvider] 📤 Sending email...`, {
      to,
      subject: subject.substring(0, 50) + (subject.length > 50 ? '...' : ''),
      from: defaultFromName,
    })

    // Send email
    const info = await transport.sendMail({
      from,
      to,
      subject,
      html: body,
      text: stripHtml(body),
    })

    const duration = Date.now() - startTime

    console.log(`[EmailProvider] ✅ Email sent successfully`, {
      messageId: info.messageId,
      to,
      duration: `${duration}ms`,
      accepted: info.accepted,
      rejected: info.rejected,
    })

    return {
      success: true,
      messageId: info.messageId,
    }
  } catch (error: any) {
    const duration = Date.now() - startTime
    const { code, details } = classifySmtpError(error)

    console.error(`[EmailProvider] ❌ SMTP_ERROR [${code}]`, {
      errorCode: code,
      to,
      subject: subject.substring(0, 50),
      duration: `${duration}ms`,
      originalError: error.message,
      ...details,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    })

    return {
      success: false,
      error: error.message || 'Unknown error sending email',
      errorCode: code,
      errorDetails: details,
    }
  }
}

/**
 * Verify SMTP connection (health check)
 */
export async function verifyConnection(): Promise<boolean> {
  try {
    const transport = getTransporter()
    await transport.verify()
    console.log('[EmailProvider] ✅ SMTP connection verified')
    return true
  } catch (error: any) {
    const { code, details } = classifySmtpError(error)
    console.error(`[EmailProvider] ❌ SMTP connection failed [${code}]`, {
      errorCode: code,
      originalError: error.message,
      ...details,
    })
    return false
  }
}

/**
 * Reset transporter (useful for testing or credential rotation)
 */
export function resetTransporter(): void {
  if (transporter) {
    transporter.close()
    transporter = null
    console.log('[EmailProvider] 🔄 Transporter reset')
  }
}
