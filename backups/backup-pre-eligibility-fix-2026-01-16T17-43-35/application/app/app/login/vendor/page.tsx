'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'
import { getVendorByEmail } from '@/lib/data-mongodb'

export default function VendorLogin() {
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [error, setError] = useState<string>('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (emailOrPhone) {
      setError('')
      // Check if this email belongs to a vendor before showing OTP
      try {
        const vendor = await getVendorByEmail(emailOrPhone)
        if (!vendor) {
          // CRITICAL: Only show "not registered" if vendor is truly not found (not a DB error)
          setError('Access denied: This email is not registered as a vendor. Please contact support.')
          return
        }
        setShowOTP(true)
      } catch (error: any) {
        console.error('Error checking vendor status:', error)
        
        // CRITICAL: Differentiate between "not found" and "database error"
        if (error.message && (
          error.message.includes('Database connection error') ||
          error.message.includes('DB_CONNECTION_ERROR') ||
          error.message.includes('Password contains unescaped characters')
        )) {
          setError('Database connection error. Please contact system administrator or try again later.')
        } else {
          setError('Error verifying vendor status. Please try again.')
        }
      }
    }
  }

  const handleOTPVerify = async (otp: string) => {
    // Double-check vendor status before allowing login
    try {
      const vendor = await getVendorByEmail(emailOrPhone)
      if (!vendor) {
        setError('Access denied: This email is not registered as a vendor.')
        setShowOTP(false)
        return
      }
      
      // Use tab-specific authentication storage
      const { setAuthData } = await import('@/lib/utils/auth-storage')
      setAuthData('vendor', {
        userEmail: emailOrPhone,
        vendorId: vendor.id
      })
      
      // CRITICAL FIX: Also update localStorage for backward compatibility
      // This ensures pages that read from localStorage get the correct vendorId
      // However, sessionStorage (setAuthData) takes priority in all pages
      if (typeof window !== 'undefined') {
        localStorage.setItem('vendorId', vendor.id)
        console.log('[VendorLogin] ✅ Stored vendorId in both sessionStorage and localStorage:', vendor.id)
        console.log('[VendorLogin] ✅ Vendor name:', vendor.name)
      }
      
      sessionStorage.setItem('currentActorType', 'vendor')
      
      setTimeout(() => {
        router.push('/dashboard/vendor')
      }, 1000)
    } catch (error) {
      console.error('Error verifying vendor:', error)
      setError('Error verifying vendor status. Please try again.')
      setShowOTP(false)
    }
  }

  const handleResendOTP = () => {
    alert('OTP resent! Use 123456 for demo')
  }

  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link href="/login/vendor" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </Link>
          <OTPVerification
            emailOrPhone={emailOrPhone}
            onVerify={handleOTPVerify}
            onResend={handleResendOTP}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Link>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Vendor Login</h1>
            <p className="text-gray-600">Access your vendor portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Vendor Email
              </label>
              <input
                type="email"
                id="emailOrPhone"
                value={emailOrPhone}
                onChange={(e) => {
                  setEmailOrPhone(e.target.value)
                  setError('')
                }}
                placeholder="Enter your vendor email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
              {error && (
                <p className="mt-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
                  {error}
                </p>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Only registered vendor emails can access this portal.
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Send OTP
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








