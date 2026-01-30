/**
 * Client-side MongoDB Data Access Layer
 * This file provides the same interface as data.ts but uses MongoDB via API routes
 */

// Re-export types from data.ts
export type {
  Uniform,
  Vendor,
  Company,
  Employee,
  Order,
  ProductCompany,
  ProductVendor,
} from './data'

// Base API URL
const API_BASE = '/api'

// Helper function to fetch from API
async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const fullUrl = `${API_BASE}${endpoint}`
  // Reduce verbose logging - only log in development mode
  if (process.env.NODE_ENV === 'development') {
    console.log(`[fetchAPI] ========================================`)
    console.log(`[fetchAPI] 🌐 Making API request`)
    console.log(`[fetchAPI] URL: ${fullUrl}`)
    console.log(`[fetchAPI] Method: ${options?.method || 'GET'}`)
  }
  
  try {
    const startTime = Date.now()
    const response = await fetch(fullUrl, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    })

    const duration = Date.now() - startTime
    // Reduce verbose logging - only log in development mode
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAPI] ⏱️ Response received in ${duration}ms`)
      console.log(`[fetchAPI] Status: ${response.status} ${response.statusText}`)
      console.log(`[fetchAPI] OK: ${response.ok}`)
      console.log(`[fetchAPI] Content-Type: ${response.headers.get('content-type')}`)
    }

    // Handle 404 (null response) before checking response.ok
    if (response.status === 404) {
      // Suppress logging for 404s - they're expected and handled gracefully
      if (process.env.NODE_ENV === 'development') {
        console.log(`[fetchAPI] ⚠️ 404 Not Found - returning null`)
        console.log(`[fetchAPI] ========================================`)
      }
      return null as T
    }

    if (!response.ok) {
      // Suppress console errors for expected error statuses (404, 401, 403)
      // These are handled gracefully by calling code
      const isExpectedError = response.status === 404 || response.status === 401 || response.status === 403
      
      if (!isExpectedError) {
        console.error(`[fetchAPI] ❌ Response not OK`)
      }
      
      let errorText = ''
      let errorMessage = `API Error: ${response.status} ${response.statusText}`
      try {
        errorText = await response.text()
        if (!isExpectedError) {
          console.error(`[fetchAPI] Error response text:`, errorText)
        }
        if (errorText) {
          try {
            const errorJson = JSON.parse(errorText)
            errorMessage = errorJson.error || errorMessage
            if (!isExpectedError) {
              console.error(`[fetchAPI] Parsed error JSON:`, errorJson)
            }
          } catch {
            // If parsing fails, use the text as error message if it's not empty
            if (errorText.trim()) {
              errorMessage = errorText
            }
          }
        }
      } catch (textError) {
        // If reading response text fails, use the default error message
        if (!isExpectedError) {
          console.warn(`[fetchAPI] Failed to read error response text:`, textError)
        }
      }
      
      if (!isExpectedError) {
        console.error(`[fetchAPI] Throwing error: ${errorMessage}`)
      }
      if (process.env.NODE_ENV === 'development') {
        console.log(`[fetchAPI] ========================================`)
      }
      throw new Error(errorMessage)
    }

    // Handle empty responses
    const contentType = response.headers.get('content-type')
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAPI] Content-Type check: ${contentType}`)
    }
    if (!contentType || !contentType.includes('application/json')) {
      // If response is not JSON, return null for empty responses
      const text = await response.text()
      if (process.env.NODE_ENV === 'development') {
        console.log(`[fetchAPI] Non-JSON response, text length: ${text.length}`)
      }
      if (!text || text.trim() === '') {
        return null as T
      }
      // If there's text but not JSON, try to parse it or return as string
      try {
        return JSON.parse(text) as T
      } catch {
        return text as T
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAPI] Parsing JSON response...`)
    }
    const data = await response.json()
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAPI] ✅ JSON parsed successfully`)
      console.log(`[fetchAPI] Response data:`, data ? {
        type: typeof data,
        isArray: Array.isArray(data),
        keys: Object.keys(data || {}),
        hasId: !!(data as any)?.id,
        hasName: !!(data as any)?.name,
        id: (data as any)?.id,
        name: (data as any)?.name
      } : 'null')
    }
    
    // Ensure arrays are returned as arrays (not wrapped in objects)
    if (Array.isArray(data)) {
      if (process.env.NODE_ENV === 'development') {
        console.log(`[fetchAPI] Response is array, length: ${data.length}`)
        console.log(`[fetchAPI] ========================================`)
      }
      return data as T
    }
    // If data is an object with an array property, extract it
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      // Check common array property names
      if (data.employees && Array.isArray(data.employees)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchAPI] Extracted employees array, length: ${data.employees.length}`)
          console.log(`[fetchAPI] ========================================`)
        }
        return data.employees as T
      }
      if (data.data && Array.isArray(data.data)) {
        if (process.env.NODE_ENV === 'development') {
          console.log(`[fetchAPI] Extracted data array, length: ${data.data.length}`)
          console.log(`[fetchAPI] ========================================`)
        }
        return data.data as T
      }
    }
    if (process.env.NODE_ENV === 'development') {
      console.log(`[fetchAPI] Returning data as-is`)
      console.log(`[fetchAPI] ========================================`)
    }
    return data
  } catch (error: any) {
    // Don't log network errors as errors if they're expected (like 404)
    if (error?.message && !error.message.includes('404')) {
      console.error(`fetchAPI error for ${endpoint}:`, error)
    }
    throw error
  }
}

// ========== PRODUCT FUNCTIONS ==========

export async function getProductsByCompany(
  companyId: string, 
  designation?: string, 
  gender?: 'male' | 'female'
): Promise<any[]> {
  if (!companyId) return []
  try {
    let url = `/products?companyId=${companyId}`
    if (designation) {
      url += `&designation=${encodeURIComponent(designation)}`
    }
    if (gender) {
      url += `&gender=${gender}`
    }
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching products by company:', error)
    return []
  }
}

export async function getAllProductsByCompany(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    const url = `/products?companyId=${companyId}&all=true`
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching all products by company:', error)
    return []
  }
}

export async function getProductsByVendor(vendorId: string): Promise<any[]> {
  // 🔍 INSTRUMENTATION: Frontend boundary
  console.log('[FRONTEND] ========================================')
  console.log('[FRONTEND] getProductsByVendor called')
  console.log('[FRONTEND]   vendorId:', vendorId)
  console.log('[FRONTEND]   vendorId type:', typeof vendorId)
  console.log('[FRONTEND]   vendorId length:', vendorId?.length || 0)
  console.log('[FRONTEND] ========================================')
  
  if (!vendorId) {
    console.log('[FRONTEND] ❌ vendorId is empty, returning []')
    return []
  }
  
  try {
    const url = `/products?vendorId=${encodeURIComponent(vendorId)}`
    console.log('[FRONTEND] Making API request to:', url)
    
    const result = await fetchAPI<any[]>(url)
    
    console.log('[FRONTEND] API response received:', {
      isArray: Array.isArray(result),
      length: result?.length || 0,
      firstItem: result?.[0] || null,
      fullResponse: result,
      resultType: typeof result,
      resultConstructor: result?.constructor?.name
    })
    
    // Handle error responses
    if (result && typeof result === 'object' && 'error' in result) {
      console.error('[FRONTEND] API returned an error:', result.error)
      return []
    }
    
    // Ensure we return an array
    if (!Array.isArray(result)) {
      console.error('[FRONTEND] API response is not an array:', result)
      return []
    }
    
    return result
  } catch (error) {
    console.error('[FRONTEND] Error fetching products by vendor:', error)
    return []
  }
}

export async function createProduct(productData: {
  name: string
  category: 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory'
  gender: 'male' | 'female' | 'unisex'
  sizes: string[]
  price: number
  image: string
  sku: string
  vendorId?: string
  stock?: number
  // Optional SKU attributes
  attribute1_name?: string
  attribute1_value?: string | number
  attribute2_name?: string
  attribute2_value?: string | number
  attribute3_name?: string
  attribute3_value?: string | number
}): Promise<any> {
  try {
    return await fetchAPI<any>('/products', {
      method: 'POST',
      body: JSON.stringify(productData),
    })
  } catch (error) {
    console.error('Error creating product:', error)
    throw error
  }
}

export async function updateProduct(
  productId: string,
  updateData: {
    name?: string
    category?: 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory'
    gender?: 'male' | 'female' | 'unisex'
    sizes?: string[]
    price?: number
    image?: string
    sku?: string
    vendorId?: string
    stock?: number
  }
): Promise<any> {
  try {
    return await fetchAPI<any>(`/products?productId=${productId}`, {
      method: 'PUT',
      body: JSON.stringify(updateData),
    })
  } catch (error) {
    console.error('Error updating product:', error)
    throw error
  }
}

export async function deleteProduct(productId: string): Promise<void> {
  try {
    await fetchAPI<void>(`/products?productId=${productId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Error deleting product:', error)
    throw error
  }
}

export async function getAllProducts(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/products`)
  } catch (error) {
    console.error('Error fetching all products:', error)
    return []
  }
}

export async function getProductById(productId: string): Promise<any | null> {
  if (!productId) return null
  try {
    return await fetchAPI<any>(`/products?productId=${productId}`)
  } catch (error) {
    console.error('Error fetching product by ID:', error)
    return null
  }
}

// ========== VENDOR FUNCTIONS ==========

export async function getAllVendors(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/vendors`)
  } catch (error) {
    console.error('Error fetching vendors:', error)
    return []
  }
}

export async function getVendorById(vendorId: string): Promise<any | null> {
  if (!vendorId) return null
  try {
    return await fetchAPI<any>(`/vendors?vendorId=${vendorId}`)
  } catch (error) {
    console.error('Error fetching vendor by ID:', error)
    return null
  }
}

