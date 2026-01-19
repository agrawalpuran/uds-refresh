import { NextResponse } from 'next/server'
import { getEnabledProvidersForCompany } from '@/lib/providers/ProviderFactory'
import connectDB from '@/lib/db/mongodb'
// Ensure models are registered
import '@/lib/models/CompanyShippingProvider'
import '@/lib/models/ShipmentServiceProvider'
import CompanyShippingProvider from '@/lib/models/CompanyShippingProvider'
import ShipmentServiceProvider from '@/lib/models/ShipmentServiceProvider'
import { generateShippingId } from '@/lib/db/shipping-config-access'
import { encrypt } from '@/lib/utils/encryption'

/**
 * GET /api/companies/[companyId]/shipping-providers
 * Get enabled shipping providers for a company
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    const { companyId } = await params

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )

    }
    const providers = await getEnabledProvidersForCompany(companyId)
    
    return NextResponse.json(providers)
  } catch (error: any) {
    console.error('API Error in /api/companies/[companyId]/shipping-providers GET:', error)
    console.error('API Error in /api/companies/[companyId]/shipping-providers GET:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * POST /api/companies/[companyId]/shipping-providers
 * Create or enable a shipping provider for a company
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    await connectDB()
    const { companyId } = await params
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    const { providerId, isEnabled = true, isDefault = false, credentials, createdBy } = body

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )

    }
    if (!providerId) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      )
    }

    // Validate company ID format (alphanumeric string)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(companyId)) {
      return NextResponse.json(
        { error: 'Company ID must be alphanumeric (1-50 characters)' },
        { status: 400 }
      )
    }

    // Validate provider exists and is active
    const provider: any = await ShipmentServiceProvider.findOne({ 
      providerId,
      isActive: true 
    }).lean()

    if (!provider) {
      return NextResponse.json(
        { error: `Provider ${providerId} not found or not active` },
        { status: 404 }
      )
    }

    // Check if CompanyShippingProvider already exists
    const existing: any = await CompanyShippingProvider.findOne({
      companyId,
      providerId,
    }).lean()

    let companyShippingProvider

    if (existing) {
      // Update existing record
      const updateData: any = {
        isEnabled: isEnabled !== undefined ? isEnabled : existing.isEnabled,
        isDefault: isDefault !== undefined ? isDefault : existing.isDefault,
        updatedBy: createdBy || 'System',
      }

      // Encrypt credentials if provided
      if (credentials) {
        if (credentials.apiKey) updateData.apiKey = encrypt(credentials.apiKey)
        if (credentials.apiSecret) updateData.apiSecret = encrypt(credentials.apiSecret)
        if (credentials.accessToken) updateData.accessToken = encrypt(credentials.accessToken)
        if (credentials.refreshToken) updateData.refreshToken = encrypt(credentials.refreshToken)
        if (credentials.providerConfig) {
          updateData.providerConfig = encrypt(typeof credentials.providerConfig === 'string' 
            ? credentials.providerConfig 
            : JSON.stringify(credentials.providerConfig))
        }
      }

      companyShippingProvider = await CompanyShippingProvider.findOneAndUpdate(
        { companyId, providerId },
        { $set: updateData },
        { new: true }
      ).lean()

      console.log(`[POST /api/companies/${companyId}/shipping-providers] ✅ Updated CompanyShippingProvider: ${existing.companyShippingProviderId}`)
    } else {
      // Create new record
      const companyShippingProviderId = generateShippingId('CSP')
      
      const createData: any = {
        companyShippingProviderId,
        companyId,
        providerId,
        isEnabled: isEnabled !== undefined ? isEnabled : true,
        isDefault: isDefault !== undefined ? isDefault : false,
        createdBy: createdBy || 'System',
      }

      // Encrypt credentials if provided
      if (credentials) {
        if (credentials.apiKey) createData.apiKey = encrypt(credentials.apiKey)
        if (credentials.apiSecret) createData.apiSecret = encrypt(credentials.apiSecret)
        if (credentials.accessToken) createData.accessToken = encrypt(credentials.accessToken)
        if (credentials.refreshToken) createData.refreshToken = encrypt(credentials.refreshToken)
        if (credentials.providerConfig) {
          createData.providerConfig = encrypt(typeof credentials.providerConfig === 'string' 
            ? credentials.providerConfig 
            : JSON.stringify(credentials.providerConfig))
        }
      }

      companyShippingProvider = await CompanyShippingProvider.create(createData)
      console.log(`[POST /api/companies/${companyId}/shipping-providers] ✅ Created CompanyShippingProvider: ${companyShippingProviderId}`)
    }

    // Return response (without sensitive credentials)
    const response: any = {
      companyShippingProviderId: companyShippingProvider.companyShippingProviderId,
      companyId: companyShippingProvider.companyId,
      providerId: companyShippingProvider.providerId,
      isEnabled: companyShippingProvider.isEnabled,
      isDefault: companyShippingProvider.isDefault,
      providerCode: provider.providerCode,
      providerName: provider.providerName,
    }

    return NextResponse.json(response, { status: existing ? 200 : 201 })
  } catch (error: any) {
    console.error('API Error in /api/companies/[companyId]/shipping-providers POST:', error)
    console.error('API Error in /api/companies/[companyId]/shipping-providers POST:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/companies/[companyId]/shipping-providers
 * Update provider enablement status for a company
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ companyId: string }> }
) {
  try {
    await connectDB()
    const { companyId } = await params
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const { providerId, isEnabled, isDefault, credentials, updatedBy } = body

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      )
    }
    
    if (!providerId) {
      return NextResponse.json(
        { error: 'Provider ID is required' },
        { status: 400 }
      )
    }

    // Validate company ID format (alphanumeric)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(companyId)) {
      return NextResponse.json(
        { error: 'Company ID must be alphanumeric (1-50 characters)' },
        { status: 400 }
      )
    }

    // Check if CompanyShippingProvider exists
    const existing: any = await CompanyShippingProvider.findOne({
      companyId,
      providerId,
    }).lean()

    if (!existing) {
      return NextResponse.json(
        { error: `Provider ${providerId} is not enabled for company ${companyId}` },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {
      updatedBy: updatedBy || 'System',
    }

    if (isEnabled !== undefined) updateData.isEnabled = isEnabled
    if (isDefault !== undefined) updateData.isDefault = isDefault

    // Encrypt credentials if provided
    if (credentials) {
      if (credentials.apiKey) updateData.apiKey = encrypt(credentials.apiKey)
      if (credentials.apiSecret) updateData.apiSecret = encrypt(credentials.apiSecret)
      if (credentials.accessToken) updateData.accessToken = encrypt(credentials.accessToken)
      if (credentials.refreshToken) updateData.refreshToken = encrypt(credentials.refreshToken)
      if (credentials.providerConfig) {
        updateData.providerConfig = encrypt(typeof credentials.providerConfig === 'string' 
          ? credentials.providerConfig 
          : JSON.stringify(credentials.providerConfig))
      }
    }

    const updated: any = await CompanyShippingProvider.findOneAndUpdate(
      { companyId, providerId },
      { $set: updateData },
      { new: true }
    ).lean()

    console.log(`[PUT /api/companies/${companyId}/shipping-providers] ✅ Updated CompanyShippingProvider: ${updated?.companyShippingProviderId || existing?.companyShippingProviderId}`)

    // Get provider details
    const provider: any = await ShipmentServiceProvider.findOne({ providerId }).select('providerCode providerName').lean()

    const response: any = {
      companyShippingProviderId: updated?.companyShippingProviderId,
      companyId: updated?.companyId,
      providerId: updated?.providerId,
      isEnabled: updated?.isEnabled,
      isDefault: updated?.isDefault,
      providerCode: provider?.providerCode,
      providerName: provider?.providerName,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error: any) {
    console.error('API Error in /api/companies/[companyId]/shipping-providers PUT:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

