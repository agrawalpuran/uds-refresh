
import { NextResponse } from 'next/server'
import connectDB from '@/lib/db/mongodb'
import Company from '@/lib/models/Company'
import Vendor from '@/lib/models/Vendor'
import mongoose from 'mongoose'

/**
 * GET /api/companies/[companyId]/vendors
 * Get all vendors mapped/eligible for a company
 * Uses direct VendorCompany relationship mapping
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
    
    if (!mongoose.connection.db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }
    
    const db = mongoose.connection.db
    if (!db) {
      return NextResponse.json(
        { error: 'Database connection not available' },
        { status: 500 }
      )
    }

    // Use raw MongoDB collection to query relationships (bypasses Mongoose validation)
    // This allows querying with any company ID format (e.g., "COMP-ICICI" or numeric strings)
    const companyIdStr = company.id
    
    // Step 1: Try VendorCompany relationships (direct vendor-company mapping)
    const allVendorCompanyLinks = await db.collection('vendorcompanies').find({}).toArray()
    
    // Filter by string comparison to match company ID
    const vendorCompanyLinks = allVendorCompanyLinks.filter((link: any) => {
      if (!link.companyId) return false
      const linkCompanyIdStr = link.companyId.toString ? link.companyId.toString() : String(link.companyId)
      return linkCompanyIdStr === companyIdStr
    })

    console.log(
      `[vendors API] Found ${vendorCompanyLinks.length} VendorCompany relationships for company ${companyIdStr}`
    )

    let vendorIds: string[] = []

    if (vendorCompanyLinks.length > 0) {
      // Extract vendor IDs from VendorCompany relationships
      vendorIds = vendorCompanyLinks
        .map((vc: any) => {
          if (!vc.vendorId) return null
          return vc.vendorId.toString ? vc.vendorId.toString() : String(vc.vendorId)
        })
        .filter(Boolean) as string[]

      console.log(
        `[vendors API] Extracted ${vendorIds.length} vendor IDs from VendorCompany relationships`
      )
    } else {
      // Step 2: Derive vendors from ProductCompany + ProductVendor relationships
      console.log(
        `[vendors API] No direct VendorCompany relationships found. Deriving from ProductCompany + ProductVendor...`
      )
      
      // Query ProductCompany relationships using raw collection
      const allProductCompanyLinks = await db.collection('productcompanies').find({}).toArray()
      
      // Filter by string comparison to match company ID
      const productCompanyLinks = allProductCompanyLinks.filter((link: any) => {
        if (!link.companyId) return false
        const linkCompanyIdStr = link.companyId.toString ? link.companyId.toString() : String(link.companyId)
        return linkCompanyIdStr === companyIdStr
      })

      console.log(
        `[vendors API] Found ${productCompanyLinks.length} ProductCompany links for company ${companyIdStr}`
      )

      if (productCompanyLinks.length === 0) {
        console.log(`[vendors API] No products linked to company ${companyIdStr}`)
        return NextResponse.json([])
      }

      // Get product IDs from ProductCompany links
      const productIds = productCompanyLinks
        .map((pc: any) => {
          if (!pc.productId && !pc.uniformId) return null
          const productId = pc.productId || pc.uniformId
          return productId.toString ? productId.toString() : String(productId)
        })
        .filter(Boolean) as string[]

      console.log(`[vendors API] Looking for vendors for ${productIds.length} products`)

      // Query ProductVendor relationships using raw collection
      const allProductVendorLinks = await db.collection('productvendors').find({}).toArray()
      
      // Filter ProductVendor links that match our product IDs
      const productVendorLinks = allProductVendorLinks.filter((link: any) => {
        if (!link.productId) return false
        const linkProductIdStr = link.productId.toString ? link.productId.toString() : String(link.productId)
        return productIds.includes(linkProductIdStr)
      })

      console.log(`[vendors API] Found ${productVendorLinks.length} ProductVendor links`)

      // Extract unique vendor IDs
      vendorIds = Array.from(
        new Set(
          productVendorLinks
            .map((pv: any) => {
              if (!pv.vendorId) return null
              return pv.vendorId.toString ? pv.vendorId.toString() : String(pv.vendorId)
            })
            .filter(Boolean)
        )
      ) as string[]

      console.log(`[vendors API] Unique vendor IDs: ${vendorIds.length}`)

      if (vendorIds.length === 0) {
        console.log(
          `[vendors API] No vendors found for products linked to company ${companyIdStr}`
        )
        return NextResponse.json([])
      }
    }

    // Step 3: Query vendors by string ID
    const vendors = await Vendor.find({
      id: { $in: vendorIds }
    }).lean()
    
    console.log(`[vendors API] Found ${vendors.length} vendor documents for ${vendorIds.length} vendor IDs`)

    // Format vendors
    const formattedVendors = vendors.map(vendor => ({
      id: vendor.id,
      name: vendor.name
    }))

    return NextResponse.json(formattedVendors)

  } catch (error: any) {
    console.error('API Error in /api/companies/[companyId]/vendors GET:', error)
    const errorMessage =
      error?.message || error?.toString() || 'Internal server error'
    
    if (
      errorMessage.includes('required') ||
      errorMessage.includes('invalid') ||
      errorMessage.includes('missing') ||
      errorMessage.includes('Invalid JSON')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 400 })
    }
    
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('Not found') ||
      errorMessage.includes('does not exist')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 404 })
    }
    
    if (
      errorMessage.includes('Unauthorized') ||
      errorMessage.includes('authentication') ||
      errorMessage.includes('token')
    ) {
      return NextResponse.json({ error: errorMessage }, { status: 401 })
    }
    
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
