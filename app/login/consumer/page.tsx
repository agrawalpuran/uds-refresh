'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'

/**
 * Employee/Consumer Login Page
 * 
 * Clean, rewritten login flow with:
 * - Consistent email normalization (trim + lowercase)
 * - Proper employee verification
 * - Company admin/location admin/branch admin detection
 * - Employee order enablement check
 * - Proper error handling
 * - Clear authentication flow
 * - No breaking changes to other login flows
 */
export default function ConsumerLogin() {
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  /**
   * Normalize email input: trim whitespace and convert to lowercase
   * This ensures consistent comparison regardless of user input format
   */
  const normalizeEmail = (input: string): string => {
    if (!input) return ''
    return input.trim().toLowerCase()
  }

  /**
   * Validate email format
   */
  const isValidEmail = (emailInput: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(emailInput)
  }

  /**
   * Validate phone number format (basic validation)
   */
  const isValidPhone = (phoneInput: string): boolean => {
    // Remove common phone number characters
    const digitsOnly = phoneInput.replace(/[\s\-\(\)\+]/g, '')
    // Check if it's 10-15 digits (international format)
    return /^\d{10,15}$/.test(digitsOnly)
  }

  /**
   * Handle form submission - validate input before showing OTP
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!emailOrPhone) {
      setError('Please enter your email or phone number')
      return
    }

    // Normalize input
    const normalizedInput = normalizeEmail(emailOrPhone)
    
    // Validate format (email or phone)
    const isEmail = normalizedInput.includes('@')
    if (isEmail && !isValidEmail(normalizedInput)) {
      setError('Please enter a valid email address')
      return
    }
    if (!isEmail && !isValidPhone(normalizedInput)) {
      setError('Please enter a valid phone number (10-15 digits)')
      return
    }

    // For now, we only support email login
    // Phone login can be added later if needed
    if (!isEmail) {
      setError('Phone number login is not yet supported. Please use your email address.')
      return
    }

    // Update state with normalized email
    setEmailOrPhone(normalizedInput)
    setShowOTP(true)
  }

  /**
   * Handle OTP verification - complete authentication
   */
  const handleOTPVerify = async (otp: string) => {
    setError('')
    setLoading(true)

    try {
      // Normalize email (defensive - should already be normalized)
      const normalizedEmail = normalizeEmail(emailOrPhone)
      
      console.log(`[ConsumerLogin] Verifying employee: ${normalizedEmail}`)

      // Import required functions
      const { 
        getEmployeeByEmail, 
        getCompanyById, 
        isCompanyAdmin, 
        getLocationByAdminEmail, 
        getBranchByAdminEmail 
      } = await import('@/lib/data-mongodb')
      
      // Step 1: Verify employee exists
      const employee = await getEmployeeByEmail(normalizedEmail)
      if (!employee) {
        setError('Employee not found. Please check your email or contact your administrator.')
        setShowOTP(false)
        setLoading(false)
        return
      }

      console.log(`[ConsumerLogin] ✅ Employee found: ${employee.id || employee.employeeId}`)
      console.log(`[ConsumerLogin] Employee object:`, {
        id: employee.id,
        employeeId: employee.employeeId,
        companyId: employee.companyId,
        companyIdType: typeof employee.companyId,
        companyIdKeys: employee.companyId && typeof employee.companyId === 'object' ? Object.keys(employee.companyId) : 'N/A'
      })

      // Step 2: Get company ID with enhanced extraction logic
      let companyId: string | null = null
      
      // Try multiple ways to extract companyId
      if (employee.companyId) {
        if (typeof employee.companyId === 'object') {
          // Handle populated company object
          if (employee.companyId.id) {
            companyId = String(employee.companyId.id)
          } else if (employee.companyId._id) {
            // If it's an ObjectId, try to look it up via API
            const objectIdStr = employee.companyId._id.toString()
            console.log(`[ConsumerLogin] Attempting to resolve ObjectId companyId via API: ${objectIdStr}`)
            try {
              const response = await fetch(`/api/companies?companyId=${encodeURIComponent(objectIdStr)}`)
              if (response.ok) {
                const companyData = await response.json()
                if (companyData && companyData.id) {
                  companyId = String(companyData.id)
                  console.log(`[ConsumerLogin] ✅ Resolved companyId from ObjectId via API: ${companyId}`)
                }
              }
            } catch (apiError) {
              console.error(`[ConsumerLogin] Failed to resolve ObjectId companyId via API:`, apiError)
            }
          }
        } else if (typeof employee.companyId === 'string') {
          companyId = employee.companyId
        } else if (employee.companyId.toString) {
          // Handle ObjectId or other objects with toString
          const companyIdStr = employee.companyId.toString()
          // Check if it's an alphanumeric ID
          if (/^[A-Za-z0-9_-]{1,50}$/.test(companyIdStr)) {
            companyId = companyIdStr
          } else {
            // It might be an ObjectId, try to look it up via API
            console.log(`[ConsumerLogin] CompanyId appears to be ObjectId: ${companyIdStr}, attempting lookup...`)
            try {
              const response = await fetch(`/api/companies?companyId=${encodeURIComponent(companyIdStr)}`)
              if (response.ok) {
                const companyData = await response.json()
                if (companyData && companyData.id) {
                  companyId = String(companyData.id)
                  console.log(`[ConsumerLogin] ✅ Resolved companyId from API: ${companyId}`)
                }
              }
            } catch (apiError) {
              console.error(`[ConsumerLogin] Failed to resolve companyId via API:`, apiError)
            }
          }
        }
      }

      // Final fallback: Try to get companyId from employee's raw data via API
      if (!companyId && employee.id) {
        console.log(`[ConsumerLogin] ⚠️ CompanyId not found, attempting fallback lookup for employee ${employee.id}`)
        try {
          const { getEmployeeById } = await import('@/lib/data-mongodb')
          const fullEmployee = await getEmployeeById(employee.id)
          if (fullEmployee && fullEmployee.companyId) {
            if (typeof fullEmployee.companyId === 'string') {
              companyId = fullEmployee.companyId
            } else if (typeof fullEmployee.companyId === 'object' && fullEmployee.companyId.id) {
              companyId = String(fullEmployee.companyId.id)
            }
            console.log(`[ConsumerLogin] ✅ Recovered companyId from fallback: ${companyId}`)
          }
        } catch (fallbackError) {
          console.error(`[ConsumerLogin] Fallback lookup failed:`, fallbackError)
        }
      }

      if (!companyId) {
        console.error(`[ConsumerLogin] ❌ CRITICAL: CompanyId extraction failed for employee:`, {
          employeeId: employee.id || employee.employeeId,
          email: normalizedEmail,
          companyIdValue: employee.companyId,
          companyIdType: typeof employee.companyId
        })
        setError('Company information not found. Please contact your administrator.')
        setShowOTP(false)
        setLoading(false)
        return
      }

      console.log(`[ConsumerLogin] Company ID: ${companyId}`)

      // Step 3: Check if user is an admin (admins always have access)
      const [isAdmin, location, branch] = await Promise.all([
        isCompanyAdmin(normalizedEmail, companyId),
        getLocationByAdminEmail(normalizedEmail),
        getBranchByAdminEmail(normalizedEmail)
      ])

      const isAnyAdmin = isAdmin || !!location || !!branch

      console.log(`[ConsumerLogin] Admin status - Company: ${isAdmin}, Location: ${!!location}, Branch: ${!!branch}`)

      // Step 4: If not an admin, check if employee orders are enabled
      if (!isAnyAdmin) {
        console.log(`[ConsumerLogin] Looking up company with ID: ${companyId}`)
        const company = await getCompanyById(companyId)
        
        if (!company) {
          console.error(`[ConsumerLogin] ❌ Company lookup failed for companyId: ${companyId}`)
          console.error(`[ConsumerLogin] Employee details:`, {
            id: employee.id || employee.employeeId,
            email: normalizedEmail,
            originalCompanyId: employee.companyId
          })
          setError('Company information not found. Please contact your administrator.')
          setShowOTP(false)
          setLoading(false)
          return
        }
        
        console.log(`[ConsumerLogin] ✅ Company found: ${company.name} (ID: ${company.id})`)

        // Check if employee orders are enabled
        // undefined/null means not set, which should default to false (disabled)
        if (company.enableEmployeeOrder === false || company.enableEmployeeOrder === undefined || company.enableEmployeeOrder === null) {
          setError('Employee orders are currently disabled for your company. Please contact your administrator.')
          setShowOTP(false)
          setLoading(false)
          return
        }

        console.log(`[ConsumerLogin] ✅ Employee orders enabled for company`)
      } else {
        console.log(`[ConsumerLogin] ✅ Admin access granted (bypasses employee order check)`)
      }

      // Step 5: Set authentication data
      const { setAuthData } = await import('@/lib/utils/auth-storage')
      setAuthData('consumer', {
        userEmail: normalizedEmail
      })

      // CRITICAL SECURITY FIX: Clear any stale localStorage auth data
      // This prevents cross-tab/cross-user session contamination
      if (typeof window !== 'undefined') {
        localStorage.removeItem('companyId')
        localStorage.removeItem('vendorId')
      }
      
      sessionStorage.setItem('currentActorType', 'consumer')

      console.log(`[ConsumerLogin] ✅ Authentication data set, redirecting to dashboard...`)

      // Redirect to consumer dashboard
      setTimeout(() => {
        router.push('/dashboard/consumer')
      }, 500)
    } catch (error: any) {
      console.error('[ConsumerLogin] Error during login verification:', error)
      setError(error.message || 'Login failed. Please try again.')
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
    setEmailOrPhone('')
  }

  // OTP Verification Screen
  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={handleBackToLogin}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </button>
          <OTPVerification
            emailOrPhone={emailOrPhone}
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
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-green-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Link>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Employee Login</h1>
            <p className="text-gray-600">Access your employee portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="emailOrPhone"
                value={emailOrPhone}
                onChange={(e) => {
                  setEmailOrPhone(e.target.value)
                  setError('')
                }}
                placeholder="Enter your email address"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
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
                Enter your company email address to access the employee portal.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !emailOrPhone}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Processing...' : 'Send OTP'}
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
