
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Branch from '@/lib/models/Branch'
import Company from '@/lib/models/Company'
import mongoose from 'mongoose'

/**
 * GET /api/companies/[companyId]/branches
 * Get all branches for a company
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

    // Find branches for the company - use string ID
    const branches: any[] = await Branch.find({
      companyId: company.id
    }).lean()

    console.log(`[branches API] Found ${branches.length} branches for company ${company.id}`)

    // Ensure we return branches with proper structure - use string IDs
    const formattedBranches = branches.map((branch: any) => ({
      id: branch.id,
      name: branch.name,
      city: branch.city,
      state: branch.state,
      companyId: String(branch.companyId),
      status: branch.status || 'active',
      ...branch // Include all other fields
    }))

    console.log(`[branches API] Returning ${formattedBranches.length} formatted branch(es)`)

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
