
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Company from '@/lib/models/Company'
import Location from '@/lib/models/Location'

/**
 * GET /api/companies/[companyId]/branches
 * Get all branches (locations) for a company
 * 
 * Uses the `locations` collection as the primary source since:
 * - Employees are linked to locations (via locationId)
 * - Order creation uses locations for shipping addresses
 * - Test order creation works with locations
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    await connectDB()

    const { companyId } = await params

    // Find company
    const company = await Company.findOne({ id: companyId })
    if (!company) {
      return NextResponse.json(
        { error: `Company not found: ${companyId}` },
        { status: 404 }
      )
    }

    // Load from locations collection - this is where employees and orders are linked
    const locations: any[] = await Location.find({
      companyId: company.id,
      status: 'active'
    }).lean()

    console.log(`[branches API] Found ${locations.length} locations for company ${company.id}`)

    // Format locations as branches for the API response
    const formattedBranches = locations.map((loc: any) => ({
      id: loc.id,
      name: loc.name,
      address_line_1: loc.address_line_1,
      address_line_2: loc.address_line_2,
      address_line_3: loc.address_line_3,
      city: loc.city,
      state: loc.state,
      pincode: loc.pincode,
      country: loc.country,
      phone: loc.phone,
      email: loc.email,
      companyId: String(loc.companyId),
      adminId: loc.adminId,
      status: loc.status || 'active'
    }))

    console.log(`[branches API] Returning ${formattedBranches.length} location(s) as branches`)

    return NextResponse.json(formattedBranches)
  } catch (error: any) {
    console.error('API Error in /api/companies/[companyId]/branches GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'

    // Return 400 for validation/input errors
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }

    // Return 404 for not found errors
    if (
      errorMessage.includes('not found') || 
      errorMessage.includes('Not found') || 
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }

    // Return 401 for authentication errors
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }

    // Return 500 for server errors
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
