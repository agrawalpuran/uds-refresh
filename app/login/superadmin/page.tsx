'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Shield } from 'lucide-react'
import OTPVerification from '@/components/OTPVerification'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function SuperAdminLogin() {
  const [email, setEmail] = useState('')
  const [showOTP, setShowOTP] = useState(false)
  const [maskedPhone, setMaskedPhone] = useState('')
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email) {
      setError('Please enter your email')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), portalType: 'superadmin' }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Unable to send OTP. Please try again.')
        setLoading(false)
        return
      }

      setMaskedPhone(data.maskedPhone || '')
      setShowOTP(true)
    } catch (err: any) {
      console.error('Error sending OTP:', err)
      setError('An error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleOTPVerify = async (otp: string) => {
    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        otp,
        redirect: false,
      })

      if (result?.error) {
        setError('Verification failed. Please try again.')
        setShowOTP(false)
        return
      }

      if (result?.ok) {
        router.push('/dashboard/superadmin')
      }
    } catch (err: any) {
      console.error('Login error:', err)
      setError('An error occurred during login. Please try again.')
      setShowOTP(false)
    }
  }

  const handleResendOTP = () => {
    alert('OTP resent! Use 123456 for demo')
  }

  if (showOTP) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <button
            onClick={() => { setShowOTP(false); setError('') }}
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to login
          </button>
          {maskedPhone && (
            <p className="text-sm text-gray-500 mb-2 text-center">
              OTP sent to <span className="font-medium">{maskedPhone}</span>
            </p>
          )}
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
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  setError('')
                }}
                placeholder="Enter your email"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                required
                disabled={loading}
                autoComplete="email"
              />
              {error && (
                <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !email}
              className="w-full bg-red-600 text-white py-3 rounded-lg font-semibold hover:bg-red-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : 'Send OTP'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
              &larr; Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
