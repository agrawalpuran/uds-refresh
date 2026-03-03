import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import User from '@/lib/models/User'
import { getEmployeeByEmail, getCompanyByAdminEmail, getLocationByAdminEmail, getBranchByAdminEmail } from '@/lib/db/data-access'
import { decrypt } from '@/lib/utils/encryption'

export const dynamic = 'force-dynamic'

function maskPhone(phone: string): string {
  if (!phone || phone.length < 4) return '****'
  return '****' + phone.slice(-4)
}

function decryptIfNeeded(value: string): string {
  if (!value) return value
  if (value.includes(':')) {
    try {
      return decrypt(value)
    } catch {
      return value
    }
  }
  return value
}

export async function POST(request: Request) {
  try {
    let body: any
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { email, portalType } = body
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    await connectDB()

    // Check if a User record exists for this email
    const user = await User.findOne({ email: normalizedEmail, isActive: true })
    if (!user) {
      return NextResponse.json(
        { error: 'No active account found for this email. Please contact your administrator.' },
        { status: 404 }
      )
    }

    // Portal-specific role validation
    if (portalType === 'vendor' && user.role !== 'vendor') {
      return NextResponse.json(
        { error: 'This email is not registered as a vendor.' },
        { status: 403 }
      )
    }
    if (portalType === 'superadmin' && user.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'This email is not authorized for super admin access.' },
        { status: 403 }
      )
    }
    if (portalType === 'company') {
      const companyRoles = ['company_admin', 'location_admin', 'branch_admin', 'super_admin']
      if (!companyRoles.includes(user.role)) {
        return NextResponse.json(
          { error: 'This email is not authorized as a company admin.' },
          { status: 403 }
        )
      }
    }

    // Look up phone number from employee or vendor record
    let maskedPhone = '****'

    if (user.role === 'vendor' && user.vendorId) {
      const db = (await import('mongoose')).default.connection.db
      if (db) {
        const vendor = await db.collection('vendors').findOne({ id: user.vendorId })
        if (vendor?.phone) {
          maskedPhone = maskPhone(vendor.phone)
        }
      }
    } else {
      // For employees, company admins, location admins, branch admins
      const employee = await getEmployeeByEmail(normalizedEmail)
      if (employee?.mobile) {
        const mobile = decryptIfNeeded(employee.mobile)
        maskedPhone = maskPhone(mobile)
      }
    }

    // TODO: When SMS is implemented, generate a real OTP, store it, and send via Twilio
    // For now, the OTP is hardcoded as 123456 in the OTPVerification component and in lib/auth.ts

    return NextResponse.json({
      success: true,
      maskedPhone,
      message: `OTP sent to ${maskedPhone}`,
    })
  } catch (error: any) {
    console.error('[send-otp] Error:', error)
    return NextResponse.json(
      { error: 'An error occurred. Please try again.' },
      { status: 500 }
    )
  }
}
