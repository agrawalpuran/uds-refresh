import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import {
  getProductMTMConfigs,
  getProductMTMAvailability,
  getProductMTMAvailabilityBatch,
  upsertProductMTMConfig,
  isCompanyMTMEnabled,
} from '@/lib/db/mtm-data-access'

export const dynamic = 'force-dynamic'

/**
 * GET /api/mtm/product-config
 * 
 * Query params:
 *   companyId (required)
 *   productId (optional) - Get MTM availability for a specific product
 *   status (optional) - Filter by status (default: active)
 */
export async function GET(request: Request) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const productId = searchParams.get('productId')
    const status = searchParams.get('status')

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 }
      )
    }

    // Batch availability check for multiple products
    const productIds = searchParams.get('productIds')
    if (productIds) {
      const ids = productIds.split(',').filter(Boolean)
      const batchResult = await getProductMTMAvailabilityBatch(ids, companyId)
      return NextResponse.json(batchResult)
    }

    // Single product availability check (includes spec details)
    if (productId) {
      const availability = await getProductMTMAvailability(productId, companyId)
      return NextResponse.json(availability)
    }

    // List all product MTM configs for a company
    const configs = await getProductMTMConfigs(companyId, {
      status: status || undefined,
    })

    return NextResponse.json(configs)
  } catch (error: any) {
    console.error('[API] GET /api/mtm/product-config error:', error)
    const errorMessage = error?.message || 'Internal server error'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

/**
 * POST /api/mtm/product-config
 * 
 * Creates or updates MTM config for a product (upsert).
 * 
 * Body:
 *   productId (required)
 *   companyId (required)
 *   mtm_specification_id (required) - ID of the measurement spec to use
 *   mtm_price_premium (optional) - Additional cost for MTM
 *   estimated_production_days (optional)
 *   status (optional) - 'active' | 'inactive'
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

    const { productId, companyId, mtm_specification_id, is_mtm_enabled } = body

    if (!productId || !companyId) {
      return NextResponse.json(
        { error: 'productId and companyId are required' },
        { status: 400 }
      )
    }

    if (is_mtm_enabled !== false && !mtm_specification_id) {
      return NextResponse.json(
        { error: 'mtm_specification_id is required when enabling MTM' },
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

    const config = await upsertProductMTMConfig(body)
    return NextResponse.json(config, { status: 201 })
  } catch (error: any) {
    console.error('[API] POST /api/mtm/product-config error:', error)
    const errorMessage = error?.message || 'Internal server error'
    if (errorMessage.includes('required') || errorMessage.includes('not found')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