export async function getVendorByEmail(email: string): Promise<any | null> {
  if (!email) return null
  
  // CRITICAL: Sanitize email before making API call
  const sanitizedEmail = email.trim()
  console.log(`[getVendorByEmail] Looking up vendor with email: ${sanitizedEmail}`)
  
  try {
    const encodedEmail = encodeURIComponent(sanitizedEmail)
    console.log(`[getVendorByEmail] Encoded email for URL: ${encodedEmail}`)
    
    // Use roleCheck=true to return 200 with null instead of 404
    // This prevents browser console from logging 404 errors for role detection
    const vendor = await fetchAPI<any>(`/vendors?email=${encodedEmail}&roleCheck=true`)
    
    if (vendor) {
      console.log(`[getVendorByEmail] ✅ Vendor found: ${vendor.id} (${vendor.name})`)
    } else {
      console.log(`[getVendorByEmail] ⚠️ Vendor not found for email: ${sanitizedEmail}`)
    }
    
    return vendor
  } catch (error: any) {
    // CRITICAL: Don't mask database errors as "not found"
    console.error(`[getVendorByEmail] ❌ Error fetching vendor by email:`, error)
    
    // Check if it's a database connection error
    if (error.message && (
      error.message.includes('Database connection error') ||
      error.message.includes('DB_CONNECTION_ERROR') ||
      error.message.includes('Password contains unescaped characters') ||
      error.message.includes('MongoParseError')
    )) {
      // Re-throw database errors so UI can show proper message
      console.error(`[getVendorByEmail] ❌ Database connection error - re-throwing`)
      throw new Error('Database connection error. Please contact system administrator.')
    }
    
    // For 404 (not found), return null
    if (error.message && error.message.includes('not found')) {
      console.log(`[getVendorByEmail] Vendor not found (404)`)
      return null
    }
    
    // For other errors, re-throw so UI can handle appropriately
    console.error(`[getVendorByEmail] Re-throwing error: ${error.message}`)
    throw error
  }
}

export async function createVendor(vendorData: {
  name: string
  email: string
  phone: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor: string
  accentColor: string
  theme?: 'light' | 'dark' | 'custom'
  // Address fields
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
  // Compliance & Banking Details
  registration_number?: string
  gst_number: string
  bank_name?: string
  branch_address?: string
  ifsc_code?: string
  account_number?: string
}): Promise<any> {
  try {
    return await fetchAPI<any>('/vendors', {
      method: 'POST',
      body: JSON.stringify(vendorData),
    })
  } catch (error) {
    console.error('Error creating vendor:', error)
    throw error
  }
}

export async function updateVendor(vendorId: string, vendorData: {
  name?: string
  email?: string
  phone?: string
  logo?: string
  website?: string
  primaryColor?: string
  secondaryColor?: string
  accentColor?: string
  theme?: 'light' | 'dark' | 'custom'
  // Address fields
  address_line_1?: string
  address_line_2?: string
  address_line_3?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  // Compliance & Banking Details
  registration_number?: string
  gst_number?: string
  bank_name?: string
  branch_address?: string
  ifsc_code?: string
  account_number?: string
}): Promise<any> {
  try {
    return await fetchAPI<any>('/vendors', {
      method: 'PUT',
      body: JSON.stringify({ vendorId, ...vendorData }),
    })
  } catch (error) {
    console.error('Error updating vendor:', error)
    throw error
  }
}

// ========== VENDOR INVENTORY FUNCTIONS ==========

export async function getVendorInventory(vendorId: string, productId?: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    let url = `/vendor-inventory?vendorId=${vendorId}`
    if (productId) {
      url += `&productId=${productId}`
    }
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching vendor inventory:', error)
    return []
  }
}

export async function getVendorWiseInventoryForCompany(companyId: string): Promise<any[]> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    if (!userEmail) {
      throw new Error('User email not found')
    }
    return await fetchAPI<any[]>(`/company/inventory/vendor-wise?companyId=${companyId}&email=${encodeURIComponent(userEmail)}`)
  } catch (error) {
    console.error('Error fetching vendor-wise inventory:', error)
    return []
  }
}

export async function updateVendorInventory(
  vendorId: string,
  productId: string,
  sizeInventory: { [size: string]: number },
  lowInventoryThreshold?: { [size: string]: number }
): Promise<any> {
  if (!vendorId || !productId) {
    throw new Error('Vendor ID and Product ID are required')
  }
  try {
    return await fetchAPI<any>(`/vendor-inventory`, {
      method: 'PUT',
      body: JSON.stringify({
        vendorId,
        productId,
        sizeInventory,
        lowInventoryThreshold,
      }),
    })
  } catch (error) {
    console.error('Error updating vendor inventory:', error)
    throw error
  }
}

export async function getLowStockItems(vendorId: string): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/vendor-inventory?vendorId=${vendorId}&lowStock=true`)
  } catch (error) {
    console.error('Error fetching low stock items:', error)
    return []
  }
}

export async function getVendorInventorySummary(vendorId: string): Promise<{
  totalProducts: number
  totalStock: number
  lowStockCount: number
}> {
  try {
    return await fetchAPI<{ totalProducts: number; totalStock: number; lowStockCount: number }>(
      `/vendor-inventory?vendorId=${vendorId}&summary=true`
    )
  } catch (error) {
    console.error('Error fetching inventory summary:', error)
    return { totalProducts: 0, totalStock: 0, lowStockCount: 0 }
  }
}

// ========== COMPANY FUNCTIONS ==========

export async function getAllCompanies(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/companies`)
  } catch (error) {
    console.error('Error fetching companies:', error)
    return []
  }
}

export async function getCompanyById(companyId: string): Promise<any | null> {
  if (!companyId) return null
  try {
    return await fetchAPI<any>(`/companies?companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching company by ID:', error)
    return null
  }
}

export async function createCompany(companyData: {
  name: string
  logo: string
  website: string
  primaryColor: string
  secondaryColor?: string
  showPrices?: boolean
  allowPersonalPayments?: boolean
}): Promise<any> {
  try {
    return await fetchAPI<any>('/companies', {
      method: 'POST',
      body: JSON.stringify(companyData),
    })
  } catch (error) {
    console.error('Error creating company:', error)
    throw error
  }
}

export async function addCompanyAdmin(companyId: string, employeeId: string, canApproveOrders: boolean = false): Promise<void> {
  try {
    await fetchAPI<any>('/companies', {
      method: 'PATCH',
      body: JSON.stringify({ companyId, employeeId, action: 'addAdmin', canApproveOrders }),
    })
  } catch (error) {
    console.error('Error adding company admin:', error)
    throw error
  }
}

export async function setCompanyAdmin(companyId: string, employeeId: string): Promise<void> {
  // Legacy function - use addCompanyAdmin instead
  return addCompanyAdmin(companyId, employeeId, false)
}

export async function removeCompanyAdmin(companyId: string, employeeId: string): Promise<void> {
  try {
    await fetchAPI<any>('/companies', {
      method: 'PATCH',
      body: JSON.stringify({ companyId, employeeId, action: 'removeAdmin' }),
    })
  } catch (error) {
    console.error('Error removing company admin:', error)
    throw error
  }
}

export async function updateCompanyAdminPrivileges(companyId: string, employeeId: string, canApproveOrders: boolean): Promise<void> {
  try {
    await fetchAPI<any>('/companies', {
      method: 'PATCH',
      body: JSON.stringify({ companyId, employeeId, action: 'updatePrivileges', canApproveOrders }),
    })
  } catch (error) {
    console.error('Error updating company admin privileges:', error)
    throw error
  }
}

export async function updateCompanySettings(
  companyId: string,
  settings: { 
    showPrices?: boolean
    allowPersonalPayments?: boolean
    enableEmployeeOrder?: boolean
    allowLocationAdminViewFeedback?: boolean
    logo?: string
    primaryColor?: string
    secondaryColor?: string
    name?: string
    // PR → PO Workflow Configuration
    enable_pr_po_workflow?: boolean
    enable_site_admin_pr_approval?: boolean
    require_company_admin_po_approval?: boolean
    allow_multi_pr_po?: boolean
  }
): Promise<any> {
  try {
    const response = await fetchAPI<any>('/companies', {
      method: 'PATCH',
      body: JSON.stringify({ companyId, action: 'updateSettings', ...settings }),
    })
    
    // The API returns { success: true, company: {...}, message: '...' }
    // Return the company object directly, or the whole response if company is not present
    if (response && response.company) {
      console.log('[updateCompanySettings] Returning company from response:', response.company)
      return response.company
    }
    
    console.log('[updateCompanySettings] Returning full response:', response)
    return response
  } catch (error) {
    console.error('Error updating company settings:', error)
    throw error
  }
}

export async function getCompanyAdmins(companyId: string): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/companies?getAdmins=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching company admins:', error)
    return []
  }
}

export async function canApproveOrders(email: string, companyId: string): Promise<boolean> {
  try {
    const result = await fetchAPI<{ canApprove: boolean }>(
      `/companies?checkCanApprove=true&email=${encodeURIComponent(email)}&companyId=${companyId}`
    )
    return result?.canApprove || false
  } catch (error) {
    console.error('Error checking approval permission:', error)
    return false
  }
}

export async function isCompanyAdmin(email: string, companyId: string): Promise<boolean> {
  try {
    const result = await fetchAPI<{ isAdmin: boolean }>(
      `/companies?checkAdmin=true&email=${encodeURIComponent(email)}&companyId=${companyId}`
    )
    return result.isAdmin
  } catch (error) {
    console.error('Error checking company admin:', error)
    return false
  }
}

export async function getCompanyByAdminEmail(email: string): Promise<any | null> {
  console.log(`[data-mongodb] ========================================`)
  console.log(`[data-mongodb] 🔍 getCompanyByAdminEmail called (client-side)`)
  console.log(`[data-mongodb] Input email: "${email}"`)
  console.log(`[data-mongodb] Input type: ${typeof email}`)
  
  try {
    const url = `/companies?getByAdminEmail=true&email=${encodeURIComponent(email)}`
    console.log(`[data-mongodb] API URL: ${url}`)
    console.log(`[data-mongodb] Encoded email: "${encodeURIComponent(email)}"`)
    console.log(`[data-mongodb] Calling fetchAPI...`)
    
    const startTime = Date.now()
    const result = await fetchAPI<any>(url)
    const duration = Date.now() - startTime
    
    console.log(`[data-mongodb] ⏱️ fetchAPI completed in ${duration}ms`)
    console.log(`[data-mongodb] Result:`, result ? {
      id: result.id,
      name: result.name,
      type: typeof result,
      keys: Object.keys(result || {})
    } : 'null')
    
    if (result) {
      console.log(`[data-mongodb] ✅ Company found: ${result.id} (${result.name})`)
    } else {
      console.error(`[data-mongodb] ❌ No company returned (null)`)
    }
    console.log(`[data-mongodb] ========================================`)
    
    return result
  } catch (error: any) {
    console.error(`[data-mongodb] ❌ ERROR in fetchAPI`)
    console.error(`[data-mongodb] Error type: ${error?.constructor?.name || typeof error}`)
    console.error(`[data-mongodb] Error message: ${error?.message || 'Unknown error'}`)
    console.error(`[data-mongodb] Error stack:`, error?.stack)
    console.error(`[data-mongodb] Full error:`, error)
    console.log(`[data-mongodb] ========================================`)
    return null
  }
}

export async function isBranchAdmin(email: string, branchId: string): Promise<boolean> {
  try {
    const params = new URLSearchParams({ email, branchId })
    const response = await fetchAPI<{ isBranchAdmin: boolean }>(`/branches?checkAdmin=true&${params.toString()}`)
    return response?.isBranchAdmin || false
  } catch (error) {
    console.error('Error checking Branch Admin status:', error)
    return false
  }
}

export async function getBranchByAdminEmail(email: string): Promise<any | null> {
  try {
    const result = await fetchAPI<any>(`/branches?getByAdminEmail=true&email=${encodeURIComponent(email)}`)
    // 404 is expected when user is not a branch admin - return null silently
    return result
  } catch (error: any) {
    // Only log non-404 errors (404 means user is not a branch admin, which is fine)
    if (error?.message && !error.message.includes('404')) {
      console.error('Error fetching branch by admin email:', error)
    }
    return null
  }
}

export async function getLocationByAdminEmail(email: string): Promise<any | null> {
  try {
    const result = await fetchAPI<any>(`/locations?getByAdminEmail=true&email=${encodeURIComponent(email)}`)
    // 404 is expected when user is not a location admin - return null silently
    return result
  } catch (error: any) {
    // Only log non-404 errors (404 means user is not a location admin, which is fine)
    if (error?.message && !error.message.includes('404')) {
      console.error('Error fetching location by admin email:', error)
    }
    return null
  }
}

// ========== EMPLOYEE FUNCTIONS ==========

export async function getAllEmployees(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/employees`)
  } catch (error) {
    console.error('Error fetching employees:', error)
    return []
  }
}

