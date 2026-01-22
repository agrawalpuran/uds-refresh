'use client'

import { useState, useEffect, useRef } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'

interface OTPVerificationProps {
  onVerify: (otp: string) => void
  onResend: () => void
  emailOrPhone: string
}

export default function OTPVerification({ onVerify, onResend, emailOrPhone }: OTPVerificationProps) {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [verified, setVerified] = useState(false)
  const submitButtonRef = useRef<HTMLButtonElement>(null)
  const firstInputRef = useRef<HTMLInputElement>(null)

  // Auto-focus first OTP input when component mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      firstInputRef.current?.focus()
    }, 100)
    return () => clearTimeout(timer)
  }, [])

  const handleChange = (index: number, value: string) => {
    if (value.length > 1) return
    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)
    
    // Clear error when user starts typing again
    if (error) {
      setError('')
    }

    // Check if all 6 digits are filled
    const allFilled = newOtp.every(digit => digit !== '')

    // Auto-focus next input if not the last one
    if (value && index < 5 && !allFilled) {
      const nextInput = document.getElementById(`otp-${index + 1}`)
      nextInput?.focus()
    }

    // Auto-submit when all 6 digits are entered
    if (allFilled) {
      setTimeout(() => {
        const otpString = newOtp.join('')
        if (otpString.length === 6) {
          if (otpString === '123456') { // Mock verification
            setVerified(true)
            setTimeout(() => onVerify(otpString), 500)
          } else {
            setError('Invalid OTP. Try 123456 for demo')
          }
        }
      }, 100)
    }
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`)
      prevInput?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const otpString = otp.join('')
    if (otpString.length !== 6) {
      setError('Please enter complete OTP')
      return
    }
    if (otpString === '123456') { // Mock verification
      setVerified(true)
      setTimeout(() => onVerify(otpString), 500)
    } else {
      setError('Invalid OTP. Try 123456 for demo')
    }
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verify OTP</h2>
          <p className="text-gray-600">
            We sent a verification code to
            <br />
            <span className="font-semibold">{emailOrPhone}</span>
          </p>
        </div>

        {verified ? (
          <div className="text-center py-8">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <p className="text-green-600 font-semibold">Verified successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex justify-center space-x-2 mb-6">
              {otp.map((digit, index) => (
                <input
                  key={index}
                  id={`otp-${index}`}
                  ref={index === 0 ? firstInputRef : null}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={(e) => handleChange(index, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(index, e)}
                  className="w-12 h-12 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:outline-none"
                />
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
                <XCircle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 text-sm">{error}</p>
              </div>
            )}

            <button
              ref={submitButtonRef}
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-4"
            >
              Verify OTP
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={onResend}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Resend OTP
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800 text-center">
                Demo: Use OTP <span className="font-bold">123456</span> to verify
              </p>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}








