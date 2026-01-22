/**
 * Tab-specific authentication storage utility
 * Uses sessionStorage for tab-specific auth and route-specific keys
 * to allow multiple roles to be logged in simultaneously in different tabs
 */

// Route to actor type mapping
const ROUTE_TO_ACTOR: Record<string, 'vendor' | 'company' | 'consumer' | 'superadmin'> = {
  '/dashboard/vendor': 'vendor',
  '/dashboard/company': 'company',
  '/dashboard/consumer': 'consumer',
  '/dashboard/superadmin': 'superadmin',
}

/**
 * Get the actor type for a given route
 */
export function getActorTypeForRoute(route: string): 'vendor' | 'company' | 'consumer' | 'superadmin' | null {
  for (const [path, actorType] of Object.entries(ROUTE_TO_ACTOR)) {
    if (route.startsWith(path)) {
      return actorType
    }
  }
  return null
}

/**
 * Get authentication data for a specific actor type (tab-specific)
 */
export function getAuthData(actorType: 'vendor' | 'company' | 'consumer' | 'superadmin') {
  if (typeof window === 'undefined') return null
  
  const key = `auth_${actorType}`
  const data = sessionStorage.getItem(key)
  if (!data) return null
  
  try {
    return JSON.parse(data)
  } catch {
    return null
  }
}

/**
 * Set authentication data for a specific actor type (tab-specific)
 */
export function setAuthData(
  actorType: 'vendor' | 'company' | 'consumer' | 'superadmin',
  data: {
    userEmail: string
    companyId?: string
    vendorId?: string
  }
) {
  if (typeof window === 'undefined') return
  
  const key = `auth_${actorType}`
  sessionStorage.setItem(key, JSON.stringify(data))
  
  // Also set a flag in sessionStorage to indicate this tab is logged in as this role
  sessionStorage.setItem('currentActorType', actorType)
}

/**
 * Clear authentication data for a specific actor type
 */
export function clearAuthData(actorType: 'vendor' | 'company' | 'consumer' | 'superadmin') {
  if (typeof window === 'undefined') return
  
  const key = `auth_${actorType}`
  sessionStorage.removeItem(key)
  
  // Clear current actor type if it matches
  const current = sessionStorage.getItem('currentActorType')
  if (current === actorType) {
    sessionStorage.removeItem('currentActorType')
  }
}

/**
 * Get user email for a specific actor type
 */
export function getUserEmail(actorType: 'vendor' | 'company' | 'consumer' | 'superadmin'): string | null {
  const authData = getAuthData(actorType)
  return authData?.userEmail || null
}

/**
 * Get company ID for company actor type
 */
export function getCompanyId(): string | null {
  const authData = getAuthData('company')
  return authData?.companyId || null
}

/**
 * Get vendor ID for vendor actor type
 */
export function getVendorId(): string | null {
  const authData = getAuthData('vendor')
  return authData?.vendorId || null
}

/**
 * Check if user is authenticated for a specific actor type
 */
export function isAuthenticated(actorType: 'vendor' | 'company' | 'consumer' | 'superadmin'): boolean {
  return getAuthData(actorType) !== null
}



