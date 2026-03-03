import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getEmployeeByEmail,
  getCompanyById,
  getVendorById,
  getBranchByAdminEmail,
  getLocationByAdminEmail,
  getCompanyByAdminEmail,
} from '@/lib/db/data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/dashboard-context?actorType=consumer|company|vendor|superadmin
 *
 * Single endpoint that returns everything DashboardLayout needs,
 * replacing the 3-5 separate API calls previously made per page load.
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const actorType = searchParams.get('actorType') as string | null

    if (!actorType || !['consumer', 'company', 'vendor', 'superadmin'].includes(actorType)) {
      return NextResponse.json({ error: 'Invalid actorType' }, { status: 400 })
    }

    const email = ctx.email
    const sessionCompanyId = ctx.companyId
    const sessionVendorId = ctx.vendorId

    // --- Vendor: single lookup ---
    if (actorType === 'vendor') {
      const vendorId = sessionVendorId
      let vendor = null
      if (vendorId) {
        vendor = await getVendorById(vendorId)
      }
      return NextResponse.json({
        actorType,
        vendor: vendor
          ? {
              id: vendor.id,
              name: vendor.name,
              primaryColor: vendor.primaryColor || null,
              accentColor: vendor.accentColor || null,
            }
          : null,
      })
    }

    // --- Super admin: no extra data needed ---
    if (actorType === 'superadmin') {
      return NextResponse.json({ actorType })
    }

    // --- Consumer & Company share an employee lookup ---
    if (!email) {
      return NextResponse.json({ actorType, employee: null, company: null })
    }

    const employee = await getEmployeeByEmail(email)

    if (!employee) {
      return NextResponse.json({ actorType, employee: null, company: null })
    }

    const employeeCompanyId =
      typeof employee.companyId === 'object' && employee.companyId?.id
        ? employee.companyId.id
        : employee.companyId || sessionCompanyId

    // Parallel role checks (they internally use caches so the repeated
    // getEmployeeByEmail lookups are now avoided since we pass data directly)
    const [branch, location, companyAdmin] = await Promise.all([
      actorType === 'company' ? getBranchByAdminEmail(email) : Promise.resolve(null),
      getLocationByAdminEmail(email),
      actorType === 'company' ? getCompanyByAdminEmail(email) : Promise.resolve(null),
    ])

    const targetCompanyId =
      actorType === 'company'
        ? branch?.companyId?.id || branch?.companyId ||
          location?.companyId?.id || location?.companyId ||
          sessionCompanyId || companyAdmin?.id
        : employeeCompanyId

    let company = null
    if (targetCompanyId) {
      company = await getCompanyById(targetCompanyId)
    }

    const canLocationAdminViewFeedback =
      !!location && !!company?.allowLocationAdminViewFeedback

    return NextResponse.json({
      actorType,
      employee: employee
        ? {
            firstName: employee.firstName || '',
            lastName: employee.lastName || '',
            name: employee.name || null,
            employeeId: employee.employeeId || null,
            email: employee.email || null,
            companyId: employeeCompanyId,
          }
        : null,
      company: company
        ? {
            id: company.id,
            name: company.name,
            logo: company.logo || null,
            primaryColor: company.primaryColor || null,
            secondaryColor: company.secondaryColor || null,
            allowLocationAdminViewFeedback: company.allowLocationAdminViewFeedback || false,
          }
        : null,
      roles: {
        isBranchAdmin: !!branch,
        isLocationAdmin: !!location,
        isCompanyAdmin: !!companyAdmin,
      },
      location: location
        ? { id: location.id, name: location.name }
        : null,
      canLocationAdminViewFeedback,
    })
  } catch (error: any) {
    console.error('[dashboard-context] Error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
