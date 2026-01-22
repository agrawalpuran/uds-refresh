/**
 * EmailProviderFactory
 * 
 * Factory for creating and initializing email provider instances.
 * Handles provider-specific initialization and credential management.
 * 
 * Follows the same pattern as ProviderFactory for logistics providers.
 */

import { EmailProvider } from './EmailProvider'
import { SMTPProvider, SMTPConfig } from './SMTPProvider'
import { SendGridProvider, SendGridConfig } from './SendGridProvider'
import { SESProvider, SESConfig } from './SESProvider'
import { decrypt } from '@/lib/utils/encryption'
import connectDB from '@/lib/db/mongodb'
import NotificationSenderProfile from '@/lib/models/NotificationSenderProfile'

/**
 * Create and initialize an email provider instance from NotificationSenderProfile
 * 
 * @param senderId - NotificationSenderProfile.senderId
 * @returns Initialized EmailProvider instance
 */
export async function createEmailProvider(senderId: string): Promise<EmailProvider | null> {
  await connectDB()

  // Get sender profile
  const senderProfile = await NotificationSenderProfile.findOne({ senderId, isActive: true }).lean()
  
  if (!senderProfile) {
    throw new Error(`Email sender profile ${senderId} not found or inactive`)
  }

  // If using default provider, return null (system will use default)
  if (senderProfile.useDefaultProvider) {
    return null
  }

  if (!senderProfile.providerType || !senderProfile.providerConfig) {
    throw new Error(`Email sender profile ${senderId} missing provider configuration`)
  }

  // Decrypt provider configuration
  let decryptedConfig: any
  try {
    if (typeof senderProfile.providerConfig === 'string') {
      const decrypted = decrypt(senderProfile.providerConfig)
      decryptedConfig = JSON.parse(decrypted)
    } else {
      decryptedConfig = senderProfile.providerConfig
    }
  } catch (error: any) {
    throw new Error(`Failed to decrypt provider configuration: ${error.message}`)
  }

  // Create provider instance based on provider type
  let providerInstance: EmailProvider

  switch (senderProfile.providerType) {
    case 'SMTP':
      providerInstance = new SMTPProvider(senderId)
      await providerInstance.initialize({
        ...decryptedConfig,
        fromName: senderProfile.senderName,
        fromEmail: senderProfile.senderEmail,
        replyTo: senderProfile.replyToEmail,
      } as SMTPConfig)
      break

    case 'SENDGRID':
      providerInstance = new SendGridProvider(senderId)
      await providerInstance.initialize({
        ...decryptedConfig,
        fromName: senderProfile.senderName,
        fromEmail: senderProfile.senderEmail,
        replyTo: senderProfile.replyToEmail,
      } as SendGridConfig)
      break

    case 'SES':
      providerInstance = new SESProvider(senderId)
      await providerInstance.initialize({
        ...decryptedConfig,
        fromName: senderProfile.senderName,
        fromEmail: senderProfile.senderEmail,
        replyTo: senderProfile.replyToEmail,
      } as SESConfig)
      break

    case 'MAILGUN':
      // Placeholder for Mailgun - implement when needed
      throw new Error('Mailgun provider not yet implemented')

    case 'CUSTOM':
      // Placeholder for custom providers - implement when needed
      throw new Error('Custom provider not yet implemented')

    default:
      throw new Error(`Unsupported email provider type: ${senderProfile.providerType}`)
  }

  return providerInstance
}

/**
 * Create email provider instance with direct configuration (for testing/development)
 * 
 * @param providerType - Provider type (SMTP, SENDGRID, SES, etc.)
 * @param config - Provider-specific configuration
 * @returns Initialized EmailProvider instance
 */
export async function createEmailProviderWithConfig(
  providerType: 'SMTP' | 'SENDGRID' | 'SES',
  config: SMTPConfig | SendGridConfig | SESConfig
): Promise<EmailProvider> {
  let providerInstance: EmailProvider

  switch (providerType) {
    case 'SMTP':
      providerInstance = new SMTPProvider('direct')
      await providerInstance.initialize(config as SMTPConfig)
      break

    case 'SENDGRID':
      providerInstance = new SendGridProvider('direct')
      await providerInstance.initialize(config as SendGridConfig)
      break

    case 'SES':
      providerInstance = new SESProvider('direct')
      await providerInstance.initialize(config as SESConfig)
      break

    default:
      throw new Error(`Unsupported email provider type: ${providerType}`)
  }

  return providerInstance
}

/**
 * Get default email provider for a company
 * Returns the first active sender profile for the company, or null
 * 
 * @param companyId - Company ID
 * @returns EmailProvider instance or null
 */
export async function getDefaultEmailProviderForCompany(companyId: string): Promise<EmailProvider | null> {
  await connectDB()

  const senderProfile = await NotificationSenderProfile.findOne({
    companyId,
    isActive: true,
    useDefaultProvider: true,
  }).lean()

  if (!senderProfile) {
    return null
  }

  return createEmailProvider(senderProfile.senderId)
}