export async function getEmployeeByEmail(email: string): Promise<any | null> {
  if (!email) return null
  try {
    // Pass userEmail as header so API can decrypt data for self-view
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    const userEmail = getUserEmail('consumer') || email // Use email as fallback for self-view
    
    const response = await fetchAPI<any>(`/employees?email=${encodeURIComponent(email)}`, {
      headers: {
        'X-User-Email': userEmail
      }
    })
    // Handle null response (404)
    if (response === null) {
      return null
    }
    return response
  } catch (error) {
    console.error('Error fetching employee by email:', error)
    return null
  }
}

export async function getEmployeeById(employeeId: string): Promise<any | null> {
  if (!employeeId) return null
  try {
    return await fetchAPI<any>(`/employees?employeeId=${employeeId}`)
  } catch (error) {
    console.error('Error fetching employee by ID:', error)
    return null
  }
}

export async function getEmployeesByCompany(companyId: string): Promise<any[]> {
  if (!companyId) {
    console.warn('[getEmployeesByCompany] No companyId provided')
    return []
  }
  try {
    // Get user email for role-based data processing (company admin should see decrypted data)
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    const userEmail = getUserEmail('company')
    
    const headers: Record<string, string> = {}
    if (userEmail) {
      headers['X-User-Email'] = userEmail
    }
    
    const employees = await fetchAPI<any[]>(`/employees?companyId=${companyId}`, {
      headers
    })
    console.log(`[getEmployeesByCompany] Fetched ${employees?.length || 0} employees for companyId: ${companyId}`)
    if (employees && employees.length > 0) {
      console.log(`[getEmployeesByCompany] First employee:`, {
        id: employees[0].id,
        employeeId: employees[0].employeeId,
        firstName: employees[0].firstName,
        lastName: employees[0].lastName
      })
    }
    return employees || []
  } catch (error) {
    console.error('Error fetching employees by company:', error)
    return []
  }
}

export async function createEmployee(employeeData: {
  employeeId?: string
  firstName: string
  lastName: string
  designation: string
  gender: 'male' | 'female'
  location: string
  email: string
  mobile: string
  shirtSize: string
  pantSize: string
  shoeSize: string
  address: string
  companyId: string
  companyName: string
  locationId?: string
  eligibility?: { shirt: number; pant: number; shoe: number; jacket: number }
  cycleDuration?: { shirt: number; pant: number; shoe: number; jacket: number }
  dispatchPreference?: 'direct' | 'central' | 'regional'
  status?: 'active' | 'inactive'
  period?: string
  dateOfJoining?: Date
}): Promise<any> {
  try {
    const employee = await fetchAPI<any>('/employees', {
      method: 'POST',
      body: JSON.stringify(employeeData),
    })
    return employee
  } catch (error: any) {
    console.error('Error creating employee:', error)
    throw error
  }
}

export async function updateEmployee(
  employeeId: string,
  updateData: {
    firstName?: string
    lastName?: string
    designation?: string
    gender?: 'male' | 'female'
    location?: string
    email?: string
    mobile?: string
    shirtSize?: string
    pantSize?: string
    shoeSize?: string
    address?: string // DEPRECATED: Use addressData instead
    addressData?: {
      address_line_1: string
      address_line_2?: string
      address_line_3?: string
      city: string
      state: string
      pincode: string
      country?: string
    }
    locationId?: string
    eligibility?: { shirt: number; pant: number; shoe: number; jacket: number }
    cycleDuration?: { shirt: number; pant: number; shoe: number; jacket: number }
    dispatchPreference?: 'direct' | 'central' | 'regional'
    status?: 'active' | 'inactive'
    period?: string
    dateOfJoining?: Date
  }
): Promise<any> {
  try {
    const employee = await fetchAPI<any>('/employees', {
      method: 'PUT',
      body: JSON.stringify({ employeeId, ...updateData }),
    })
    return employee
  } catch (error: any) {
    console.error('Error updating employee:', error)
    throw error
  }
}

export async function deleteEmployee(employeeId: string): Promise<boolean> {
  try {
    await fetchAPI<any>(`/employees?employeeId=${employeeId}`, {
      method: 'DELETE',
    })
    return true
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    throw error
  }
}

export async function getBranchesByCompany(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/branches?companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching branches by company:', error)
    return []
  }
}

/**
 * Get vendors associated with a company through their orders
 * Extracts unique vendors from company's order history
 */
export async function getVendorsByCompany(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    // Get orders for the company and extract unique vendors
    const orders = await fetchAPI<any[]>(`/orders?companyId=${companyId}`)
    const vendorMap = new Map<string, { id: string; name: string }>()
    orders?.forEach((order: any) => {
      if (order.vendorId && order.vendorName) {
        vendorMap.set(order.vendorId, { id: order.vendorId, name: order.vendorName })
      }
    })
    return Array.from(vendorMap.values())
  } catch (error) {
    console.error('Error fetching vendors by company:', error)
    return []
  }
}

export async function createBranch(branchData: {
  name: string
  companyId: string
  adminId?: string
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
  phone?: string
  email?: string
  status?: 'active' | 'inactive'
}): Promise<any> {
  try {
    return await fetchAPI<any>('/branches', {
      method: 'POST',
      body: JSON.stringify(branchData),
    })
  } catch (error) {
    console.error('Error creating branch:', error)
    throw error
  }
}

export async function updateBranch(
  branchId: string,
  updateData: {
    name?: string
    adminId?: string
    address_line_1?: string
    address_line_2?: string
    address_line_3?: string
    city?: string
    state?: string
    pincode?: string
    country?: string
    phone?: string
    email?: string // Branch's contact email
    status?: 'active' | 'inactive'
    adminEmail?: string // Logged-in user's email for authorization
  }
): Promise<any> {
  try {
    // Extract adminEmail (for authorization) and email (branch's contact email) separately
    const { adminEmail, email: branchEmail, ...data } = updateData
    // The API route expects 'adminEmail' for authorization and 'email' for branch contact email
    return await fetchAPI<any>('/branches', {
      method: 'PUT',
      body: JSON.stringify({ 
        branchId, 
        adminEmail: adminEmail, // Logged-in user's email for authorization
        ...data, // Rest of the update data (without adminEmail and email)
        ...(branchEmail && { email: branchEmail }) // Branch's contact email
      }),
    })
  } catch (error) {
    console.error('Error updating branch:', error)
    throw error
  }
}

export async function deleteBranch(branchId: string): Promise<boolean> {
  try {
    const result = await fetchAPI<{ success: boolean }>(`/branches?branchId=${branchId}`, {
      method: 'DELETE',
    })
    return result.success
  } catch (error) {
    console.error('Error deleting branch:', error)
    throw error
  }
}

// ========== ORDER FUNCTIONS ==========

