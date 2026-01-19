'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'

export default function SuperAdminLogin() {
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const router = useRouter()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (emailOrPhone) {
      setShowOTP(true)
    }
  }

  const handleOTPVerify = async (otp: string) => {
    // Use tab-specific authentication storage
    const { setAuthData } = await import('@/lib/utils/auth-storage')
    setAuthData('superadmin', {
      userEmail: emailOrPhone
    })
    
    // CRITICAL SECURITY FIX: Do NOT write to localStorage as it's shared across tabs
    // Only use sessionStorage which is tab-specific
    // This prevents cross-tab authentication leakage
    sessionStorage.setItem('currentActorType', 'superadmin')
    
    setTimeout(() => {
      router.push('/dashboard/superadmin')
    }, 1000)
  }

  const handleResendOTP = () => {
    alert('OTP resent! Use 123456 for demo')
  }

  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link href="/login/superadmin" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
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
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Link href="/" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to home
        </Link>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <Shield className="h-8 w-8 text-red-600" />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Super Admin Login</h1>
            <p className="text-gray-600">Access the administrative portal</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="emailOrPhone" className="block text-sm font-medium text-gray-700 mb-2">
                Email or Phone Number
              </label>
              <input
                type="text"
                id="emailOrPhone"
                value={emailOrPhone}
                onChange={(e) => setEmailOrPhone(e.target.value)}
                placeholder="Enter email or phone number"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors"
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






