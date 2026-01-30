import { NextResponse } from 'next/server'
import { 
  getAllCompanies, 
  getCompanyById, 
  addCompanyAdmin, 
  removeCompanyAdmin, 
  updateCompanyAdminPrivileges,
  updateCompanySettings,
  getCompanyAdmins,
  isCompanyAdmin, 
  getCompanyByAdminEmail,
  canApproveOrders,
  createCompany
} from '@/lib/db/data-access'


// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const companyId = searchParams.get('companyId')
    const email = searchParams.get('email')
    const checkAdmin = searchParams.get('checkAdmin')
    const getByAdminEmail = searchParams.get('getByAdminEmail')
    const getAdmins = searchParams.get('getAdmins')
    const checkCanApprove = searchParams.get('checkCanApprove')

    // Check if admin can approve orders
    if (checkCanApprove === 'true' && email && companyId) {
      const canApprove = await canApproveOrders(email, companyId)
      return NextResponse.json({ canApprove })
    }

    // Get company admins
    if (getAdmins === 'true' && companyId) {
      const admins = await getCompanyAdmins(companyId)
      console.log(`[API] Returning ${admins.length} admins for company ${companyId}`)
      return NextResponse.json(admins, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // Check if user is admin of a company
    if (checkAdmin === 'true' && email && companyId) {
      const isAdmin = await isCompanyAdmin(email, companyId)
      return NextResponse.json({ isAdmin })
    }

    // Get company by admin email
    if (getByAdminEmail === 'true' && email) {
      console.log(`[API /companies] ========================================`)
      console.log(`[API /companies] 🔍 getByAdminEmail API called`)
      console.log(`[API /companies] Raw email param: "${email}"`)
      
      // Normalize email: decode URL encoding, trim, and lowercase for consistent comparison
      const normalizedEmail = decodeURIComponent(email).trim().toLowerCase()
      console.log(`[API /companies] Decoded email: "${decodeURIComponent(email)}"`)
      console.log(`[API /companies] Normalized email: "${normalizedEmail}"`)
      console.log(`[API /companies] Calling getCompanyByAdminEmail(${normalizedEmail})...`)
      
      const startTime = Date.now()
      const company = await getCompanyByAdminEmail(normalizedEmail)
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }
      const duration = Date.now() - startTime
      
      console.log(`[API /companies] ⏱️ getCompanyByAdminEmail completed in ${duration}ms`)
      console.log(`[API /companies] Result:`, company ? {
        id: company.id,
        name: company.name,
        type: typeof company,
        keys: Object.keys(company || {})
      } : 'null')
      
      if (company) {
        console.log(`[API /companies] ✅ Company found: ${company.id} (${company.name})`)
      } else {
        console.error(`[API /companies] ❌ No company found for email: ${normalizedEmail}`)
      }
      console.log(`[API /companies] ========================================`)
      
      return NextResponse.json(company)
    }

    // Get company by ID
    if (companyId) {
      const company = await getCompanyById(companyId)
      if (!company) {
        return NextResponse.json({ error: 'Company not found' }, { status: 404 })
      }
      return NextResponse.json(company, {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      })
    }

    // Get all companies
    const companies = await getAllCompanies()
    return NextResponse.json(companies, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    })
  } catch (error: any) {
    console.error('API Error:', error)
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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

export async function PATCH(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    const { companyId, employeeId, action, canApproveOrders, showPrices, allowPersonalPayments, enableEmployeeOrder, allowLocationAdminViewFeedback, allowEligibilityConsumptionReset, logo, primaryColor, secondaryColor, name, enable_pr_po_workflow, enable_site_admin_pr_approval, require_company_admin_po_approval, allow_multi_pr_po, shipmentRequestMode } = body

    if (!companyId) {
      return NextResponse.json({ error: 'Company ID is required' }, { status: 400 })
    }

    if (action === 'addAdmin') {
      if (!employeeId) {
        return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 })
      }
      await addCompanyAdmin(companyId, employeeId, canApproveOrders || false)
      return NextResponse.json({ success: true, message: 'Company admin added successfully' })
    } else if (action === 'removeAdmin') {
      if (!employeeId) {
        return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 })
      }
      await removeCompanyAdmin(companyId, employeeId)
      return NextResponse.json({ success: true, message: 'Company admin removed successfully' })
    } else if (action === 'updatePrivileges') {
      if (!employeeId) {
        return NextResponse.json({ error: 'Employee ID is required' }, { status: 400 })
      }
      if (typeof canApproveOrders !== 'boolean') {
        return NextResponse.json({ error: 'canApproveOrders must be a boolean' }, { status: 400 })
      }
      await updateCompanyAdminPrivileges(companyId, employeeId, canApproveOrders)
      return NextResponse.json({ success: true, message: 'Admin privileges updated successfully' })
    } else if (action === 'updateSettings') {
      // Log the incoming request
      console.log('[API] updateSettings request:', {
        companyId,
        enableEmployeeOrder,
        enableEmployeeOrderType: typeof enableEmployeeOrder,
        showPrices,
        allowPersonalPayments
      })
      
      const settings: { 
        showPrices?: boolean
        allowPersonalPayments?: boolean
        enableEmployeeOrder?: boolean
        allowLocationAdminViewFeedback?: boolean
        allowEligibilityConsumptionReset?: boolean
        logo?: string
        primaryColor?: string
        secondaryColor?: string
        name?: string
        // PR → PO Workflow Configuration
        enable_pr_po_workflow?: boolean
        enable_site_admin_pr_approval?: boolean
        require_company_admin_po_approval?: boolean
        allow_multi_pr_po?: boolean
        shipmentRequestMode?: 'MANUAL' | 'AUTOMATIC'
      } = {}
      if (showPrices !== undefined) {
        if (typeof showPrices !== 'boolean') {
          return NextResponse.json({ error: 'showPrices must be a boolean' }, { status: 400 })
        }
        settings.showPrices = showPrices
      }
      if (allowPersonalPayments !== undefined) {
        if (typeof allowPersonalPayments !== 'boolean') {
          return NextResponse.json({ error: 'allowPersonalPayments must be a boolean' }, { status: 400 })
        }
        settings.allowPersonalPayments = allowPersonalPayments
      }
      if (enableEmployeeOrder !== undefined) {
        if (typeof enableEmployeeOrder !== 'boolean') {
          return NextResponse.json({ error: 'enableEmployeeOrder must be a boolean' }, { status: 400 })
        }
        settings.enableEmployeeOrder = enableEmployeeOrder
      }
      if (allowLocationAdminViewFeedback !== undefined) {
        if (typeof allowLocationAdminViewFeedback !== 'boolean') {
          return NextResponse.json({ error: 'allowLocationAdminViewFeedback must be a boolean' }, { status: 400 })
        }
        settings.allowLocationAdminViewFeedback = allowLocationAdminViewFeedback
      }
      if (allowEligibilityConsumptionReset !== undefined) {
        if (typeof allowEligibilityConsumptionReset !== 'boolean') {
          return NextResponse.json({ error: 'allowEligibilityConsumptionReset must be a boolean' }, { status: 400 })
        }
        settings.allowEligibilityConsumptionReset = allowEligibilityConsumptionReset
      }
      if (logo !== undefined) {
        if (typeof logo !== 'string') {
          return NextResponse.json({ error: 'logo must be a string' }, { status: 400 })
        }
        settings.logo = logo
      }
      if (primaryColor !== undefined) {
        if (typeof primaryColor !== 'string') {
          return NextResponse.json({ error: 'primaryColor must be a string' }, { status: 400 })
        }
        settings.primaryColor = primaryColor
      }
      if (secondaryColor !== undefined) {
        if (typeof secondaryColor !== 'string') {
          return NextResponse.json({ error: 'secondaryColor must be a string' }, { status: 400 })
        }
        settings.secondaryColor = secondaryColor
      }
      if (name !== undefined) {
        if (typeof name !== 'string') {
          return NextResponse.json({ error: 'name must be a string' }, { status: 400 })
        }
        settings.name = name
      }
      // PR → PO Workflow Configuration
      if (enable_pr_po_workflow !== undefined) {
        if (typeof enable_pr_po_workflow !== 'boolean') {
          return NextResponse.json({ error: 'enable_pr_po_workflow must be a boolean' }, { status: 400 })
        }
        settings.enable_pr_po_workflow = enable_pr_po_workflow
      }
      if (enable_site_admin_pr_approval !== undefined) {
        if (typeof enable_site_admin_pr_approval !== 'boolean') {
          return NextResponse.json({ error: 'enable_site_admin_pr_approval must be a boolean' }, { status: 400 })
        }
        settings.enable_site_admin_pr_approval = enable_site_admin_pr_approval
      }
      if (require_company_admin_po_approval !== undefined) {
        if (typeof require_company_admin_po_approval !== 'boolean') {
          return NextResponse.json({ error: 'require_company_admin_po_approval must be a boolean' }, { status: 400 })
        }
        settings.require_company_admin_po_approval = require_company_admin_po_approval
      }
      if (allow_multi_pr_po !== undefined) {
        if (typeof allow_multi_pr_po !== 'boolean') {
          return NextResponse.json({ error: 'allow_multi_pr_po must be a boolean' }, { status: 400 })
        }
        settings.allow_multi_pr_po = allow_multi_pr_po
      }
      if (shipmentRequestMode !== undefined) {
        if (shipmentRequestMode !== 'MANUAL' && shipmentRequestMode !== 'AUTOMATIC') {
          return NextResponse.json({ error: 'shipmentRequestMode must be either MANUAL or AUTOMATIC' }, { status: 400 })
        }
        settings.shipmentRequestMode = shipmentRequestMode
      }
      const updated = await updateCompanySettings(companyId, settings)
      return NextResponse.json({ success: true, company: updated, message: 'Company settings updated successfully' })
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('API Error:', error)
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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

export async function POST(request: Request) {
  try {
    // Parse JSON body with error handling
    let body: any
    try {
      body = await request.json()
    } catch (jsonError: any) {
      return NextResponse.json({
        error: 'Invalid JSON in request body'
      }, { status: 400 })
    }
    
    const company = await createCompany(body)
    return NextResponse.json(company)
  } catch (error: any) {
    console.error('API Error:', error)
    // Return appropriate status code based on error type
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    const isConnectionError = errorMessage.includes('Mongo') || 
                              errorMessage.includes('connection') || 
                              errorMessage.includes('ECONNREFUSED') ||
                              errorMessage.includes('timeout') ||
                              errorMessage.includes('network') ||
                              error?.code === 'ECONNREFUSED' ||
                              error?.code === 'ETIMEDOUT' ||
                              error?.name === 'MongoNetworkError' ||
                              error?.name === 'MongoServerSelectionError'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
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

