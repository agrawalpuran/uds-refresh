/**
 * Notification ID Generator
 * 
 * Utility functions for generating numeric IDs for notification-related entities.
 * Follows UDS pattern of using 6-12 digit numeric IDs.
 * 
 * ID Ranges (for reference):
 * - NotificationEvent: 500000-509999
 * - NotificationTemplate: 600000-699999
 * - NotificationRouting: 700000-799999
 * - NotificationSenderProfile: 800000-899999
 * - NotificationQueue: 900000-999999
 * - NotificationLog: 950000-999999
 */

/**
 * Generate numeric ID for notification entities
 * @param prefix - Prefix for the ID (e.g., "500" for events)
 * @param existingIds - Array of existing IDs to avoid duplicates (optional)
 * @returns Numeric ID string (6-12 digits)
 */
export function generateNotificationId(prefix: string, existingIds: string[] = []): string {
  // Generate a random number in the range
  const min = parseInt(prefix + '000')
  const max = parseInt(prefix + '999')
  
  let attempts = 0
  const maxAttempts = 100
  
  while (attempts < maxAttempts) {
    const randomId = Math.floor(Math.random() * (max - min + 1)) + min
    const idString = randomId.toString()
    
    // Check if ID already exists
    if (!existingIds.includes(idString)) {
      return idString
    }
    
    attempts++
  }
  
  // Fallback: use timestamp-based ID if random generation fails
  const timestamp = Date.now().toString().slice(-6)
  return prefix + timestamp
}

/**
 * Generate sequential ID (for use with database auto-increment pattern)
 * @param prefix - Prefix for the ID
 * @param lastId - Last used ID (optional, for sequential generation)
 * @returns Next sequential ID
 */
export function generateSequentialNotificationId(prefix: string, lastId?: string): string {
  if (!lastId) {
    return prefix + '001'
  }
  
  const numericPart = parseInt(lastId.replace(prefix, ''))
  const nextNumeric = numericPart + 1
  const padded = nextNumeric.toString().padStart(6 - prefix.length, '0')
  
  return prefix + padded
}

