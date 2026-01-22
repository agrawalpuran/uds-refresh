/**
 * API Error Handler Utility
 * Provides consistent error handling across all API routes
 */

import { NextResponse } from 'next/server'

export interface ErrorResponse {
  error: string
  type?: string
  details?: any
}

/**
 * Parse JSON body with proper error handling
 */
export async function parseJsonBody(request: Request): Promise<{ body: any; error?: NextResponse }> {
  try {
    const body = await request.json()
    return { body }
  } catch (jsonError: any) {
    return {
      body: null,
      error: NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }
  }
}

/**
 * Validate required parameters
 */
export function validateRequiredParams(params: Record<string, any>, required: string[]): NextResponse | null {
  const missing: string[] = []
  
  for (const field of required) {
    if (!params[field] || (typeof params[field] === 'string' && params[field].trim() === '')) {
      missing.push(field)
    }
  }
  
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Missing required fields: ${missing.join(', ')}` },
      { status: 400 }
    )
  }
  
  return null
}

/**
 * Validate parameter formats
 */
export function validateParamFormats(params: Record<string, any>, validations: Record<string, (value: any) => boolean>): NextResponse | null {
  for (const [field, validator] of Object.entries(validations)) {
    if (params[field] !== undefined && !validator(params[field])) {
      return NextResponse.json(
        { error: `Invalid ${field} format` },
        { status: 400 }
      )
    }
  }
  
  return null
}

/**
 * Handle API errors with appropriate status codes
 */
export function handleApiError(error: any, defaultMessage: string = 'Internal server error'): NextResponse {
  console.error('API Error:', error)
  
  const errorMessage = error?.message || error?.toString() || defaultMessage
  
  // Return 400 for validation/input errors
  if (errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('not found') ||
      errorMessage.includes('Invalid JSON')) {
    return NextResponse.json(
      { error: errorMessage },
      { status: 400 }
    )
  }
  
  // Return 401 for authentication errors
  if (errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')) {
    return NextResponse.json(
      { error: errorMessage },
      { status: 401 }
    )
  }
  
  // Return 403 for authorization errors
  if (errorMessage.includes('Forbidden') ||
      errorMessage.includes('permission') ||
      errorMessage.includes('not allowed')) {
    return NextResponse.json(
      { error: errorMessage },
      { status: 403 }
    )
  }
  
  // Return 404 for not found errors
  if (errorMessage.includes('not found') && !errorMessage.includes('Missing')) {
    return NextResponse.json(
      { error: errorMessage },
      { status: 404 }
    )
  }
  
  // Return 409 for conflict errors
  if (errorMessage.includes('already exists') ||
      errorMessage.includes('duplicate') ||
      errorMessage.includes('Conflict')) {
    return NextResponse.json(
      { error: errorMessage },
      { status: 409 }
    )
  }
  
  // Return 500 for server errors
  return NextResponse.json(
    {
      error: errorMessage,
      type: 'api_error',
      details: process.env.NODE_ENV === 'development' ? error?.stack : undefined
    },
    { status: 500 }
  )
}

/**
 * Validate string ID format (6-digit numeric)
 */
export function isValidStringId(id: any): boolean {
  return typeof id === 'string' && /^\d{6}$/.test(id)
}

/**
 * Validate email format
 */
export function isValidEmail(email: any): boolean {
  return typeof email === 'string' && email.includes('@') && email.trim().length > 0
}
