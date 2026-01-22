'use client'

/**
 * UDS Context: Vendor Inventory Management Page
 * 
 * This page is part of the Uniform Distribution System (UDS) - a B2B2C platform
 * for managing uniform distribution, tracking, and fulfillment.
 * 
 * Purpose:
 * - Allows vendors to view and manage inventory for products assigned to them
 * - Displays products linked via ProductVendor relationships (single source of truth)
 * - Enables vendors to update stock levels and low inventory thresholds per size
 * - Shows low stock alerts and inventory summaries
 * 
 * Access Control:
 * - Only products assigned via ProductVendor relationships are visible
 * - Vendor ID is resolved from sessionStorage (current login) with localStorage fallback
 * - No fallback vendorId is used (prevents data leakage between vendors)
 * 
 * Key Features:
 * - Real-time inventory tracking per product size
 * - Low stock threshold management
 * - Search and filter capabilities
 * - Visual indicators for stock levels (green/yellow/red)
 * 
 * Related Files:
 * - UDS_CONTEXT.md - Complete system documentation
 * - lib/db/data-access.ts - Database queries (getVendorInventory, getProductsByVendor)
 * - lib/models/VendorInventory.ts - Inventory data model
 */

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Search, Edit, Package, Save, X } from 'lucide-react'
import { getProductsByVendor, getVendorInventory, updateVendorInventory, getLowStockItems, getVendorByEmail, getProductById } from '@/lib/data-mongodb'
import Image from 'next/image'
import { getUniformImage } from '@/lib/utils/image-mapping'

