/**
 * API Authentication Utilities
 * 
 * Provides functions to extract and validate company context from API requests.
 * CRITICAL: Never trust client-provided companyId alone - always validate from auth context.
 */

import { NextRequest } from 'next/server'
import { getCompanyByAdminEmail } from '@/lib/db/data-access'

/**
 * Extract companyId from request
 * Priority:
 * 1. Authorization header (if implementing token-based auth)
 * 2. Query parameter (for GET requests)
 * 3. Request body (for POST/PUT requests)
 * 4. Cookie/session (if available)
 * 
 * NOTE: This is a placeholder - actual implementation depends on your auth strategy.
 * For now, we'll use query params and body, but validate against auth context.
 */
export async function getCompanyIdFromRequest(request: NextRequest): Promise<string | null> {
  // Method 1: Try query parameter
  const queryCompanyId = request.nextUrl.searchParams.get('companyId')
  if (queryCompanyId) {
    return queryCompanyId
  }
  
  // Method 2: Try request body (for POST/PUT)
  try {
    const body = await request.json().catch(() => null)
    if (body && body.companyId) {
      return body.companyId
    }
  } catch {
    // Body not available or not JSON
  }
  
  // Method 3: Try authorization header (if implementing token-based auth)
  const authHeader = request.headers.get('authorization')
  if (authHeader) {
    // TODO: Extract companyId from JWT token or session
    // For now, return null
  }
  
  return null
}

/**
 * Validate that the companyId belongs to the authenticated user
 * This is a security check to prevent cross-company access.
 * 
 * @param request - Next.js request object
 * @param companyId - Company ID to validate
 * @returns true if companyId is valid for the authenticated user
 */
export async function validateCompanyAccess(
  request: NextRequest,
  companyId: string
): Promise<boolean> {
  // TODO: Implement proper authentication validation
  // For now, this is a placeholder
  // In production, this should:
  // 1. Extract user identity from auth token/session
  // 2. Verify user is Company Admin for the specified company
  // 3. Return false if user doesn't have access
  
  // For now, we'll rely on the API endpoints to validate companyId
  // by checking against the authenticated user's company
  return true
}

/**
 * Get companyId from authenticated user context
 * This should be used instead of trusting client-provided companyId.
 * 
 * @param request - Next.js request object
 * @returns Company ID from authenticated user context, or null
 */
export async function getAuthenticatedCompanyId(request: NextRequest): Promise<string | null> {
  // TODO: Implement proper authentication extraction
  // This should extract companyId from:
  // - JWT token claims
  // - Session data
  // - Server-side auth context
  
  // For now, we'll use a combination of methods:
  // 1. Try to get from query/body (but validate it)
  // 2. For Company Admin APIs, we'll validate via email lookup
  
  return getCompanyIdFromRequest(request)
}

/**
 * Extract user email from request (for Company Admin authentication)
 * This is used to validate company access via getCompanyByAdminEmail
 */
export async function getUserEmailFromRequest(request: NextRequest): Promise<string | null> {
  // Method 1: Try X-User-Email header first (custom header for API calls)
  // This is the primary method for client-side API calls
  const userEmailHeader = request.headers.get('x-user-email') || request.headers.get('X-User-Email')
  if (userEmailHeader) {
    console.log(`[getUserEmailFromRequest] Found userEmail from header: ${userEmailHeader}`)
    return userEmailHeader.trim().toLowerCase()
  }
  
  // Method 2: Try query parameter
  const queryEmail = request.nextUrl.searchParams.get('userEmail') || 
                     request.nextUrl.searchParams.get('email')
  if (queryEmail) {
    console.log(`[getUserEmailFromRequest] Found userEmail from query: ${queryEmail}`)
    return queryEmail.trim().toLowerCase()
  }
  
  // Method 3: Try request body (need to clone request to read body multiple times)
  try {
    const clonedRequest = request.clone()
    const body = await clonedRequest.json().catch(() => null)
    if (body && (body.userEmail || body.email)) {
      console.log(`[getUserEmailFromRequest] Found userEmail from body: ${body.userEmail || body.email}`)
      return (body.userEmail || body.email).trim().toLowerCase()
    }
  } catch {
    // Body not available or already consumed
  }
  
  // Method 4: Try authorization header (Bearer token with email)
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // TODO: Extract email from JWT token
    // For now, skip
  }
  
  console.log(`[getUserEmailFromRequest] No userEmail found in request`)
  return null
}

/**
 * Validate Company Admin access and return companyId
 * This is the recommended way to get companyId for Company Admin APIs.
 * 
 * CRITICAL: This validates the user is a Company Admin and returns their companyId.
 * The companyId from request parameters is validated against this.
 * 
 * @param request - Next.js request object
 * @returns Company ID if user is authenticated Company Admin, null otherwise
 */
export async function getCompanyIdForCompanyAdmin(
  request: NextRequest
): Promise<{ companyId: string; userEmail: string } | null> {
  const userEmail = await getUserEmailFromRequest(request)
  
  if (!userEmail) {
    return null
  }
  
  // Validate user is Company Admin and get their company
  const company = await getCompanyByAdminEmail(userEmail.trim().toLowerCase())
  
  if (!company) {
    return null
  }
  
  return {
    companyId: company.id,
    userEmail: userEmail.trim().toLowerCase()
  }
}

/**
 * Validate and get companyId for Company Admin API
 * This function:
 * 1. Gets companyId from authenticated user context
 * 2. Optionally validates it matches request companyId (if provided)
 * 3. Returns validated companyId or throws error
 * 
 * @param request - Next.js request object
 * @param requestCompanyId - Optional companyId from request (to validate)
 * @returns Validated companyId
 * @throws Error if validation fails
 */
export async function validateAndGetCompanyId(
  request: NextRequest,
  requestCompanyId?: string | null
): Promise<{ companyId: string; userEmail: string }> {
  // Get companyId from authenticated user
  const authContext = await getCompanyIdForCompanyAdmin(request)
  
  if (!authContext) {
    throw new Error('Unauthorized: User is not a Company Admin')
  }
  
  // If requestCompanyId is provided, validate it matches authenticated user's company
  if (requestCompanyId && requestCompanyId !== authContext.companyId) {
    throw new Error('Forbidden: Company ID does not match authenticated user\'s company')
  }
  
  return authContext
}

