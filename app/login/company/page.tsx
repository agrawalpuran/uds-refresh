'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'
import { getCompanyByAdminEmail } from '@/lib/data-mongodb'

/**
 * Company Admin Login Page
 * 
 * Clean, rewritten login flow with:
 * - Consistent email normalization (trim + lowercase)
 * - Proper error handling
 * - Clear authentication flow
 * - No breaking changes to other login flows
 */
export default function CompanyLogin() {
  const [email, setEmail] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  /**
   * Normalize email input: trim whitespace and convert to lowercase
   * This ensures consistent comparison regardless of user input format
   */
  const normalizeEmail = (emailInput: string): string => {
    if (!emailInput) return ''
    return emailInput.trim().toLowerCase()
  }

  /**
   * Validate email format
   */
  const isValidEmail = (emailInput: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailInput)
  }

  /**
   * Handle form submission - verify admin status before showing OTP
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email) {
      setError('Please enter your email address')
      return
    }

    // Normalize email
    const normalizedEmail = normalizeEmail(email)
    
    // Validate email format
    if (!isValidEmail(normalizedEmail)) {
      setError('Please enter a valid email address')
      return
    }

    setLoading(true)

    try {
      // Verify this email is authorized as a company admin
      console.log(`[CompanyLogin] ========================================`)
      console.log(`[CompanyLogin] 🔍 STEP 1: Starting admin verification`)
      console.log(`[CompanyLogin] Input email: "${email}"`)
      console.log(`[CompanyLogin] Normalized email: "${normalizedEmail}"`)
      console.log(`[CompanyLogin] Calling getCompanyByAdminEmail(${normalizedEmail})...`)
      
      const startTime = Date.now()
      const company = await getCompanyByAdminEmail(normalizedEmail)
      const duration = Date.now() - startTime
      
      console.log(`[CompanyLogin] ⏱️ API call completed in ${duration}ms`)
      console.log(`[CompanyLogin] API response:`, company ? {
        id: company.id,
        name: company.name,
        hasCompanyId: !!company.id
      } : 'null')
      
      if (!company) {
        console.error(`[CompanyLogin] ❌ STEP 1 FAILED: No company returned`)
        console.error(`[CompanyLogin] This means the email is not authorized as a company admin`)
        console.error(`[CompanyLogin] ========================================`)
        setError('Access denied: This email is not authorized as a company admin. Please contact your super admin to be assigned as a company administrator.')
        setLoading(false)
        return
      }

      console.log(`[CompanyLogin] ✅ STEP 1 SUCCESS: Admin verified`)
      console.log(`[CompanyLogin] Company ID: ${company.id}`)
      console.log(`[CompanyLogin] Company Name: ${company.name}`)
      console.log(`[CompanyLogin] ========================================`)
      
      // Update email state with normalized value
      setEmail(normalizedEmail)
      setShowOTP(true)
    } catch (error: any) {
      console.error(`[CompanyLogin] ❌ STEP 1 ERROR: Exception caught`)
      console.error(`[CompanyLogin] Error type: ${error?.constructor?.name || typeof error}`)
      console.error(`[CompanyLogin] Error message: ${error?.message || 'Unknown error'}`)
      console.error(`[CompanyLogin] Error stack:`, error?.stack)
      console.error(`[CompanyLogin] Full error object:`, error)
      console.error(`[CompanyLogin] ========================================`)
      setError(error.message || 'Error verifying admin status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  /**
   * Handle OTP verification - final authentication step
   */
  const handleOTPVerify = async (otp: string) => {
    setError('')
    setLoading(true)

    try {
      // Normalize email (defensive - should already be normalized)
      const normalizedEmail = normalizeEmail(email)
      
      // Re-verify admin status before allowing login (security check)
      console.log(`[CompanyLogin] Re-verifying admin status before login: ${normalizedEmail}`)
      const company = await getCompanyByAdminEmail(normalizedEmail)
      
      if (!company) {
        setError('Access denied: This email is not authorized as a company admin.')
        setShowOTP(false)
        setLoading(false)
        return
      }

      console.log(`[CompanyLogin] ✅ Login authorized for company: ${company.id} (${company.name})`)

      // Set authentication data using tab-specific storage
      const { setAuthData } = await import('@/lib/utils/auth-storage')
      setAuthData('company', {
        userEmail: normalizedEmail,
        companyId: company.id
      })

      // CRITICAL SECURITY FIX: Clear any stale localStorage auth data
      // This prevents cross-tab/cross-user session contamination
      if (typeof window !== 'undefined') {
        localStorage.removeItem('companyId')
        localStorage.removeItem('vendorId')
      }
      
      sessionStorage.setItem('currentActorType', 'company')

      console.log(`[CompanyLogin] ✅ Authentication data set, redirecting to dashboard...`)

      // Redirect to company dashboard
      setTimeout(() => {
        router.push('/dashboard/company')
      }, 500)
    } catch (error: any) {
      console.error('[CompanyLogin] Error during login verification:', error)
      setError(error.message || 'Error verifying admin status. Please try again.')
      setShowOTP(false)
      setLoading(false)
    }
  }

  /**
   * Handle OTP resend
   */
  const handleResendOTP = () => {
    alert('OTP resent! Use 123456 for demo')
  }

  /**
   * Handle back to login (from OTP screen)
   */
  const handleBackToLogin = () => {
    setShowOTP(false)
    setError('')
    setEmail('')
  }

  // OTP Verification Screen
  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={handleBackToLogin}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </button>
          <OTPVerification
            emailOrPhone={email}
            onVerify={handleOTPVerify}
            onResend={handleResendOTP}
          />
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Login Form Screen
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Link>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Company Login</h1>
            <p className="text-gray-600">Access your company portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Admin Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="Enter your admin email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
                disabled={loading}
                autoComplete="email"
              />
              {error && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Only users assigned as company administrators can access this portal.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Send OTP'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
              ← Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
