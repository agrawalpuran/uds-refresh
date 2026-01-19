/**
 * Base URL Utility
 * 
 * Provides the correct base URL for the application based on environment.
 * Works for both localhost development and Vercel deployment.
 */

/**
 * Get the base URL for the application
 * @returns Base URL (e.g., "https://your-app.vercel.app" or "http://localhost:3001")
 */
export function getBaseUrl(): string {
  // Vercel provides VERCEL_URL in production/preview
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  // Next.js public base URL (can be set in env)
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL
  }

  // Local development fallback
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || '3001'
    return `http://localhost:${port}`
  }

  // Fallback for production without VERCEL_URL
  return 'https://your-app.vercel.app'
}

/**
 * Get the API base URL
 * @returns API base URL
 */
export function getApiBaseUrl(): string {
  return `${getBaseUrl()}/api`
}

