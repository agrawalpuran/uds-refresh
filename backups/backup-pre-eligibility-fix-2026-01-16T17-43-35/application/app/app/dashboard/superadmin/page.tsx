'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  Package, Users, Building2, ShoppingBag, Link2, 
  Plus, Edit, Trash2, Search, Save, ChevronDown, ChevronUp
} from 'lucide-react'
import { 
  getAllProducts, getAllVendors, getAllCompanies, getAllEmployees,
  getProductCompanies, getProductVendors,
  createProductCompany, createProductCompanyBatch, createProductVendor, createProductVendorBatch,
  deleteProductCompany, deleteProductVendor,
  addCompanyAdmin, removeCompanyAdmin, updateCompanyAdminPrivileges, getCompanyAdmins,
  createProduct, updateProduct, deleteProduct,
  createVendor, updateVendor, createCompany,
  Uniform, Vendor, Company, Employee, ProductCompany, ProductVendor
} from '@/lib/data-mongodb'
import { maskEmployeeData, maskEmail } from '@/lib/utils/data-masking'

export default function SuperAdminPage() {
  const [activeTab, setActiveTab] = useState<'products' | 'vendors' | 'companies' | 'employees' | 'relationships'>('products')
  const [relationshipSubTab, setRelationshipSubTab] = useState<'productToCompany' | 'productToVendor'>('productToCompany')
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedVendorSections, setExpandedVendorSections] = useState<Set<string>>(new Set())
  const [expandedCompanySections, setExpandedCompanySections] = useState<Set<string>>(new Set())
  
  // Data states
  const [products, setProducts] = useState<Uniform[]>([])
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [productCompanies, setProductCompanies] = useState<ProductCompany[]>([])
  const [productVendors, setProductVendors] = useState<ProductVendor[]>([])
  const [vendorCompanies, setVendorCompanies] = useState<Array<{ vendorId: string, companyId: string }>>([])
  const [loading, setLoading] = useState(true)
  
  // Load all data from MongoDB on mount
  useEffect(() => {
    const loadAllData = async () => {
      try {
        setLoading(true)
        const [productsData, vendorsData, companiesData, employeesData, pcData, pvData] = await Promise.all([
          getAllProducts(),
          getAllVendors(),
          getAllCompanies(),
          getAllEmployees(),
          getProductCompanies(),
          getProductVendors()
        ])
        
        setProducts(productsData)
        setVendors(vendorsData)
        setCompanies(companiesData)
        setEmployees(employeesData)
        setProductCompanies(pcData)
        setProductVendors(pvData)
        setVendorCompanies([])
        
        // Load admins for each company
        const adminsMap: Record<string, any[]> = {}
        for (const company of companiesData) {
          try {
            const admins = await getCompanyAdmins(company.id)
            adminsMap[company.id] = admins
            console.log(`Loaded ${admins.length} admins for ${company.id}:`, admins.map((a: any) => a.employee?.employeeId || a.employeeId))
          } catch (error) {
            console.error(`Error loading admins for company ${company.id}:`, error)
            adminsMap[company.id] = []
          }
        }
        console.log('Setting companyAdmins state:', adminsMap)
        setCompanyAdmins(adminsMap)
        
        // Load shipping integration status
        try {
          const shippingConfigResponse = await fetch('/api/superadmin/shipping-config')
          if (shippingConfigResponse.ok) {
            const shippingConfig = await shippingConfigResponse.json()
            setShippingIntegrationEnabled(shippingConfig.shippingIntegrationEnabled || false)
          }
        } catch (error) {
          console.error('Error loading shipping config:', error)
        }
        
        console.log('✅ Loaded data:', {
          products: productsData.length,
          vendors: vendorsData.length,
          companies: companiesData.length,
          employees: employeesData.length
        })
      } catch (error) {
        console.error('❌ Error loading data:', error)
        alert('Error loading data. Please check the console for details.')
      } finally {
        setLoading(false)
      }
    }
    
    loadAllData()
  }, [])
  
  // Refresh admins when Companies tab is opened
  useEffect(() => {
    if (activeTab === 'companies' && companies.length > 0) {
      const refreshAdmins = async () => {
        const adminsMap: Record<string, any[]> = {}
        for (const company of companies) {
          try {
            const admins = await getCompanyAdmins(company.id)
            adminsMap[company.id] = admins
            console.log(`[Refresh] Loaded ${admins.length} admins for ${company.id}`)
          } catch (error) {
            console.error(`Error refreshing admins for company ${company.id}:`, error)
            adminsMap[company.id] = []
          }
        }
        setCompanyAdmins(adminsMap)
      }
      refreshAdmins()
    }
  }, [activeTab, companies])
  
  // Form states
  const [editingProduct, setEditingProduct] = useState<Uniform | null>(null)
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null)
  const [editingCompany, setEditingCompany] = useState<Company | null>(null)
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([])
  
  // Warehouse management state
  const [vendorWarehouses, setVendorWarehouses] = useState<any[]>([])
  const [editingWarehouse, setEditingWarehouse] = useState<any | null>(null)
  const [loadingWarehouses, setLoadingWarehouses] = useState(false)
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [selectedVendorId, setSelectedVendorId] = useState<string>('')
  const [assigningAdminForCompany, setAssigningAdminForCompany] = useState<string | null>(null)
  const [selectedEmployeeIdForAdmin, setSelectedEmployeeIdForAdmin] = useState<string>('')
  
  // Initialize workflow checkbox disabled state when editing company changes
  useEffect(() => {
    if (editingCompany) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        const workflowCheckbox = document.querySelector<HTMLInputElement>('input[name="enable_pr_po_workflow"]')
        if (workflowCheckbox) {
          const workflowEnabled = workflowCheckbox.checked || editingCompany.enable_pr_po_workflow || false
          const otherCheckboxes = document.querySelectorAll<HTMLInputElement>(
            'input[name="enable_site_admin_pr_approval"], input[name="require_company_admin_po_approval"], input[name="allow_multi_pr_po"]'
          )
          otherCheckboxes.forEach(cb => {
            cb.disabled = !workflowEnabled
          })
        }
      }, 100)
    }
  }, [editingCompany])
  const [adminSearchTerm, setAdminSearchTerm] = useState<string>('')
  const [canApproveOrders, setCanApproveOrders] = useState<boolean>(false)
  const [companyAdmins, setCompanyAdmins] = useState<Record<string, any[]>>({})
  const [shippingIntegrationEnabled, setShippingIntegrationEnabled] = useState<boolean>(false)
  const [updatingShippingMode, setUpdatingShippingMode] = useState<string | null>(null)

  const tabs = [
    { id: 'products', name: 'Products', icon: Package },
    { id: 'vendors', name: 'Vendors', icon: ShoppingBag },
    { id: 'companies', name: 'Companies', icon: Building2 },
    { id: 'employees', name: 'Employees', icon: Users },
    { id: 'relationships', name: 'Relationships', icon: Link2 },
  ]

  const filteredProducts = products.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const filteredEmployees = employees.filter(e =>
    `${e.firstName} ${e.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.employeeId && e.employeeId.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const handleSaveProduct = async (product: Partial<Uniform>) => {
    try {
      if (editingProduct && editingProduct.id) {
        // Update existing product
        const updated = await updateProduct(editingProduct.id, {
          name: product.name,
          category: product.category,
          gender: product.gender,
          sizes: product.sizes,
          price: product.price,
          image: product.image,
          sku: product.sku,
          // Include optional attributes
          attribute1_name: (product as any).attribute1_name,
          attribute1_value: (product as any).attribute1_value,
          attribute2_name: (product as any).attribute2_name,
          attribute2_value: (product as any).attribute2_value,
          attribute3_name: (product as any).attribute3_name,
          attribute3_value: (product as any).attribute3_value,
        })
        
        // Reload products list
        const updatedProducts = await getAllProducts()
        setProducts(updatedProducts)
        alert('Product updated successfully!')
      } else {
        // Create new product (vendor can be linked later via relationships)
        const newProduct = await createProduct({
          name: product.name || '',
          category: (product.category as any) || 'shirt',
          gender: (product.gender as any) || 'unisex',
          sizes: product.sizes || [],
          price: product.price || 0,
          image: product.image || '',
          sku: product.sku || '',
          // Include optional attributes
          attribute1_name: (product as any).attribute1_name,
          attribute1_value: (product as any).attribute1_value,
          attribute2_name: (product as any).attribute2_name,
          attribute2_value: (product as any).attribute2_value,
          attribute3_name: (product as any).attribute3_name,
          attribute3_value: (product as any).attribute3_value,
        })
        
        // Reload products list
        const updatedProducts = await getAllProducts()
        setProducts(updatedProducts)
        alert('Product created successfully!')
      }
      setEditingProduct(null)
    } catch (error: any) {
      console.error('Error saving product:', error)
      alert(`Error saving product: ${error.message || 'Unknown error occurred'}`)
    }
  }

  // Load warehouses for a vendor
  const loadVendorWarehouses = async (vendorId: string) => {
    try {
      setLoadingWarehouses(true)
      const response = await fetch(`/api/superadmin/vendor-warehouses?vendorId=${vendorId}`)
      if (response.ok) {
        const data = await response.json()
        setVendorWarehouses(Array.isArray(data.warehouses) ? data.warehouses : [])
      } else {
        setVendorWarehouses([])
      }
    } catch (error) {
      console.error('Error loading warehouses:', error)
      setVendorWarehouses([])
    } finally {
      setLoadingWarehouses(false)
    }
  }

  // Load warehouses when editing a vendor
  useEffect(() => {
    if (editingVendor?.id) {
      loadVendorWarehouses(editingVendor.id)
    } else {
      setVendorWarehouses([])
    }
  }, [editingVendor?.id])

  const handleSaveVendor = async (vendor: Partial<Vendor>) => {
    try {
      if (editingVendor && editingVendor.id) {
        // Update existing vendor
        await updateVendor(editingVendor.id, {
          name: vendor.name,
          email: vendor.email,
          phone: vendor.phone,
          logo: vendor.logo,
          website: vendor.website,
          primaryColor: vendor.primaryColor,
          secondaryColor: vendor.secondaryColor,
          accentColor: vendor.accentColor,
          theme: vendor.theme as 'light' | 'dark' | 'custom'
        })
        // Reload vendors list
        const updatedVendors = await getAllVendors()
        setVendors(updatedVendors)
        alert('Vendor updated successfully!')
      } else {
        // Create new vendor with 6-digit numeric ID
        const newVendor = await createVendor({
          name: vendor.name || '',
          email: vendor.email || '',
          phone: vendor.phone || '',
          logo: vendor.logo || '',
          website: vendor.website || '',
          primaryColor: vendor.primaryColor || '#2563eb',
          secondaryColor: vendor.secondaryColor || '#1e40af',
          accentColor: vendor.accentColor || '#3b82f6',
          theme: (vendor.theme as 'light' | 'dark' | 'custom') || 'light'
        })
        // Reload vendors list
        const updatedVendors = await getAllVendors()
        setVendors(updatedVendors)
        alert('Vendor created successfully!')
      }
      setEditingVendor(null)
    } catch (error: any) {
      console.error('Error saving vendor:', error)
      alert(`Error saving vendor: ${error.message || 'Unknown error occurred'}`)
    }
  }

  const handleSaveCompany = async (company: Partial<Company>) => {
    try {
      if (editingCompany && editingCompany.id) {
        // Update existing company using updateCompanySettings API
        const { updateCompanySettings } = await import('@/lib/data-mongodb')
        await updateCompanySettings(editingCompany.id, {
          name: company.name,
          logo: company.logo,
          website: company.website,
          primaryColor: company.primaryColor,
          secondaryColor: company.secondaryColor,
          showPrices: company.showPrices,
          allowPersonalPayments: company.allowPersonalPayments,
          // PR → PO Workflow Configuration
          enable_pr_po_workflow: company.enable_pr_po_workflow,
          enable_site_admin_pr_approval: company.enable_site_admin_pr_approval,
          require_company_admin_po_approval: company.require_company_admin_po_approval,
          allow_multi_pr_po: company.allow_multi_pr_po,
          // Shipping Configuration
          shipmentRequestMode: (company as any).shipmentRequestMode,
        })
        // Reload companies list
        const updatedCompanies = await getAllCompanies()
        setCompanies(updatedCompanies)
        alert('Company updated successfully!')
      } else {
        // Create new company with 6-digit numeric ID
        console.log('Creating new company with data:', {
          name: company.name || '',
          logo: company.logo || '',
          website: company.website || '',
          primaryColor: company.primaryColor || '#000000',
          secondaryColor: company.secondaryColor,
          showPrices: company.showPrices || false,
          allowPersonalPayments: company.allowPersonalPayments || false,
          enable_pr_po_workflow: company.enable_pr_po_workflow || false,
          enable_site_admin_pr_approval: company.enable_site_admin_pr_approval !== undefined ? company.enable_site_admin_pr_approval : true,
          require_company_admin_po_approval: company.require_company_admin_po_approval !== undefined ? company.require_company_admin_po_approval : true,
          allow_multi_pr_po: company.allow_multi_pr_po !== undefined ? company.allow_multi_pr_po : true,
        })
        const newCompany = await createCompany({
          name: company.name || '',
          logo: company.logo || '',
          website: company.website || '',
          primaryColor: company.primaryColor || '#000000',
          secondaryColor: company.secondaryColor,
          showPrices: company.showPrices || false,
          allowPersonalPayments: company.allowPersonalPayments || false,
        })
        // After creation, update workflow and shipping settings if provided
        if (newCompany && (company.enable_pr_po_workflow !== undefined || company.enable_site_admin_pr_approval !== undefined || company.require_company_admin_po_approval !== undefined || company.allow_multi_pr_po !== undefined || (company as any).shipmentRequestMode !== undefined)) {
          const { updateCompanySettings } = await import('@/lib/data-mongodb')
          await updateCompanySettings(newCompany.id, {
            enable_pr_po_workflow: company.enable_pr_po_workflow,
            enable_site_admin_pr_approval: company.enable_site_admin_pr_approval,
            require_company_admin_po_approval: company.require_company_admin_po_approval,
            allow_multi_pr_po: company.allow_multi_pr_po,
            shipmentRequestMode: (company as any).shipmentRequestMode,
          })
        }
        console.log('Company created:', newCompany)
        // Reload companies list
        const updatedCompanies = await getAllCompanies()
        console.log('Updated companies list:', updatedCompanies.length)
        setCompanies(updatedCompanies)
        alert('Company created successfully!')
      }
      setEditingCompany(null)
    } catch (error: any) {
      console.error('Error saving company:', error)
      alert(`Error saving company: ${error.message || 'Unknown error occurred'}`)
    }
  }

  const handleLinkProductToCompanies = async () => {
    if (selectedProductIds.length === 0 || !selectedCompanyId) {
      alert('Please select at least one product and a company')
      return
    }
    
    try {
      const result = await createProductCompanyBatch(selectedProductIds, selectedCompanyId)
      
      // Reload relationships
      const updated = await getProductCompanies()
      setProductCompanies(updated)
      
      const productNames = selectedProductIds.map(id => products.find(p => p.id === id)?.name || id).join(', ')
      const companyName = companies.find(c => c.id === selectedCompanyId)?.name || selectedCompanyId
      
      if (result.failed.length > 0) {
        const failedMessages = result.failed.map(f => `\n- ${products.find(p => p.id === f.productId)?.name || f.productId}: ${f.error}`).join('')
        alert(`⚠️ Partial success:\n✅ ${result.success.length} product(s) linked\n❌ ${result.failed.length} failed:${failedMessages}`)
      } else {
        alert(`✅ ${result.success.length} product(s) linked to company "${companyName}" successfully!`)
      }
      
      setSelectedProductIds([])
      setSelectedCompanyId('')
    } catch (error: any) {
      console.error('Error linking products to company:', error)
      alert(`Error saving relationship: ${error?.message || 'Unknown error'}. Please check the console for details.`)
    }
  }

  const handleLinkProductToVendor = async () => {
    if (selectedProductIds.length === 0 || !selectedVendorId) {
      alert('Please select at least one product and a vendor')
      return
    }
    
    try {
      const result = await createProductVendorBatch(selectedProductIds, selectedVendorId)
      
      // Reload relationships
      const updated = await getProductVendors()
      setProductVendors(updated)
      
      const vendorName = vendors.find(v => v.id === selectedVendorId)?.name || selectedVendorId
      
      if (result.failed.length > 0) {
        const failedMessages = result.failed.map(f => `\n- ${products.find(p => p.id === f.productId)?.name || f.productId}: ${f.error}`).join('')
        alert(`⚠️ Partial success:\n✅ ${result.success.length} product(s) linked\n❌ ${result.failed.length} failed:${failedMessages}`)
      } else {
        alert(`✅ ${result.success.length} product(s) linked to vendor "${vendorName}" successfully!`)
      }
      
      setSelectedProductIds([])
      setSelectedVendorId('')
    } catch (error: any) {
      console.error('Error linking products to vendor:', error)
      alert(`Error saving relationship: ${error?.message || 'Unknown error'}. Please check the console for details.`)
    }
  }


  return (
    <DashboardLayout actorType="superadmin">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Welcome Superadmin</h1>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            {tabs.map((tab) => {
              const Icon = tab.icon
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center space-x-2 px-6 py-4 font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'border-b-2 border-blue-600 text-blue-600'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span>{tab.name}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <p className="text-gray-600">Loading data...</p>
          </div>
        )}

        {/* Search */}
        {!loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder={`Search ${activeTab}...`}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              />
            </div>
          </div>
        )}

        {/* Products Tab */}
        {activeTab === 'products' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Products</h2>
              <button
                onClick={() => setEditingProduct({} as Uniform)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Add Product</span>
              </button>
            </div>
            
            {/* Products grouped by Vendor */}
            {(() => {
              // Group filtered products by vendor
              const vendorProductMap = new Map<string, Uniform[]>()
              const unassignedProducts: Uniform[] = []
              
              filteredProducts.forEach((product) => {
                // Find vendor for this product via productVendors relationship
                const productVendor = productVendors.find(pv => pv.productId === product.id)
                
                if (productVendor) {
                  const vendorId = productVendor.vendorId
                  if (!vendorProductMap.has(vendorId)) {
                    vendorProductMap.set(vendorId, [])
                  }
                  vendorProductMap.get(vendorId)!.push(product)
                } else {
                  // Product not linked to any vendor
                  unassignedProducts.push(product)
                }
              })
              
              // Sort vendors by name for consistent display
              const sortedVendorIds = Array.from(vendorProductMap.keys()).sort((a, b) => {
                const vendorA = vendors.find(v => v.id === a)?.name || a
                const vendorB = vendors.find(v => v.id === b)?.name || b
                return vendorA.localeCompare(vendorB)
              })
              
              return (
                <div className="space-y-4">
                  {/* Vendor sections */}
                  {sortedVendorIds.map((vendorId) => {
                    const vendor = vendors.find(v => v.id === vendorId)
                    const vendorName = vendor?.name || vendorId
                    const vendorProducts = vendorProductMap.get(vendorId) || []
                    const isExpanded = expandedVendorSections.has(vendorId)
                    
                    return (
                      <div key={vendorId} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        {/* Vendor Header - Collapsible */}
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedVendorSections)
                            if (isExpanded) {
                              newExpanded.delete(vendorId)
                            } else {
                              newExpanded.add(vendorId)
                            }
                            setExpandedVendorSections(newExpanded)
                          }}
                          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-gray-600" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-600" />
                            )}
                            <h3 className="text-lg font-semibold text-gray-900">
                              {vendorName}
                            </h3>
                            <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded-full">
                              {vendorProducts.length} {vendorProducts.length === 1 ? 'product' : 'products'}
                            </span>
                          </div>
                        </button>
                        
                        {/* Products Grid - Collapsible */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50 p-4">
                            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                              {vendorProducts.map((product) => (
                                <div key={product.id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                                  <div className="flex gap-3 mb-2">
                                    {/* Product Image */}
                                    <div className="flex-shrink-0">
                                      {product.image ? (
                                        <div className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-gray-50">
                                          <Image
                                            src={product.image}
                                            alt={product.name}
                                            fill
                                            className="object-cover"
                                            sizes="64px"
                                          />
                                        </div>
                                      ) : (
                                        <div className="w-16 h-16 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                                          <Package className="h-6 w-6 text-gray-400" />
                                        </div>
                                      )}
                                    </div>
                                    {/* Product Info */}
                                    <div className="flex-1 min-w-0">
                                      <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h4>
                                      <div className="flex items-center gap-2">
                                        <p className="text-sm text-gray-600">SKU: <span className="font-mono text-xs">{product.sku}</span></p>
                                        {product.sizes && product.sizes.length > 0 && (
                                          <span className="text-xs text-gray-500">• {product.sizes[0]}{product.sizes.length > 1 ? ` +${product.sizes.length - 1}` : ''}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  {/* Display attributes only if they have values */}
                                  {((product as any).attribute1_value || (product as any).attribute2_value || (product as any).attribute3_value) && (
                                    <div className="flex flex-wrap gap-1.5 mb-2">
                                      {(product as any).attribute1_value && (
                                        <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                          {(product as any).attribute1_name || 'Attr1'}: {(product as any).attribute1_value}
                                        </span>
                                      )}
                                      {(product as any).attribute2_value && (
                                        <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                                          {(product as any).attribute2_name || 'Attr2'}: {(product as any).attribute2_value}
                                        </span>
                                      )}
                                      {(product as any).attribute3_value && (
                                        <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                                          {(product as any).attribute3_name || 'Attr3'}: {(product as any).attribute3_value}
                                        </span>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-sm text-gray-600 mb-2">
                                    Gender: <span className="font-semibold capitalize">{product.gender || 'unisex'}</span>
                                  </p>
                                  <p className="text-sm text-gray-600 mb-2">Price: ₹{product.price}</p>
                                  <p className="text-sm text-gray-600 mb-2">
                                    Companies: {product.companyIds.length}
                                  </p>
                                  <div className="flex space-x-2 mt-4">
                                    <button
                                      onClick={() => setEditingProduct(product)}
                                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={async () => {
                                        if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
                                          try {
                                            await deleteProduct(product.id)
                                            // Reload products list
                                            const updatedProducts = await getAllProducts()
                                            setProducts(updatedProducts)
                                            alert('Product deleted successfully!')
                                          } catch (error: any) {
                                            console.error('Error deleting product:', error)
                                            alert(`Error deleting product: ${error.message || 'Unknown error occurred'}`)
                                          }
                                        }
                                      }}
                                      className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {/* Unassigned Products Section */}
                  {unassignedProducts.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedVendorSections)
                          const unassignedKey = '__unassigned__'
                          if (expandedVendorSections.has(unassignedKey)) {
                            newExpanded.delete(unassignedKey)
                          } else {
                            newExpanded.add(unassignedKey)
                          }
                          setExpandedVendorSections(newExpanded)
                        }}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {expandedVendorSections.has('__unassigned__') ? (
                            <ChevronUp className="h-5 w-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-600" />
                          )}
                          <h3 className="text-lg font-semibold text-gray-900">
                            Unassigned Products
                          </h3>
                          <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded-full">
                            {unassignedProducts.length} {unassignedProducts.length === 1 ? 'product' : 'products'}
                          </span>
                        </div>
                      </button>
                      
                      {expandedVendorSections.has('__unassigned__') && (
                        <div className="border-t border-gray-200 bg-gray-50 p-4">
                          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {unassignedProducts.map((product) => (
                              <div key={product.id} className="border border-gray-200 rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                                <div className="flex gap-3 mb-2">
                                  {/* Product Image */}
                                  <div className="flex-shrink-0">
                                    {product.image ? (
                                      <div className="relative w-16 h-16 rounded-md overflow-hidden border border-gray-200 bg-gray-50">
                                        <Image
                                          src={product.image}
                                          alt={product.name}
                                          fill
                                          className="object-cover"
                                          sizes="64px"
                                        />
                                      </div>
                                    ) : (
                                      <div className="w-16 h-16 rounded-md bg-gray-100 border border-gray-200 flex items-center justify-center">
                                        <Package className="h-6 w-6 text-gray-400" />
                                      </div>
                                    )}
                                  </div>
                                  {/* Product Info */}
                                  <div className="flex-1 min-w-0">
                                    <h4 className="font-semibold text-gray-900 mb-1 line-clamp-2">{product.name}</h4>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-gray-600">SKU: <span className="font-mono text-xs">{product.sku}</span></p>
                                      {product.sizes && product.sizes.length > 0 && (
                                        <span className="text-xs text-gray-500">• {product.sizes[0]}{product.sizes.length > 1 ? ` +${product.sizes.length - 1}` : ''}</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                {/* Display attributes only if they have values */}
                                {((product as any).attribute1_value || (product as any).attribute2_value || (product as any).attribute3_value) && (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {(product as any).attribute1_value && (
                                      <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                                        {(product as any).attribute1_name || 'Attr1'}: {(product as any).attribute1_value}
                                      </span>
                                    )}
                                    {(product as any).attribute2_value && (
                                      <span className="text-xs px-2 py-0.5 bg-green-50 text-green-700 rounded">
                                        {(product as any).attribute2_name || 'Attr2'}: {(product as any).attribute2_value}
                                      </span>
                                    )}
                                    {(product as any).attribute3_value && (
                                      <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded">
                                        {(product as any).attribute3_name || 'Attr3'}: {(product as any).attribute3_value}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <p className="text-sm text-gray-600 mb-2">
                                  Gender: <span className="font-semibold capitalize">{product.gender || 'unisex'}</span>
                                </p>
                                <p className="text-sm text-gray-600 mb-2">Price: ₹{product.price}</p>
                                <p className="text-sm text-gray-600 mb-2">
                                  Companies: {product.companyIds.length}
                                </p>
                                <div className="flex space-x-2 mt-4">
                                  <button
                                    onClick={() => setEditingProduct(product)}
                                    className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete "${product.name}"?`)) {
                                        try {
                                          await deleteProduct(product.id)
                                          // Reload products list
                                          const updatedProducts = await getAllProducts()
                                          setProducts(updatedProducts)
                                          alert('Product deleted successfully!')
                                        } catch (error: any) {
                                          console.error('Error deleting product:', error)
                                          alert(`Error deleting product: ${error.message || 'Unknown error occurred'}`)
                                        }
                                      }
                                    }}
                                    className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Empty state */}
                  {sortedVendorIds.length === 0 && unassignedProducts.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-600">No products found matching your search.</p>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* Product Edit/Add Form Modal */}
            {editingProduct && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    {editingProduct.id ? 'Edit Product' : 'Add New Product'}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const formData = new FormData(e.target as HTMLFormElement)
                      const productData: Partial<Uniform> = {
                        name: formData.get('name') as string,
                        category: formData.get('category') as any,
                        gender: formData.get('gender') as any,
                        sizes: (formData.get('sizes') as string)?.split(',').map(s => s.trim()).filter(s => s) || [],
                        price: parseFloat(formData.get('price') as string) || 0,
                        image: formData.get('image') as string,
                        sku: formData.get('sku') as string,
                        // Optional attributes (include if name is provided, even if value is empty)
                        attribute1_name: (formData.get('attribute1_name') as string) || undefined,
                        attribute1_value: (formData.get('attribute1_value') as string) || undefined,
                        attribute2_name: (formData.get('attribute2_name') as string) || undefined,
                        attribute2_value: (formData.get('attribute2_value') as string) || undefined,
                        attribute3_name: (formData.get('attribute3_name') as string) || undefined,
                        attribute3_value: (formData.get('attribute3_value') as string) || undefined,
                      }
                      await handleSaveProduct(productData)
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                      <input
                        type="text"
                        name="name"
                        defaultValue={editingProduct.name || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          name="category"
                          defaultValue={editingProduct.category || 'shirt'}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="shirt">Shirt</option>
                          <option value="pant">Pant</option>
                          <option value="shoe">Shoe</option>
                          <option value="jacket">Jacket</option>
                          <option value="accessory">Accessory</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Gender</label>
                        <select
                          name="gender"
                          defaultValue={editingProduct.gender || 'unisex'}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="unisex">Unisex</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Sizes (comma-separated)</label>
                      <input
                        type="text"
                        name="sizes"
                        defaultValue={editingProduct.sizes?.join(', ') || ''}
                        placeholder="e.g., S, M, L, XL"
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Price (₹)</label>
                        <input
                          type="number"
                          name="price"
                          step="0.01"
                          defaultValue={editingProduct.price || 0}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="col-span-1">
                        <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                        <input
                          type="text"
                          name="sku"
                          defaultValue={editingProduct.sku || ''}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
                        <input
                          type="text"
                          name="image"
                          defaultValue={editingProduct.image || ''}
                          placeholder="/images/uniforms/product-name.jpg or https://example.com/image.jpg"
                          pattern="^(/|https?://).*"
                          title="Enter a relative path (e.g., /images/uniforms/product.jpg) or a full URL (e.g., https://example.com/image.jpg)"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use relative paths like <code className="bg-gray-100 px-1 rounded">/images/uniforms/product-name.jpg</code> for images in the public folder
                        </p>
                      </div>
                    </div>
                    
                    {/* Optional SKU Attributes */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <label className="block text-sm font-semibold text-gray-700 mb-3">SKU Attributes (Optional)</label>
                      <div className="space-y-3">
                        {/* Attribute 1 */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Attribute 1 Name</label>
                            <input
                              type="text"
                              name="attribute1_name"
                              defaultValue={editingProduct.attribute1_name || ''}
                              placeholder="e.g., GSM"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                            <input
                              type="text"
                              name="attribute1_value"
                              defaultValue={editingProduct.attribute1_value || ''}
                              placeholder="e.g., 350"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="flex items-end">
                            <p className="text-xs text-gray-500">Leave empty to hide</p>
                          </div>
                        </div>
                        
                        {/* Attribute 2 */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Attribute 2 Name</label>
                            <input
                              type="text"
                              name="attribute2_name"
                              defaultValue={editingProduct.attribute2_name || ''}
                              placeholder="e.g., Fabric"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                            <input
                              type="text"
                              name="attribute2_value"
                              defaultValue={editingProduct.attribute2_value || ''}
                              placeholder="e.g., Cotton"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="flex items-end">
                            <p className="text-xs text-gray-500">Leave empty to hide</p>
                          </div>
                        </div>
                        
                        {/* Attribute 3 */}
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Attribute 3 Name</label>
                            <input
                              type="text"
                              name="attribute3_name"
                              defaultValue={editingProduct.attribute3_name || ''}
                              placeholder="e.g., Style"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Value</label>
                            <input
                              type="text"
                              name="attribute3_value"
                              defaultValue={editingProduct.attribute3_value || ''}
                              placeholder="e.g., Slim Fit"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                            />
                          </div>
                          <div className="flex items-end">
                            <p className="text-xs text-gray-500">Leave empty to hide</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex space-x-4 pt-4">
                      <button
                        type="submit"
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        <Save className="h-5 w-5 inline mr-2" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingProduct(null)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Vendors Tab */}
        {activeTab === 'vendors' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Vendors</h2>
              <button
                onClick={() => setEditingVendor({} as Vendor)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Add Vendor</span>
              </button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredVendors.map((vendor) => (
                <div key={vendor.id} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">{vendor.name}</h3>
                  <p className="text-sm text-gray-600 mb-2">Email: {vendor.email}</p>
                  <p className="text-sm text-gray-600 mb-2">Phone: {vendor.phone}</p>
                  <div className="flex items-center space-x-2 mb-2">
                    <div 
                      className="w-4 h-4 rounded-full"
                      style={{ backgroundColor: vendor.primaryColor }}
                    />
                    <span className="text-sm text-gray-600">Primary: {vendor.primaryColor}</span>
                  </div>
                  <div className="flex space-x-2 mt-4">
                    <button
                      onClick={() => setEditingVendor(vendor)}
                      className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setVendors(vendors.filter(v => v.id !== vendor.id))}
                      className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Vendor Edit/Add Form Modal */}
            {editingVendor && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    {editingVendor.id ? 'Edit Vendor' : 'Add New Vendor'}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const formData = new FormData(e.target as HTMLFormElement)
                      const vendorData: Partial<Vendor> = {
                        name: formData.get('name') as string,
                        email: formData.get('email') as string,
                        phone: formData.get('phone') as string,
                        logo: formData.get('logo') as string,
                        website: formData.get('website') as string,
                        primaryColor: formData.get('primaryColor') as string,
                        secondaryColor: formData.get('secondaryColor') as string,
                        accentColor: formData.get('accentColor') as string,
                        theme: (formData.get('theme') as 'light' | 'dark' | 'custom') || 'light',
                      }
                      await handleSaveVendor(vendorData)
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Vendor Name</label>
                      <input
                        type="text"
                        name="name"
                        defaultValue={editingVendor.name || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                          type="email"
                          name="email"
                          defaultValue={editingVendor.email || ''}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                        <input
                          type="tel"
                          name="phone"
                          defaultValue={editingVendor.phone || ''}
                          required
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                      <input
                        type="url"
                        name="website"
                        defaultValue={editingVendor.website || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                      <input
                        type="url"
                        name="logo"
                        defaultValue={editingVendor.logo || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            name="primaryColor"
                            defaultValue={editingVendor.primaryColor || '#2563eb'}
                            className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            name="primaryColor"
                            defaultValue={editingVendor.primaryColor || '#2563eb'}
                            required
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            name="secondaryColor"
                            defaultValue={editingVendor.secondaryColor || '#1e40af'}
                            className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            name="secondaryColor"
                            defaultValue={editingVendor.secondaryColor || '#1e40af'}
                            required
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Accent Color</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            name="accentColor"
                            defaultValue={editingVendor.accentColor || '#3b82f6'}
                            className="w-16 h-10 border border-gray-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            name="accentColor"
                            defaultValue={editingVendor.accentColor || '#3b82f6'}
                            required
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Theme</label>
                      <select
                        name="theme"
                        defaultValue={editingVendor.theme || 'light'}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>
                    {editingVendor.id && (
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">
                          <span className="font-semibold">Vendor ID:</span> {editingVendor.id}
                        </p>
                      </div>
                    )}

                    {/* Vendor Warehouses Section */}
                    {editingVendor.id && (
                      <div className="border-t border-gray-200 pt-6 mt-6">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 flex items-center space-x-2">
                            <Package className="h-5 w-5" />
                            <span>Vendor Warehouses</span>
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingWarehouse({
                                vendorId: editingVendor.id,
                                warehouseName: '',
                                addressLine1: '',
                                addressLine2: '',
                                city: '',
                                state: '',
                                country: 'India',
                                pincode: '',
                                contactName: '',
                                contactPhone: '',
                                isPrimary: vendorWarehouses.length === 0,
                                isActive: true,
                              })
                            }}
                            className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2"
                          >
                            <Plus className="h-4 w-4" />
                            <span>Add Warehouse</span>
                          </button>
                        </div>
                        
                        {loadingWarehouses ? (
                          <div className="text-center py-4 text-gray-500">Loading warehouses...</div>
                        ) : vendorWarehouses.length === 0 ? (
                          <div className="text-center py-8 bg-gray-50 rounded-lg">
                            <Package className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                            <p className="text-gray-600 mb-2">No warehouses configured</p>
                            <p className="text-sm text-gray-500">Add at least one warehouse for automatic shipments</p>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            {vendorWarehouses.map((warehouse) => (
                              <div
                                key={warehouse.warehouseRefId}
                                className={`p-4 border rounded-lg ${
                                  warehouse.isPrimary ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center space-x-2 mb-2">
                                      <h4 className="font-semibold text-gray-900">{warehouse.warehouseName}</h4>
                                      {warehouse.isPrimary && (
                                        <span className="px-2 py-0.5 bg-blue-600 text-white text-xs font-medium rounded">
                                          Primary
                                        </span>
                                      )}
                                      {!warehouse.isActive && (
                                        <span className="px-2 py-0.5 bg-gray-400 text-white text-xs font-medium rounded">
                                          Inactive
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-sm text-gray-600">
                                      {warehouse.addressLine1}
                                      {warehouse.addressLine2 && `, ${warehouse.addressLine2}`}
                                    </p>
                                    <p className="text-sm text-gray-600">
                                      {warehouse.city}, {warehouse.state} - {warehouse.pincode}
                                    </p>
                                    {warehouse.contactName && (
                                      <p className="text-sm text-gray-500 mt-1">
                                        Contact: {warehouse.contactName}
                                        {warehouse.contactPhone && ` (${warehouse.contactPhone})`}
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2 ml-4">
                                    <button
                                      type="button"
                                      onClick={() => setEditingWarehouse(warehouse)}
                                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        if (!confirm('Are you sure you want to delete this warehouse?')) return
                                        try {
                                          const response = await fetch(`/api/superadmin/vendor-warehouses/${warehouse.warehouseRefId}`, {
                                            method: 'DELETE',
                                          })
                                          if (response.ok) {
                                            loadVendorWarehouses(editingVendor.id)
                                            alert('Warehouse deleted successfully')
                                          } else {
                                            const error = await response.json()
                                            throw new Error(error.error || 'Failed to delete warehouse')
                                          }
                                        } catch (error: any) {
                                          alert(`Error: ${error.message}`)
                                        }
                                      }}
                                      className="text-red-600 hover:text-red-700 text-sm font-medium"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Warehouse Edit/Add Modal */}
                    {editingWarehouse && (
                      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                          <h3 className="text-xl font-bold text-gray-900 mb-4">
                            {editingWarehouse.warehouseRefId ? 'Edit Warehouse' : 'Add Warehouse'}
                          </h3>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault()
                              const formData = new FormData(e.target as HTMLFormElement)
                              try {
                                const warehouseData = {
                                  vendorId: editingWarehouse.vendorId,
                                  warehouseName: formData.get('warehouseName') as string,
                                  addressLine1: formData.get('addressLine1') as string,
                                  addressLine2: formData.get('addressLine2') as string || undefined,
                                  city: formData.get('city') as string,
                                  state: formData.get('state') as string,
                                  country: formData.get('country') as string || 'India',
                                  pincode: formData.get('pincode') as string,
                                  contactName: formData.get('contactName') as string || undefined,
                                  contactPhone: formData.get('contactPhone') as string || undefined,
                                  isPrimary: formData.get('isPrimary') === 'true',
                                  isActive: formData.get('isActive') !== 'false',
                                }

                                if (editingWarehouse.warehouseRefId) {
                                  // Update
                                  const response = await fetch(`/api/superadmin/vendor-warehouses/${editingWarehouse.warehouseRefId}`, {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(warehouseData),
                                  })
                                  if (!response.ok) {
                                    const error = await response.json()
                                    throw new Error(error.error || 'Failed to update warehouse')
                                  }
                                  alert('Warehouse updated successfully!')
                                } else {
                                  // Create
                                  const response = await fetch('/api/superadmin/vendor-warehouses', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(warehouseData),
                                  })
                                  if (!response.ok) {
                                    const error = await response.json()
                                    throw new Error(error.error || 'Failed to create warehouse')
                                  }
                                  alert('Warehouse created successfully!')
                                }
                                setEditingWarehouse(null)
                                if (editingVendor?.id) {
                                  loadVendorWarehouses(editingVendor.id)
                                }
                              } catch (error: any) {
                                alert(`Error: ${error.message}`)
                              }
                            }}
                            className="space-y-4"
                          >
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Warehouse Name *</label>
                              <input
                                type="text"
                                name="warehouseName"
                                defaultValue={editingWarehouse.warehouseName || ''}
                                required
                                maxLength={200}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1 *</label>
                              <input
                                type="text"
                                name="addressLine1"
                                defaultValue={editingWarehouse.addressLine1 || ''}
                                required
                                maxLength={255}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                              <input
                                type="text"
                                name="addressLine2"
                                defaultValue={editingWarehouse.addressLine2 || ''}
                                maxLength={255}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">City *</label>
                                <input
                                  type="text"
                                  name="city"
                                  defaultValue={editingWarehouse.city || ''}
                                  required
                                  maxLength={100}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">State *</label>
                                <input
                                  type="text"
                                  name="state"
                                  defaultValue={editingWarehouse.state || ''}
                                  required
                                  maxLength={100}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Pincode *</label>
                                <input
                                  type="text"
                                  name="pincode"
                                  defaultValue={editingWarehouse.pincode || ''}
                                  required
                                  pattern="[0-9]{6}"
                                  maxLength={6}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">6 digits (e.g., 110001)</p>
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
                                <input
                                  type="text"
                                  name="country"
                                  defaultValue={editingWarehouse.country || 'India'}
                                  maxLength={50}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                                <input
                                  type="text"
                                  name="contactName"
                                  defaultValue={editingWarehouse.contactName || ''}
                                  maxLength={100}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                              <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Phone</label>
                                <input
                                  type="tel"
                                  name="contactPhone"
                                  defaultValue={editingWarehouse.contactPhone || ''}
                                  maxLength={20}
                                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                              </div>
                            </div>
                            <div className="flex items-center space-x-6">
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  name="isPrimary"
                                  value="true"
                                  defaultChecked={editingWarehouse.isPrimary}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Primary Warehouse</span>
                              </label>
                              <label className="flex items-center space-x-2">
                                <input
                                  type="checkbox"
                                  name="isActive"
                                  value="true"
                                  defaultChecked={editingWarehouse.isActive !== false}
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-sm font-medium text-gray-700">Active</span>
                              </label>
                            </div>
                            <div className="flex space-x-4 pt-4">
                              <button
                                type="submit"
                                className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                              >
                                <Save className="h-5 w-5 inline mr-2" />
                                Save Warehouse
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingWarehouse(null)}
                                className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </form>
                        </div>
                      </div>
                    )}
                    <div className="flex space-x-4 pt-4">
                      <button
                        type="submit"
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        <Save className="h-5 w-5 inline mr-2" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingVendor(null)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Companies Tab */}
        {activeTab === 'companies' && !loading && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Companies</h2>
              <button
                onClick={() => setEditingCompany({} as Company)}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <Plus className="h-5 w-5" />
                <span>Add Company</span>
              </button>
            </div>
            {filteredCompanies.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600 mb-4">No companies found.</p>
                <p className="text-sm text-gray-500">Companies: {companies.length}, Filtered: {filteredCompanies.length}</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCompanies.map((company) => {
                const companyEmployees = employees.filter((e: any) => {
                  // Handle different companyId formats
                  let empCompanyId: string | null = null
                  
                  if (e.companyId) {
                    // If companyId is populated object with id field
                    if (typeof e.companyId === 'object' && e.companyId !== null) {
                      empCompanyId = e.companyId.id || e.companyId._id?.toString() || null
                    } 
                    // If companyId is a string (company id like "COMP-INDIGO")
                    else if (typeof e.companyId === 'string') {
                      empCompanyId = e.companyId
                    }
                  }
                  
                  // Also check companyName as fallback
                  if (!empCompanyId && e.companyName) {
                    const matchingCompany = companies.find(c => c.name === e.companyName)
                    if (matchingCompany) {
                      empCompanyId = matchingCompany.id
                    }
                  }
                  
                  return empCompanyId === company.id
                })
                const admins = companyAdmins[company.id] || []

                return (
                  <div key={company.id} className="border border-gray-200 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-2">{company.name}</h3>
                    <p className="text-sm text-gray-600 mb-2">Website: {company.website}</p>
                    <div className="flex items-center space-x-2 mb-2">
                      <div 
                        className="w-4 h-4 rounded-full"
                        style={{ backgroundColor: company.primaryColor }}
                      />
                      <span className="text-sm text-gray-600">Color: {company.primaryColor}</span>
                    </div>
                    
                    {/* Company Admins Display */}
                    <div className="mb-3 p-2 bg-gray-50 rounded">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-xs font-semibold text-gray-700">Company Admins ({admins.length}):</p>
                        <button
                          onClick={async () => {
                            try {
                              const refreshedAdmins = await getCompanyAdmins(company.id)
                              setCompanyAdmins({ ...companyAdmins, [company.id]: refreshedAdmins })
                              console.log('Refreshed admins for', company.id, ':', refreshedAdmins)
                            } catch (error) {
                              console.error('Error refreshing admins:', error)
                            }
                          }}
                          className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                        >
                          🔄 Refresh
                        </button>
                      </div>
                      {admins.length > 0 ? (
                        <div className="space-y-2">
                          {admins.map((admin: any) => {
                            // Try to get employee from admin.employee (populated), or find in employees list
                            let adminEmployee = admin.employee
                            if (!adminEmployee && admin.employeeId) {
                              // Try to find by id or employeeId - but only if admin.employeeId exists
                              adminEmployee = employees.find((e: any) => 
                                e.id === admin.employeeId || 
                                e.employeeId === admin.employeeId ||
                                e._id?.toString() === admin.employeeId?.toString()
                              )
                            }
                            
                            // Don't display if no valid employee found
                            if (!adminEmployee) {
                              console.warn('Admin record has no valid employee:', admin)
                              return null
                            }
                            
                            return (
                              <div key={admin.employeeId || admin._id} className="p-2 bg-white rounded border border-gray-200">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-gray-900">
                                      {maskEmployeeData(adminEmployee).firstName} {maskEmployeeData(adminEmployee).lastName}
                                    </p>
                                    <p className="text-xs text-gray-600">{maskEmail(adminEmployee.email)}</p>
                                    <p className="text-xs font-mono text-blue-600 font-semibold mt-1">
                                      ID: {adminEmployee.employeeId || 'N/A'}
                                    </p>
                                    <div className="mt-1 flex items-center space-x-2">
                                      <span className={`text-xs px-2 py-0.5 rounded ${
                                        admin.canApproveOrders 
                                          ? 'bg-green-100 text-green-800 font-semibold' 
                                          : 'bg-gray-100 text-gray-600'
                                      }`}>
                                        {admin.canApproveOrders ? '✓ Can Approve Orders' : 'Cannot Approve Orders'}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="flex flex-col space-y-1">
                                    <button
                                      onClick={async () => {
                                        try {
                                          // Use employee.id or employee.employeeId, fallback to admin.employeeId
                                          const employeeIdToUpdate = adminEmployee.id || adminEmployee.employeeId || admin.employeeId
                                          if (!employeeIdToUpdate) {
                                            alert('Error: Could not determine employee ID')
                                            return
                                          }
                                          await updateCompanyAdminPrivileges(
                                            company.id, 
                                            employeeIdToUpdate, 
                                            !admin.canApproveOrders
                                          )
                                          // Reload admins
                                          const updatedAdmins = await getCompanyAdmins(company.id)
                                          setCompanyAdmins({ ...companyAdmins, [company.id]: updatedAdmins })
                                          alert('Privileges updated successfully!')
                                        } catch (error: any) {
                                          console.error('Error updating privileges:', error)
                                          alert(`Error: ${error.message}`)
                                        }
                                      }}
                                      className={`text-xs px-2 py-1 rounded font-semibold ${
                                        admin.canApproveOrders
                                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                                      }`}
                                    >
                                      {admin.canApproveOrders ? 'Revoke Approval' : 'Grant Approval'}
                                    </button>
                                    <button
                                      onClick={async () => {
                                        const masked = maskEmployeeData(adminEmployee)
                                        if (confirm(`Remove ${masked.firstName} ${masked.lastName} as admin?`)) {
                                          try {
                                            // Use employee.id or employee.employeeId, fallback to admin.employeeId
                                            const employeeIdToRemove = adminEmployee.id || adminEmployee.employeeId || admin.employeeId
                                            
                                            if (!employeeIdToRemove) {
                                              console.error('No employeeId found:', { adminEmployee, admin })
                                              alert('Error: Could not determine employee ID. Please check the console.')
                                              return
                                            }
                                            
                                            console.log('Removing admin:', { 
                                              companyId: company.id, 
                                              employeeId: employeeIdToRemove,
                                              adminEmployeeId: adminEmployee.id,
                                              adminEmployeeEmployeeId: adminEmployee.employeeId,
                                              adminRecordEmployeeId: admin.employeeId
                                            })
                                            
                                            await removeCompanyAdmin(company.id, employeeIdToRemove)
                                            
                                            // Reload admins
                                            const updatedAdmins = await getCompanyAdmins(company.id)
                                            setCompanyAdmins({ ...companyAdmins, [company.id]: updatedAdmins })
                                            alert('Admin removed successfully!')
                                          } catch (error: any) {
                                            console.error('Error removing admin:', error)
                                            alert(`Error: ${error.message}`)
                                          }
                                        }
                                      }}
                                      className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 hover:bg-red-200 font-semibold"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500 italic">No admins assigned</p>
                      )}
                    </div>

                    {/* Assign Admin Section */}
                    {assigningAdminForCompany === company.id ? (
                      <div className="mb-3 p-3 bg-blue-50 rounded border border-blue-200">
                        <label className="block text-xs font-semibold text-gray-700 mb-2">
                          Search Employee (e.g., "Amit" or "Patel"):
                        </label>
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                          <input
                            type="text"
                            placeholder="Search by name or email..."
                            value={adminSearchTerm}
                            onChange={(e) => {
                              setAdminSearchTerm(e.target.value)
                              setSelectedEmployeeIdForAdmin('') // Clear selection when search changes
                            }}
                            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                          />
                        </div>
                        {adminSearchTerm && (
                          <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white mb-2">
                            {companyEmployees
                              .filter((emp) => {
                                const searchLower = adminSearchTerm.toLowerCase()
                                return (
                                  emp.firstName.toLowerCase().includes(searchLower) ||
                                  emp.lastName.toLowerCase().includes(searchLower) ||
                                  emp.email.toLowerCase().includes(searchLower) ||
                                  `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchLower)
                                )
                              })
                              .slice(0, 5)
                              .map((emp) => (
                                <div
                                  key={emp.id}
                                  onClick={() => {
                                    // Use employee.id as primary, fallback to employee.employeeId
                                    const employeeIdToSelect = emp.id || emp.employeeId
                                    setSelectedEmployeeIdForAdmin(employeeIdToSelect)
                                    setAdminSearchTerm(`${emp.firstName} ${emp.lastName} (${emp.email})`)
                                    console.log('Selected employee for admin:', {
                                      id: emp.id,
                                      employeeId: emp.employeeId,
                                      name: `${emp.firstName} ${emp.lastName}`,
                                      email: emp.email,
                                      companyId: emp.companyId,
                                      companyName: emp.companyName,
                                      targetCompany: company.name,
                                      selectedId: employeeIdToSelect,
                                      belongsToCompany: emp.companyId === company.id || emp.companyName === company.name
                                    })
                                  }}
                                  className={`px-3 py-2 cursor-pointer hover:bg-blue-100 transition-colors ${
                                    selectedEmployeeIdForAdmin === (emp.id || emp.employeeId) ? 'bg-blue-200' : ''
                                  }`}
                                >
                                  <p className="text-sm font-medium text-gray-900">
                                    {emp.firstName} {emp.lastName}
                                  </p>
                                  <p className="text-xs font-mono text-blue-600 font-semibold">{emp.employeeId || emp.id || 'N/A'}</p>
                                  <p className="text-xs text-gray-600">{emp.email}</p>
                                </div>
                              ))}
                            {companyEmployees.filter((emp) => {
                              const searchLower = adminSearchTerm.toLowerCase()
                              return (
                                emp.firstName.toLowerCase().includes(searchLower) ||
                                emp.lastName.toLowerCase().includes(searchLower) ||
                                emp.email.toLowerCase().includes(searchLower) ||
                                `${emp.firstName} ${emp.lastName}`.toLowerCase().includes(searchLower)
                              )
                            }).length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-500 text-center">
                                No employees found
                              </div>
                            )}
                          </div>
                        )}
                        {selectedEmployeeIdForAdmin && (() => {
                          const selectedEmployee = companyEmployees.find((e) => 
                            e.id === selectedEmployeeIdForAdmin || 
                            e.employeeId === selectedEmployeeIdForAdmin
                          )
                          return selectedEmployee ? (
                            <div className="mb-2 p-2 bg-green-50 border border-green-200 rounded text-sm">
                              <p className="font-semibold text-green-900">Selected:</p>
                              <p className="text-green-700 font-medium">
                                {selectedEmployee.firstName} {selectedEmployee.lastName}
                              </p>
                              <p className="text-xs font-mono text-green-600 font-semibold mt-1">
                                Employee ID: {selectedEmployee.employeeId || selectedEmployee.id || 'N/A'}
                              </p>
                              <p className="text-xs text-green-600 mt-1">
                                {selectedEmployee.email}
                              </p>
                              <p className="text-xs text-gray-500 mt-1">
                                Internal ID: {selectedEmployee.id}
                              </p>
                            <div className="mt-2">
                              <label className="flex items-center space-x-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={canApproveOrders}
                                  onChange={(e) => setCanApproveOrders(e.target.checked)}
                                  className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                                />
                                <span className="text-xs font-semibold text-gray-700">
                                  Can Approve Orders
                                </span>
                              </label>
                            </div>
                            </div>
                          ) : null
                        })()}
                        <div className="flex space-x-2">
                          <button
                            onClick={async () => {
                              if (!selectedEmployeeIdForAdmin) {
                                alert('Please search and select an employee')
                                return
                              }
                              
                              // Get the selected employee to verify
                              const selectedEmployee = companyEmployees.find((e) => 
                                e.id === selectedEmployeeIdForAdmin || 
                                e.employeeId === selectedEmployeeIdForAdmin
                              )
                              
                              if (!selectedEmployee) {
                                alert('Selected employee not found. Please try again.')
                                return
                              }
                              
                              // Verify employee belongs to this company
                              let empCompanyId: string | null = null
                              if (selectedEmployee.companyId) {
                                if (typeof selectedEmployee.companyId === 'object' && selectedEmployee.companyId !== null) {
                                  empCompanyId = (selectedEmployee.companyId as any).id || (selectedEmployee.companyId as any).toString()
                                } else {
                                  empCompanyId = String(selectedEmployee.companyId)
                                }
                              }
                              
                              // Also check companyName as fallback
                              if (empCompanyId !== company.id && selectedEmployee.companyName !== company.name) {
                                // Try to find matching company by name
                                const matchingCompany = companies.find(c => 
                                  c.name === selectedEmployee.companyName || 
                                  c.id === empCompanyId
                                )
                                if (!matchingCompany || matchingCompany.id !== company.id) {
                                  alert(`Error: Employee ${selectedEmployee.firstName} ${selectedEmployee.lastName} (${selectedEmployee.employeeId}) does not belong to ${company.name}. They belong to ${selectedEmployee.companyName || 'unknown company'}.`)
                                  return
                                }
                              }
                              
                              // Use employee.id as primary identifier
                              const employeeIdToAdd = selectedEmployee.id || selectedEmployee.employeeId || selectedEmployeeIdForAdmin
                              
                              console.log('Adding admin:', {
                                companyId: company.id,
                                companyName: company.name,
                                employeeIdToAdd: employeeIdToAdd,
                                selectedEmployeeIdForAdmin: selectedEmployeeIdForAdmin,
                                employeeName: `${selectedEmployee.firstName} ${selectedEmployee.lastName}`,
                                employeeEmployeeId: selectedEmployee.employeeId,
                                employeeCompanyId: empCompanyId,
                                employeeCompanyName: selectedEmployee.companyName,
                                verification: empCompanyId === company.id ? 'PASS' : 'FAIL'
                              })
                              
                              try {
                                await addCompanyAdmin(company.id, employeeIdToAdd, canApproveOrders)
                                // Reload admins
                                const updatedAdmins = await getCompanyAdmins(company.id)
                                setCompanyAdmins({ ...companyAdmins, [company.id]: updatedAdmins })
                                setAssigningAdminForCompany(null)
                                setSelectedEmployeeIdForAdmin('')
                                setAdminSearchTerm('')
                                setCanApproveOrders(false)
                                alert(`Admin added successfully! ${selectedEmployee.firstName} ${selectedEmployee.lastName} is now an admin.`)
                              } catch (error: any) {
                                console.error('Error adding admin:', error)
                                alert(`Error: ${error.message}`)
                              }
                            }}
                            disabled={!selectedEmployeeIdForAdmin}
                            className="flex-1 bg-green-600 text-white py-1.5 rounded text-xs font-semibold hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                          >
                            Add Admin
                          </button>
                          <button
                            onClick={() => {
                              setAssigningAdminForCompany(null)
                              setSelectedEmployeeIdForAdmin('')
                              setAdminSearchTerm('')
                              setCanApproveOrders(false)
                            }}
                            className="flex-1 bg-gray-400 text-white py-1.5 rounded text-xs font-semibold hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mb-3">
                        <button
                          onClick={() => {
                            setAssigningAdminForCompany(company.id)
                            setSelectedEmployeeIdForAdmin('')
                            setAdminSearchTerm('')
                            setCanApproveOrders(false)
                          }}
                          className="w-full bg-purple-600 text-white py-2 rounded-lg font-semibold hover:bg-purple-700 transition-colors text-sm"
                        >
                          Add Admin
                        </button>
                      </div>
                    )}

                    {/* Shipping Preference Display & Quick Toggle */}
                    <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200">
                      <div>
                        <span className="text-xs font-semibold text-gray-700">Current Shipping Mode</span>
                      </div>
                      <div className="flex justify-center mb-2 -mt-2">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          ((company as any).shipmentRequestMode || 'MANUAL') === 'AUTOMATIC'
                            ? 'bg-green-100 text-red-900'
                            : 'bg-gray-100 text-red-900'
                        }`}>
                          {(company as any).shipmentRequestMode || 'MANUAL'}
                        </span>
                      </div>
                      <button
                        onClick={async () => {
                          const newMode = ((company as any).shipmentRequestMode || 'MANUAL') === 'MANUAL' ? 'AUTOMATIC' : 'MANUAL'
                          if (newMode === 'AUTOMATIC' && !shippingIntegrationEnabled) {
                            alert('AUTOMATIC mode requires shipping integration to be enabled. Please enable it in Logistics & Shipping settings first.')
                            return
                          }
                          if (confirm(`Change shipping mode to ${newMode}?`)) {
                            try {
                              setUpdatingShippingMode(company.id)
                              const response = await fetch('/api/companies', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                  companyId: company.id,
                                  action: 'updateSettings',
                                  shipmentRequestMode: newMode,
                                }),
                              })
                              
                              if (!response.ok) {
                                const error = await response.json()
                                throw new Error(error.error || 'Failed to update shipping mode')
                              }
                              
                              // Update local state
                              const updatedCompanies = await getAllCompanies()
                              setCompanies(updatedCompanies)
                              alert('Shipping mode updated successfully!')
                            } catch (error: any) {
                              console.error('Error updating shipping mode:', error)
                              alert(`Error: ${error.message}`)
                            } finally {
                              setUpdatingShippingMode(null)
                            }
                          }
                        }}
                        disabled={updatingShippingMode === company.id}
                        className={`w-full py-1.5 rounded text-xs font-medium transition-colors ${
                          ((company as any).shipmentRequestMode || 'MANUAL') === 'AUTOMATIC'
                            ? shippingIntegrationEnabled
                              ? 'bg-gray-600 text-white hover:bg-gray-700'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                            : shippingIntegrationEnabled
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {updatingShippingMode === company.id 
                          ? 'Updating...' 
                          : ((company as any).shipmentRequestMode || 'MANUAL') === 'AUTOMATIC' 
                            ? 'Set MANUAL' 
                            : 'Set AUTOMATIC'}
                      </button>
                    </div>

                    <div className="flex space-x-2 mt-4">
                      <button
                        onClick={() => setEditingCompany(company)}
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setCompanies(companies.filter(c => c.id !== company.id))}
                        className="flex-1 bg-red-600 text-white py-2 rounded-lg font-semibold hover:bg-red-700 transition-colors text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                )
              })}
              </div>
            )}

            {/* Company Edit/Add Form Modal */}
            {editingCompany && (
              <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    {editingCompany.id ? 'Edit Company' : 'Add New Company'}
                  </h2>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const formData = new FormData(e.target as HTMLFormElement)
                      const secondaryColorValue = formData.get('secondaryColor') as string
                      const companyData: Partial<Company> = {
                        name: (formData.get('name') as string) || '',
                        logo: (formData.get('logo') as string) || '',
                        website: (formData.get('website') as string) || '',
                        primaryColor: (formData.get('primaryColor') as string) || '#000000',
                        secondaryColor: secondaryColorValue && secondaryColorValue.trim() ? secondaryColorValue : undefined,
                        showPrices: formData.get('showPrices') === 'on',
                        allowPersonalPayments: formData.get('allowPersonalPayments') === 'on',
                        // PR → PO Workflow Configuration
                        enable_pr_po_workflow: formData.get('enable_pr_po_workflow') === 'on',
                        enable_site_admin_pr_approval: formData.get('enable_site_admin_pr_approval') === 'on',
                        require_company_admin_po_approval: formData.get('require_company_admin_po_approval') === 'on',
                        allow_multi_pr_po: formData.get('allow_multi_pr_po') === 'on',
                      // Shipping Configuration
                      shipmentRequestMode: (formData.get('shipmentRequestMode') as 'MANUAL' | 'AUTOMATIC') || 'MANUAL',
                      }
                      console.log('Form submitted with data:', companyData)
                      await handleSaveCompany(companyData)
                    }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Company Name *</label>
                      <input
                        type="text"
                        name="name"
                        defaultValue={editingCompany.name || ''}
                        required
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Website</label>
                      <input
                        type="url"
                        name="website"
                        defaultValue={editingCompany.website || ''}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Logo URL</label>
                      <input
                        type="url"
                        name="logo"
                        defaultValue={editingCompany.logo || ''}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Primary Color *</label>
                        <input
                          type="color"
                          name="primaryColor"
                          defaultValue={editingCompany.primaryColor || '#000000'}
                          required
                          className="w-full h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Secondary Color</label>
                        <input
                          type="color"
                          name="secondaryColor"
                          defaultValue={editingCompany.secondaryColor || '#f76b1c'}
                          className="w-full h-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="showPrices"
                          defaultChecked={editingCompany.showPrices || false}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Show Prices to Employees</span>
                      </label>
                      <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                          type="checkbox"
                          name="allowPersonalPayments"
                          defaultChecked={editingCompany.allowPersonalPayments || false}
                          className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <span className="text-sm font-medium text-gray-700">Allow Personal Payments</span>
                      </label>
                    </div>

                    {/* Procurement & Approval Workflow Settings */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Procurement & Approval Workflow Settings</h3>
                      <div className="space-y-3">
                        <label className="flex items-start space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            name="enable_pr_po_workflow"
                            id="enable_pr_po_workflow"
                            defaultChecked={editingCompany.enable_pr_po_workflow || false}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5"
                            onChange={(e) => {
                              // Disable/enable other workflow toggles based on this checkbox
                              const otherCheckboxes = document.querySelectorAll<HTMLInputElement>(
                                'input[name="enable_site_admin_pr_approval"], input[name="require_company_admin_po_approval"], input[name="allow_multi_pr_po"]'
                              )
                              otherCheckboxes.forEach(cb => {
                                cb.disabled = !e.target.checked
                                if (!e.target.checked) {
                                  cb.checked = false
                                }
                              })
                            }}
                            onLoad={(e) => {
                              // Initialize disabled state on load
                              const workflowEnabled = (e.target as HTMLInputElement).checked
                              const otherCheckboxes = document.querySelectorAll<HTMLInputElement>(
                                'input[name="enable_site_admin_pr_approval"], input[name="require_company_admin_po_approval"], input[name="allow_multi_pr_po"]'
                              )
                              otherCheckboxes.forEach(cb => {
                                cb.disabled = !workflowEnabled
                              })
                            }}
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">Enable PR → Approval → PO Workflow</span>
                            <p className="text-xs text-gray-500 mt-0.5">Enables the Purchase Requisition to Purchase Order workflow with approval steps</p>
                          </div>
                        </label>
                        <label className="flex items-start space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            name="enable_site_admin_pr_approval"
                            id="enable_site_admin_pr_approval"
                            defaultChecked={editingCompany.enable_site_admin_pr_approval !== undefined ? editingCompany.enable_site_admin_pr_approval : (editingCompany.enable_site_admin_approval !== undefined ? editingCompany.enable_site_admin_approval : true)}
                            disabled={!editingCompany.enable_pr_po_workflow}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">Require Site Admin PR Approval</span>
                            <p className="text-xs text-gray-500 mt-0.5">Site Admin must approve Purchase Requisitions (Orders) before they proceed to Company Admin</p>
                          </div>
                        </label>
                        <label className="flex items-start space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            name="require_company_admin_po_approval"
                            id="require_company_admin_po_approval"
                            defaultChecked={editingCompany.require_company_admin_po_approval !== undefined ? editingCompany.require_company_admin_po_approval : (editingCompany.require_company_admin_approval !== undefined ? editingCompany.require_company_admin_approval : true)}
                            disabled={!editingCompany.enable_pr_po_workflow}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">Require Company Admin PO Approval</span>
                            <p className="text-xs text-gray-500 mt-0.5">Company Admin must approve Purchase Orders before they are sent to vendors</p>
                          </div>
                        </label>
                        <label className="flex items-start space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            name="allow_multi_pr_po"
                            id="allow_multi_pr_po"
                            defaultChecked={editingCompany.allow_multi_pr_po !== undefined ? editingCompany.allow_multi_pr_po : true}
                            disabled={!editingCompany.enable_pr_po_workflow}
                            className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 mt-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <div className="flex-1">
                            <span className="text-sm font-medium text-gray-700">Allow grouping multiple PRs into one PO</span>
                            <p className="text-xs text-gray-500 mt-0.5">Company Admin can group multiple approved Purchase Requisitions into a single Purchase Order</p>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Shipping Configuration */}
                    <div className="border-t border-gray-200 pt-4 mt-4">
                      <h3 className="text-lg font-semibold text-gray-900 mb-3">Shipping Configuration</h3>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">Shipment Request Mode</label>
                          <select
                            name="shipmentRequestMode"
                            defaultValue={(editingCompany as any)?.shipmentRequestMode || 'MANUAL'}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          >
                            <option value="MANUAL">MANUAL - Manual entry of shipment details</option>
                            <option value="AUTOMATIC" disabled={!shippingIntegrationEnabled}>
                              AUTOMATIC - Automatic shipment creation {!shippingIntegrationEnabled && '(Requires shipping integration)'}
                            </option>
                          </select>
                          {!shippingIntegrationEnabled && (
                            <p className="mt-2 text-xs text-yellow-600">
                              ⚠️ AUTOMATIC mode requires shipping integration to be enabled in Logistics & Shipping settings.
                            </p>
                          )}
                          <p className="mt-2 text-xs text-gray-500">
                            MANUAL mode requires manual entry of shipment details. AUTOMATIC mode enables automatic shipment creation using logistics providers and vendor warehouses.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-4 pt-4">
                      <button
                        type="submit"
                        className="flex-1 bg-blue-600 text-white py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                      >
                        <Save className="h-5 w-5 inline mr-2" />
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCompany(null)}
                        className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Employees Tab */}
        {activeTab === 'employees' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-900">Employees</h2>
            </div>
            
            {/* Employees grouped by Company */}
            {(() => {
              // Group filtered employees by company
              const companyEmployeeMap = new Map<string, Employee[]>()
              const unassignedEmployees: Employee[] = []
              
              filteredEmployees.forEach((employee) => {
                // Get company ID - handle different formats (object, string, or companyName)
                let companyId: string | null = null
                
                if (employee.companyId) {
                  if (typeof employee.companyId === 'object' && employee.companyId !== null) {
                    // Prioritize the 'id' field (string ID like "100001")
                    const populatedCompanyId = (employee.companyId as any).id
                    const populatedCompanyObjectId = (employee.companyId as any)._id?.toString()
                    
                    if (populatedCompanyId) {
                      companyId = populatedCompanyId
                    } else if (populatedCompanyObjectId) {
                      // If only _id is available, try to find company by _id in companies array
                      // getAllCompanies() preserves _id as a string, so we can match it
                      const companyByObjectId = companies.find(c => {
                        const cId = (c as any)._id
                        return cId === populatedCompanyObjectId || String(cId) === populatedCompanyObjectId
                      })
                      if (companyByObjectId) {
                        companyId = companyByObjectId.id
                      }
                      // If we can't find by _id, don't set companyId - it will fall through to companyName lookup
                    }
                  } else if (typeof employee.companyId === 'string') {
                    // Check if it's an ObjectId string (24 hex characters)
                    // If so, try to find the company by _id
                    if (/^[0-9a-fA-F]{24}$/.test(employee.companyId)) {
                      const companyByObjectId = companies.find(c => {
                        const cId = (c as any)._id
                        return cId === employee.companyId || String(cId) === employee.companyId
                      })
                      if (companyByObjectId) {
                        companyId = companyByObjectId.id
                      }
                      // If not found by _id, don't use the ObjectId string - fall through to companyName lookup
                    } else {
                      // It's already a valid company ID string
                      companyId = employee.companyId
                    }
                  }
                }
                
                // Fallback to companyName if companyId not available
                if (!companyId && employee.companyName) {
                  const matchingCompany = companies.find(c => c.name === employee.companyName)
                  if (matchingCompany) {
                    companyId = matchingCompany.id
                  }
                }
                
                if (companyId) {
                  if (!companyEmployeeMap.has(companyId)) {
                    companyEmployeeMap.set(companyId, [])
                  }
                  companyEmployeeMap.get(companyId)!.push(employee)
                } else {
                  // Employee not linked to any company
                  unassignedEmployees.push(employee)
                }
              })
              
              // Sort companies by name for consistent display
              const sortedCompanyIds = Array.from(companyEmployeeMap.keys()).sort((a, b) => {
                const companyA = companies.find(c => c.id === a)?.name || a
                const companyB = companies.find(c => c.id === b)?.name || b
                return companyA.localeCompare(companyB)
              })
              
              return (
                <div className="space-y-4">
                  {/* Company sections */}
                  {sortedCompanyIds.map((companyId) => {
                    const company = companies.find(c => c.id === companyId)
                    const companyName = company?.name || companyId
                    const companyEmployees = companyEmployeeMap.get(companyId) || []
                    const isExpanded = expandedCompanySections.has(companyId)
                    
                    return (
                      <div key={companyId} className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                        {/* Company Header - Collapsible */}
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedCompanySections)
                            if (isExpanded) {
                              newExpanded.delete(companyId)
                            } else {
                              newExpanded.add(companyId)
                            }
                            setExpandedCompanySections(newExpanded)
                          }}
                          className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 hover:from-green-100 hover:to-emerald-100 transition-colors"
                        >
                          <div className="flex items-center space-x-3">
                            {isExpanded ? (
                              <ChevronUp className="h-5 w-5 text-gray-600" />
                            ) : (
                              <ChevronDown className="h-5 w-5 text-gray-600" />
                            )}
                            <h3 className="text-lg font-semibold text-gray-900">
                              {companyName}
                            </h3>
                            <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded-full">
                              {companyEmployees.length} {companyEmployees.length === 1 ? 'employee' : 'employees'}
                            </span>
                          </div>
                        </button>
                        
                        {/* Employees Table - Collapsible */}
                        {isExpanded && (
                          <div className="border-t border-gray-200 bg-gray-50">
                            <div className="overflow-x-auto p-4">
                              <table className="w-full bg-white rounded-lg">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Employee ID</th>
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                                    <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {companyEmployees.map((employee) => (
                                    <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                      <td className="py-3 px-4">
                                        <span className="font-mono text-sm font-semibold text-blue-600">
                                          {employee.employeeId || 'N/A'}
                                        </span>
                                      </td>
                                      <td className="py-3 px-4">{maskEmployeeData(employee).firstName} {maskEmployeeData(employee).lastName}</td>
                                      <td className="py-3 px-4">{maskEmail(employee.email)}</td>
                                      <td className="py-3 px-4">
                                        <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                          employee.status === 'active' 
                                            ? 'bg-green-100 text-green-700' 
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                          {employee.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  
                  {/* Unassigned Employees Section */}
                  {unassignedEmployees.length > 0 && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                      <button
                        onClick={() => {
                          const newExpanded = new Set(expandedCompanySections)
                          const unassignedKey = '__unassigned__'
                          if (expandedCompanySections.has(unassignedKey)) {
                            newExpanded.delete(unassignedKey)
                          } else {
                            newExpanded.add(unassignedKey)
                          }
                          setExpandedCompanySections(newExpanded)
                        }}
                        className="w-full flex items-center justify-between p-4 bg-gradient-to-r from-gray-50 to-slate-50 hover:from-gray-100 hover:to-slate-100 transition-colors"
                      >
                        <div className="flex items-center space-x-3">
                          {expandedCompanySections.has('__unassigned__') ? (
                            <ChevronUp className="h-5 w-5 text-gray-600" />
                          ) : (
                            <ChevronDown className="h-5 w-5 text-gray-600" />
                          )}
                          <h3 className="text-lg font-semibold text-gray-900">
                            Unassigned Employees
                          </h3>
                          <span className="text-sm text-gray-600 bg-white px-2 py-1 rounded-full">
                            {unassignedEmployees.length} {unassignedEmployees.length === 1 ? 'employee' : 'employees'}
                          </span>
                        </div>
                      </button>
                      
                      {expandedCompanySections.has('__unassigned__') && (
                        <div className="border-t border-gray-200 bg-gray-50">
                          <div className="overflow-x-auto p-4">
                            <table className="w-full bg-white rounded-lg">
                              <thead>
                                <tr className="border-b border-gray-200">
                                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Employee ID</th>
                                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Name</th>
                                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Email</th>
                                  <th className="text-left py-3 px-4 font-semibold text-gray-900">Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {unassignedEmployees.map((employee) => (
                                  <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                    <td className="py-3 px-4">
                                      <span className="font-mono text-sm font-semibold text-blue-600">
                                        {employee.employeeId || 'N/A'}
                                      </span>
                                    </td>
                                    <td className="py-3 px-4">{maskEmployeeData(employee).firstName} {maskEmployeeData(employee).lastName}</td>
                                    <td className="py-3 px-4">{maskEmail(employee.email)}</td>
                                    <td className="py-3 px-4">
                                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                        employee.status === 'active' 
                                          ? 'bg-green-100 text-green-700' 
                                          : 'bg-red-100 text-red-700'
                                      }`}>
                                        {employee.status}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Empty state */}
                  {sortedCompanyIds.length === 0 && unassignedEmployees.length === 0 && (
                    <div className="text-center py-8">
                      <p className="text-gray-600">No employees found matching your search.</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        )}

        {/* Relationships Tab */}
        {activeTab === 'relationships' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Manage Relationships</h2>
            
            {/* Sub-tabs for relationships */}
            <div className="mb-6 border-b border-gray-200">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setRelationshipSubTab('productToCompany')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    relationshipSubTab === 'productToCompany'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Product to Company
                </button>
                <button
                  onClick={() => setRelationshipSubTab('productToVendor')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm ${
                    relationshipSubTab === 'productToVendor'
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  Product to Vendor
                </button>
              </nav>
            </div>
            
            {/* Link Products to Company */}
            {relationshipSubTab === 'productToCompany' && (
            <div className="mb-8 p-6 border border-gray-200 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Link Products to Company</h3>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
                  <select
                    multiple
                    value={selectedProductIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      setSelectedProductIds(selected)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    size={8}
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Company</label>
                  <select
                    value={selectedCompanyId}
                    onChange={(e) => setSelectedCompanyId(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Select Company</option>
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleLinkProductToCompanies}
                    disabled={selectedProductIds.length === 0 || !selectedCompanyId}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Link2 className="h-5 w-5" />
                    <span>Link</span>
                  </button>
                </div>
              </div>
              
              {/* Display all products linked to selected company */}
              {selectedCompanyId && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Products Linked to Selected Company</h4>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    {(() => {
                      const company = companies.find(c => c.id === selectedCompanyId)
                      const linkedProducts = productCompanies
                        .filter(pc => pc.companyId === selectedCompanyId)
                        .map(pc => {
                          const product = products.find(p => p.id === pc.productId)
                          return product
                        })
                        .filter(Boolean)
                      
                      return (
                        <>
                          <h5 className="font-semibold text-gray-900 mb-2">
                            {company?.name || selectedCompanyId}
                          </h5>
                          {linkedProducts.length === 0 ? (
                            <p className="text-gray-500 text-sm">No products linked to this company</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedProducts.map((product, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded text-sm">
                                  <span className="text-gray-700">
                                    <span className="font-medium">{product?.name}</span>
                                    {product?.sku && <span className="text-gray-500 ml-2">(SKU: {product.sku})</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Display existing Product-Company relationships */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">All Product-Company Links</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {productCompanies.length === 0 ? (
                    <p className="text-gray-500 text-sm">No product-company links yet</p>
                  ) : (
                    productCompanies.map((pc, index) => {
                      const product = products.find(p => p.id === pc.productId)
                      const company = companies.find(c => c.id === pc.companyId)
                      return (
                        <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg text-sm">
                          <span className="text-gray-700">
                            <span className="font-semibold">{product?.name || pc.productId}</span> linked to{' '}
                            <span className="font-semibold">{company?.name || pc.companyId}</span>
                          </span>
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to remove the link between "${product?.name || pc.productId}" and "${company?.name || pc.companyId}"?`)) {
                                return
                              }
                              try {
                                await deleteProductCompany(pc.productId, pc.companyId)
                                const updated = await getProductCompanies()
                                setProductCompanies(updated)
                                alert('Link removed successfully!')
                              } catch (error: any) {
                                console.error('Error deleting relationship:', error)
                                alert(`Error removing link: ${error.message || 'Please try again.'}`)
                              }
                            }}
                            className="text-red-600 hover:text-red-800 cursor-pointer transition-colors p-1 rounded hover:bg-red-50"
                            title="Delete relationship"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            )}

            {/* Link Products to Vendor */}
            {relationshipSubTab === 'productToVendor' && (
            <div className="mb-8 p-6 border border-gray-200 rounded-lg">
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Link Products to Vendor</h3>
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  <strong>Note:</strong> A product can only be linked to one vendor. Products already linked to other vendors will be filtered out.
                </p>
              </div>
              <div className="grid md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Products</label>
                  <select
                    multiple
                    value={selectedProductIds}
                    onChange={(e) => {
                      const selected = Array.from(e.target.selectedOptions, option => option.value)
                      setSelectedProductIds(selected)
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                    size={8}
                  >
                    {products.map(p => {
                      const existingLink = productVendors.find(pv => pv.productId === p.id)
                      const isLinkedToOtherVendor = existingLink && existingLink.vendorId !== selectedVendorId
                      return (
                        <option 
                          key={p.id} 
                          value={p.id}
                          disabled={isLinkedToOtherVendor}
                          style={isLinkedToOtherVendor ? { color: '#999', fontStyle: 'italic' } : {}}
                        >
                          {p.name}{isLinkedToOtherVendor ? ' (already linked to another vendor)' : ''}
                        </option>
                      )
                    })}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Hold Ctrl/Cmd to select multiple. Grayed out products are already linked to other vendors.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Vendor</label>
                  <select
                    value={selectedVendorId}
                    onChange={(e) => {
                      setSelectedVendorId(e.target.value)
                      // Filter out products already linked to other vendors
                      if (e.target.value) {
                        const availableProducts = products.filter(p => {
                          const existingLink = productVendors.find(pv => pv.productId === p.id)
                          return !existingLink || existingLink.vendorId === e.target.value
                        })
                        setSelectedProductIds(prev => prev.filter(id => 
                          availableProducts.some(ap => ap.id === id)
                        ))
                      }
                    }}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Select Vendor</option>
                    {vendors.map(v => (
                      <option key={v.id} value={v.id}>{v.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={handleLinkProductToVendor}
                    disabled={selectedProductIds.length === 0 || !selectedVendorId}
                    className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                  >
                    <Link2 className="h-5 w-5" />
                    <span>Link</span>
                  </button>
                </div>
              </div>
              
              {/* Display all products linked to selected vendor */}
              {selectedVendorId && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-900 mb-3">Products Linked to Selected Vendor</h4>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    {(() => {
                      const vendor = vendors.find(v => v.id === selectedVendorId)
                      const linkedProducts = productVendors
                        .filter(pv => pv.vendorId === selectedVendorId)
                        .map(pv => {
                          const product = products.find(p => p.id === pv.productId)
                          return product
                        })
                        .filter(Boolean)
                      
                      return (
                        <>
                          <h5 className="font-semibold text-gray-900 mb-2">
                            {vendor?.name || selectedVendorId}
                          </h5>
                          {linkedProducts.length === 0 ? (
                            <p className="text-gray-500 text-sm">No products linked to this vendor</p>
                          ) : (
                            <div className="space-y-1">
                              {linkedProducts.map((product, idx) => (
                                <div key={idx} className="flex justify-between items-center bg-white p-2 rounded text-sm">
                                  <span className="text-gray-700">
                                    <span className="font-medium">{product?.name}</span>
                                    {product?.sku && <span className="text-gray-500 ml-2">(SKU: {product.sku})</span>}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* Display existing Product-Vendor relationships */}
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h4 className="text-lg font-semibold text-gray-900 mb-3">All Product-Vendor Links</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {productVendors.length === 0 ? (
                    <p className="text-gray-500 text-sm">No product-vendor links yet</p>
                  ) : (
                    productVendors.map((pv, index) => {
                      const product = products.find(p => p.id === pv.productId)
                      const vendor = vendors.find(v => v.id === pv.vendorId)
                      return (
                        <div key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-lg text-sm">
                          <span className="text-gray-700">
                            <span className="font-semibold">{product?.name || pv.productId}</span> supplied by{' '}
                            <span className="font-semibold">{vendor?.name || pv.vendorId}</span>
                          </span>
                          <button
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to remove the link between "${product?.name || pv.productId}" and "${vendor?.name || pv.vendorId}"?`)) {
                                return
                              }
                              try {
                                await deleteProductVendor(pv.productId, pv.vendorId)
                                const updated = await getProductVendors()
                                setProductVendors(updated)
                                alert('Link removed successfully!')
                              } catch (error: any) {
                                console.error('Error deleting relationship:', error)
                                alert(`Error removing link: ${error.message || 'Please try again.'}`)
                              }
                            }}
                            className="text-red-600 hover:text-red-800 cursor-pointer transition-colors p-1 rounded hover:bg-red-50"
                            title="Delete relationship"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            </div>
            )}


          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

