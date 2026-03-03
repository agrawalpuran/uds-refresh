import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getMTMSpecifications,
  getMTMSpecificationById,
  createMTMSpecification,
  updateMTMSpecification,
  deleteMTMSpecification,
  isCompanyMTMEnabled,
} from '@/lib/db/mtm-data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mtm/specifications
 * 
 * Query params:
 *   companyId (required) - Company to get specifications for
 *   specId (optional) - Get a specific specification by ID
 *   garment_category (optional) - Filter by garment category
 *   status (optional) - Filter by status (default: active)
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const specId = searchParams.get('specId')
    const garment_category = searchParams.get('garment_category')
    const status = searchParams.get('status')

    if (!companyId && !specId) {
      return NextResponse.json(
        { error: 'companyId or specId is required' },
        { status: 400 }
      )
    }

    if (specId) {
      const spec = await getMTMSpecificationById(specId)
      if (!spec) {
        return NextResponse.json(
          { error: 'MTM specification not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(spec)
    }

    const specs = await getMTMSpecifications(companyId!, {
      garment_category: garment_category || undefined,
      status: status || undefined,
    })

    return NextResponse.json(specs)
  } catch (error: any) {
    console.error('[API] GET /api/mtm/specifications error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('not found') || errorMessage.includes('required')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/mtm/specifications
 * 
 * Body:
 *   companyId (required)
 *   garment_category (required) - e.g., 'shirt', 'pant', 'jacket'
 *   specification_name (required) - Human-readable name
 *   measurement_points (required) - Array of measurement point definitions
 *   created_by (optional)
 */
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { companyId, garment_category, specification_name, measurement_points, created_by } = body

    if (!companyId || !garment_category || !specification_name || !measurement_points) {
      return NextResponse.json(
        { error: 'companyId, garment_category, specification_name, and measurement_points are required' },
        { status: 400 }
      )
    }

    if (!Array.isArray(measurement_points) || measurement_points.length === 0) {
      return NextResponse.json(
        { error: 'measurement_points must be a non-empty array' },
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

    const spec = await createMTMSpecification({
      companyId,
      garment_category,
      specification_name,
      measurement_points,
      created_by,
    })

    return NextResponse.json(spec, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /api/mtm/specifications error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('required') || errorMessage.includes('Duplicate') || errorMessage.includes('min_value')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * PUT /api/mtm/specifications
 * 
 * Body:
 *   specId (required) - Specification ID to update
 *   specification_name (optional)
 *   measurement_points (optional)
 *   status (optional) - 'active' | 'inactive'
 *   updated_by (optional)
 */
export async function PUT(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      )
    }

    const { specId, ...updates } = body

    if (!specId) {
      return NextResponse.json(
        { error: 'specId is required' },
        { status: 400 }
      )
    }

    const updated = await updateMTMSpecification(specId, updates)
    if (!updated) {
      return NextResponse.json(
        { error: 'MTM specification not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(updated)
  } catch (error: any) {
    console.error('[API] PUT /api/mtm/specifications error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('required') || errorMessage.includes('min_value')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const specId = searchParams.get('specId')

    if (!specId) {
      return NextResponse.json(
        { error: 'specId is required' },
        { status: 400 }
      )
    }

    const deleted = await deleteMTMSpecification(specId)
    if (!deleted) {
      return NextResponse.json(
        { error: 'MTM specification not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[API] DELETE /api/mtm/specifications error:', error)
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    )
  }
}
