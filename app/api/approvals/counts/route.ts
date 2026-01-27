import { NextResponse } from 'next/server'
import { 
  getPendingApprovalCount,
  getPendingReturnRequestCount,
  getPendingApprovalCountByLocation,
  getPendingOrderCountByVendor,
  getPendingReplacementOrderCountByVendor,
  getNewFeedbackCount,
  getNewInvoiceCount,
  getNewGRNCount,
  getApprovedGRNCount,
  getApprovedInvoiceCount,
  getPendingGRNCountForCompany,
  getPendingInvoiceCountForCompany
} from '@/lib/db/data-access'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const locationId = searchParams.get('locationId')
    const vendorId = searchParams.get('vendorId')
    const role = searchParams.get('role') || 'company' // company, location, vendor

    const counts: {
      pendingOrderApprovals?: number
      pendingReturnRequests?: number
      pendingOrders?: number
      pendingReplacementOrders?: number
      newFeedbackCount?: number
      newInvoiceCount?: number
      newGRNCount?: number
      approvedGRNCount?: number
      approvedInvoiceCount?: number
      pendingGRNApprovals?: number  // GRNs awaiting company admin approval
      pendingInvoiceApprovals?: number  // Invoices awaiting company admin approval
    } = {}

    if (role === 'company' && companyId) {
      // Company Admin: Get order approvals, return requests, feedback, GRN approvals, and invoice approvals
      const [orderCount, returnCount, feedbackCount, grnApprovalCount, invoiceApprovalCount] = await Promise.all([
        getPendingApprovalCount(companyId),
        getPendingReturnRequestCount(companyId),
        getNewFeedbackCount(companyId),
        getPendingGRNCountForCompany(companyId),
        getPendingInvoiceCountForCompany(companyId)
      ])
      counts.pendingOrderApprovals = orderCount
      counts.pendingReturnRequests = returnCount
      counts.newFeedbackCount = feedbackCount
      counts.pendingGRNApprovals = grnApprovalCount
      counts.pendingInvoiceApprovals = invoiceApprovalCount
      // Keep newInvoiceCount for backward compatibility (same as pendingInvoiceApprovals)
      counts.newInvoiceCount = invoiceApprovalCount
    } else if (role === 'location' && locationId) {
      // Location Admin: Get order approvals for their location
      const orderCount = await getPendingApprovalCountByLocation(locationId)
      counts.pendingOrderApprovals = orderCount
    } else if (role === 'vendor' && vendorId) {
      // Vendor: Get pending orders, replacement orders, new GRN, approved GRN, and approved invoices
      const [orderCount, replacementCount, newGRNCount, approvedGRNCount, approvedInvoiceCount] = await Promise.all([
        getPendingOrderCountByVendor(vendorId),
        getPendingReplacementOrderCountByVendor(vendorId),
        getNewGRNCount(vendorId),
        getApprovedGRNCount(vendorId),
        getApprovedInvoiceCount(vendorId)
      ])
      counts.pendingOrders = orderCount
      counts.pendingReplacementOrders = replacementCount
      counts.newGRNCount = newGRNCount
      counts.approvedGRNCount = approvedGRNCount
      counts.approvedInvoiceCount = approvedInvoiceCount
    }

    return NextResponse.json(counts, { status: 200 })
  } catch (error: any) {
    console.error('Error fetching approval counts:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
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