export async function getAllOrders(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/orders`)
  } catch (error) {
    console.error('Error fetching orders:', error)
    return []
  }
}

export async function getOrdersByCompany(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/orders?companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching orders by company:', error)
    return []
  }
}

export async function getOrdersByVendor(vendorId: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    return await fetchAPI<any[]>(`/orders?vendorId=${vendorId}`)
  } catch (error) {
    console.error('Error fetching orders by vendor:', error)
    return []
  }
}

export async function getOrdersByEmployee(employeeId: string): Promise<any[]> {
  if (!employeeId) return []
  try {
    return await fetchAPI<any[]>(`/orders?employeeId=${employeeId}`)
  } catch (error) {
    console.error('Error fetching orders by employee:', error)
    return []
  }
}

export async function getOrdersByLocation(locationId: string): Promise<any[]> {
  if (!locationId) return []
  try {
    return await fetchAPI<any[]>(`/orders?locationId=${locationId}`)
  } catch (error) {
    console.error('Error fetching orders by location:', error)
    return []
  }
}

export async function getConsumedEligibility(employeeId: string): Promise<{
  shirt: number
  pant: number
  shoe: number
  jacket: number
}> {
  if (!employeeId) return { shirt: 0, pant: 0, shoe: 0, jacket: 0 }
  try {
    return await fetchAPI<{ shirt: number; pant: number; shoe: number; jacket: number }>(
      `/orders?employeeId=${employeeId}&consumedEligibility=true`
    )
  } catch (error) {
    console.error('Error fetching consumed eligibility:', error)
    return { shirt: 0, pant: 0, shoe: 0, jacket: 0 }
  }
}

export async function createOrder(orderData: {
  employeeId: string
  items: Array<{
    uniformId: string
    uniformName: string
    size: string
    quantity: number
    price: number
  }>
  deliveryAddress: string
  estimatedDeliveryTime: string
  dispatchLocation?: string
}): Promise<any> {
  try {
    const response = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    })

    if (!response.ok) {
      // CRITICAL FIX: Clone the response before reading to avoid "body stream already read" error
      const responseClone = response.clone()
      let errorMessage = `API Error: ${response.status} ${response.statusText}`
      let errorDetails: any = null
      
      try {
        // Try to parse as JSON first
        const errorData = await response.json()
        errorMessage = errorData.error || errorMessage
        errorDetails = errorData
        console.error('API Error Response:', errorData)
      } catch (parseError) {
        // If JSON parsing fails, try to get text from cloned response
        try {
          const errorText = await responseClone.text()
          if (errorText) {
            errorMessage = errorText
            console.error('API Error Response (text):', errorText)
          }
        } catch (textError) {
          console.error('Failed to parse error response:', textError)
        }
      }
      
      // Create error with details
      const error = new Error(errorMessage) as any
      if (errorDetails) {
        error.details = errorDetails
        error.validationErrors = errorDetails.validationErrors
        error.type = errorDetails.type
      }
      throw error
    }

    return await response.json()
  } catch (error: any) {
    console.error('Error creating order:', error)
    // Ensure we have a meaningful error message
    if (error.message) {
      throw error
    } else {
      throw new Error(error.toString() || 'Unknown error occurred while creating order')
    }
  }
}

export async function approveOrder(orderId: string, adminEmail: string, prNumber?: string, prDate?: Date): Promise<any> {
  try {
    return await fetchAPI<any>('/orders', {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'approve', 
        orderId, 
        adminEmail,
        prNumber,
        prDate: prDate ? prDate.toISOString() : undefined
      }),
    })
  } catch (error) {
    console.error('Error approving order:', error)
    throw error
  }
}

export async function bulkApproveOrders(orderIds: string[], adminEmail: string, prDataArray?: Array<{ orderId: string, prNumber: string, prDate: Date }>): Promise<{ success: string[], failed: Array<{ orderId: string, error: string }> }> {
  try {
    return await fetchAPI<{ success: string[], failed: Array<{ orderId: string, error: string }> }>('/orders', {
      method: 'POST',
      body: JSON.stringify({ 
        action: 'bulkApprove', 
        orderIds, 
        adminEmail,
        prDataArray: prDataArray?.map(pr => ({
          orderId: pr.orderId,
          prNumber: pr.prNumber,
          prDate: pr.prDate.toISOString()
        }))
      }),
    })
  } catch (error) {
    console.error('Error bulk approving orders:', error)
    throw error
  }
}

export async function updateOrderStatus(orderId: string, status: 'Awaiting approval' | 'Awaiting fulfilment' | 'Dispatched' | 'Delivered', vendorId?: string): Promise<any> {
  try {
    // CRITICAL SECURITY: Pass vendorId to backend for authorization validation
    const body: any = { action: 'updateStatus', orderId, status }
    if (vendorId) {
      body.vendorId = vendorId
      console.log(`[updateOrderStatus] Passing vendorId for authorization: ${vendorId}`)
    } else {
      console.warn(`[updateOrderStatus] ⚠️ No vendorId provided - authorization check will be skipped`)
    }
    
    return await fetchAPI<any>('/orders', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  } catch (error) {
    console.error('Error updating order status:', error)
    throw error
  }
}

export async function getPendingApprovals(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/orders?pendingApprovals=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching pending approvals:', error)
    return []
  }
}

export async function getPendingSiteAdminApprovalCount(companyId: string): Promise<{ count: number; message: string }> {
  if (!companyId) return { count: 0, message: '' }
  try {
    return await fetchAPI<{ count: number; message: string }>(`/orders?pendingSiteAdminApprovalCount=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching pending site admin approval count:', error)
    return { count: 0, message: '' }
  }
}

export async function getPendingApprovalsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  if (!adminEmail) return []
  try {
    let url = `/orders?pendingSiteAdminApprovals=true&adminEmail=${encodeURIComponent(adminEmail)}`
    if (fromDate) {
      url += `&fromDate=${fromDate.toISOString()}`
    }
    if (toDate) {
      url += `&toDate=${toDate.toISOString()}`
    }
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching pending site admin approvals:', error)
    return []
  }
}

export async function getApprovedPRsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  if (!adminEmail) return []
  try {
    let url = `/orders?approvedPRs=true&adminEmail=${encodeURIComponent(adminEmail)}`
    if (fromDate) {
      url += `&fromDate=${fromDate.toISOString()}`
    }
    if (toDate) {
      url += `&toDate=${toDate.toISOString()}`
    }
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching approved PRs for site admin:', error)
    return []
  }
}

/**
 * Get all PRs raised by Location Admin (historical view - all statuses)
 * @param adminEmail Location Admin email
 * @param fromDate Optional date filter - PRs created on or after this date
 * @param toDate Optional date filter - PRs created on or before this date
 * @returns Array of all PRs/orders with their current status
 */
export async function getAllPRsForSiteAdmin(
  adminEmail: string,
  fromDate?: Date,
  toDate?: Date
): Promise<any[]> {
  if (!adminEmail) return []
  try {
    let url = `/orders?allPRsForSiteAdmin=true&adminEmail=${encodeURIComponent(adminEmail)}`
    if (fromDate) {
      url += `&fromDate=${fromDate.toISOString()}`
    }
    if (toDate) {
      url += `&toDate=${toDate.toISOString()}`
    }
    return await fetchAPI<any[]>(url)
  } catch (error) {
    console.error('Error fetching all PRs for site admin:', error)
    return []
  }
}

export async function createPurchaseOrder(
  orderIds: string[],
  poNumber: string,
  poDate: Date,
  companyId: string,
  createdByUserId: string
): Promise<{ success: boolean, purchaseOrders: any[], message: string }> {
  try {
    return await fetchAPI<{ success: boolean, purchaseOrders: any[], message: string }>('/purchase-orders', {
      method: 'POST',
      body: JSON.stringify({
        orderIds,
        poNumber,
        poDate: poDate.toISOString(),
        companyId,
        createdByUserId
      }),
    })
  } catch (error) {
    console.error('Error creating purchase order:', error)
    throw error
  }
}

