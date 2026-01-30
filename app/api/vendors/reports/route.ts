
import { NextRequest, NextResponse } from 'next/server'
import { 
  getVendorReports, 
  getVendorReportsForCompany,
  getVendorSalesPatterns, 
  getVendorSalesPatternsForCompany,
  getVendorOrderStatusBreakdown,
  getVendorOrderStatusBreakdownForCompany,
  getVendorBusinessVolumeByCompany,
  getVendorBusinessVolumeByCompanyWithDateRange,
  getVendorTopProducts,
  getVendorDeliveryPerformance,
  getVendorAccountHealth
} from '@/lib/db/data-access'
import connectDB from '@/lib/db/mongodb'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

// Helper to parse date from query string
function parseDateParam(dateStr: string | null): Date | null {
  if (!dateStr) return null
  const date = new Date(dateStr)
  return isNaN(date.getTime()) ? null : date
}

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendorId')
    const companyId = searchParams.get('companyId') // Optional company filter
    const reportType = searchParams.get('type')  // 'full', 'sales-patterns', 'order-status', 'business-volume', 'top-products', 'delivery', 'account-health'
    const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | null
    
    // Date range parameters
    const startDate = parseDateParam(searchParams.get('startDate'))
    const endDate = parseDateParam(searchParams.get('endDate'))

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    // Return full comprehensive report by default
    if (!reportType || reportType === 'full') {
      // Use company-filtered version with date range
      const reports = await getVendorReportsForCompany(vendorId, companyId, startDate, endDate)
      return NextResponse.json(reports)
    }

    // Return sales patterns
    if (reportType === 'sales-patterns') {
      const patterns = await getVendorSalesPatternsForCompany(vendorId, companyId, period || 'monthly', startDate, endDate)
      return NextResponse.json({ patterns, period: period || 'monthly' })
    }

    // Order status breakdown
    if (reportType === 'order-status') {
      const breakdown = await getVendorOrderStatusBreakdownForCompany(vendorId, companyId, startDate, endDate)
      return NextResponse.json({ breakdown })
    }

    // Business volume by company (only for all-companies view)
    if (reportType === 'business-volume') {
      if (companyId) {
        return NextResponse.json({ 
          volume: [],
          message: 'Business volume by company is only available in All Companies view'
        })
      }
      const volume = await getVendorBusinessVolumeByCompanyWithDateRange(vendorId, startDate, endDate)
      return NextResponse.json({ volume })
    }

    // Top products (context-aware)
    if (reportType === 'top-products') {
      const topProducts = await getVendorTopProducts(vendorId, companyId, 5, startDate, endDate)
      return NextResponse.json({ topProducts })
    }

    // Delivery performance (context-aware)
    if (reportType === 'delivery') {
      const deliveryPerformance = await getVendorDeliveryPerformance(vendorId, companyId, startDate, endDate)
      return NextResponse.json({ deliveryPerformance })
    }

    // Account health (single company view only - not filtered by date, shows lifetime)
    if (reportType === 'account-health') {
      if (!companyId) {
        return NextResponse.json(
          { error: 'Company ID is required for account health report' },
          { status: 400 }
        )
      }
      const accountHealth = await getVendorAccountHealth(vendorId, companyId)
      return NextResponse.json({ accountHealth })
    }

    return NextResponse.json(
      { 
        error: 'Invalid report type. Use: full, sales-patterns, order-status, business-volume, top-products, delivery, or account-health' 
      },
      { status: 400 }
    )

  } catch (error: any) {
    console.error('API Error:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing')
    ) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') || 
      errorMessage.includes('Not found') || 
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }

    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