export default function InventoryPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [vendorId, setVendorId] = useState<string>('')
  const [products, setProducts] = useState<any[]>([])
  const [inventoryData, setInventoryData] = useState<Map<string, any>>(new Map())
  const [loading, setLoading] = useState(true)
  const [editingProductId, setEditingProductId] = useState<string | null>(null)
  const [editingSizes, setEditingSizes] = useState<{ [size: string]: number }>({})
  const [editingThresholds, setEditingThresholds] = useState<{ [size: string]: number }>({})
  const [saving, setSaving] = useState(false)
  const [lowStockItems, setLowStockItems] = useState<any[]>([])
  
  // Get vendor ID from localStorage (set during login)
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        
        // CRITICAL FIX: Prioritize sessionStorage (from current login) over localStorage (may be stale)
        // sessionStorage is tab-specific and set during login, localStorage may have old data from previous login
        const { getUserEmail, getVendorId, getAuthData } = typeof window !== 'undefined' 
          ? await import('@/lib/utils/auth-storage') 
          : { getUserEmail: () => null, getVendorId: () => null, getAuthData: () => null }
        
        // STEP 1: Try sessionStorage first (from current login) - MOST RELIABLE
        let targetVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
        const storedUserEmail = getUserEmail('vendor')
        
        console.log('[Inventory] 🔍 VendorId resolution (priority order):')
        console.log('[Inventory]   1. sessionStorage (getVendorId):', getVendorId())
        console.log('[Inventory]   2. sessionStorage (getAuthData):', getAuthData('vendor')?.vendorId)
        
        // STEP 2: Fallback to localStorage (may be stale, but better than nothing)
        if (!targetVendorId) {
          const localStorageVendorId = typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null
          console.log('[Inventory]   3. localStorage (fallback):', localStorageVendorId)
          targetVendorId = localStorageVendorId
        }
        
        // STEP 3: If vendorId is still not found but userEmail exists, try to get vendor by email
        if (!targetVendorId && storedUserEmail) {
          console.log('[Inventory]   4. Email lookup (last resort):', storedUserEmail)
          console.log('[Inventory] vendorId not found, trying to get vendor by email:', storedUserEmail)
          try {
            const vendor = await getVendorByEmail(storedUserEmail)
            if (vendor && vendor.id) {
              targetVendorId = vendor.id
              console.log('[Inventory] ✅ Found vendor by email, vendorId:', targetVendorId)
              console.log('[Inventory] ✅ Vendor name:', vendor.name)
              
              // CRITICAL: Update BOTH sessionStorage (current login) AND localStorage (backward compatibility)
              const { setAuthData } = await import('@/lib/utils/auth-storage')
              setAuthData('vendor', {
                userEmail: storedUserEmail,
                vendorId: targetVendorId
              })
              
              // Also update localStorage for backward compatibility
              if (typeof window !== 'undefined') {
                localStorage.setItem('vendorId', targetVendorId)
              }
            } else {
              console.error('[Inventory] ❌ Vendor not found for email:', storedUserEmail)
            }
          } catch (emailError) {
            console.error('[Inventory] ❌ Error getting vendor by email:', emailError)
          }
        }
        
        // CRITICAL SECURITY: Do NOT use fallback vendorId
        // If vendorId is not found, vendor should not see any products
        // Using a default vendorId would show products from another vendor (data leakage)
        if (!targetVendorId) {
          console.error('[Inventory] ❌ CRITICAL: No vendorId found - cannot load inventory')
          console.error('[Inventory] ❌ Vendor must be logged in with valid vendorId')
          console.error('[Inventory] ❌ NOT using fallback vendorId (would violate data isolation)')
          setProducts([])
          setLoading(false)
          return
        }
        
        console.log('[Inventory] ========================================')
        console.log('[Inventory] 🔍 VENDOR ID RESOLUTION SUMMARY:')
        console.log('[Inventory]   targetVendorId (final):', targetVendorId)
        console.log('[Inventory]   storedUserEmail:', storedUserEmail)
        console.log('[Inventory] ========================================')
        console.log('[Inventory] Loading data for vendorId:', targetVendorId)
        setVendorId(targetVendorId)
        
        // Load products linked to this vendor (PRIMARY METHOD)
        console.log('[Inventory] Fetching products for vendor:', targetVendorId)
        let vendorProducts = await getProductsByVendor(targetVendorId)
        console.log('[Inventory] Products from getProductsByVendor:', vendorProducts.length)
        console.log('[Inventory] Product names:', vendorProducts.map((p: any) => `${p.name} (${p.sku})`))
        
        // CRITICAL: NO FALLBACK - ProductVendor relationships are the SINGLE SOURCE OF TRUTH
        // If no products are returned, vendor has no assigned products
        // Do NOT fall back to inventory records - this would show unassigned products
        if (vendorProducts.length === 0) {
          console.warn('[Inventory] ⚠️ No products from getProductsByVendor - vendor has no products assigned via ProductVendor relationships')
          console.warn('[Inventory] ⚠️ NOT using fallback to inventory records (would violate access control)')
          console.warn('[Inventory] ⚠️ Vendor must have products assigned by Super Admin to see them in catalog/inventory')
          
          // Still fetch inventory for display (if any exists), but don't use it to derive products
          // Inventory is only used for displaying stock levels for products that are already assigned
          const inventory = await getVendorInventory(targetVendorId)
          console.log('[Inventory] Inventory records found (for display only, NOT used to derive products):', inventory.length)
        }
        
        console.log('[Inventory] Final products count:', vendorProducts.length)
        setProducts(vendorProducts)
        
        // Load inventory data for all products
        console.log('[Inventory] Fetching inventory for vendor:', targetVendorId)
        const inventory = await getVendorInventory(targetVendorId)
        console.log('[Inventory] Inventory records received:', inventory.length)
        const inventoryMap = new Map()
        inventory.forEach((inv: any) => {
          inventoryMap.set(inv.productId, inv)
        })
        setInventoryData(inventoryMap)
        
        // Load low stock items
        const lowStock = await getLowStockItems(targetVendorId)
        setLowStockItems(lowStock)
      } catch (error) {
        console.error('[Inventory] Error loading inventory:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])
  
  const handleEdit = (product: any) => {
    const inventory = inventoryData.get(product.id)
    const sizeInventory = inventory?.sizeInventory || {}
    const thresholds = inventory?.lowInventoryThreshold || {}
    
    // Initialize with product's available sizes, defaulting to 0
    const initialSizes: { [size: string]: number } = {}
    const initialThresholds: { [size: string]: number } = {}
    product.sizes?.forEach((size: string) => {
      initialSizes[size] = sizeInventory[size] || 0
      initialThresholds[size] = thresholds[size] || 0
    })
    
    setEditingSizes(initialSizes)
    setEditingThresholds(initialThresholds)
    setEditingProductId(product.id)
  }
  
  const handleSave = async (productId: string) => {
    try {
      setSaving(true)
      await updateVendorInventory(vendorId, productId, editingSizes, editingThresholds)
      
      // Reload inventory data
      const inventory = await getVendorInventory(vendorId, productId)
      if (inventory.length > 0) {
        const updatedMap = new Map(inventoryData)
        updatedMap.set(productId, inventory[0])
        setInventoryData(updatedMap)
      }
      
      // Reload low stock items
      const lowStock = await getLowStockItems(vendorId)
      setLowStockItems(lowStock)
      
      setEditingProductId(null)
      setEditingSizes({})
      setEditingThresholds({})
    } catch (error) {
      console.error('Error saving inventory:', error)
      alert('Failed to save inventory. Please try again.')
    } finally {
      setSaving(false)
    }
  }
  
  const handleCancel = () => {
    setEditingProductId(null)
    setEditingSizes({})
    setEditingThresholds({})
  }
  
  const handleSizeChange = (size: string, value: string) => {
    const numValue = parseInt(value) || 0
    setEditingSizes((prev) => ({
      ...prev,
      [size]: numValue,
    }))
  }
  
  const handleThresholdChange = (size: string, value: string) => {
    const numValue = parseInt(value) || 0
    setEditingThresholds((prev) => ({
      ...prev,
      [size]: numValue,
    }))
  }
  
  const isLowStock = (productId: string, size: string, stock: number) => {
    const inventory = inventoryData.get(productId)
    if (!inventory) return false
    const threshold = inventory.lowInventoryThreshold?.[size] || 0
    return threshold > 0 && stock <= threshold
  }
  
  const filteredProducts = products.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase())
  )
  
  const getInventoryForProduct = (productId: string) => {
    return inventoryData.get(productId) || {
      sizeInventory: {},
      totalStock: 0,
    }
  }
  
  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading inventory...</div>
        </div>
      </DashboardLayout>
    )
  }
  
  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Inventory Management</h1>
        </div>

        {/* Low Stock Alert Banner */}
        {lowStockItems.length > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">
                  <strong>Low Stock Alert:</strong> {lowStockItems.length} product{lowStockItems.length !== 1 ? 's' : ''} have low inventory. Please restock soon.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or SKU..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Consolidated Inventory Table */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">SKU</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Sizes & Thresholds</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Total Stock</th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      {searchTerm ? 'No products found matching your search.' : 'No products linked to this vendor.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((product: any) => {
                    const inventory = getInventoryForProduct(product.id)
                    const isEditing = editingProductId === product.id
                    const sizeInventory = inventory.sizeInventory || {}
                    const thresholds = inventory.lowInventoryThreshold || {}
                    
                    // Check if product has any low stock sizes
                    const hasLowStock = product.sizes?.some((size: string) => {
                      const stock = sizeInventory[size] || 0
                      return isLowStock(product.id, size, stock)
                    })
                    
                    return (
                      <tr 
                        key={product.id} 
                        className={`hover:bg-gray-50 ${hasLowStock ? 'bg-red-50 border-l-4 border-red-500' : ''}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center space-x-3">
                            <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-white">
                              <Image
                                src={getUniformImage(product.image, product.category, product.gender, product.name)}
                                alt={product.name}
                                fill
                                className="object-contain object-center"
                                unoptimized={true}
                                onError={(e) => {
                                  const target = e.target as HTMLImageElement
                                  target.src = '/images/uniforms/default.jpg'
                                }}
                              />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900">{product.name}</div>
                              <div className="text-sm text-gray-500 font-mono">{product.sku}</div>
                              {/* Display attributes only if they have values */}
                              {((product as any).attribute1_value || (product as any).attribute2_value || (product as any).attribute3_value) && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {(product as any).attribute1_value && (
                                    <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">
                                      {(product as any).attribute1_name || 'Attr1'}: {(product as any).attribute1_value}
                                    </span>
                                  )}
                                  {(product as any).attribute2_value && (
                                    <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded">
                                      {(product as any).attribute2_name || 'Attr2'}: {(product as any).attribute2_value}
                                    </span>
                                  )}
                                  {(product as any).attribute3_value && (
                                    <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">
                                      {(product as any).attribute3_name || 'Attr3'}: {(product as any).attribute3_value}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-gray-500 mt-1">{product.gender}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-600">{product.sku}</td>
                        <td className="px-6 py-4 text-sm text-gray-600 capitalize">{product.category}</td>
                        <td className="px-6 py-4">
                          {isEditing ? (
                            <div className="flex flex-wrap gap-3 justify-center">
                              {product.sizes?.map((size: string) => {
                                const stock = editingSizes[size] || 0
                                const threshold = editingThresholds[size] || 0
                                const isLow = threshold > 0 && stock <= threshold
                                return (
                                  <div key={size} className={`p-2 rounded border ${isLow ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                                    <div className="text-xs font-semibold text-gray-700 mb-1">{size}</div>
                                    <div className="flex items-center space-x-1 mb-1">
                                      <span className="text-xs text-gray-600">Stock:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={stock}
                                        onChange={(e) => handleSizeChange(size, e.target.value)}
                                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <span className="text-xs text-gray-600">Threshold:</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={threshold}
                                        onChange={(e) => handleThresholdChange(size, e.target.value)}
                                        className="w-16 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2 justify-center">
                              {product.sizes?.map((size: string) => {
                                const qty = sizeInventory[size] || 0
                                const threshold = thresholds[size] || 0
                                const isLow = isLowStock(product.id, size, qty)
                                return (
                                  <div key={size} className={`px-2 py-1 text-xs font-medium rounded border ${
                                    isLow
                                      ? 'bg-red-100 text-red-700 border-red-300'
                                      : qty > 0
                                        ? qty > 10
                                          ? 'bg-green-100 text-green-700 border-green-300'
                                          : 'bg-yellow-100 text-yellow-700 border-yellow-300'
                                        : 'bg-gray-100 text-gray-700 border-gray-300'
                                  }`}>
                                    <div className="font-semibold">{size}: {qty}</div>
                                    {threshold > 0 && (
                                      <div className="text-xs opacity-75">Threshold: {threshold}</div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                            inventory.totalStock > 50
                              ? 'bg-green-100 text-green-700'
                              : inventory.totalStock > 0
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-red-100 text-red-700'
                          }`}>
                            {inventory.totalStock || 0}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center justify-center space-x-2">
                            {isEditing ? (
                              <>
                                <button
                                  onClick={() => handleSave(product.id)}
                                  disabled={saving}
                                  className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Save"
                                >
                                  <Save className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={handleCancel}
                                  disabled={saving}
                                  className="p-2 bg-gray-400 text-white rounded-lg hover:bg-gray-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  title="Cancel"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              </>
                            ) : (
                              <button
                                onClick={() => handleEdit(product)}
                                className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                title="Edit Inventory"
                              >
                                <Edit className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
