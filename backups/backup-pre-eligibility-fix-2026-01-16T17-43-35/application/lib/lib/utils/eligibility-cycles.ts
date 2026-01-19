/**
 * Eligibility Cycle Management
 * Eligibility resets based on configurable cycle durations per item type
 * Each item type (shirt, pant, shoe, jacket) can have its own cycle duration in months
 */

const DEFAULT_START_DATE = new Date('2025-10-01T00:00:00.000Z')
const DEFAULT_CYCLE_DURATION = 6 // Default 6 months

export interface CycleDuration {
  shirt: number
  pant: number
  shoe: number
  jacket: number
}

export const DEFAULT_CYCLE_DURATIONS: CycleDuration = {
  shirt: 6,
  pant: 6,
  shoe: 6,
  jacket: 12, // 1 year default for jackets
}

/**
 * Get the current eligibility cycle start and end dates for a specific item type
 * @param itemType - The item type ('shirt', 'pant', 'shoe', 'jacket')
 * @param dateOfJoining - Employee's date of joining (defaults to Oct 1, 2025 if not provided)
 * @param cycleDurationMonths - Cycle duration in months for this item type (defaults to 6 months)
 */
export function getCurrentCycleDates(
  itemType: 'shirt' | 'pant' | 'shoe' | 'jacket',
  dateOfJoining?: Date,
  cycleDurationMonths?: number
): { start: Date; end: Date } {
  const now = new Date()
  const startDate = dateOfJoining || DEFAULT_START_DATE
  const duration = cycleDurationMonths || DEFAULT_CYCLE_DURATION
  
  // Normalize start date to the 1st of the month
  const normalizedStartDate = new Date(startDate)
  normalizedStartDate.setDate(1)
  normalizedStartDate.setHours(0, 0, 0, 0)
  
  // If current date is before the first cycle start, return the first cycle
  if (now < normalizedStartDate) {
    return {
      start: normalizedStartDate,
      end: new Date(normalizedStartDate.getFullYear(), normalizedStartDate.getMonth() + duration, 0, 23, 59, 59, 999)
    }
  }
  
  // Calculate how many cycles have passed
  const monthsDiff = (now.getFullYear() - normalizedStartDate.getFullYear()) * 12 + 
                     (now.getMonth() - normalizedStartDate.getMonth())
  const cyclesPassed = Math.floor(monthsDiff / duration)
  
  // Calculate current cycle start
  const cycleStart = new Date(normalizedStartDate)
  cycleStart.setMonth(cycleStart.getMonth() + (cyclesPassed * duration))
  cycleStart.setDate(1)
  cycleStart.setHours(0, 0, 0, 0)
  
  // Calculate current cycle end (last day of the duration month)
  const cycleEnd = new Date(cycleStart)
  cycleEnd.setMonth(cycleEnd.getMonth() + duration)
  cycleEnd.setDate(0) // Last day of previous month
  cycleEnd.setHours(23, 59, 59, 999)
  
  return { start: cycleStart, end: cycleEnd }
}

/**
 * Get the next cycle start date for a specific item type
 * @param itemType - The item type ('shirt', 'pant', 'shoe', 'jacket')
 * @param dateOfJoining - Employee's date of joining (defaults to Oct 1, 2025 if not provided)
 * @param cycleDurationMonths - Cycle duration in months for this item type (defaults to 6 months)
 */
export function getNextCycleStartDate(
  itemType: 'shirt' | 'pant' | 'shoe' | 'jacket',
  dateOfJoining?: Date,
  cycleDurationMonths?: number
): Date {
  const { end } = getCurrentCycleDates(itemType, dateOfJoining, cycleDurationMonths)
  const nextCycleStart = new Date(end)
  nextCycleStart.setDate(1)
  nextCycleStart.setMonth(nextCycleStart.getMonth() + 1)
  nextCycleStart.setHours(0, 0, 0, 0)
  return nextCycleStart
}

/**
 * Check if a date falls within the current eligibility cycle for a specific item type
 * @param date - Date to check
 * @param itemType - The item type (now accepts any string for dynamic categories, but maps legacy types for backward compatibility)
 * @param dateOfJoining - Employee's date of joining (defaults to Oct 1, 2025 if not provided)
 * @param cycleDurationMonths - Cycle duration in months for this item type (defaults to 6 months)
 */
export function isDateInCurrentCycle(
  date: Date,
  itemType: string, // Changed to accept any string for dynamic categories
  dateOfJoining?: Date,
  cycleDurationMonths?: number
): boolean {
  // Map dynamic category names to legacy types for getCurrentCycleDates (which still uses legacy types)
  // This maintains backward compatibility while supporting dynamic categories
  const legacyTypeMap: Record<string, 'shirt' | 'pant' | 'shoe' | 'jacket'> = {
    'shirt': 'shirt',
    'pant': 'pant',
    'trouser': 'pant',
    'shoe': 'shoe',
    'jacket': 'jacket',
    'blazer': 'jacket'
  }
  
  const normalizedType = itemType.toLowerCase().trim()
  const legacyType = legacyTypeMap[normalizedType] || 'shirt' // Default to 'shirt' for unknown categories
  
  const { start, end } = getCurrentCycleDates(legacyType, dateOfJoining, cycleDurationMonths)
  return date >= start && date <= end
}

/**
 * Format date for display
 */
export function formatCycleDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

/**
 * Get days remaining in current cycle for a specific item type
 * @param itemType - The item type ('shirt', 'pant', 'shoe', 'jacket')
 * @param dateOfJoining - Employee's date of joining (defaults to Oct 1, 2025 if not provided)
 * @param cycleDurationMonths - Cycle duration in months for this item type (defaults to 6 months)
 */
export function getDaysRemainingInCycle(
  itemType: 'shirt' | 'pant' | 'shoe' | 'jacket',
  dateOfJoining?: Date,
  cycleDurationMonths?: number
): number {
  const { end } = getCurrentCycleDates(itemType, dateOfJoining, cycleDurationMonths)
  const now = new Date()
  const diffTime = end.getTime() - now.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  return Math.max(0, diffDays)
}

