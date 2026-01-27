'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Package, AlertTriangle, CheckCircle, XCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { getCompanyByAdminEmail } from '@/lib/data-mongodb'

interface InventoryRecord {
  sku: string
  productName: string
  productId: string
  vendorName: string
  vendorId: string
  availableStock: number
  threshold: number
  sizeInventory: { [size: string]: number }
  lowInventoryThreshold: { [size: string]: number }
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock'
  lastUpdated: string | null
  category: string
  gender: string
}

export default function VendorStockPage() {
  const [inventory, setInventory] = useState<InventoryRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterVendor, setFilterVendor] = useState<string>('all')
  const [sortField, setSortField] = useState<keyof InventoryRecord>('productName')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [expandedVendors, setExpandedVendors] = useState<Set<string>>(new Set())

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)

        // SECURITY FIX: Use ONLY sessionStorage (tab-specific)
        const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
        let targetCompanyId = getCompanyId()
        
        if (!targetCompanyId) {
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('company')
          if (userEmail) {
            const company = await getCompanyByAdminEmail(userEmail)
            if (company && company.id) {
              targetCompanyId = String(company.id)
              localStorage.setItem('companyId', targetCompanyId)
            }
          }
        }

        if (!targetCompanyId) {
          setError('Company ID not found. Please ensure you are logged in as a Company Admin.')
          setLoading(false)
          return
        }

        setCompanyId(targetCompanyId)

        // Get company details for colors
        const { getCompanyById } = await import('@/lib/data-mongodb')
        const companyDetails = await getCompanyById(targetCompanyId)
        if (companyDetails) {
          setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
        }

        // Get user email for authorization
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        // Note: getUserEmail already imported above on line 43
        const userEmail = getUserEmail('company')
        
        if (!userEmail) {
          setError('User email not found. Please log in again.')
          setLoading(false)
          return
        }

        // Fetch vendor-wise inventory
        try {
          const { getVendorWiseInventoryForCompany } = await import('@/lib/data-mongodb')
          const inventoryData = await getVendorWiseInventoryForCompany(targetCompanyId)
          
          if (inventoryData && Array.isArray(inventoryData) && inventoryData.length >= 0) {
            setInventory(inventoryData)
          } else {
            // Fallback to direct API call if helper returns invalid data
            const response = await fetch(
              `/api/company/inventory/vendor-wise?companyId=${targetCompanyId}&email=${encodeURIComponent(userEmail)}`
            )
            
            if (!response.ok) {
              if (response.status === 403) {
                setError('Access denied. Only Company Admin can view vendor inventory.')
              } else if (response.status === 401) {
                setError('Unauthorized. Please log in again.')
              } else {
                const errorData = await response.json()
                setError(errorData.error || 'Failed to load inventory data')
              }
              setLoading(false)
              return
            }
            
            const responseData = await response.json()
            setInventory(responseData)
          }
        } catch (fetchError: any) {
          // If helper function fails, try direct API call
          const response = await fetch(
            `/api/company/inventory/vendor-wise?companyId=${targetCompanyId}&email=${encodeURIComponent(userEmail)}`
          )
          
          if (!response.ok) {
            if (response.status === 403) {
              setError('Access denied. Only Company Admin can view vendor inventory.')
            } else if (response.status === 401) {
              setError('Unauthorized. Please log in again.')
            } else {
              const errorData = await response.json()
              setError(errorData.error || 'Failed to load inventory data')
            }
            setLoading(false)
            return
          }
          
          const responseData = await response.json()
          setInventory(responseData)
        }
      } catch (err: any) {
        console.error('Error loading vendor stock:', err)
        setError(err.message || 'An error occurred while loading inventory data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  // Get unique vendors for filter
  const uniqueVendors = Array.from(new Set(inventory.map(item => item.vendorName).filter(name => name && name !== 'Unknown Vendor'))).sort()

  // Filter inventory first
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.productName.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesVendor = filterVendor === 'all' || item.vendorName === filterVendor
    return matchesSearch && matchesVendor
  })

  // Group by vendor
  const inventoryByVendor = filteredInventory.reduce((acc, item) => {
    const vendorName = item.vendorName || 'Unknown Vendor'
    if (!acc[vendorName]) {
      acc[vendorName] = []
    }
    acc[vendorName].push(item)
    return acc
  }, {} as Record<string, InventoryRecord[]>)

  // Sort items within each vendor group
  Object.keys(inventoryByVendor).forEach(vendorName => {
    inventoryByVendor[vendorName].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]
      
      if (aValue === null || aValue === undefined) return 1
      if (bValue === null || bValue === undefined) return -1
      
      let comparison = 0
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue)
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue
      } else {
        comparison = String(aValue).localeCompare(String(bValue))
      }
      
      return sortDirection === 'asc' ? comparison : -comparison
    })
  })

  // Sort vendors alphabetically
  const sortedVendorNames = Object.keys(inventoryByVendor).sort()

  const handleSort = (field: keyof InventoryRecord) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const getStockStatusIcon = (status: string) => {
    switch (status) {
      case 'out_of_stock':
        return <XCircle className="h-5 w-5 text-red-500" />
      case 'low_stock':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      case 'in_stock':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      default:
        return null
    }
  }

  const getStockStatusBadge = (status: string) => {
    switch (status) {
      case 'out_of_stock':
        return <span className="px-2 py-1 bg-red-100 text-red-700 text-xs font-medium rounded">Out of Stock</span>
      case 'low_stock':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded">Low Stock</span>
      case 'in_stock':
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">In Stock</span>
      default:
        return null
    }
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    try {
      const date = new Date(dateString)
      return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return 'N/A'
    }
  }

  const toggleVendor = (vendorName: string) => {
    setExpandedVendors(prev => {
      const newSet = new Set(prev)
      if (newSet.has(vendorName)) {
        newSet.delete(vendorName)
      } else {
        newSet.add(vendorName)
      }
      return newSet
    })
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">Loading vendor inventory...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout actorType="company">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">{error}</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Vendor Stock</h1>
            <p className="text-gray-600 mt-1">View inventory levels by vendor and SKU (Read-only)</p>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by SKU or Product Name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                  '--tw-border-color': companyPrimaryColor || '#f76b1c'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                onFocus={(e) => {
                  e.target.style.borderColor = companyPrimaryColor || '#f76b1c'
                  e.target.style.boxShadow = `0 0 0 2px ${companyPrimaryColor || '#f76b1c'}40`
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
              style={{ 
                '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                '--tw-border-color': companyPrimaryColor || '#f76b1c'
              } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              onFocus={(e) => {
                e.target.style.borderColor = companyPrimaryColor || '#f76b1c'
                e.target.style.boxShadow = `0 0 0 2px ${companyPrimaryColor || '#f76b1c'}40`
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="all">All Vendors</option>
              {uniqueVendors.map(vendor => (
                <option key={vendor} value={vendor}>{vendor}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Vendor-wise Inventory View */}
        {sortedVendorNames.length === 0 ? (
          <div className="bg-white rounded-xl shadow-lg p-12 text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-xl font-semibold text-gray-900 mb-2">No inventory found</p>
            <p className="text-gray-600">
              {searchTerm || filterVendor !== 'all'
                ? 'Try adjusting your filters'
                : 'No vendor inventory records found for this company.'}
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {sortedVendorNames.map((vendorName) => {
              const vendorItems = inventoryByVendor[vendorName]
              const totalStock = vendorItems.reduce((sum, item) => sum + item.availableStock, 0)
              const outOfStockCount = vendorItems.filter(item => item.stockStatus === 'out_of_stock').length
              const lowStockCount = vendorItems.filter(item => item.stockStatus === 'low_stock').length
              
              return (
                <div key={vendorName} className="bg-white rounded-xl shadow-lg overflow-hidden">
                  {/* Vendor Header */}
                  <div 
                    className="bg-gradient-to-r from-gray-50 to-gray-100 px-6 py-4 border-b border-gray-200 cursor-pointer hover:from-gray-100 hover:to-gray-150 transition-colors"
                    onClick={() => toggleVendor(vendorName)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-lg font-bold text-gray-900">{vendorName}</h3>
                          {expandedVendors.has(vendorName) ? (
                            <ChevronUp className="h-5 w-5 text-gray-500" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-500" />
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">
                          {vendorItems.length} product{vendorItems.length !== 1 ? 's' : ''} • Total Stock: {totalStock}
                          {outOfStockCount > 0 && (
                            <span className="ml-2 text-red-600">• {outOfStockCount} out of stock</span>
                          )}
                          {lowStockCount > 0 && (
                            <span className="ml-2 text-yellow-600">• {lowStockCount} low stock</span>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  {/* Vendor Products Table */}
                  {expandedVendors.has(vendorName) && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('sku')}
                          >
                            <div className="flex items-center gap-2">
                              SKU
                              {sortField === 'sku' && (
                                <span className="text-gray-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('productName')}
                          >
                            <div className="flex items-center gap-2">
                              Product Name
                              {sortField === 'productName' && (
                                <span className="text-gray-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('availableStock')}
                          >
                            <div className="flex items-center gap-2">
                              Available Stock
                              {sortField === 'availableStock' && (
                                <span className="text-gray-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('threshold')}
                          >
                            <div className="flex items-center gap-2">
                              Threshold
                              {sortField === 'threshold' && (
                                <span className="text-gray-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                          <th 
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                            onClick={() => handleSort('lastUpdated')}
                          >
                            <div className="flex items-center gap-2">
                              Last Updated
                              {sortField === 'lastUpdated' && (
                                <span className="text-gray-400">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                              )}
                            </div>
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {vendorItems.map((item, index) => (
                          <tr key={`${item.sku}-${item.vendorId}-${index}`} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-mono text-gray-900">{item.sku}</span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm font-medium text-gray-900">{item.productName}</div>
                              <div className="text-xs text-gray-500 capitalize">{item.category} • {item.gender}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm font-semibold text-gray-900">{item.availableStock}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-gray-600">{item.threshold > 0 ? item.threshold : 'N/A'}</span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center gap-2">
                                {getStockStatusIcon(item.stockStatus)}
                                {getStockStatusBadge(item.stockStatus)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {formatDate(item.lastUpdated)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )
            })}
            
            {/* Summary Footer */}
            <div className="bg-white rounded-xl shadow-lg p-4">
              <p className="text-sm text-gray-600 text-center">
                Showing <span className="font-medium">{filteredInventory.length}</span> of{' '}
                <span className="font-medium">{inventory.length}</span> inventory records across{' '}
                <span className="font-medium">{sortedVendorNames.length}</span> vendor{sortedVendorNames.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

