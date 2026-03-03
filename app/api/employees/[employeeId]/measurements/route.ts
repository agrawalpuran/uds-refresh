import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getActiveMeasurementProfile,
  getMeasurementProfiles,
  createMeasurementProfile,
  updateMeasurementProfile,
  isCompanyMTMEnabled,
} from '@/lib/db/mtm-data-access'
import { validateMeasurements, MeasurementInput } from '@/lib/utils/measurement-validation'
import { getMTMSpecifications } from '@/lib/db/mtm-data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/employees/[employeeId]/measurements
 * 
 * Query params:
 *   active (optional) - If 'true', return only the active profile
 *   status (optional) - Filter by status
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const resolvedParams = await params
    const employeeId = resolvedParams.employeeId

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing employee ID' },
        { status: 400 }
      )
    }

    const { searchParams } = new URL(request.url)
    const active = searchParams.get('active')
    const status = searchParams.get('status')

    if (active === 'true') {
      const profile = await getActiveMeasurementProfile(employeeId)
      if (!profile) {
        return NextResponse.json(
          { error: 'No active measurement profile found' },
          { status: 404 }
        )
      }
      return NextResponse.json(profile)
    }

    const profiles = await getMeasurementProfiles(employeeId, {
      status: status || undefined,
    })

    return NextResponse.json(profiles)
  } catch (error: any) {
    console.error('[API] GET /api/employees/[employeeId]/measurements error:', error)
    const errorMessage = error?.message || 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/employees/[employeeId]/measurements
 * 
 * Creates a new measurement profile. Automatically becomes the active profile.
 * 
 * Body:
 *   companyId (required)
 *   measurements (required) - Object with ISO keys: { chest_girth: { value: 102, unit: 'cm' }, ... }
 *   capture_method (required) - 'MANUAL_TAPE' | 'PHOTO_AI' | 'PROFESSIONAL' | 'SELF_REPORTED'
 *   garment_category (optional) - If provided, validates measurements against spec
 *   captured_by (optional)
 *   notes (optional)
 *   created_by (optional)
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const resolvedParams = await params
    const employeeId = resolvedParams.employeeId

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing employee ID' },
        { status: 400 }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { companyId, measurements, capture_method, garment_category, captured_by, notes, created_by } = body

    if (!companyId || !measurements || !capture_method) {
      return NextResponse.json(
        { error: 'companyId, measurements, and capture_method are required' },
        { status: 400 }
      )
    }

    if (typeof measurements !== 'object' || Object.keys(measurements).length === 0) {
      return NextResponse.json(
        { error: 'measurements must be a non-empty object' },
        { status: 400 }
      )
    }

    const mtmEnabled = await isCompanyMTMEnabled(companyId)
    if (!mtmEnabled) {
      return NextResponse.json(
        { error: 'MTM is not enabled for this company' },
        { status: 403 }
      )
    }

    // Optional: validate against specification if garment_category provided
    if (garment_category) {
      const specs = await getMTMSpecifications(companyId, { garment_category })
      if (specs.length > 0) {
        const spec = specs[0]
        const measurementInputs: MeasurementInput[] = Object.entries(measurements).map(
          ([key, val]: [string, any]) => ({
            key,
            value: val.value,
            unit: val.unit,
          })
        )
        const validation = validateMeasurements(measurementInputs, spec.measurement_points)
        if (!validation.valid) {
          return NextResponse.json(
            { error: 'Measurement validation failed', details: validation.errors },
            { status: 400 }
          )
        }
      }
    }

    const profile = await createMeasurementProfile({
      employeeId,
      companyId,
      measurements,
      capture_method,
      captured_by,
      notes,
      created_by,
    })

    return NextResponse.json(profile, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /api/employees/[employeeId]/measurements error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('required') || errorMessage.includes('validation')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * PUT /api/employees/[employeeId]/measurements
 * 
 * Updates an existing measurement profile.
 * 
 * Body:
 *   profileId (required) - Profile ID to update
 *   measurements (optional) - Updated measurements
 *   capture_method (optional)
 *   captured_by (optional)
 *   notes (optional)
 *   is_active (optional)
 *   status (optional)
 *   updated_by (optional)
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const resolvedParams = await params
    const employeeId = resolvedParams.employeeId

    if (!employeeId) {
      return NextResponse.json(
        { error: 'Missing employee ID' },
        { status: 400 }
      )
    }

    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { profileId, ...updates } = body

    if (!profileId) {
      return NextResponse.json(
        { error: 'profileId is required' },
        { status: 400 }
      )
    }

    const updated = await updateMeasurementProfile(profileId, updates)
    if (!updated) {
      return NextResponse.json(
        { error: 'Measurement profile not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[API] PUT /api/employees/[employeeId]/measurements error:', error)
    const errorMessage = error?.message || 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
