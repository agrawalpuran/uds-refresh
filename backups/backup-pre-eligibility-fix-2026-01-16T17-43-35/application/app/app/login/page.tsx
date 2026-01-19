'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [emailOrPhone, setEmailOrPhone] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [actorType, setActorType] = useState<'vendor' | 'company' | 'consumer' | 'superadmin'>('consumer')
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
    
    // Store vendor/company IDs based on actor type
    if (actorType === 'vendor') {
      // For demo: assign vendor based on email domain or default
      // Vendor IDs are now 6-digit numeric: 100001=UniformPro Inc, 100002=Footwear Plus, 100003=Elite Uniforms
      const vendorId = emailOrPhone.includes('uniformpro') ? '100001' : 
                      emailOrPhone.includes('footwear') ? '100002' : '100001'
      setAuthData('vendor', {
        userEmail: emailOrPhone,
        vendorId
      })
    } else if (actorType === 'company') {
      // For demo: assign company based on email domain or default
      // Company IDs are now 6-digit numeric: 100001=Indigo, 100002=Akasa Air, 100003=Air India
      const companyId = emailOrPhone.includes('icicibank') ? '100001' :
                        emailOrPhone.includes('akasa') ? '100002' : '100001'
      setAuthData('company', {
        userEmail: emailOrPhone,
        companyId
      })
    } else if (actorType === 'superadmin') {
      setAuthData('superadmin', {
        userEmail: emailOrPhone
      })
    } else {
      setAuthData('consumer', {
        userEmail: emailOrPhone
      })
    }
    
    // CRITICAL SECURITY FIX: Do NOT write to localStorage as it's shared across tabs
    // Only use sessionStorage which is tab-specific
    // This prevents cross-tab authentication leakage
    sessionStorage.setItem('currentActorType', actorType)
    
    // Redirect to appropriate dashboard
    setTimeout(() => {
      if (actorType === 'vendor') {
        router.push('/dashboard/vendor')
      } else if (actorType === 'company') {
        router.push('/dashboard/company')
      } else if (actorType === 'superadmin') {
        router.push('/dashboard/superadmin')
      } else {
        router.push('/dashboard/consumer')
      }
    }, 1000)
  }

  const handleResendOTP = () => {
    // Mock resend
    alert('OTP resent! Use 123456 for demo')
  }

  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-white via-orange-50/30 to-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <Link href="/login" className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4">
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-600">Sign in to your account</p>
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
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#f76b1c] text-white py-3 rounded-lg font-semibold hover:bg-[#dc5514] transition-colors"
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








