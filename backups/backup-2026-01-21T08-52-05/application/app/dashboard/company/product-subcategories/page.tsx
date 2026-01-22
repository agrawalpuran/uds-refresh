'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Save, Loader2, CheckCircle2, XCircle, Package, Tag, Building2 } from 'lucide-react'
import { 
  getProductsByCompany, 
  getSubcategoriesByCompany,
  getProductSubcategoryMappings,
  createProductSubcategoryMapping,
  deleteProductSubcategoryMapping,
  getCompanyByAdminEmail,
  isCompanyAdmin
} from '@/lib/data-mongodb'

interface Product {
  id: string
  name: string
  sku?: string
  price?: number
  gender?: string
  category?: string
  vendors?: Array<{ id: string; name: string }>
}

interface Subcategory {
  id: string
  name: string
  parentCategoryId?: string
  parentCategory?: {
    id: string
    name: string
  }
}

interface ProductMapping {
  _id: string
  productId: string
  subCategoryId: string
  subcategory: Subcategory
}

export default function ProductSubcategoriesPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [products, setProducts] = useState<Product[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [existingMappings, setExistingMappings] = useState<ProductMapping[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [filterVendor, setFilterVendor] = useState<string>('all')
  const [companyId, setCompanyId] = useState<string>('')
  
  // State for managing product-subcategory associations
  // Map: productId -> Set of subCategoryIds
  const [productSubcategoryMap, setProductSubcategoryMap] = useState<Map<string, Set<string>>>(new Map())
  
  // State for company-specific prices (optional)
  const [subcategoryPrices, setSubcategoryPrices] = useState<Map<string, number>>(new Map())
  
  // Get all unique vendors from products
  const vendors = useMemo(() => {
    const vendorSet = new Set<string>()
    products.forEach(product => {
      product.vendors?.forEach(vendor => {
        vendorSet.add(vendor.name)
      })
    })
    return Array.from(vendorSet).sort()
  }, [products])

  // Verify admin access and load data
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const verifyAccessAndLoadData = async () => {
        try {
          setLoading(true)
          
          // Use tab-specific authentication storage
          const { getUserEmail, getCompanyId, setAuthData } = await import('@/lib/utils/auth-storage')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('company')
          
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            alert('Access denied: Please log in as a company admin.')
            router.push('/login/company')
            return
          }

          // Get company by admin email
          const company = await getCompanyByAdminEmail(userEmail)
          if (!company) {
            setAccessDenied(true)
            setLoading(false)
            alert('Access denied: You are not authorized as a company admin. Please contact your super admin.')
            router.push('/login/company')
            return
          }

          // Verify admin status
          const adminStatus = await isCompanyAdmin(userEmail, company.id)
          if (!adminStatus) {
            setAccessDenied(true)
            setLoading(false)
            alert('Access denied: You are not authorized as a company admin.')
            router.push('/login/company')
            return
          }

          // Set company ID and load data
          const targetCompanyId = String(company.id)
          setCompanyId(targetCompanyId)
          
          // Update tab-specific storage
          setAuthData('company', {
            userEmail,
            companyId: targetCompanyId
          })
          // Also update localStorage for backward compatibility
          localStorage.setItem('companyId', targetCompanyId)
        
        // Load products for the company
        console.log(`[ProductSubcategories] Loading products for company: ${targetCompanyId}`)
        const companyProducts = await getProductsByCompany(targetCompanyId)
        console.log(`[ProductSubcategories] Loaded ${companyProducts.length} products`)
        setProducts(companyProducts)
        
        // Load subcategories for the company
        console.log(`[ProductSubcategories] Loading subcategories for company: ${targetCompanyId}`)
        const companySubcategories = await getSubcategoriesByCompany(targetCompanyId)
        console.log(`[ProductSubcategories] Loaded ${companySubcategories.length} subcategories`)
        setSubcategories(companySubcategories)
        
        // Load existing mappings
        console.log(`[ProductSubcategories] Loading existing mappings for company: ${targetCompanyId}`)
        // Use userEmail that was already obtained above (line 84)
        const mappingsResponse = await fetch(`/api/product-subcategory-mappings?companyId=${targetCompanyId}`, {
          headers: {
            'Content-Type': 'application/json',
            ...(userEmail ? {
              'X-User-Email': userEmail
            } : {})
          }
        })
        
        if (mappingsResponse.ok) {
          const mappingsData = await mappingsResponse.json()
          const mappings = mappingsData.mappings || []
          console.log(`[ProductSubcategories] Loaded ${mappings.length} existing mappings`)
          setExistingMappings(mappings)
          
          // Build product-subcategory map from existing mappings
          // CRITICAL: productId and subCategoryId are now string IDs (not ObjectIds) from API
          const map = new Map<string, Set<string>>()
          mappings.forEach((mapping: ProductMapping) => {
            // Use string IDs for matching with product.id and sub.id
            const productIdStr = mapping.productId
            const subCategoryIdStr = mapping.subCategoryId
            
            if (!map.has(productIdStr)) {
              map.set(productIdStr, new Set())
            }
            map.get(productIdStr)!.add(subCategoryIdStr)
          })
          console.log(`[ProductSubcategories] Built map with ${map.size} products and ${Array.from(map.values()).reduce((sum, set) => sum + set.size, 0)} total associations`)
          setProductSubcategoryMap(map)
        } else {
          // Suppress console errors for expected errors (404, 401, 403)
          const isExpectedError = mappingsResponse.status === 404 || 
                                 mappingsResponse.status === 401 || 
                                 mappingsResponse.status === 403
          if (!isExpectedError) {
            console.error('Failed to load existing mappings:', mappingsResponse.statusText)
          }
        }
        
        } catch (error: any) {
          // Only show error if it's not an expected error (404, 401, 403)
          const isExpectedError = error?.message?.includes('404') || 
                                 error?.message?.includes('401') || 
                                 error?.message?.includes('403') ||
                                 error?.message?.includes('Unauthorized') ||
                                 error?.message?.includes('Forbidden')
          
          if (!isExpectedError) {
            console.error('Error loading data:', error)
            setAccessDenied(true)
            alert('Error loading data. Please try logging in again.')
            router.push('/login/company')
          } else {
            // For expected errors, just set loading to false
            setLoading(false)
          }
        } finally {
          setLoading(false)
        }
      }
      
      verifyAccessAndLoadData()
    }
  }, [router])

  // Filter products based on search and vendor filter
  const filteredProducts = useMemo(() => {
    return products.filter(product => {
      // Search filter
      const matchesSearch = !searchTerm || 
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.sku?.toLowerCase().includes(searchTerm.toLowerCase())
      
      // Vendor filter
      const matchesVendor = filterVendor === 'all' || 
        product.vendors?.some(v => v.name === filterVendor)
      
      return matchesSearch && matchesVendor
    })
  }, [products, searchTerm, filterVendor])

  // Group subcategories by parent category
  const subcategoriesByCategory = useMemo(() => {
    const grouped = new Map<string, Subcategory[]>()
    
    subcategories.forEach(sub => {
      const categoryName = sub.parentCategory?.name || 'Uncategorized'
      if (!grouped.has(categoryName)) {
        grouped.set(categoryName, [])
      }
      grouped.get(categoryName)!.push(sub)
    })
    
    return grouped
  }, [subcategories])

  // Handle subcategory selection/deselection for a product
  const handleSubcategoryToggle = (productId: string, subCategoryId: string) => {
    const newMap = new Map(productSubcategoryMap)
    
    if (!newMap.has(productId)) {
      newMap.set(productId, new Set())
    }
    
    const subcategorySet = newMap.get(productId)!
    
    if (subcategorySet.has(subCategoryId)) {
      subcategorySet.delete(subCategoryId)
    } else {
      subcategorySet.add(subCategoryId)
    }
    
    setProductSubcategoryMap(newMap)
  }

  // Check if a product-subcategory mapping exists (either existing or newly selected)
  const isSubcategorySelected = (productId: string, subCategoryId: string): boolean => {
    return productSubcategoryMap.get(productId)?.has(subCategoryId) || false
  }

  // Get count of selected subcategories for a product
  const getSelectedCount = (productId: string): number => {
    return productSubcategoryMap.get(productId)?.size || 0
  }

  // Save all changes (bulk save)
  const handleSaveAll = async () => {
    if (!companyId) {
      alert('Company ID not found. Please refresh the page.')
      return
    }

    try {
      setSaving(true)
      
      // Collect all changes
      const toCreate: Array<{ productId: string; subCategoryId: string }> = []
      const toDelete: string[] = []
      
      // Find new mappings to create
      productSubcategoryMap.forEach((subcategorySet, productId) => {
        subcategorySet.forEach(subCategoryId => {
          // Check if this mapping already exists
          const exists = existingMappings.some(
            m => m.productId === productId && m.subCategoryId === subCategoryId
          )
          if (!exists) {
            toCreate.push({ productId, subCategoryId })
          }
        })
      })
      
      // Find mappings to delete (exist in DB but not in current selection)
      existingMappings.forEach(mapping => {
        const isSelected = productSubcategoryMap.get(mapping.productId)?.has(mapping.subCategoryId)
        if (!isSelected) {
          toDelete.push(mapping._id)
        }
      })
      
      console.log(`[ProductSubcategories] Saving changes:`, {
        toCreate: toCreate.length,
        toDelete: toDelete.length
      })
      
      // Create new mappings
      const createPromises = toCreate.map(({ productId, subCategoryId }) =>
        createProductSubcategoryMapping(productId, subCategoryId, companyId)
      )
      
      // Delete removed mappings
      const deletePromises = toDelete.map(mappingId =>
        deleteProductSubcategoryMapping(mappingId)
      )
      
      // Execute all operations with error handling
      const results = await Promise.allSettled([...createPromises, ...deletePromises])
      
      // Check for failures
      const failures = results.filter(r => r.status === 'rejected')
      if (failures.length > 0) {
        console.error('[ProductSubcategories] Some operations failed:', failures)
        const errorMessages = failures.map(f => f.status === 'rejected' ? f.reason?.message || String(f.reason) : '').filter(Boolean)
        throw new Error(`Failed to save ${failures.length} operation(s): ${errorMessages.join('; ')}`)
      }
      
      console.log('[ProductSubcategories] ✅ All save operations completed successfully')
      
      // Reload existing mappings
      // Get user email for authentication
      const { getUserEmail } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage')
        : { getUserEmail: () => null }
      
      const mappingsResponse = await fetch(`/api/product-subcategory-mappings?companyId=${companyId}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(typeof window !== 'undefined' ? {
            'X-User-Email': getUserEmail('company') || ''
          } : {})
        }
      })
      
      if (mappingsResponse.ok) {
        const mappingsData = await mappingsResponse.json()
        setExistingMappings(mappingsData.mappings || [])
        
        // Update the map to reflect saved state
        // CRITICAL: productId and subCategoryId are now string IDs (not ObjectIds) from API
        const map = new Map<string, Set<string>>()
        mappingsData.mappings.forEach((mapping: ProductMapping) => {
          const productIdStr = mapping.productId
          const subCategoryIdStr = mapping.subCategoryId
          
          if (!map.has(productIdStr)) {
            map.set(productIdStr, new Set())
          }
          map.get(productIdStr)!.add(subCategoryIdStr)
        })
        console.log(`[ProductSubcategories] Updated map after save with ${map.size} products and ${Array.from(map.values()).reduce((sum, set) => sum + set.size, 0)} total associations`)
        setProductSubcategoryMap(map)
      }
      
      alert(`Successfully saved ${toCreate.length} new associations and removed ${toDelete.length} associations.`)
      
    } catch (error: any) {
      console.error('Error saving mappings:', error)
      alert(`Failed to save changes: ${error.message || 'Unknown error'}`)
    } finally {
      setSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = useMemo(() => {
    // Check for new selections
    for (const [productId, subcategorySet] of productSubcategoryMap.entries()) {
      for (const subCategoryId of subcategorySet) {
        const exists = existingMappings.some(
          m => m.productId === productId && m.subCategoryId === subCategoryId
        )
        if (!exists) {
          return true
        }
      }
    }
    
    // Check for removed selections
    for (const mapping of existingMappings) {
      const isSelected = productSubcategoryMap.get(mapping.productId)?.has(mapping.subCategoryId)
      if (!isSelected) {
        return true
      }
    }
    
    return false
  }, [productSubcategoryMap, existingMappings])

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
          <span className="ml-2 text-gray-600">Verifying access...</span>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8 max-w-md">
            <h2 className="text-2xl font-bold text-red-900 mb-4">Access Denied</h2>
            <p className="text-red-700 mb-4">
              You are not authorized to access this page. Only assigned company administrators can access this page.
            </p>
            <button
              onClick={() => router.push('/login/company')}
              className="bg-orange-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-orange-600 transition-colors"
            >
              Back to Login
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Product-Subcategory Associations</h1>
            <p className="text-gray-600 mt-1">
              Associate products with company-specific subcategories
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={!hasUnsavedChanges || saving}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors ${
              hasUnsavedChanges && !saving
                ? 'bg-orange-500 text-white hover:bg-orange-600'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {saving ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Save All Changes
              </>
            )}
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            
            {/* Vendor Filter */}
            <div>
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              >
                <option value="all">All Vendors</option>
                {vendors.map(vendor => (
                  <option key={vendor} value={vendor}>{vendor}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <Package className="w-8 h-8 text-orange-500" />
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-bold text-gray-900">{products.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <Tag className="w-8 h-8 text-blue-500" />
              <div>
                <p className="text-sm text-gray-600">Subcategories</p>
                <p className="text-2xl font-bold text-gray-900">{subcategories.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <div>
                <p className="text-sm text-gray-600">Current Mappings</p>
                <p className="text-2xl font-bold text-gray-900">{existingMappings.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Products Table */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white p-8 rounded-lg shadow-sm border border-gray-200 text-center">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">
              {searchTerm || filterVendor !== 'all'
                ? 'No products match your filters.'
                : 'No products found for your company.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Vendor(s)
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subcategories
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Selected
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{product.name}</div>
                          {product.sku && (
                            <div className="text-sm text-gray-500">SKU: {product.sku}</div>
                          )}
                          {product.price && (
                            <div className="text-sm text-gray-500">₹{product.price}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-2">
                          {product.vendors && product.vendors.length > 0 ? (
                            product.vendors.map((vendor) => (
                              <span
                                key={vendor.id}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded"
                              >
                                <Building2 className="w-3 h-3" />
                                {vendor.name}
                              </span>
                            ))
                          ) : (
                            <span className="text-sm text-gray-400">No vendor</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-3 max-w-2xl">
                          {Array.from(subcategoriesByCategory.entries()).map(([categoryName, categorySubs]) => {
                            if (categorySubs.length === 0) return null
                            
                            return (
                              <div key={categoryName} className="border-l-2 border-gray-200 pl-3">
                                <div className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                                  {categoryName}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {categorySubs.map((sub) => {
                                    const isSelected = isSubcategorySelected(product.id, sub.id)
                                    return (
                                      <button
                                        key={sub.id}
                                        onClick={() => handleSubcategoryToggle(product.id, sub.id)}
                                        className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                                          isSelected
                                            ? 'bg-orange-500 text-white hover:bg-orange-600'
                                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                        }`}
                                      >
                                        {sub.name}
                                      </button>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {getSelectedCount(product.id) > 0 ? (
                            <>
                              <CheckCircle2 className="w-5 h-5 text-green-500" />
                              <span className="text-sm font-medium text-gray-900">
                                {getSelectedCount(product.id)}
                              </span>
                            </>
                          ) : (
                            <XCircle className="w-5 h-5 text-gray-300" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Help Text */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            <strong>How to use:</strong> Click on subcategory buttons to associate them with products. 
            Multiple subcategories can be selected per product. Click "Save All Changes" to persist your selections.
            Associations are company-specific and will not affect other companies.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}

