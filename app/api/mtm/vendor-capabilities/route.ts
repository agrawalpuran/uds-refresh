import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getVendorMTMCapabilities,
  isVendorMTMCapable,
  upsertVendorMTMCapability,
} from '@/lib/db/mtm-data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mtm/vendor-capabilities
 * 
 * Query params:
 *   vendorId (required, or vendorIds for batch)
 *   vendorIds (optional) - comma-separated list for batch fetch
 *   garment_category (optional) - Check specific category capability
 *   is_active (optional) - Filter by active status
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const vendorId = searchParams.get('vendorId')
    const vendorIds = searchParams.get('vendorIds')
    const garment_category = searchParams.get('garment_category')
    const is_active = searchParams.get('is_active')

    // Batch fetch for multiple vendors
    if (vendorIds) {
      const ids = vendorIds.split(',').filter(Boolean)
      const result: Record<string, any[]> = {}
      const allCaps = await Promise.all(
        ids.map(id => getVendorMTMCapabilities(id, {
          is_active: is_active !== null ? is_active === 'true' : undefined,
        }))
      )
      ids.forEach((id, i) => { result[id] = allCaps[i] })
      return NextResponse.json(result)
    }

    if (!vendorId) {
      return NextResponse.json(
        { error: 'vendorId or vendorIds is required' },
        { status: 400 }
      )
    }

    if (garment_category) {
      const capable = await isVendorMTMCapable(vendorId, garment_category)
      return NextResponse.json({ vendorId, garment_category, capable })
    }

    const capabilities = await getVendorMTMCapabilities(vendorId, {
      is_active: is_active !== null ? is_active === 'true' : undefined,
    })

    return NextResponse.json(capabilities)
  } catch (error: any) {
    console.error('[API] GET /api/mtm/vendor-capabilities error:', error)
    const errorMessage = error?.message || 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/mtm/vendor-capabilities
 * 
 * Creates or updates vendor MTM capability (upsert).
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

    const { vendorId, garment_category } = body

    if (!vendorId || !garment_category) {
      return NextResponse.json(
        { error: 'vendorId and garment_category are required' },
        { status: 400 }
      )
    }

    const capability = await upsertVendorMTMCapability(body)
    return NextResponse.json(capability, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /api/mtm/vendor-capabilities error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('required')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
