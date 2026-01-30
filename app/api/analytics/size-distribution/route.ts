import { NextResponse } from 'next/server'
import {
  getSizeDistributionFilterOptions,
  getSizeDistributionAnalytics,
  type SizeDistributionFilters
} from '@/lib/db/size-analytics'

export const dynamic = 'force-dynamic'

function parseMultiParam(value: string | null): string[] {
  if (!value || typeof value !== 'string') return []
  return value.split(',').map(s => s.trim()).filter(Boolean)
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const filtersOnly = searchParams.get('filters') === '1' || searchParams.get('filters') === 'true'

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId is required' },
        { status: 400 }
      )
    }

    if (filtersOnly) {
      const options = await getSizeDistributionFilterOptions(companyId)
      return NextResponse.json(options, {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      })
    }

    const garmentTypes = parseMultiParam(searchParams.get('garmentTypes'))
    const designIds = parseMultiParam(searchParams.get('designIds'))
    const vendorIds = parseMultiParam(searchParams.get('vendorIds'))
    const orderCycleYearParam = searchParams.get('orderCycleYear')
    const orderCycleYear = orderCycleYearParam ? parseInt(orderCycleYearParam, 10) : undefined
    const locationId = searchParams.get('locationId') || undefined
    const topNParam = searchParams.get('topN')
    const topN = topNParam ? Math.min(20, Math.max(1, parseInt(topNParam, 10))) : 5

    const filters: SizeDistributionFilters = {
      companyId,
      ...(garmentTypes.length > 0 && { garmentTypes }),
      ...(designIds.length > 0 && { designIds }),
      ...(vendorIds.length > 0 && { vendorIds }),
      ...(orderCycleYear && !isNaN(orderCycleYear) && { orderCycleYear }),
      ...(locationId && { locationId }),
      topN
    }

    const result = await getSizeDistributionAnalytics(filters)
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    })
  } catch (error: any) {
    console.error('[API size-distribution]', error)
    const message = error?.message || 'Internal server error'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
