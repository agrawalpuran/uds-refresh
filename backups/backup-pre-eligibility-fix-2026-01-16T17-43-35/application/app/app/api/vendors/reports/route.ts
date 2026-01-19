
import { NextRequest, NextResponse } from 'next/server'
import { 
  getVendorReports, 
  getVendorSalesPatterns, 
  getVendorOrderStatusBreakdown, 
  getVendorBusinessVolumeByCompany 
} from '@/lib/db/data-access'
import connectDB from '@/lib/db/mongodb'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    await connectDB()
    
    const searchParams = request.nextUrl.searchParams
    const vendorId = searchParams.get('vendorId')
    const reportType = searchParams.get('type')  // 'full', 'sales-patterns', 'order-status', 'business-volume'
    const period = searchParams.get('period') as 'daily' | 'weekly' | 'monthly' | null

    if (!vendorId) {
      return NextResponse.json(
        { error: 'Vendor ID is required' },
        { status: 400 }
      )
    }

    // Return full comprehensive report by default
    if (!reportType || reportType === 'full') {
      const reports = await getVendorReports(vendorId)
      return NextResponse.json(reports)
    }

    // Return sales patterns
    if (reportType === 'sales-patterns') {
      const patterns = await getVendorSalesPatterns(vendorId, period || 'monthly')
      return NextResponse.json({ patterns, period: period || 'monthly' })
    }

    // Order status breakdown
    if (reportType === 'order-status') {
      const breakdown = await getVendorOrderStatusBreakdown(vendorId)
      return NextResponse.json({ breakdown })
    }

    // Business volume
    if (reportType === 'business-volume') {
      const volume = await getVendorBusinessVolumeByCompany(vendorId)
      return NextResponse.json({ volume })
    }

    return NextResponse.json(
      { 
        error: 'Invalid report type. Use: full, sales-patterns, order-status, or business-volume' 
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
