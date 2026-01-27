/**
 * CompanyNotificationConfigService
 * 
 * Manages company-specific notification configurations.
 * Provides methods to:
 * - Get/create/update company notification settings
 * - Check if a notification event is enabled for a company
 * - Get custom templates for a company
 * - Apply company branding to emails
 */

import connectDB from '../db/mongodb'
import CompanyNotificationConfig, { ICompanyNotificationConfig, IEventConfig } from '../models/CompanyNotificationConfig'
import NotificationEvent from '../models/NotificationEvent'
import NotificationTemplate from '../models/NotificationTemplate'

// Cache for company configs (simple in-memory cache)
const configCache = new Map<string, { config: ICompanyNotificationConfig | null; timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateConfigId(companyId: string): string {
  return `CNC-${companyId}`
}

function isCacheValid(timestamp: number): boolean {
  return Date.now() - timestamp < CACHE_TTL
}

function clearCache(companyId?: string): void {
  if (companyId) {
    configCache.delete(companyId)
  } else {
    configCache.clear()
  }
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Get notification config for a company
 * Returns null if no custom config exists (use system defaults)
 */
export async function getCompanyNotificationConfig(
  companyId: string
): Promise<ICompanyNotificationConfig | null> {
  if (!companyId) return null

  // Check cache
  const cached = configCache.get(companyId)
  if (cached && isCacheValid(cached.timestamp)) {
    return cached.config
  }

  await connectDB()

  const config = await CompanyNotificationConfig.findOne({ companyId }).lean()

  // Update cache
  configCache.set(companyId, {
    config: config as ICompanyNotificationConfig | null,
    timestamp: Date.now(),
  })

  return config as ICompanyNotificationConfig | null
}

/**
 * Check if notifications are enabled for a company
 */
export async function areNotificationsEnabled(companyId: string): Promise<boolean> {
  if (!companyId) return true // Default: enabled

  const config = await getCompanyNotificationConfig(companyId)
  
  // If no config exists, use system default (enabled)
  if (!config) return true

  return config.notificationsEnabled
}

/**
 * Check if a specific event is enabled for a company
 */
export async function isEventEnabledForCompany(
  companyId: string,
  eventCode: string
): Promise<boolean> {
  if (!companyId || !eventCode) return true // Default: enabled

  const config = await getCompanyNotificationConfig(companyId)

  // If no config exists, use system default (enabled)
  if (!config) return true

  // Check master switch first
  if (!config.notificationsEnabled) return false

  // Check event-specific config
  const eventConfig = config.eventConfigs?.find(
    (ec) => ec.eventCode.toUpperCase() === eventCode.toUpperCase()
  )

  // If no specific config for this event, default to enabled
  if (!eventConfig) return true

  return eventConfig.isEnabled
}

/**
 * Get event config for a company
 * Returns the specific event configuration or null
 */
export async function getEventConfigForCompany(
  companyId: string,
  eventCode: string
): Promise<IEventConfig | null> {
  if (!companyId || !eventCode) return null

  const config = await getCompanyNotificationConfig(companyId)
  if (!config) return null

  return config.eventConfigs?.find(
    (ec) => ec.eventCode.toUpperCase() === eventCode.toUpperCase()
  ) || null
}

/**
 * Get template for a company (custom or default)
 * Returns custom template if exists, otherwise returns default template
 */
export async function getTemplateForCompany(
  companyId: string,
  eventCode: string
): Promise<{ subject: string; body: string } | null> {
  await connectDB()

  // First, get the default template
  const event = await NotificationEvent.findOne({ eventCode: eventCode.toUpperCase() }).lean()
  if (!event) return null

  const defaultTemplate = await NotificationTemplate.findOne({
    eventId: event.eventId,
    isActive: true,
  }).lean()

  if (!defaultTemplate) return null

  // Check for company-specific override
  if (companyId) {
    const eventConfig = await getEventConfigForCompany(companyId, eventCode)
    
    if (eventConfig) {
      return {
        subject: eventConfig.customSubject || defaultTemplate.subjectTemplate,
        body: eventConfig.customBody || defaultTemplate.bodyTemplate,
      }
    }
  }

  // Return default template
  return {
    subject: defaultTemplate.subjectTemplate,
    body: defaultTemplate.bodyTemplate,
  }
}

/**
 * Get company branding for emails
 */
export async function getCompanyBranding(companyId: string): Promise<{
  brandName: string
  brandColor: string
  logoUrl?: string
  ccEmails: string[]
  bccEmails: string[]
}> {
  const defaultBranding = {
    brandName: 'UDS',
    brandColor: '#4A90A4',
    ccEmails: [] as string[],
    bccEmails: [] as string[],
  }

  if (!companyId) return defaultBranding

  const config = await getCompanyNotificationConfig(companyId)
  if (!config) return defaultBranding

  return {
    brandName: config.brandName || defaultBranding.brandName,
    brandColor: config.brandColor || defaultBranding.brandColor,
    logoUrl: config.logoUrl,
    ccEmails: config.ccEmails || [],
    bccEmails: config.bccEmails || [],
  }
}

/**
 * Check if current time is within quiet hours for a company
 */
export async function isInQuietHours(companyId: string): Promise<boolean> {
  if (!companyId) return false

  const config = await getCompanyNotificationConfig(companyId)
  if (!config || !config.quietHoursEnabled) return false
  if (!config.quietHoursStart || !config.quietHoursEnd) return false

  const tz = config.quietHoursTimezone || 'Asia/Kolkata'

  try {
    // Get current time in company timezone
    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const currentTime = formatter.format(now)

    const start = config.quietHoursStart
    const end = config.quietHoursEnd

    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    if (start > end) {
      // Quiet hours span midnight
      return currentTime >= start || currentTime < end
    } else {
      // Normal quiet hours
      return currentTime >= start && currentTime < end
    }
  } catch (error) {
    console.warn(`[CompanyNotificationConfig] Error checking quiet hours: ${error}`)
    return false
  }
}

/**
 * Get when quiet hours end for a company
 * Returns a Date object representing when quiet hours end (for scheduling queued notifications)
 */
export async function getQuietHoursEndTime(companyId: string): Promise<Date | null> {
  if (!companyId) return null

  const config = await getCompanyNotificationConfig(companyId)
  if (!config || !config.quietHoursEnabled) return null
  if (!config.quietHoursStart || !config.quietHoursEnd) return null

  const tz = config.quietHoursTimezone || 'Asia/Kolkata'
  const endTime = config.quietHoursEnd // e.g., "08:00"

  try {
    const now = new Date()
    
    // Parse end time
    const [endHour, endMinute] = endTime.split(':').map(Number)
    
    // Get current date in the company's timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    
    const parts = formatter.formatToParts(now)
    const currentYear = parseInt(parts.find(p => p.type === 'year')?.value || '2024')
    const currentMonth = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1
    const currentDay = parseInt(parts.find(p => p.type === 'day')?.value || '1')
    const currentHour = parseInt(parts.find(p => p.type === 'hour')?.value || '0')
    const currentMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0')
    
    // Create a date for quiet hours end time
    let endDate = new Date(currentYear, currentMonth, currentDay, endHour, endMinute, 0, 0)
    
    // If current time is past quiet hours end, schedule for next day
    const currentTimeMinutes = currentHour * 60 + currentMinute
    const endTimeMinutes = endHour * 60 + endMinute
    
    // Handle overnight quiet hours (e.g., 22:00 to 08:00)
    const startTime = config.quietHoursStart
    const [startHour] = startTime.split(':').map(Number)
    const startTimeMinutes = startHour * 60 + parseInt(startTime.split(':')[1] || '0')
    
    if (startTimeMinutes > endTimeMinutes) {
      // Overnight quiet hours
      if (currentTimeMinutes >= startTimeMinutes || currentTimeMinutes < endTimeMinutes) {
        // We're in quiet hours
        if (currentTimeMinutes >= startTimeMinutes) {
          // It's after start time, so end time is tomorrow
          endDate.setDate(endDate.getDate() + 1)
        }
        // If currentTimeMinutes < endTimeMinutes, end time is today (already set)
      }
    } else {
      // Same-day quiet hours
      if (currentTimeMinutes >= endTimeMinutes) {
        // Past quiet hours for today, schedule for tomorrow
        endDate.setDate(endDate.getDate() + 1)
      }
    }
    
    // Add a 1-minute buffer to ensure we're past quiet hours
    endDate.setMinutes(endDate.getMinutes() + 1)
    
    return endDate
  } catch (error) {
    console.warn(`[CompanyNotificationConfig] Error calculating quiet hours end: ${error}`)
    return null
  }
}

// =============================================================================
// CRUD FUNCTIONS
// =============================================================================

/**
 * Create or update company notification config
 */
export async function upsertCompanyNotificationConfig(
  companyId: string,
  updates: Partial<ICompanyNotificationConfig>,
  updatedBy?: string
): Promise<ICompanyNotificationConfig> {
  await connectDB()

  const configId = generateConfigId(companyId)

  const result = await CompanyNotificationConfig.findOneAndUpdate(
    { companyId },
    {
      $set: {
        ...updates,
        id: configId,
        companyId,
        updatedBy,
      },
      $setOnInsert: {
        createdBy: updatedBy,
      },
    },
    {
      new: true,
      upsert: true,
      runValidators: true,
    }
  ).lean()

  // Clear cache
  clearCache(companyId)

  return result as ICompanyNotificationConfig
}

/**
 * Update a specific event config for a company
 */
export async function updateEventConfig(
  companyId: string,
  eventCode: string,
  eventConfig: Partial<IEventConfig>,
  updatedBy?: string
): Promise<ICompanyNotificationConfig | null> {
  await connectDB()

  const config = await CompanyNotificationConfig.findOne({ companyId })
  
  if (!config) {
    // Create new config with this event
    return upsertCompanyNotificationConfig(
      companyId,
      {
        notificationsEnabled: true,
        eventConfigs: [{
          eventCode: eventCode.toUpperCase(),
          isEnabled: eventConfig.isEnabled ?? true,
          customSubject: eventConfig.customSubject,
          customBody: eventConfig.customBody,
          recipients: eventConfig.recipients,
        }],
      },
      updatedBy
    )
  }

  // Find existing event config
  const existingIndex = config.eventConfigs?.findIndex(
    (ec) => ec.eventCode.toUpperCase() === eventCode.toUpperCase()
  ) ?? -1

  if (existingIndex >= 0) {
    // Update existing
    const updatePath = `eventConfigs.${existingIndex}`
    const updateFields: any = { updatedBy }
    
    if (eventConfig.isEnabled !== undefined) {
      updateFields[`${updatePath}.isEnabled`] = eventConfig.isEnabled
    }
    if (eventConfig.customSubject !== undefined) {
      updateFields[`${updatePath}.customSubject`] = eventConfig.customSubject
    }
    if (eventConfig.customBody !== undefined) {
      updateFields[`${updatePath}.customBody`] = eventConfig.customBody
    }
    if (eventConfig.recipients !== undefined) {
      updateFields[`${updatePath}.recipients`] = eventConfig.recipients
    }

    await CompanyNotificationConfig.updateOne(
      { companyId },
      { $set: updateFields }
    )
  } else {
    // Add new event config
    await CompanyNotificationConfig.updateOne(
      { companyId },
      {
        $push: {
          eventConfigs: {
            eventCode: eventCode.toUpperCase(),
            isEnabled: eventConfig.isEnabled ?? true,
            customSubject: eventConfig.customSubject,
            customBody: eventConfig.customBody,
            recipients: eventConfig.recipients,
          },
        },
        $set: { updatedBy },
      }
    )
  }

  // Clear cache and return updated config
  clearCache(companyId)
  return getCompanyNotificationConfig(companyId)
}

/**
 * Enable/disable a specific event for a company
 */
export async function toggleEventForCompany(
  companyId: string,
  eventCode: string,
  isEnabled: boolean,
  updatedBy?: string
): Promise<ICompanyNotificationConfig | null> {
  return updateEventConfig(companyId, eventCode, { isEnabled }, updatedBy)
}

/**
 * Enable/disable all notifications for a company
 */
export async function toggleAllNotificationsForCompany(
  companyId: string,
  isEnabled: boolean,
  updatedBy?: string
): Promise<ICompanyNotificationConfig> {
  return upsertCompanyNotificationConfig(
    companyId,
    { notificationsEnabled: isEnabled },
    updatedBy
  )
}

/**
 * Get all event configs for a company with default status
 * Returns all system events with company-specific overrides applied
 */
export async function getAllEventConfigsForCompany(
  companyId: string
): Promise<Array<{
  eventCode: string
  eventDescription: string
  defaultRecipientType: string
  isEnabled: boolean
  hasCustomTemplate: boolean
  customSubject?: string
  customBody?: string
}>> {
  await connectDB()

  // Get all system events
  const events = await NotificationEvent.find({ isActive: true }).lean()

  // Get company config
  const companyConfig = await getCompanyNotificationConfig(companyId)

  return events.map((event) => {
    const eventConfig = companyConfig?.eventConfigs?.find(
      (ec) => ec.eventCode.toUpperCase() === event.eventCode
    )

    return {
      eventCode: event.eventCode,
      eventDescription: event.eventDescription,
      defaultRecipientType: event.defaultRecipientType,
      isEnabled: companyConfig?.notificationsEnabled === false 
        ? false 
        : (eventConfig?.isEnabled ?? true),
      hasCustomTemplate: !!(eventConfig?.customSubject || eventConfig?.customBody),
      customSubject: eventConfig?.customSubject,
      customBody: eventConfig?.customBody,
    }
  })
}

/**
 * Delete company notification config
 */
export async function deleteCompanyNotificationConfig(
  companyId: string
): Promise<boolean> {
  await connectDB()

  const result = await CompanyNotificationConfig.deleteOne({ companyId })
  clearCache(companyId)

  return result.deletedCount > 0
}

// Export cache clear function for external use
export { clearCache as clearNotificationConfigCache }