export async function getPurchaseOrders(companyId: string, vendorId?: string, poStatus?: string): Promise<any[]> {
  if (!companyId) return []
  try {
    const params = new URLSearchParams({ companyId })
    if (vendorId) params.append('vendorId', vendorId)
    if (poStatus) params.append('poStatus', poStatus)
    return await fetchAPI<any[]>(`/purchase-orders?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching purchase orders:', error)
    return []
  }
}

/**
 * Update PR shipment status (vendor marks items as SHIPPED)
 * @param prId PR (Order) ID
 * @param shipmentData Shipment details
 * @param vendorId Vendor ID
 */
export async function updatePRShipment(
  prId: string,
  shipmentData: {
    shipperName: string
    carrierName?: string
    modeOfTransport: 'ROAD' | 'AIR' | 'RAIL' | 'COURIER' | 'OTHER'
    trackingNumber?: string
    dispatchedDate: Date
    expectedDeliveryDate?: Date
    shipmentReferenceNumber?: string
    itemDispatchedQuantities: Array<{ itemIndex: number, dispatchedQuantity: number }>
  },
  vendorId: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/prs/shipment', {
      method: 'POST',
      body: JSON.stringify({
        prId,
        shipmentData,
        vendorId
      })
    })
  } catch (error: any) {
    console.error('Error updating PR shipment status:', error)
    throw error
  }
}

/**
 * Update PR delivery status (mark items as DELIVERED)
 * @param prId PR (Order) ID
 * @param deliveryData Delivery details
 * @param vendorId Vendor ID
 */
export async function updatePRDelivery(
  prId: string,
  deliveryData: {
    deliveredDate: Date
    receivedBy?: string
    deliveryRemarks?: string
    itemDeliveredQuantities: Array<{ itemIndex: number, deliveredQuantity: number }>
  },
  vendorId: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/prs/shipment', {
      method: 'PUT',
      body: JSON.stringify({
        prId,
        deliveryData,
        vendorId
      })
    })
  } catch (error: any) {
    console.error('Error updating PR delivery status:', error)
    throw error
  }
}

/**
 * Create GRN from PO
 * @param poNumber PO number
 * @param grnNumber GRN number
 * @param companyId Company ID
 * @param createdByUserId User ID
 */
export async function createGRN(
  poNumber: string,
  grnNumber: string,
  companyId: string,
  createdByUserId: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/grns', {
      method: 'POST',
      body: JSON.stringify({
        poNumber,
        grnNumber,
        companyId,
        createdByUserId
      })
    })
  } catch (error: any) {
    console.error('Error creating GRN:', error)
    throw error
  }
}

/**
 * Get GRNs for a company
 * @param companyId Company ID
 * @param vendorId Optional vendor ID filter
 * @param status Optional status filter
 */
export async function getGRNs(
  companyId: string,
  vendorId?: string,
  status?: 'CREATED' | 'RECEIVED' | 'CLOSED'
): Promise<any[]> {
  if (!companyId) return []
  try {
    const params = new URLSearchParams({ companyId })
    if (vendorId) params.append('vendorId', vendorId)
    if (status) params.append('status', status)
    return await fetchAPI<any[]>(`/grns?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching GRNs:', error)
    return []
  }
}

/**
 * Update GRN status
 * @param grnId GRN ID
 * @param status New status
 */
export async function updateGRNStatus(
  grnId: string,
  status: 'CREATED' | 'RECEIVED' | 'CLOSED'
): Promise<any> {
  try {
    return await fetchAPI<any>('/grns', {
      method: 'PUT',
      body: JSON.stringify({
        grnId,
        status
      })
    })
  } catch (error: any) {
    console.error('Error updating GRN status:', error)
    throw error
  }
}

// ============================================================================
// VENDOR-LED GRN WORKFLOW CLIENT FUNCTIONS
// ============================================================================

/**
 * Get POs eligible for GRN creation by vendor
 * @param vendorId Vendor ID
 */
export async function getPOsEligibleForGRN(vendorId: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    const params = new URLSearchParams({ vendorId, type: 'eligible' })
    return await fetchAPI<any[]>(`/vendor/grns?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching POs eligible for GRN:', error)
    return []
  }
}

/**
 * Get ALL orders eligible for GRN (both PR→PO and Manual orders)
 * POST-DELIVERY WORKFLOW EXTENSION: This unified function fetches both:
 * - PR→PO orders that are fully delivered
 * - Manual orders that are fully delivered (no PO involved)
 * @param vendorId Vendor ID
 */
export async function getAllOrdersEligibleForGRN(vendorId: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    const params = new URLSearchParams({ vendorId, type: 'all-eligible' })
    return await fetchAPI<any[]>(`/vendor/grns?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching all orders eligible for GRN:', error)
    return []
  }
}

/**
 * Get GRNs raised by vendor
 * @param vendorId Vendor ID
 */
export async function getGRNsByVendor(vendorId: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    const params = new URLSearchParams({ vendorId, type: 'my-grns' })
    return await fetchAPI<any[]>(`/vendor/grns?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching GRNs by vendor:', error)
    return []
  }
}

/**
 * Create GRN by vendor
 * @param poNumber PO number
 * @param grnNumber GRN number
 * @param grnDate GRN date
 * @param vendorId Vendor ID
 * @param remarks Optional remarks
 */
export async function createGRNByVendor(
  poNumber: string,
  grnNumber: string,
  grnDate: Date,
  vendorId: string,
  remarks?: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/vendor/grns', {
      method: 'POST',
      body: JSON.stringify({
        poNumber,
        grnNumber,
        grnDate,
        vendorId,
        remarks
      })
    })
  } catch (error: any) {
    console.error('Error creating GRN by vendor:', error)
    throw error
  }
}

/**
 * Create GRN for a Manual Order (no PO involved)
 * POST-DELIVERY WORKFLOW EXTENSION: Allows vendors to create GRN for orders
 * that went through direct/manual workflow instead of PR→PO workflow.
 * @param orderId Order ID (not PO number)
 * @param grnNumber GRN number
 * @param grnDate GRN date
 * @param vendorId Vendor ID
 * @param remarks Optional remarks
 */
export async function createGRNForManualOrder(
  orderId: string,
  grnNumber: string,
  grnDate: Date,
  vendorId: string,
  remarks?: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/vendor/grns', {
      method: 'POST',
      body: JSON.stringify({
        orderId,  // Use orderId instead of poNumber
        grnNumber,
        grnDate,
        vendorId,
        remarks,
        sourceType: 'MANUAL'  // Explicitly mark as manual order GRN
      })
    })
  } catch (error: any) {
    console.error('Error creating GRN for manual order:', error)
    throw error
  }
}

/**
 * Get GRNs pending acknowledgment by Company Admin
 * @param companyId Company ID (optional)
 */
export async function getGRNsRaisedByVendors(companyId?: string): Promise<any[]> {
  const url = companyId 
    ? `/grns?companyId=${encodeURIComponent(companyId)}&raisedByVendors=true`
    : `/grns?raisedByVendors=true`
  return fetchAPI<any[]>(url)
}

/**
 * Approve GRN by Company Admin (Simple Approval Workflow)
 * @param grnId GRN ID
 * @param approvedBy Company Admin identifier
 */
export async function approveGRN(grnId: string, approvedBy: string): Promise<any> {
  try {
    return await fetchAPI<any>('/grns/approve', {
      method: 'POST',
      body: JSON.stringify({
        grnId,
        approvedBy
      })
    })
  } catch (error: any) {
    console.error('Error approving GRN:', error)
    throw error
  }
}

export async function getGRNsPendingAcknowledgment(companyId?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams()
    if (companyId) params.append('companyId', companyId)
    return await fetchAPI<any[]>(`/company/grns/acknowledge?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching GRNs pending acknowledgment:', error)
    return []
  }
}

/**
 * Acknowledge GRN by Company Admin
 * @param grnId GRN ID
 * @param acknowledgedBy Company Admin ID/name
 */
export async function acknowledgeGRN(
  grnId: string,
  acknowledgedBy: string
): Promise<any> {
  try {
    return await fetchAPI<any>('/company/grns/acknowledge', {
      method: 'POST',
      body: JSON.stringify({
        grnId,
        acknowledgedBy
      })
    })
  } catch (error: any) {
    console.error('Error acknowledging GRN:', error)
    throw error
  }
}

/**
 * Create Invoice by vendor
 * @param grnId GRN ID
 * @param invoiceNumber System-generated invoice number (internal to UDS)
 * @param invoiceDate System-generated invoice date (internal to UDS)
 * @param vendorInvoiceNumber Vendor-provided invoice number (required)
 * @param vendorInvoiceDate Vendor-provided invoice date (required)
 * @param invoiceAmount Invoice amount
 * @param vendorId Vendor ID
 * @param remarks Optional invoice remarks
 * @param taxAmount Optional tax or additional charges
 */
export async function createInvoiceByVendor(
  grnId: string,
  invoiceNumber: string,
  invoiceDate: Date,
  vendorInvoiceNumber: string,
  vendorInvoiceDate: Date,
  invoiceAmount: number,
  vendorId: string,
  remarks?: string,
  taxAmount?: number
): Promise<any> {
  try {
    return await fetchAPI<any>('/vendor/invoices', {
      method: 'POST',
      body: JSON.stringify({
        grnId,
        invoiceNumber,
        invoiceDate,
        vendorInvoiceNumber,
        vendorInvoiceDate,
        invoiceAmount,
        vendorId,
        remarks,
        taxAmount
      })
    })
  } catch (error: any) {
    console.error('Error creating invoice by vendor:', error)
    throw error
  }
}

/**
 * Get Invoices for Company Admin
 * @param companyId Company ID (optional)
 */
export async function getInvoicesForCompany(companyId?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams()
    if (companyId) params.append('companyId', companyId)
    return await fetchAPI<any[]>(`/company/invoices?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching invoices for company:', error)
    return []
  }
}

/**
 * Approve Invoice by Company Admin
 * @param invoiceId Invoice ID
 * @param approvedBy Company Admin identifier
 */
export async function approveInvoice(invoiceId: string, approvedBy: string): Promise<any> {
  try {
    return await fetchAPI<any>('/company/invoices/approve', {
      method: 'POST',
      body: JSON.stringify({
        invoiceId,
        approvedBy
      })
    })
  } catch (error: any) {
    console.error('Error approving invoice:', error)
    throw error
  }
}

/**
 * Get Invoices by vendor
 * @param vendorId Vendor ID
 */
export async function getInvoicesByVendor(vendorId: string): Promise<any[]> {
  if (!vendorId) return []
  try {
    const params = new URLSearchParams({ vendorId })
    return await fetchAPI<any[]>(`/vendor/invoices?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching invoices by vendor:', error)
    return []
  }
}

/**
 * Update existing PR and PO statuses based on underlying order delivery status
 * This is a maintenance/migration function
 * @param companyId Optional company ID to limit update scope
 */
export async function updatePRAndPOStatusesFromDelivery(companyId?: string): Promise<{
  prsUpdated: number
  posUpdated: number
  errors: string[]
}> {
  try {
    const params = new URLSearchParams()
    if (companyId) params.append('companyId', companyId)
    return await fetchAPI<{ prsUpdated: number, posUpdated: number, errors: string[] }>(
      `/admin/update-pr-po-statuses?${params.toString()}`,
      { method: 'POST' }
    )
  } catch (error: any) {
    console.error('Error updating PR and PO statuses:', error)
    throw error
  }
}

export async function getApprovedOrdersForCompanyAdmin(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/orders?approvedCompanyAdmin=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching approved orders for company admin:', error)
    return []
  }
}

export async function getPOCreatedOrdersForCompanyAdmin(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/orders?poCreatedCompanyAdmin=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching PO created orders for company admin:', error)
    return []
  }
}

export async function getRejectedOrdersForCompanyAdmin(companyId: string): Promise<any[]> {
  if (!companyId) return []
  try {
    return await fetchAPI<any[]>(`/orders?rejectedCompanyAdmin=true&companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching rejected orders for company admin:', error)
    return []
  }
}

export async function getPendingApprovalCount(companyId: string): Promise<number> {
  if (!companyId) return 0
  try {
    const result = await fetchAPI<{ count: number }>(`/orders?pendingApprovalCount=true&companyId=${companyId}`)
    return result.count || 0
  } catch (error) {
    console.error('Error fetching pending approval count:', error)
    return 0
  }
}

export async function getPendingReturnRequestCount(companyId: string): Promise<number> {
  if (!companyId) return 0
  try {
    const result = await fetchAPI<{ pendingReturnRequests?: number }>(`/approvals/counts?companyId=${companyId}&role=company`)
    return result.pendingReturnRequests || 0
  } catch (error) {
    console.error('Error fetching pending return request count:', error)
    return 0
  }
}

export async function getNewFeedbackCount(companyId: string): Promise<number> {
  if (!companyId) return 0
  try {
    const result = await fetchAPI<{ newFeedbackCount?: number }>(`/approvals/counts?companyId=${companyId}&role=company`)
    return result.newFeedbackCount || 0
  } catch (error) {
    console.error('Error fetching new feedback count:', error)
    return 0
  }
}

// ========== RELATIONSHIP FUNCTIONS ==========

export async function getProductCompanies(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/relationships?type=productCompany`)
  } catch (error) {
    console.error('Error fetching product-company relationships:', error)
    return []
  }
}

export async function getProductVendors(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/relationships?type=productVendor`)
  } catch (error) {
    console.error('Error fetching product-vendor relationships:', error)
    return []
  }
}

export async function getVendorCompanies(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/relationships?type=vendorCompany`)
  } catch (error) {
    console.error('Error fetching vendor-company relationships:', error)
    return []
  }
}

/**
 * Get all companies that a specific vendor supplies products to.
 * Derives this from ProductVendor + ProductCompany relationships.
 */
export async function getCompaniesByVendor(vendorId: string): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/vendors/${vendorId}/companies`)
  } catch (error) {
    console.error('Error fetching companies for vendor:', error)
    return []
  }
}

/**
 * Get products for a vendor filtered by a specific company.
 */
export async function getProductsByVendorAndCompany(vendorId: string, companyId: string): Promise<any[]> {
  try {
    return await fetchAPI<any[]>(`/vendors/${vendorId}/products?companyId=${companyId}`)
  } catch (error) {
    console.error('Error fetching products for vendor and company:', error)
    return []
  }
}

// ========== CREATE/UPDATE RELATIONSHIP FUNCTIONS ==========

export async function createProductCompany(productId: string, companyId: string): Promise<void> {
  try {
    await fetchAPI(`/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'productCompany',
        productId,
        companyId,
      }),
    })
  } catch (error) {
    console.error('Error creating product-company relationship:', error)
    throw error
  }
}

