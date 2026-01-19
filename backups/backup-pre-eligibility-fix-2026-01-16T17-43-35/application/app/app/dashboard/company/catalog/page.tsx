'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Search, Filter, Plus, X, Eye, Edit2, Save, Loader2, Ruler } from 'lucide-react'
import { 
  getProductsByCompany, 
  getAllCompanies, 
  getCompanyById, 
  getProductById, 
  updateProduct,
  getSubcategoriesByCompany,
  getProductSubcategoryMappings,
  createProductSubcategoryMapping,
  deleteProductSubcategoryMapping
} from '@/lib/data-mongodb'
import Image from 'next/image'
import { getUniformImage } from '@/lib/utils/image-mapping'
import SizeChartModal from '@/components/SizeChartModal'

export default function CatalogPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterGender, setFilterGender] = useState<'all' | 'male' | 'female' | 'unisex'>('all')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [uniforms, setUniforms] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  
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
  
  // Subcategory management state
  const [subcategories, setSubcategories] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [productMappings, setProductMappings] = useState<any[]>([])
  const [selectedSubcategories, setSelectedSubcategories] = useState<Set<string>>(new Set())
  const [subcategoryPrices, setSubcategoryPrices] = useState<Record<string, number>>({})
  
  // Get company ID from localStorage (set during login) or default to first company
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        let targetCompanyId = typeof window !== 'undefined' ? localStorage.getItem('companyId') : null
        
        // If companyId not in localStorage, try to get it from admin email
        if (!targetCompanyId && typeof window !== 'undefined') {
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('company')
          if (userEmail) {
            const { getCompanyByAdminEmail } = await import('@/lib/data-mongodb')
            const company = await getCompanyByAdminEmail(userEmail)
            if (company && company.id) {
              targetCompanyId = String(company.id)
              localStorage.setItem('companyId', targetCompanyId)
            }
          }
        }
        
        if (targetCompanyId) {
          setSelectedCompanyId(targetCompanyId)
          console.log(`[CatalogPage] Fetching products for companyId: ${targetCompanyId}`)
          const products = await getProductsByCompany(targetCompanyId)
          console.log(`[CatalogPage] Loaded ${products.length} products for company ${targetCompanyId}`)
          console.log(`[CatalogPage] Products:`, products.slice(0, 3).map(p => ({ id: p.id, name: p.name, sku: p.sku })))
          if (products.length === 0) {
            console.warn(`[CatalogPage] No products found for company ${targetCompanyId}. This might mean:`)
            console.warn(`  - No ProductCompany relationships exist for this company`)
            console.warn(`  - Products exist but are not linked to the company`)
            console.warn(`  - Check server logs for getProductsByCompany details`)
          }
          setUniforms(products)
          
          // Fetch size charts for all products
          if (products.length > 0) {
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
          
          // Fetch company colors
          const companyDetails = await getCompanyById(targetCompanyId)
          if (companyDetails) {
            setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
          }
        } else {
          // Default to first company for demo (fallback)
          const companies = await getAllCompanies()
          if (companies.length > 0) {
            const fallbackCompanyId = companies[0].id
            setSelectedCompanyId(fallbackCompanyId)
            const products = await getProductsByCompany(fallbackCompanyId)
            console.log(`[CatalogPage] Using fallback company ${fallbackCompanyId}, loaded ${products.length} products`)
            setUniforms(products)
            
            // Fetch company colors
            const companyDetails = await getCompanyById(fallbackCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            }
          } else {
            console.error('[CatalogPage] No companies found and no companyId in localStorage')
          }
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
  
  useEffect(() => {
    const loadProducts = async () => {
      if (selectedCompanyId) {
        try {
          setLoading(true)
          const products = await getProductsByCompany(selectedCompanyId)
          setUniforms(products)
        } catch (error) {
          console.error('Error loading products:', error)
        } finally {
          setLoading(false)
        }
      }
    }
    
    loadProducts()
  }, [selectedCompanyId])

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
      
      // Initialize form data with product values (read-only fields)
      // Note: Subcategory mappings are no longer loaded since they're not shown in the edit modal
      setEditFormData({
        name: product.name || '',
        category: product.category || 'shirt',
        gender: product.gender || 'male',
        sizes: product.sizes ? [...product.sizes] : [],
        price: product.price || 0,
        // Attributes are read-only for Company Admin
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
    setSubcategories([])
    setProductMappings([])
    setSelectedSubcategories(new Set())
    setSubcategoryPrices({})
  }

  const handleSaveEdit = async () => {
    if (!editModal.product) return

    try {
      setEditModal(prev => ({ ...prev, saving: true }))
      
      const companyId = selectedCompanyId || (typeof window !== 'undefined' ? localStorage.getItem('companyId') : null)
      if (!companyId) {
        alert('Company ID not found')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }

      // Company Admin can only update: price
      // Name, category, gender, sizes, attributes are read-only
      const updateData: any = {
        price: editFormData.price || editModal.product.price,
      }

      // Validate price
      if (!updateData.price || updateData.price <= 0) {
        alert('Price must be greater than 0')
        setEditModal(prev => ({ ...prev, saving: false }))
        return
      }

      // Update product (only price field)
      await updateProduct(editModal.product.id, updateData)
      
      // Note: Subcategory mappings are no longer updated here since company admin can only edit price
      
      // Refresh the catalog
      if (selectedCompanyId) {
        const products = await getProductsByCompany(selectedCompanyId)
        setUniforms(products)
      }
      
      alert('Product updated successfully!')
      handleCloseEdit()
    } catch (error: any) {
      console.error('Error updating product:', error)
      alert(`Error updating product: ${error.message || 'Unknown error'}`)
      setEditModal(prev => ({ ...prev, saving: false }))
    }
  }
  
  const handleSubcategoryToggle = (subCategoryId: string) => {
    const newSelected = new Set(selectedSubcategories)
    if (newSelected.has(subCategoryId)) {
      newSelected.delete(subCategoryId)
      // Remove price when unselected
      const newPrices = { ...subcategoryPrices }
      delete newPrices[subCategoryId]
      setSubcategoryPrices(newPrices)
    } else {
      newSelected.add(subCategoryId)
      // Set default price when selected
      if (!subcategoryPrices[subCategoryId] && editModal.product) {
        setSubcategoryPrices({ ...subcategoryPrices, [subCategoryId]: editModal.product.price })
      }
    }
    setSelectedSubcategories(newSelected)
  }
  
  const handleSubcategoryPriceChange = (subCategoryId: string, price: number) => {
    setSubcategoryPrices({ ...subcategoryPrices, [subCategoryId]: price })
  }
  
  // Group subcategories by parent category
  const getSubcategoriesByCategory = () => {
    const grouped: Record<string, any[]> = {}
    subcategories.forEach((sub) => {
      const categoryId = sub.parentCategory?.id || sub.parentCategoryId
      if (!grouped[categoryId]) {
        grouped[categoryId] = []
      }
      grouped[categoryId].push(sub)
    })
    return grouped
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
    <DashboardLayout actorType="company">
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Uniform Catalog</h1>
          <button 
            className="text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
            style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            onMouseEnter={(e) => {
              const color = companyPrimaryColor || '#f76b1c'
              const r = parseInt(color.slice(1, 3), 16)
              const g = parseInt(color.slice(3, 5), 16)
              const b = parseInt(color.slice(5, 7), 16)
              const darker = `#${Math.max(0, r - 25).toString(16).padStart(2, '0')}${Math.max(0, g - 25).toString(16).padStart(2, '0')}${Math.max(0, b - 25).toString(16).padStart(2, '0')}`
              e.currentTarget.style.backgroundColor = darker
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = companyPrimaryColor || '#f76b1c'
            }}
          >
            <Plus className="h-5 w-5" />
            <span>Add SKU</span>
          </button>
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
              value={filterGender}
              onChange={(e) => setFilterGender(e.target.value as any)}
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
                : 'No products are currently linked to this company. Products need to be linked via ProductCompany relationships.'}
            </p>
            {!searchTerm && filterGender === 'all' && filterCategory === 'all' && (
              <div className="text-sm text-gray-500 mt-4">
                <p>To add products to this catalog:</p>
                <p>1. Ensure products exist in the database</p>
                <p>2. Create ProductCompany relationships linking products to this company</p>
                <p>3. Check server console logs for detailed debugging information</p>
              </div>
            )}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {filteredUniforms.map((uniform) => (
            <div key={uniform.id} className="bg-white rounded-xl shadow-lg overflow-hidden hover:shadow-2xl transition-shadow">
              <div className="relative h-64 bg-white overflow-hidden">
                <Image
                  src={getUniformImage(uniform.image, uniform.category, uniform.gender, uniform.name)}
                  alt={uniform.name}
                  fill
                  className="object-contain object-center transition-transform duration-300 hover:scale-[1.75]"
                  priority={false}
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  unoptimized={true}
                  onError={(e) => {
                    // Fallback to a placeholder or default image if the image fails to load
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
                
                {/* Display vendor name(s) - subtle, non-intrusive
                    Vendor data is already available in product.vendors array from getProductsByCompany()
                    No additional API calls or data fetching required */}
                {uniform.vendors && Array.isArray(uniform.vendors) && uniform.vendors.length > 0 && (
                  <p className="text-xs text-gray-400 mb-2">
                    <span className="font-medium text-gray-500">Vendor{uniform.vendors.length > 1 ? 's' : ''}:</span>{' '}
                    <span className="text-gray-600">{uniform.vendors.map((v: any) => v.name || 'Unknown').join(', ')}</span>
                  </p>
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
                  {/* Stock information should come from VendorInventory, not from product */}
                </div>
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
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handleEdit(uniform.id)}
                    className="flex-1 text-white py-2 rounded-lg font-semibold transition-colors text-sm flex items-center justify-center gap-1"
                    style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                    onMouseEnter={(e) => {
                      const color = companyPrimaryColor || '#f76b1c'
                      const r = parseInt(color.slice(1, 3), 16)
                      const g = parseInt(color.slice(3, 5), 16)
                      const b = parseInt(color.slice(5, 7), 16)
                      const darker = `#${Math.max(0, r - 25).toString(16).padStart(2, '0')}${Math.max(0, g - 25).toString(16).padStart(2, '0')}${Math.max(0, b - 25).toString(16).padStart(2, '0')}`
                      e.currentTarget.style.backgroundColor = darker
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = companyPrimaryColor || '#f76b1c'
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

        {/* View Modal */}
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
                    {/* Product Image */}
                    <div className="relative h-80 bg-white rounded-lg overflow-hidden">
                      <Image
                        src={getUniformImage(viewModal.product.image, viewModal.product.category, viewModal.product.gender, viewModal.product.name)}
                        alt={viewModal.product.name}
                        fill
                        className="object-contain object-center transition-transform duration-300 hover:scale-[1.75]"
                        unoptimized={true}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement
                          target.src = '/images/uniforms/default.jpg'
                        }}
                      />
                    </div>
                    
                    {/* Product Details */}
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
                      
                      {viewModal.product.vendors && Array.isArray(viewModal.product.vendors) && viewModal.product.vendors.length > 0 && (
                        <div>
                          <label className="text-sm font-medium text-gray-500">Vendor{viewModal.product.vendors.length > 1 ? 's' : ''}</label>
                          <p className="text-sm text-gray-900 mt-1">
                            {viewModal.product.vendors.map((v: any) => v.name || 'Unknown').join(', ')}
                          </p>
                        </div>
                      )}
                      
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
                      
                      {/* Attributes */}
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

        {/* Edit Modal */}
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
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product ID</label>
                      <input
                        type="text"
                        value={editModal.product.id || ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  
                  {editModal.product.vendors && Array.isArray(editModal.product.vendors) && editModal.product.vendors.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor{editModal.product.vendors.length > 1 ? 's' : ''}</label>
                      <input
                        type="text"
                        value={editModal.product.vendors.map((v: any) => v.name || 'Unknown').join(', ')}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      />
                    </div>
                  )}
                  
                  {/* Read-only fields (Company Admin cannot edit) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                    <input
                      type="text"
                      value={editFormData.name || ''}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-500 mt-1">Read-only: Contact vendor to change product name</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <input
                        type="text"
                        value={editFormData.category ? editFormData.category.charAt(0).toUpperCase() + editFormData.category.slice(1) : ''}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      />
                      <p className="text-xs text-gray-500 mt-1">Read-only: Category cannot be changed</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                      <select
                        value={editFormData.gender || 'male'}
                        disabled
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      >
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="unisex">Unisex</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">Read-only: Gender cannot be changed</p>
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹) <span className="text-red-500">*</span></label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editFormData.price || 0}
                      onChange={(e) => setEditFormData({ ...editFormData, price: parseFloat(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:outline-none"
                      style={{ '--tw-ring-color': companyPrimaryColor || '#f76b1c' } as React.CSSProperties & { '--tw-ring-color'?: string }}
                      required
                    />
                  </div>
                  
                  
                  {/* Action buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                    <button
                      onClick={handleCloseEdit}
                      disabled={editModal.saving}
                      className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveEdit}
                      disabled={editModal.saving}
                      className="px-6 py-2 rounded-lg text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                      style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
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
      </div>
      {/* Size Chart Modal */}
      <SizeChartModal
        isOpen={sizeChartModal.isOpen}
        onClose={() => setSizeChartModal({ isOpen: false, imageUrl: '', productName: '' })}
        imageUrl={sizeChartModal.imageUrl}
        productName={sizeChartModal.productName}
      />
    </DashboardLayout>
  )
}








