'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Filter, X, Eye, Edit2, Save, Loader2, Ruler } from 'lucide-react'
import { getProductsByVendor, getVendorById, getProductById, updateProduct, getVendorInventory } from '@/lib/data-mongodb'
import Image from 'next/image'
import { getUniformImage } from '@/lib/utils/image-mapping'
import SizeChartModal from '@/components/SizeChartModal'

export default function VendorCatalogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female' | 'unisex'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [uniforms, setUniforms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [vendorPrimaryColor, setVendorPrimaryColor] = useState<string>('#2563eb')
  const [vendorSecondaryColor, setVendorSecondaryColor] = useState<string>('#2563eb')
  
  // Modal states
  const [viewModal, setViewModal] = useState<{ open: boolean; product: any | null }>({ open: false, product: null })
  const [editModal, setEditModal] = useState<{ open: boolean; product: any | null; loading: boolean; saving: boolean }>({ 
    open: false, 
    product: null, 
    loading: false,
    saving: false 
  })
  const [editFormData, setEditFormData] = useState<any>({})
  const [sizeCharts, setSizeCharts] = useState<Record<string, any>>({})
  const [sizeChartModal, setSizeChartModal] = useState<{ isOpen: boolean; imageUrl: string; productName: string }>({
    isOpen: false,
    imageUrl: '',
    productName: '',
  })
  const [inventoryData, setInventoryData] = useState<Record<string, any>>({}) // productId -> inventory record
  
  // Get vendor ID from sessionStorage (set during login via setAuthData)
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // CRITICAL FIX: Use sessionStorage via auth-storage utility (not localStorage)
        let vendorId: string | null = null
        if (typeof window !== 'undefined') {
          const { getAuthData, getVendorId, getUserEmail } = await import('@/lib/utils/auth-storage')
          const { getVendorByEmail } = await import('@/lib/data-mongodb')
          
          // Try getVendorId first (newer method)
          vendorId = getVendorId()
          
          // Fallback to getAuthData if getVendorId returns null
          if (!vendorId) {
            const authData = getAuthData('vendor')
            vendorId = authData?.vendorId || null
            console.log(`[VendorCatalogPage] vendorId from getAuthData:`, vendorId)
          }
          
          // Last resort: check localStorage (for backward compatibility during migration)
          if (!vendorId) {
            vendorId = localStorage.getItem('vendorId')
            console.log(`[VendorCatalogPage] vendorId from localStorage (fallback):`, vendorId)
          }
          
          // Final fallback: try to get vendor by email if we have userEmail but no vendorId
          if (!vendorId) {
            const userEmail = getUserEmail('vendor')
            if (userEmail) {
              console.log(`[VendorCatalogPage] No vendorId found, trying to get vendor by email: ${userEmail}`)
              try {
                const vendor = await getVendorByEmail(userEmail)
                if (vendor && vendor.id) {
                  vendorId = vendor.id
                  console.log(`[VendorCatalogPage] ✅ Found vendor by email, vendorId: ${vendorId}`)
                  // Update auth storage for future use
                  const { setAuthData } = await import('@/lib/utils/auth-storage')
                  setAuthData('vendor', {
                    userEmail: userEmail,
                    vendorId: vendorId
                  })
                  // Also update localStorage for backward compatibility
                  localStorage.setItem('vendorId', vendorId)
                }
              } catch (emailError) {
                console.error('[VendorCatalogPage] Error getting vendor by email:', emailError)
              }
            }
          }
        }
        
        console.log(`[VendorCatalogPage] 🔍 DEBUG - Final vendorId resolved:`, vendorId, 'type:', typeof vendorId)
        
        if (vendorId) {
          console.log(`[VendorCatalogPage] ✅ Fetching products for vendorId: ${vendorId}`)
          
          // Fetch products for this vendor
          const products = await getProductsByVendor(vendorId)
          console.log(`[VendorCatalogPage] ✅ Loaded ${products.length} products for vendor ${vendorId}`)
          
          if (products.length === 0) {
            console.warn(`[VendorCatalogPage] ⚠️ WARNING: No products returned for vendor ${vendorId}`)
            console.warn(`[VendorCatalogPage] ⚠️ This could indicate:`)
            console.warn(`[VendorCatalogPage]   1. No ProductVendor relationships exist for this vendor`)
            console.warn(`[VendorCatalogPage]   2. ProductVendor relationships exist but query is failing`)
            console.warn(`[VendorCatalogPage]   3. Products exist but are not being returned`)
          }
          
          setUniforms(products)
          
          // Fetch inventory for all products
          if (products.length > 0) {
            try {
              const inventory = await getVendorInventory(vendorId)
              console.log(`[VendorCatalogPage] Loaded ${inventory.length} inventory records`)
              
              // Create a map of productId -> inventory record for quick lookup
              const inventoryMap: Record<string, any> = {}
              inventory.forEach((inv: any) => {
                if (inv.productId) {
                  inventoryMap[inv.productId] = inv
                }
              })
              setInventoryData(inventoryMap)
            } catch (error) {
              console.error('Error fetching inventory:', error)
            }
            
            // Fetch size charts for all products
            const productIds = products.map(p => p.id)
            try {
              const response = await fetch(`/api/products/size-charts?productIds=${productIds.join(',')}`)
              if (response.ok) {
                const charts = await response.json()
                setSizeCharts(charts)
              }
            } catch (error) {
              console.error('Error fetching size charts:', error)
            }
          }
          
          // Fetch vendor colors
          const vendorDetails = await getVendorById(vendorId)
          if (vendorDetails) {
            setVendorPrimaryColor(vendorDetails.primaryColor || '#2563eb')
            setVendorSecondaryColor(vendorDetails.secondaryColor || vendorDetails.primaryColor || '#2563eb')
          }
        } else {
          console.error('[VendorCatalogPage] ❌ CRITICAL: No vendorId found in sessionStorage or localStorage')
          console.error('[VendorCatalogPage] ❌ This indicates authentication data is missing')
          console.error('[VendorCatalogPage] ❌ Please check:')
          console.error('[VendorCatalogPage]   1. Did you log in successfully?')
          console.error('[VendorCatalogPage]   2. Is sessionStorage being cleared?')
          console.error('[VendorCatalogPage]   3. Are you using the correct login page?')
          alert('Vendor ID not found. Please log in again.')
        }
      } catch (error) {
        console.error('Error loading catalog:', error)
        alert(`Error loading catalog: ${error instanceof Error ? error.message : 'Unknown error'}`)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  const filteredUniforms = uniforms.filter(uniform => {
    const matchesSearch = uniform.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         uniform.sku.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesGender = filterGender === 'all' || uniform.gender === filterGender
    const matchesCategory = filterCategory === 'all' || uniform.category === filterCategory
    return matchesSearch && matchesGender && matchesCategory
  })

  // View modal handlers
  const handleView = async (productId: string) => {
    try {
      setViewModal({ open: true, product: null })
      const product = await getProductById(productId)
      if (!product) {
        alert('Product not found')
        setViewModal({ open: false, product: null })
        return
      }
      setViewModal({ open: true, product })
    } catch (error) {
      console.error('Error fetching product for view:', error)
      alert('Error loading product details')
      setViewModal({ open: false, product: null })
    }
  }

  const handleCloseView = () => {
    setViewModal({ open: false, product: null })
  }

  // Edit modal handlers
  const handleEdit = async (productId: string) => {
    try {
      setEditModal({ open: true, product: null, loading: true, saving: false })
      const product = await getProductById(productId)
      if (!product) {
        alert('Product not found')
        setEditModal({ open: false, product: null, loading: false, saving: false })
        return
      }
      
      // Verify vendor ownership before allowing edit
      let vendorId: string | null = null
      if (typeof window !== 'undefined') {
        const { getVendorId, getAuthData, getUserEmail } = await import('@/lib/utils/auth-storage')
        const { getVendorByEmail } = await import('@/lib/data-mongodb')
        
        vendorId = getVendorId() || getAuthData('vendor')?.vendorId || localStorage.getItem('vendorId')
        
        // Fallback: try to get vendor by email
        if (!vendorId) {
          const userEmail = getUserEmail('vendor')
          if (userEmail) {
            try {
              const vendor = await getVendorByEmail(userEmail)
              vendorId = vendor?.id || null
            } catch (error) {
              console.error('Error getting vendor by email:', error)
            }
          }
        }
      }
      
      if (!vendorId) {
        alert('Vendor ID not found. Please log in again.')
        setEditModal({ open: false, product: null, loading: false, saving: false })
        return
      }
      
      // Check if product belongs to this vendor
      const vendorProducts = await getProductsByVendor(vendorId)
      const productBelongsToVendor = vendorProducts.some(p => p.id === productId)
      
      if (!productBelongsToVendor) {
        alert('You do not have permission to edit this product. It does not belong to your vendor.')
        setEditModal({ open: false, product: null, loading: false, saving: false })
        return
      }
      
      // Initialize form data with product values
      setEditFormData({
        name: product.name || '',
        category: product.category || 'shirt',
        gender: product.gender || 'male',
        sizes: product.sizes ? [...product.sizes] : [],
        price: product.price || 0,
        attribute1_name: product.attribute1_name || '',
        attribute1_value: product.attribute1_value || '',
        attribute2_name: product.attribute2_name || '',
        attribute2_value: product.attribute2_value || '',
        attribute3_name: product.attribute3_name || '',
        attribute3_value: product.attribute3_value || '',
      })
      setEditModal({ open: true, product, loading: false, saving: false })
    } catch (error) {
      console.error('Error fetching product for edit:', error)
      alert('Error loading product for editing')
      setEditModal({ open: false, product: null, loading: false, saving: false })
    }
  }

  const handleCloseEdit = () => {
    setEditModal({ open: false, product: null, loading: false, saving: false })
    setEditFormData({})
  }

  const handleSaveEdit = async () => {
    if (!editModal.product) return

    try {
      setEditModal(prev => ({ ...prev, saving: true }))
      
      // Validate required fields
      if (!editFormData.name || !editFormData.name.trim()) {
        alert('Product name is required')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }
      
      if (!editFormData.price || editFormData.price <= 0) {
        alert('Price must be greater than 0')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }
      
      if (!editFormData.sizes || editFormData.sizes.length === 0) {
        alert('At least one size is required')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }

      // Prepare update data (exclude SKU, vendor, and ID - vendors cannot change these)
      const updateData: any = {
        name: editFormData.name.trim(),
        category: editFormData.category,
        gender: editFormData.gender,
        sizes: editFormData.sizes.filter((s: string) => s.trim() !== ''),
        price: parseFloat(editFormData.price),
      }

      // Include attributes only if name is provided
      if (editFormData.attribute1_name && editFormData.attribute1_name.trim()) {
        updateData.attribute1_name = editFormData.attribute1_name.trim()
        updateData.attribute1_value = editFormData.attribute1_value || null
      } else {
        updateData.attribute1_name = null
        updateData.attribute1_value = null
      }

      if (editFormData.attribute2_name && editFormData.attribute2_name.trim()) {
        updateData.attribute2_name = editFormData.attribute2_name.trim()
        updateData.attribute2_value = editFormData.attribute2_value || null
      } else {
        updateData.attribute2_name = null
        updateData.attribute2_value = null
      }

      if (editFormData.attribute3_name && editFormData.attribute3_name.trim()) {
        updateData.attribute3_name = editFormData.attribute3_name.trim()
        updateData.attribute3_value = editFormData.attribute3_value || null
      } else {
        updateData.attribute3_name = null
        updateData.attribute3_value = null
      }

      // Call API with vendorId for validation
      let vendorId: string | null = null
      if (typeof window !== 'undefined') {
        const { getVendorId, getAuthData, getUserEmail } = await import('@/lib/utils/auth-storage')
        const { getVendorByEmail } = await import('@/lib/data-mongodb')
        
        vendorId = getVendorId() || getAuthData('vendor')?.vendorId || localStorage.getItem('vendorId')
        
        // Fallback: try to get vendor by email
        if (!vendorId) {
          const userEmail = getUserEmail('vendor')
          if (userEmail) {
            try {
              const vendor = await getVendorByEmail(userEmail)
              vendorId = vendor?.id || null
            } catch (error) {
              console.error('Error getting vendor by email:', error)
            }
          }
        }
      }
      
      if (!vendorId) {
        alert('Vendor ID not found. Please log in again.')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }

      // Use the updateProduct function directly, which will be validated by the API
      const response = await fetch(`/api/products?productId=${encodeURIComponent(editModal.product.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...updateData, vendorId }), // Include vendorId for backend validation
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to update product')
      }

      const updatedProduct = await response.json()
      
      // Refresh the catalog
      const products = await getProductsByVendor(vendorId)
      setUniforms(products)
      
      alert('Product updated successfully!')
      handleCloseEdit()
    } catch (error: any) {
      console.error('Error updating product:', error)
      alert(`Error updating product: ${error.message || 'Unknown error'}`)
      setEditModal(prev => ({ ...prev, saving: false }))
    }
  }

  const handleAddSize = () => {
    setEditFormData((prev: any) => ({
      ...prev,
      sizes: [...(prev.sizes || []), '']
    }))
  }

  const handleRemoveSize = (index: number) => {
    setEditFormData((prev: any) => ({
      ...prev,
      sizes: prev.sizes.filter((_: string, i: number) => i !== index)
    }))
  }

  const handleSizeChange = (index: number, value: string) => {
    setEditFormData((prev: any) => {
      const newSizes = [...prev.sizes]
      newSizes[index] = value
      return { ...prev, sizes: newSizes }
    })
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Product Catalog</h1>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-lg p-4 sm:p-6 mb-4 sm:mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                style={{ 
                  '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                  '--tw-border-color': vendorPrimaryColor || '#2563eb'
                } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                onFocus={(e) => {
                  e.target.style.borderColor = vendorPrimaryColor || '#2563eb'
                  e.target.style.boxShadow = `0 0 0 2px ${vendorPrimaryColor || '#2563eb'}40`
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = '#d1d5db'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>
            <select
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value as any)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
              style={{ 
                '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                '--tw-border-color': vendorPrimaryColor || '#2563eb'
              } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              onFocus={(e) => {
                e.target.style.borderColor = vendorPrimaryColor || '#2563eb'
                e.target.style.boxShadow = `0 0 0 2px ${vendorPrimaryColor || '#2563eb'}40`
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="all">All Genders</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="unisex">Unisex</option>
            </select>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
              style={{ 
                '--tw-ring-color': vendorPrimaryColor || '#2563eb',
                '--tw-border-color': vendorPrimaryColor || '#2563eb'
              } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
              onFocus={(e) => {
                e.target.style.borderColor = vendorPrimaryColor || '#2563eb'
                e.target.style.boxShadow = `0 0 0 2px ${vendorPrimaryColor || '#2563eb'}40`
              }}
              onBlur={(e) => {
                e.target.style.borderColor = '#d1d5db'
                e.target.style.boxShadow = 'none'
              }}
            >
              <option value="all">All Categories</option>
              <option value="shirt">Shirts</option>
              <option value="pant">Pants</option>
              <option value="shoe">Shoes</option>
              <option value="jacket">Jackets</option>
            </select>
          </div>
        </div>

        {/* Catalog Grid */}
        {loading ? (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading catalog...</p>
          </div>
        ) : filteredUniforms.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <p className="text-xl font-semibold text-gray-900 mb-2">No products found</p>
            <p className="text-gray-600 mb-4">
              {searchTerm || filterGender !== 'all' || filterCategory !== 'all'
                ? 'Try adjusting your filters'
                : 'No products are currently linked to your vendor. Contact your company admin to link products.'}
            </p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {filteredUniforms.map((uniform) => (
            <div key={uniform.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow">
              <div className="relative h-64 bg-white">
                <Image
                  src={getUniformImage(uniform.image, uniform.category, uniform.gender, uniform.name)}
                  alt={uniform.name}
                  fill
                  className="object-contain object-center"
                  priority={false}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  unoptimized={true}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement
                    target.src = '/images/uniforms/default.jpg'
                  }}
                />
              </div>
              <div className="p-4">
                <h3 className="font-bold text-gray-900 mb-1">{uniform.name}</h3>
                <p className="text-xs text-gray-500 mb-2 font-mono">SKU: {uniform.sku}</p>
                
                {/* View Size Chart Link */}
                {sizeCharts[uniform.id] && (
                  <button
                    onClick={() => {
                      setSizeChartModal({
                        isOpen: true,
                        imageUrl: sizeCharts[uniform.id].imageUrl,
                        productName: uniform.name,
                      })
                    }}
                    className="mb-2 text-xs text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors"
                  >
                    <Ruler className="h-3 w-3" />
                    <span>View Size Chart</span>
                  </button>
                )}
                
                {/* Display attributes only if they have values */}
                {((uniform as any).attribute1_value || (uniform as any).attribute2_value || (uniform as any).attribute3_value) && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {(uniform as any).attribute1_value && (
                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                        {(uniform as any).attribute1_name || 'Attr1'}: {(uniform as any).attribute1_value}
                      </span>
                    )}
                    {(uniform as any).attribute2_value && (
                      <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                        {(uniform as any).attribute2_name || 'Attr2'}: {(uniform as any).attribute2_value}
                      </span>
                    )}
                    {(uniform as any).attribute3_value && (
                      <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                        {(uniform as any).attribute3_name || 'Attr3'}: {(uniform as any).attribute3_value}
                      </span>
                    )}
                  </div>
                )}
                
                <div className="flex items-center justify-between mb-3">
                  <span className="text-lg font-bold text-gray-900">₹{uniform.price}</span>
                  {/* Inventory Summary */}
                  {inventoryData[uniform.id] && (
                    <div className="text-right">
                      <div className="text-xs text-gray-500">Total Stock</div>
                      <div className={`text-sm font-semibold ${
                        inventoryData[uniform.id].totalStock === 0 
                          ? 'text-red-600' 
                          : inventoryData[uniform.id].totalStock < 10 
                          ? 'text-orange-600' 
                          : 'text-green-600'
                      }`}>
                        {inventoryData[uniform.id].totalStock || 0}
                      </div>
                    </div>
                  )}
                </div>
                
                {/* Size-wise Inventory */}
                {inventoryData[uniform.id] && inventoryData[uniform.id].sizeInventory && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-600 mb-1.5">Stock by Size:</div>
                    <div className="flex flex-wrap gap-1.5">
                      {uniform.sizes.slice(0, 6).map((size: string) => {
                        const stock = inventoryData[uniform.id].sizeInventory[size] || 0
                        const threshold = inventoryData[uniform.id].lowInventoryThreshold?.[size] || 0
                        const isLowStock = threshold > 0 && stock <= threshold
                        const isOutOfStock = stock === 0
                        
                        return (
                          <span 
                            key={size} 
                            className={`px-2 py-1 text-xs rounded flex items-center gap-1 ${
                              isOutOfStock 
                                ? 'bg-red-100 text-red-700 border border-red-300' 
                                : isLowStock 
                                ? 'bg-orange-100 text-orange-700 border border-orange-300' 
                                : 'bg-green-50 text-green-700 border border-green-200'
                            }`}
                            title={`Size ${size}: ${stock} units${threshold > 0 ? ` (Threshold: ${threshold})` : ''}`}
                          >
                            <span className="font-medium">{size}:</span>
                            <span className="font-semibold">{stock}</span>
                          </span>
                        )
                      })}
                      {uniform.sizes.length > 6 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                          +{uniform.sizes.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Sizes (if no inventory data) */}
                {!inventoryData[uniform.id] && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {uniform.sizes.slice(0, 4).map((size: string) => (
                      <span key={size} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        {size}
                      </span>
                    ))}
                    {uniform.sizes.length > 4 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                        +{uniform.sizes.length - 4}
                      </span>
                    )}
                  </div>
                )}
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleEdit(uniform.id)}
                    className="flex-1 text-white py-2 rounded-lg font-semibold transition-colors text-sm flex items-center justify-center gap-1"
                    style={{ backgroundColor: vendorPrimaryColor || '#2563eb' }}
                    onMouseEnter={(e) => {
                      const color = vendorPrimaryColor || '#2563eb'
                      const r = parseInt(color.slice(1, 3), 16)
                      const g = parseInt(color.slice(3, 5), 16)
                      const b = parseInt(color.slice(5, 7), 16)
                      const darker = `#${Math.max(0, r - 25).toString(16).padStart(2, '0')}${Math.max(0, g - 25).toString(16).padStart(2, '0')}${Math.max(0, b - 25).toString(16).padStart(2, '0')}`
                      e.currentTarget.style.backgroundColor = darker
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = vendorPrimaryColor || '#2563eb'
                    }}
                  >
                    <Edit2 className="h-4 w-4" />
                    Edit
                  </button>
                  <button 
                    onClick={() => handleView(uniform.id)}
                    className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors text-sm flex items-center justify-center gap-1"
                  >
                    <Eye className="h-4 w-4" />
                    View
                  </button>
                </div>
              </div>
            </div>
          ))}
          </div>
        )}

        {/* View Modal - Same as company catalog */}
        {viewModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-none sm:rounded-xl shadow-2xl max-w-4xl w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] overflow-y-auto modal-mobile">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Product Details</h2>
                <button
                  onClick={handleCloseView}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {viewModal.product ? (
                <div className="p-4 sm:p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                    <div className="relative h-80 bg-white rounded-lg overflow-hidden">
                      <Image
                        src={getUniformImage(viewModal.product.image, viewModal.product.category, viewModal.product.gender, viewModal.product.name)}
                        alt={viewModal.product.name}
                        fill
                        className="object-contain object-center"
                        unoptimized={true}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = '/images/uniforms/default.jpg'
                        }}
                      />
                    </div>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="text-sm font-medium text-gray-500">Product Name</label>
                        <p className="text-lg font-bold text-gray-900 mt-1">{viewModal.product.name}</p>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">SKU</label>
                          <p className="text-sm font-mono text-gray-900 mt-1">{viewModal.product.sku}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Product ID</label>
                          <p className="text-sm font-mono text-gray-900 mt-1">{viewModal.product.id}</p>
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-gray-500">Category</label>
                          <p className="text-sm text-gray-900 mt-1 capitalize">{viewModal.product.category}</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-500">Gender</label>
                          <p className="text-sm text-gray-900 mt-1 capitalize">{viewModal.product.gender}</p>
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-500">Price</label>
                        <p className="text-xl font-bold text-gray-900 mt-1">₹{viewModal.product.price}</p>
                      </div>
                      
                      <div>
                        <label className="text-sm font-medium text-gray-500">Available Sizes</label>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {viewModal.product.sizes && viewModal.product.sizes.map((size: string) => (
                            <span key={size} className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded">
                              {size}
                            </span>
                          ))}
                        </div>
                      </div>
                      
                      {/* Inventory Details */}
                      {inventoryData[viewModal.product.id] && (
                        <div className="border-t pt-4 mt-4">
                          <label className="text-sm font-medium text-gray-500 mb-2 block">Inventory Details</label>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-gray-600">Total Stock:</span>
                              <span className={`text-sm font-semibold ${
                                inventoryData[viewModal.product.id].totalStock === 0 
                                  ? 'text-red-600' 
                                  : inventoryData[viewModal.product.id].totalStock < 10 
                                  ? 'text-orange-600' 
                                  : 'text-green-600'
                              }`}>
                                {inventoryData[viewModal.product.id].totalStock || 0} units
                              </span>
                            </div>
                            {inventoryData[viewModal.product.id].sizeInventory && (
                              <div>
                                <div className="text-xs font-medium text-gray-600 mb-2">Stock by Size:</div>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                  {viewModal.product.sizes && viewModal.product.sizes.map((size: string) => {
                                    const stock = inventoryData[viewModal.product.id].sizeInventory[size] || 0
                                    const threshold = inventoryData[viewModal.product.id].lowInventoryThreshold?.[size] || 0
                                    const isLowStock = threshold > 0 && stock <= threshold
                                    const isOutOfStock = stock === 0
                                    
                                    return (
                                      <div 
                                        key={size}
                                        className={`p-2 rounded border ${
                                          isOutOfStock 
                                            ? 'bg-red-50 border-red-200' 
                                            : isLowStock 
                                            ? 'bg-orange-50 border-orange-200' 
                                            : 'bg-green-50 border-green-200'
                                        }`}
                                      >
                                        <div className="text-xs font-medium text-gray-600">Size {size}</div>
                                        <div className={`text-sm font-semibold ${
                                          isOutOfStock ? 'text-red-600' : isLowStock ? 'text-orange-600' : 'text-green-600'
                                        }`}>
                                          {stock} units
                                        </div>
                                        {threshold > 0 && (
                                          <div className="text-xs text-gray-500 mt-0.5">
                                            Threshold: {threshold}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {((viewModal.product as any).attribute1_value || (viewModal.product as any).attribute2_value || (viewModal.product as any).attribute3_value) && (
                        <div>
                          <label className="text-sm font-medium text-gray-500 mb-2 block">Attributes</label>
                          <div className="space-y-2">
                            {(viewModal.product as any).attribute1_name && (viewModal.product as any).attribute1_value && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">{(viewModal.product as any).attribute1_name}:</span>
                                <span className="text-sm text-gray-900">{(viewModal.product as any).attribute1_value}</span>
                              </div>
                            )}
                            {(viewModal.product as any).attribute2_name && (viewModal.product as any).attribute2_value && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">{(viewModal.product as any).attribute2_name}:</span>
                                <span className="text-sm text-gray-900">{(viewModal.product as any).attribute2_value}</span>
                              </div>
                            )}
                            {(viewModal.product as any).attribute3_name && (viewModal.product as any).attribute3_value && (
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-600">{(viewModal.product as any).attribute3_name}:</span>
                                <span className="text-sm text-gray-900">{(viewModal.product as any).attribute3_value}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-4 text-gray-600">Loading product details...</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Edit Modal - Same structure as company catalog but without SKU/vendor editing */}
        {editModal.open && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-0 sm:p-4">
            <div className="bg-white rounded-none sm:rounded-xl shadow-2xl max-w-3xl w-full h-full sm:h-auto max-h-screen sm:max-h-[90vh] overflow-y-auto modal-mobile">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-900">Edit Product</h2>
                <button
                  onClick={handleCloseEdit}
                  disabled={editModal.saving}
                  className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              {editModal.loading ? (
                <div className="p-6 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400" />
                  <p className="mt-4 text-gray-600">Loading product...</p>
                </div>
              ) : editModal.product ? (
                <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                  {/* Read-only fields */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                      <input
                        type="text"
                        value={editModal.product.sku || ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">SKU cannot be changed</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                      <input
                        type="text"
                        value={editModal.product.id || ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-500 cursor-not-allowed"
                      />
                    </div>
                  </div>

                  {/* Editable fields */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Name *</label>
                    <input
                      type="text"
                      value={editFormData.name || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                      style={{ 
                        '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                      } as React.CSSProperties & { '--tw-ring-color'?: string }}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                      <select
                        value={editFormData.category || 'shirt'}
                        onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                        style={{ 
                          '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                        } as React.CSSProperties & { '--tw-ring-color'?: string }}
                        required
                      >
                        <option value="shirt">Shirt</option>
                        <option value="pant">Pant</option>
                        <option value="shoe">Shoe</option>
                        <option value="jacket">Jacket</option>
                        <option value="accessory">Accessory</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                      <select
                        value={editFormData.gender || 'male'}
                        onChange={(e) => setEditFormData({ ...editFormData, gender: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                        style={{ 
                          '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                        } as React.CSSProperties & { '--tw-ring-color'?: string }}
                        required
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="unisex">Unisex</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.price || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, price: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                      style={{ 
                        '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                      } as React.CSSProperties & { '--tw-ring-color'?: string }}
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sizes *</label>
                    <div className="space-y-2">
                      {editFormData.sizes && editFormData.sizes.map((size: string, index: number) => (
                        <div key={index} className="flex gap-2">
                          <input
                            type="text"
                            value={size}
                            onChange={(e) => handleSizeChange(index, e.target.value)}
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                            style={{ 
                              '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                            } as React.CSSProperties & { '--tw-ring-color'?: string }}
                            placeholder="Size (e.g., S, M, L, XL)"
                          />
                          {editFormData.sizes.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSize(index)}
                              className="px-3 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={handleAddSize}
                        className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                      >
                        + Add Size
                      </button>
                    </div>
                  </div>

                  {/* Attributes */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-gray-700">Attributes (Optional)</h3>
                    
                    {[1, 2, 3].map((num) => (
                      <div key={num} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Attribute {num} Name</label>
                          <input
                            type="text"
                            value={editFormData[`attribute${num}_name`] || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, [`attribute${num}_name`]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                            style={{ 
                              '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                            } as React.CSSProperties & { '--tw-ring-color'?: string }}
                            placeholder={`e.g., GSM, Fabric, Style`}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Attribute {num} Value</label>
                          <input
                            type="text"
                            value={editFormData[`attribute${num}_value`] || ''}
                            onChange={(e) => setEditFormData({ ...editFormData, [`attribute${num}_value`]: e.target.value })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent outline-none"
                            style={{ 
                              '--tw-ring-color': vendorPrimaryColor || '#2563eb'
                            } as React.CSSProperties & { '--tw-ring-color'?: string }}
                            placeholder={`e.g., 350, Cotton, Classic Fit`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <button
                      onClick={handleCloseEdit}
                      disabled={editModal.saving}
                      className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editModal.saving}
                      className="px-6 py-2 text-white rounded-lg font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
                      style={{ backgroundColor: vendorPrimaryColor || '#2563eb' }}
                    >
                      {editModal.saving ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Save Changes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Size Chart Modal */}
        <SizeChartModal
          isOpen={sizeChartModal.isOpen}
          imageUrl={sizeChartModal.imageUrl}
          productName={sizeChartModal.productName}
          onClose={() => setSizeChartModal({ isOpen: false, imageUrl: '', productName: '' })}
        />
      </div>
    </DashboardLayout>
  )
}