export async function createProductCompanyBatch(productIds: string[], companyId: string): Promise<{ success: string[], failed: Array<{ productId: string, error: string }> }> {
  try {
    const response = await fetchAPI<{ success: boolean, result: { success: string[], failed: Array<{ productId: string, error: string }> } }>(`/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'productCompany',
        productIds,
        companyId,
      }),
    })
    return response.result
  } catch (error) {
    console.error('Error creating product-company relationships:', error)
    throw error
  }
}

export async function deleteProductCompany(productId: string, companyId: string): Promise<void> {
  try {
    await fetchAPI(`/relationships?type=productCompany&productId=${productId}&companyId=${companyId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Error deleting product-company relationship:', error)
    throw error
  }
}

export async function createProductVendor(productId: string, vendorId: string): Promise<void> {
  try {
    await fetchAPI(`/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'productVendor',
        productId,
        vendorId,
      }),
    })
  } catch (error) {
    console.error('Error creating product-vendor relationship:', error)
    throw error
  }
}

export async function createProductVendorBatch(productIds: string[], vendorId: string): Promise<{ success: string[], failed: Array<{ productId: string, error: string }> }> {
  try {
    const response = await fetchAPI<{ success: boolean, result: { success: string[], failed: Array<{ productId: string, error: string }> } }>(`/relationships`, {
      method: 'POST',
      body: JSON.stringify({
        type: 'productVendor',
        productIds,
        vendorId,
      }),
    })
    return response.result
  } catch (error) {
    console.error('Error creating product-vendor relationships:', error)
    throw error
  }
}

export async function deleteProductVendor(productId: string, vendorId: string): Promise<void> {
  try {
    await fetchAPI(`/relationships?type=productVendor&productId=${productId}&vendorId=${vendorId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Error deleting product-vendor relationship:', error)
    throw error
  }
}

// Vendor-company relationships are now automatically derived from ProductCompany + ProductVendor
// No explicit create/delete functions needed - relationships are derived dynamically

// ========== DESIGNATION PRODUCT ELIGIBILITY FUNCTIONS ==========

export async function getDesignationEligibilitiesByCompany(companyId: string): Promise<any[]> {
  try {
    const data = await fetchAPI<any[]>(`/designation-eligibility?companyId=${companyId}`)
    return data || []
  } catch (error) {
    console.error('Error fetching designation eligibilities by company:', error)
    return []
  }
}

export async function getDesignationEligibilityById(eligibilityId: string): Promise<any | null> {
  try {
    const data = await fetchAPI<any>(`/designation-eligibility?eligibilityId=${eligibilityId}`)
    return data
  } catch (error) {
    console.error('Error fetching designation eligibility by ID:', error)
    return null
  }
}

export async function getDesignationEligibilityByDesignation(companyId: string, designation: string): Promise<any | null> {
  try {
    const data = await fetchAPI<any>(`/designation-eligibility?companyId=${companyId}&designation=${encodeURIComponent(designation)}`)
    return data
  } catch (error) {
    console.error('Error fetching designation eligibility by designation:', error)
    return null
  }
}

export async function createDesignationEligibility(
  companyId: string,
  designation: string,
  allowedProductCategories: string[],
  itemEligibility?: {
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
  },
  gender?: 'male' | 'female' | 'unisex'
): Promise<any> {
  try {
    const data = await fetchAPI<any>(`/designation-eligibility`, {
      method: 'POST',
      body: JSON.stringify({
        companyId,
        designation,
        allowedProductCategories,
        itemEligibility,
        gender: gender || 'all',
      }),
    })
    return data
  } catch (error) {
    console.error('Error creating designation eligibility:', error)
    throw error
  }
}

export async function updateDesignationEligibility(
  eligibilityId: string,
  designation?: string,
  allowedProductCategories?: string[],
  itemEligibility?: {
    shirt?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    trouser?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    pant?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    shoe?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    blazer?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
    jacket?: { quantity: number; renewalFrequency: number; renewalUnit: 'months' | 'years' }
  },
  gender?: 'male' | 'female' | 'unisex',
  status?: 'active' | 'inactive',
  refreshEligibility?: boolean
): Promise<any> {
  try {
    const body: any = { eligibilityId }
    if (designation !== undefined) body.designation = designation
    if (allowedProductCategories !== undefined) body.allowedProductCategories = allowedProductCategories
    if (itemEligibility !== undefined) body.itemEligibility = itemEligibility
    if (gender !== undefined) body.gender = gender
    if (status !== undefined) body.status = status
    if (refreshEligibility !== undefined) body.refreshEligibility = refreshEligibility
    
    const data = await fetchAPI<any>(`/designation-eligibility`, {
      method: 'PUT',
      body: JSON.stringify(body),
    })
    return data
  } catch (error) {
    console.error('Error updating designation eligibility:', error)
    throw error
  }
}

export async function deleteDesignationEligibility(eligibilityId: string): Promise<void> {
  try {
    await fetchAPI<void>(`/designation-eligibility?eligibilityId=${eligibilityId}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Error deleting designation eligibility:', error)
    throw error
  }
}

export async function getProductsForDesignation(companyId: string, designation: string, gender?: 'male' | 'female'): Promise<any[]> {
  try {
    let url = `/products?companyId=${companyId}&designation=${encodeURIComponent(designation)}`
    if (gender) {
      url += `&gender=${gender}`
    }
    const data = await fetchAPI<any[]>(url)
    console.log(`[getProductsForDesignation] API call: companyId=${companyId}, designation="${designation}", gender="${gender || 'unisex'}" -> ${data?.length || 0} products`)
    return data || []
  } catch (error) {
    console.error('Error fetching products for designation:', error)
    return []
  }
}

export async function getUniqueDesignationsByCompany(companyId: string): Promise<string[]> {
  try {
    const data = await fetchAPI<string[]>(`/designations?companyId=${companyId}`)
    return data || []
  } catch (error) {
    console.error('Error fetching unique designations by company:', error)
    return []
  }
}

export async function getUniqueShirtSizesByCompany(companyId: string): Promise<string[]> {
  try {
    const data = await fetchAPI<string[]>(`/designations?companyId=${companyId}&type=shirtSize`)
    return data || []
  } catch (error) {
    console.error('Error fetching unique shirt sizes by company:', error)
    return []
  }
}

export async function getUniquePantSizesByCompany(companyId: string): Promise<string[]> {
  try {
    const data = await fetchAPI<string[]>(`/designations?companyId=${companyId}&type=pantSize`)
    return data || []
  } catch (error) {
    console.error('Error fetching unique pant sizes by company:', error)
    return []
  }
}

export async function getUniqueShoeSizesByCompany(companyId: string): Promise<string[]> {
  try {
    const data = await fetchAPI<string[]>(`/designations?companyId=${companyId}&type=shoeSize`)
    return data || []
  } catch (error) {
    console.error('Error fetching unique shoe sizes by company:', error)
    return []
  }
}

// For backward compatibility, export mock data arrays as empty (they'll be loaded from MongoDB)
export const mockUniforms: any[] = []
export const mockVendors: any[] = []
export const mockCompanies: any[] = []
export const mockEmployees: any[] = []
// ========== LOCATION FUNCTIONS ==========

export async function getAllLocations(): Promise<any[]> {
  try {
    return await fetchAPI<any[]>('/locations')
  } catch (error) {
    console.error('Error fetching locations:', error)
    throw error
  }
}

export async function getLocationsByCompany(companyId: string, email?: string): Promise<any[]> {
  try {
    const params = new URLSearchParams({ companyId })
    if (email) params.append('email', email)
    return await fetchAPI<any[]>(`/locations?${params.toString()}`)
  } catch (error) {
    console.error('Error fetching locations by company:', error)
    throw error
  }
}

export async function getLocationById(locationId: string): Promise<any | null> {
  try {
    return await fetchAPI<any>(`/locations?locationId=${locationId}`)
  } catch (error) {
    console.error('Error fetching location:', error)
    throw error
  }
}

export async function createLocation(locationData: {
  name: string
  companyId: string
  adminId?: string // Optional
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
  phone?: string
  email?: string
  status?: 'active' | 'inactive'
  adminEmail?: string // For authorization
}): Promise<any> {
  try {
    const { adminEmail, ...data } = locationData
    return await fetchAPI<any>('/locations', {
      method: 'POST',
      body: JSON.stringify({ ...data, email: adminEmail, adminEmail }),
    })
  } catch (error) {
    console.error('Error creating location:', error)
    throw error
  }
}

export async function updateLocation(
  locationId: string,
  updateData: {
    name?: string
    adminId?: string
    address_line_1?: string
    address_line_2?: string
    address_line_3?: string
    city?: string
    state?: string
    pincode?: string
    country?: string
    phone?: string
    email?: string // Location's contact email
    status?: 'active' | 'inactive'
    companyId?: string
    adminEmail?: string // Logged-in user's email for authorization
  }
): Promise<any> {
  try {
    // Extract adminEmail (for authorization) and email (location's contact email) separately
    const { adminEmail, email: locationEmail, ...data } = updateData
    // The API route expects 'adminEmail' for authorization and 'email' for location contact email
    return await fetchAPI<any>('/locations', {
      method: 'PATCH',
      body: JSON.stringify({ 
        locationId, 
        adminEmail: adminEmail, // Logged-in user's email for authorization
        ...data, // Rest of the update data (without adminEmail and email)
        ...(locationEmail && { email: locationEmail }) // Location's contact email
      }),
    })
  } catch (error) {
    console.error('Error updating location:', error)
    throw error
  }
}

export async function deleteLocation(locationId: string, adminEmail: string, companyId: string): Promise<void> {
  try {
    const params = new URLSearchParams({ locationId, adminEmail, companyId })
    await fetchAPI(`/locations?${params.toString()}`, {
      method: 'DELETE',
    })
  } catch (error) {
    console.error('Error deleting location:', error)
    throw error
  }
}

export async function assignLocationAdmin(
  locationId: string,
  adminId: string | null,
  adminEmail: string,
  companyId: string
): Promise<any> {
  try {
    // Ensure all required fields are present
    if (!locationId || !adminEmail || !companyId) {
      throw new Error(`Missing required fields: locationId=${!!locationId}, adminEmail=${!!adminEmail}, companyId=${!!companyId}`)
    }
    
    const payload = { 
      locationId, 
      adminId: adminId || null, // Explicitly set to null if not provided
      adminEmail, 
      companyId 
    }
    
    console.log('Calling assignLocationAdmin API:', { locationId, adminId, adminEmail, companyId })
    
    return await fetchAPI<any>('/locations/admin', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (error) {
    console.error('Error assigning Location Admin:', error)
    throw error
  }
}

export async function getEligibleEmployeesForLocationAdmin(
  companyId: string, 
  adminEmail: string, 
  locationId?: string
): Promise<any[]> {
  try {
    const params = new URLSearchParams({ companyId, adminEmail })
    if (locationId) {
      params.append('locationId', locationId)
    }
    const response = await fetchAPI<any>(`/locations/admin?${params.toString()}`)
    
    console.log('[getEligibleEmployeesForLocationAdmin] Raw response type:', typeof response, 'Is array?', Array.isArray(response))
    
    // Handle both cases: fetchAPI might return the array directly or an object with employees
    if (Array.isArray(response)) {
      console.log('[getEligibleEmployeesForLocationAdmin] Response is array, returning', response.length, 'employees')
      return response
    }
    if (response && typeof response === 'object' && response.employees) {
      const employees = Array.isArray(response.employees) ? response.employees : []
      console.log('[getEligibleEmployeesForLocationAdmin] Response has employees property, returning', employees.length, 'employees')
      return employees
    }
    
    console.warn('[getEligibleEmployeesForLocationAdmin] Unexpected response format:', response)
    return []
  } catch (error) {
    console.error('Error fetching eligible employees:', error)
    throw error
  }
}

export const mockOrders: any[] = []
export const mockProductCompanies: any[] = []
export const mockProductVendors: any[] = []
export const mockVendorCompanies: any[] = []

// ========== PRODUCT FEEDBACK FUNCTIONS ==========

export async function createProductFeedback(feedbackData: {
  orderId: string
  productId: string
  employeeId: string
  companyId: string
  vendorId?: string
  rating: number
  comment?: string
}): Promise<any> {
  try {
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    // Note: These functions can be called from consumer or company context
    // We'll try consumer first (most common), then company
    const { getUserEmail } = typeof window !== 'undefined' ? await import('@/lib/utils/auth-storage') : { getUserEmail: () => null }
    const userEmail = getUserEmail('consumer') || getUserEmail('company') || null
    if (!userEmail) {
      throw new Error('User email not found')
    }
    
    const response = await fetchAPI<any>('/feedback', {
      method: 'POST',
      body: JSON.stringify({
        ...feedbackData,
        userEmail,
      }),
    })
    
    if (response && response.feedback) {
      return response.feedback
    }
    return response
  } catch (error) {
    console.error('Error creating product feedback:', error)
    throw error
  }
}

export async function getProductFeedback(filters?: {
  orderId?: string
  productId?: string
  employeeId?: string
  companyId?: string
  vendorId?: string
}): Promise<any[]> {
  try {
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    // Note: These functions can be called from consumer, company, or vendor context
    // We'll try consumer first (most common), then company, then vendor
    const { getUserEmail } = typeof window !== 'undefined' ? await import('@/lib/utils/auth-storage') : { getUserEmail: () => null }
    const userEmail = getUserEmail('consumer') || getUserEmail('company') || getUserEmail('vendor') || null
    if (!userEmail) {
      throw new Error('User email not found')
    }
    
    const params = new URLSearchParams({ userEmail })
    if (filters?.orderId) {
      params.append('orderId', filters.orderId)
    }
    if (filters?.productId) {
      params.append('productId', filters.productId)
    }
    if (filters?.employeeId) {
      params.append('employeeId', filters.employeeId)
    }
    if (filters?.companyId) {
      params.append('companyId', filters.companyId)
    }
    if (filters?.vendorId) {
      params.append('vendorId', filters.vendorId)
    }
    
    const response = await fetchAPI<any>(`/feedback?${params.toString()}`)
    
    if (response && response.feedback) {
      return Array.isArray(response.feedback) ? response.feedback : []
    }
    return Array.isArray(response) ? response : []
  } catch (error) {
    console.error('Error fetching product feedback:', error)
    throw error
  }
}

// ========== SUBCATEGORY FUNCTIONS ==========

export async function getSubcategoriesByCompany(companyId: string, categoryId?: string): Promise<any[]> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    // Build URL without /api prefix since fetchAPI adds it, or use direct fetch
    let url = categoryId 
      ? `/subcategories?companyId=${companyId}&categoryId=${categoryId}`
      : `/subcategories?companyId=${companyId}`
    // Always fetch active subcategories for designation eligibility
    url += '&status=active'
    if (userEmail) url += `&userEmail=${encodeURIComponent(userEmail)}`
    
    console.log('[getSubcategoriesByCompany] Fetching subcategories:', { url, companyId, categoryId, userEmail })
    
    try {
      // Make direct fetch to get full response details
      const fullUrl = `${API_BASE}${url}`
      console.log('[getSubcategoriesByCompany] Full URL:', fullUrl)
      const response = await fetch(fullUrl, {
        headers: {
          'Content-Type': 'application/json',
          ...(userEmail ? { 'X-User-Email': userEmail } : {})
        }
      })
      
      console.log('[getSubcategoriesByCompany] HTTP Response:', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        url: fullUrl
      })
      
      const responseText = await response.text()
      console.log('[getSubcategoriesByCompany] Raw response text:', responseText)
      
      let result: any
      try {
        result = JSON.parse(responseText)
      } catch (parseError) {
        console.error('[getSubcategoriesByCompany] ❌ Failed to parse JSON response:', parseError)
        console.error('[getSubcategoriesByCompany] Response text:', responseText)
        return []
      }
      
      console.log('[getSubcategoriesByCompany] Parsed API response:', result)
      
      if (!response.ok) {
        console.error('[getSubcategoriesByCompany] ❌ HTTP Error:', {
          status: response.status,
          error: result.error || 'Unknown error'
        })
        alert(`Error fetching subcategories: ${result.error || 'Unknown error'} (Status: ${response.status})`)
        return []
      }
      
      if (!result) {
        console.error('[getSubcategoriesByCompany] ❌ API returned null/undefined')
        return []
      }
      
      if (result.error) {
        console.error('[getSubcategoriesByCompany] ❌ API returned error:', result.error)
        alert(`Error: ${result.error}`)
        return []
      }
      
      if (!result.success) {
        console.warn('[getSubcategoriesByCompany] ⚠️ API returned success=false')
        return []
      }
      
      console.log('[getSubcategoriesByCompany] ✅ API response:', {
        success: result.success,
        count: result.subcategories?.length || 0,
        subcategories: result.subcategories?.map((s: any) => ({
          id: s.id,
          name: s.name,
          status: s.status,
          hasParentCategory: !!s.parentCategory,
          parentCategory: s.parentCategory,
          parentCategoryId: s.parentCategoryId,
        })) || []
      })
      
      if (result.subcategories && result.subcategories.length === 0) {
        console.warn('[getSubcategoriesByCompany] ⚠️ No subcategories returned. Possible reasons:')
        console.warn('  1. No subcategories exist for this company')
        console.warn('  2. All subcategories are inactive (status filter)')
        console.warn('  3. Company ID mismatch')
        console.warn('  4. Authentication issue')
      }
      
      return result.subcategories || []
    } catch (error: any) {
      console.error('[getSubcategoriesByCompany] ❌ Exception during API call:', error)
      console.error('[getSubcategoriesByCompany] Error details:', {
        message: error.message,
        stack: error.stack,
      })
      alert(`Error fetching subcategories: ${error.message || 'Unknown error'}`)
      return []
    }
  } catch (error) {
    console.error('[getSubcategoriesByCompany] Error fetching subcategories:', error)
    return []
  }
}

export async function getProductSubcategoryMappings(productId: string, companyId: string): Promise<any[]> {
  try {
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/product-subcategory-mappings' not '/api/product-subcategory-mappings'
    const result = await fetchAPI<{ success: boolean; mappings: any[] }>(
      `/product-subcategory-mappings?productId=${productId}&companyId=${companyId}`
    )
    return result?.mappings || []
  } catch (error: any) {
    // Suppress console errors for expected errors (404, 401, 403) - these are handled gracefully
    const isExpectedError = error?.message?.includes('404') || 
                           error?.message?.includes('401') || 
                           error?.message?.includes('403') ||
                           error?.message?.includes('Unauthorized') ||
                           error?.message?.includes('Forbidden') ||
                           error?.message?.includes('not found')
    
    if (!isExpectedError) {
      console.error('Error fetching product-subcategory mappings:', error)
    }
    return []
  }
}

export async function createProductSubcategoryMapping(
  productId: string,
  subCategoryId: string,
  companyId: string,
  companySpecificPrice?: number
): Promise<any> {
  try {
    // Get user email for authentication
    const userEmail = typeof window !== 'undefined' 
      ? ((await import('@/lib/utils/auth-storage')).getUserEmail('company') || '')
      : ''
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/product-subcategory-mappings' not '/api/product-subcategory-mappings'
    const result = await fetchAPI<{ success: boolean; mapping: any }>(
      '/product-subcategory-mappings',
      {
        method: 'POST',
        headers: {
          'X-User-Email': userEmail
        },
        body: JSON.stringify({
          productId,
          subCategoryId,
          companyId,
          companySpecificPrice
        })
      }
    )
    return result?.mapping
  } catch (error) {
    console.error('Error creating product-subcategory mapping:', error)
    throw error
  }
}

export async function deleteProductSubcategoryMapping(mappingId: string): Promise<void> {
  try {
    // Get user email for authentication
    const userEmail = typeof window !== 'undefined' 
      ? ((await import('@/lib/utils/auth-storage')).getUserEmail('company') || '')
      : ''
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/product-subcategory-mappings' not '/api/product-subcategory-mappings'
    await fetchAPI(`/product-subcategory-mappings?mappingId=${mappingId}`, {
      method: 'DELETE',
      headers: {
        'X-User-Email': userEmail
      }
    })
  } catch (error) {
    console.error('Error deleting product-subcategory mapping:', error)
    throw error
  }
}

// ========== DESIGNATION SUBCATEGORY ELIGIBILITY FUNCTIONS ==========

export async function getDesignationSubcategoryEligibilities(
  companyId: string,
  designationId?: string,
  subCategoryId?: string
): Promise<any[]> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/designation-subcategory-eligibilities' not '/api/designation-subcategory-eligibilities'
    let url = `/designation-subcategory-eligibilities?companyId=${companyId}`
    if (designationId) url += `&designationId=${encodeURIComponent(designationId)}`
    if (subCategoryId) url += `&subCategoryId=${subCategoryId}`
    if (userEmail) url += `&userEmail=${encodeURIComponent(userEmail)}`
    
    const result = await fetchAPI<{ success: boolean; eligibilities: any[] }>(url, {
      headers: userEmail ? { 'X-User-Email': userEmail } : undefined
    })
    return result?.eligibilities || []
  } catch (error) {
    console.error('Error fetching designation-subcategory eligibilities:', error)
    return []
  }
}

export async function createDesignationSubcategoryEligibility(
  companyId: string,
  designationId: string,
  subCategoryId: string,
  quantity: number,
  renewalFrequency: number,
  renewalUnit: 'months' | 'years' = 'months',
  gender: 'male' | 'female' | 'unisex' = 'unisex'
): Promise<any> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/designation-subcategory-eligibilities' not '/api/designation-subcategory-eligibilities'
    const result = await fetchAPI<{ success: boolean; eligibility: any }>(
      '/designation-subcategory-eligibilities',
      {
        method: 'POST',
        headers: userEmail ? { 'X-User-Email': userEmail } : undefined,
        body: JSON.stringify({
          companyId,
          designationId,
          subCategoryId,
          quantity,
          renewalFrequency,
          renewalUnit,
          gender,
          userEmail
        })
      }
    )
    return result?.eligibility
  } catch (error) {
    console.error('Error creating designation-subcategory eligibility:', error)
    throw error
  }
}

export async function updateDesignationSubcategoryEligibility(
  eligibilityId: string,
  quantity?: number,
  renewalFrequency?: number,
  renewalUnit?: 'months' | 'years',
  status?: 'active' | 'inactive'
): Promise<any> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/designation-subcategory-eligibilities' not '/api/designation-subcategory-eligibilities'
    const result = await fetchAPI<{ success: boolean; eligibility: any }>(
      '/designation-subcategory-eligibilities',
      {
        method: 'PUT',
        headers: userEmail ? { 'X-User-Email': userEmail } : undefined,
        body: JSON.stringify({
          eligibilityId,
          quantity,
          renewalFrequency,
          renewalUnit,
          status,
          userEmail
        })
      }
    )
    return result?.eligibility
  } catch (error) {
    console.error('Error updating designation-subcategory eligibility:', error)
    throw error
  }
}

export async function deleteDesignationSubcategoryEligibility(eligibilityId: string): Promise<void> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    // CRITICAL FIX: fetchAPI already prepends /api, so use '/designation-subcategory-eligibilities' not '/api/designation-subcategory-eligibilities'
    let url = `/designation-subcategory-eligibilities?eligibilityId=${eligibilityId}`
    if (userEmail) url += `&userEmail=${encodeURIComponent(userEmail)}`
    
    await fetchAPI(url, {
      method: 'DELETE',
      headers: userEmail ? { 'X-User-Email': userEmail } : undefined
    })
  } catch (error) {
    console.error('Error deleting designation-subcategory eligibility:', error)
    throw error
  }
}

/**
 * Refresh employee eligibility for a specific designation and gender
 * This recomputes eligibility for all employees based on subcategory-based eligibility rules
 */
export async function refreshEmployeeEligibilityForDesignation(
  companyId: string,
  designationId: string,
  gender: 'male' | 'female' | 'unisex' = 'unisex'
): Promise<{ success: boolean; message: string; employeesUpdated: number }> {
  try {
    const { getUserEmail } = await import('@/lib/utils/auth-storage')
    // CRITICAL SECURITY FIX: Use only tab-specific auth storage
    const userEmail = getUserEmail('company')
    
    const result = await fetchAPI<{ success: boolean; message: string; employeesUpdated: number }>(
      '/designation-subcategory-eligibilities/refresh',
      {
        method: 'POST',
        headers: userEmail ? { 'X-User-Email': userEmail } : undefined,
        body: JSON.stringify({
          companyId,
          designationId,
          gender,
          userEmail
        })
      }
    )
    return result || { success: false, message: 'Unknown error', employeesUpdated: 0 }
  } catch (error) {
    console.error('Error refreshing employee eligibility:', error)
    throw error
  }
}

// ========== VENDOR REPORTS FUNCTIONS ==========

export async function getVendorReports(vendorId: string): Promise<{
  salesPatterns: {
    daily: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    weekly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    monthly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number; percentage: number }>
  businessVolumeByCompany: Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }>
  summary: {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    totalCompanies: number
  }
}> {
  try {
    return await fetchAPI<any>(`/vendors/reports?vendorId=${vendorId}&type=full`)
  } catch (error) {
    console.error('Error fetching vendor reports:', error)
    throw error
  }
}

export async function getVendorSalesPatterns(vendorId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>> {
  try {
    const result = await fetchAPI<{ patterns: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }> }>(`/vendors/reports?vendorId=${vendorId}&type=sales-patterns&period=${period}`)
    return result?.patterns || []
  } catch (error) {
    console.error('Error fetching vendor sales patterns:', error)
    throw error
  }
}

export async function getVendorOrderStatusBreakdown(vendorId: string): Promise<Array<{ status: string; count: number; revenue: number; percentage: number }>> {
  try {
    const result = await fetchAPI<{ breakdown: Array<{ status: string; count: number; revenue: number; percentage: number }> }>(`/vendors/reports?vendorId=${vendorId}&type=order-status`)
    return result?.breakdown || []
  } catch (error) {
    console.error('Error fetching vendor order status breakdown:', error)
    throw error
  }
}

export async function getVendorBusinessVolumeByCompany(vendorId: string): Promise<Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }>> {
  try {
    const result = await fetchAPI<{ volume: Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }> }>(`/vendors/reports?vendorId=${vendorId}&type=business-volume`)
    return result?.volume || []
  } catch (error) {
    console.error('Error fetching vendor business volume by company:', error)
    throw error
  }
}

// ========== COMPANY-FILTERED VENDOR REPORT FUNCTIONS ==========

/**
 * Get comprehensive vendor reports with optional company and date range filtering
 */
export async function getVendorReportsForCompany(
  vendorId: string, 
  companyId: string | null = null,
  startDate?: Date | null,
  endDate?: Date | null
): Promise<{
  salesPatterns: {
    daily: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    weekly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
    monthly: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>
  }
  orderStatusBreakdown: Array<{ status: string; count: number; revenue: number; percentage: number }>
  businessVolumeByCompany: Array<{ companyId: string; companyName: string; orderCount: number; revenue: number; avgOrderValue: number; percentage: number }>
  topProducts: Array<{ productId: string; productName: string; quantitySold: number; revenue: number; orderCount: number }>
  deliveryPerformance: {
    avgDeliveryTime: number
    bestDeliveryTime: number
    slowestDeliveryTime: number
    totalDeliveries: number
    onTimeDeliveries: number
    onTimePercentage: number
  }
  accountHealth?: {
    repeatOrderRate: number
    avgOrderValueTrend: number
    orderFrequencyDays: number
    accountSince: string
    totalOrdersFromCompany: number
    recentOrderTrend: 'growing' | 'stable' | 'declining'
  }
  summary: {
    totalRevenue: number
    totalOrders: number
    avgOrderValue: number
    totalCompanies: number
    accountSince?: string
    totalOrdersFromCompany?: number
  }
}> {
  try {
    let url = `/vendors/reports?vendorId=${vendorId}&type=full`
    if (companyId) url += `&companyId=${companyId}`
    if (startDate) url += `&startDate=${startDate.toISOString()}`
    if (endDate) url += `&endDate=${endDate.toISOString()}`
    return await fetchAPI<any>(url)
  } catch (error) {
    console.error('Error fetching vendor reports for company:', error)
    throw error
  }
}

/**
 * Get vendor sales patterns with optional company and date range filtering
 */
export async function getVendorSalesPatternsForCompany(
  vendorId: string, 
  companyId: string | null = null,
  period: 'daily' | 'weekly' | 'monthly' = 'monthly',
  startDate?: Date | null,
  endDate?: Date | null
): Promise<Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }>> {
  try {
    let url = `/vendors/reports?vendorId=${vendorId}&type=sales-patterns&period=${period}`
    if (companyId) url += `&companyId=${companyId}`
    if (startDate) url += `&startDate=${startDate.toISOString()}`
    if (endDate) url += `&endDate=${endDate.toISOString()}`
    const result = await fetchAPI<{ patterns: Array<{ period: string; revenue: number; orderCount: number; avgOrderValue: number }> }>(url)
    return result?.patterns || []
  } catch (error) {
    console.error('Error fetching vendor sales patterns for company:', error)
    throw error
  }
}

/**
 * Get vendor top products with optional company filtering
 */
export async function getVendorTopProducts(
  vendorId: string, 
  companyId: string | null = null
): Promise<Array<{ productId: string; productName: string; quantitySold: number; revenue: number; orderCount: number }>> {
  try {
    const url = companyId 
      ? `/vendors/reports?vendorId=${vendorId}&companyId=${companyId}&type=top-products`
      : `/vendors/reports?vendorId=${vendorId}&type=top-products`
    const result = await fetchAPI<{ topProducts: Array<{ productId: string; productName: string; quantitySold: number; revenue: number; orderCount: number }> }>(url)
    return result?.topProducts || []
  } catch (error) {
    console.error('Error fetching vendor top products:', error)
    throw error
  }
}

/**
 * Get vendor delivery performance with optional company filtering
 */
export async function getVendorDeliveryPerformance(
  vendorId: string, 
  companyId: string | null = null
): Promise<{
  avgDeliveryTime: number
  bestDeliveryTime: number
  slowestDeliveryTime: number
  totalDeliveries: number
  onTimeDeliveries: number
  onTimePercentage: number
}> {
  try {
    const url = companyId 
      ? `/vendors/reports?vendorId=${vendorId}&companyId=${companyId}&type=delivery`
      : `/vendors/reports?vendorId=${vendorId}&type=delivery`
    const result = await fetchAPI<{ deliveryPerformance: any }>(url)
    return result?.deliveryPerformance || {
      avgDeliveryTime: 0,
      bestDeliveryTime: 0,
      slowestDeliveryTime: 0,
      totalDeliveries: 0,
      onTimeDeliveries: 0,
      onTimePercentage: 0
    }
  } catch (error) {
    console.error('Error fetching vendor delivery performance:', error)
    throw error
  }
}

/**
 * Get vendor account health for a specific company
 */
export async function getVendorAccountHealth(
  vendorId: string, 
  companyId: string
): Promise<{
  repeatOrderRate: number
  avgOrderValueTrend: number
  orderFrequencyDays: number
  accountSince: string
  totalOrdersFromCompany: number
  recentOrderTrend: 'growing' | 'stable' | 'declining'
}> {
  try {
    const result = await fetchAPI<{ accountHealth: any }>(`/vendors/reports?vendorId=${vendorId}&companyId=${companyId}&type=account-health`)
    return result?.accountHealth || {
      repeatOrderRate: 0,
      avgOrderValueTrend: 0,
      orderFrequencyDays: 0,
      accountSince: '',
      totalOrdersFromCompany: 0,
      recentOrderTrend: 'stable'
    }
  } catch (error) {
    console.error('Error fetching vendor account health:', error)
    throw error
  }
}

// ========== BULK ORDER UPLOAD FUNCTIONS ==========

/**
 * Download bulk order Excel template
 */
export async function downloadBulkOrderTemplate(companyId: string, adminEmail: string): Promise<void> {
  try {
    const response = await fetch(`/api/orders/bulk-template?companyId=${companyId}&adminEmail=${encodeURIComponent(adminEmail)}`)
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to download template' }))
      throw new Error(errorData.error || 'Failed to download template')
    }

    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `bulk_order_template_${companyId}_${Date.now()}.xlsx`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  } catch (error) {
    console.error('Error downloading bulk order template:', error)
    throw error
  }
}

/**
 * Upload bulk orders from Excel file
 */
export async function uploadBulkOrdersExcel(
  file: File,
  companyId: string,
  adminEmail: string
): Promise<{
  success: boolean
  results: Array<{
    rowNumber: number
    employeeId: string
    productId: string
    quantity: number
    status: 'success' | 'failed'
    orderId?: string
    error?: string
  }>
  summary: {
    total: number
    successful: number
    failed: number
  }
}> {
  try {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('companyId', companyId)
    formData.append('adminEmail', adminEmail)

    const response = await fetch('/api/orders/bulk-excel', {
      method: 'POST',
      body: formData
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Failed to upload orders' }))
      throw new Error(errorData.error || 'Failed to upload orders')
    }

    return await response.json()
  } catch (error) {
    console.error('Error uploading bulk orders:', error)
    throw error
  }
}

