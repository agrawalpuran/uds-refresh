'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Package, ShoppingCart, TrendingUp, AlertCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getAllProducts, getAllOrders, getProductsByVendor, getOrdersByVendor, getVendorInventorySummary, getLowStockItems } from '@/lib/data-mongodb'
import Link from 'next/link'
// Employee names are now pre-masked by the backend

export default function VendorDashboard() {
  const [vendorId, setVendorId] = useState<string>('')
  const [products, setProducts] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [inventorySummary, setInventorySummary] = useState<{ totalProducts: number; totalStock: number; lowStockCount: number }>({ totalProducts: 0, totalStock: 0, lowStockCount: 0 })
  const [lowStockItems, setLowStockItems] = useState<any[]>([])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        // CRITICAL FIX: Prioritize sessionStorage (from current login) over localStorage (may be stale)
        const { getVendorId, getAuthData } = typeof window !== 'undefined' 
          ? await import('@/lib/utils/auth-storage') 
          : { getVendorId: () => null, getAuthData: () => null }
        
        // Try sessionStorage first (from current login) - MOST RELIABLE
        let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
        
        // Fallback to localStorage (may be stale)
        if (!storedVendorId) {
          storedVendorId = typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null
        }
        
        console.log('[VendorDashboard] VendorId resolved:', storedVendorId)
        
        if (storedVendorId) {
          setVendorId(storedVendorId)
          const vendorProducts = await getProductsByVendor(storedVendorId)
          setProducts(vendorProducts)
        } else {
          // Fallback: get all products if no vendor ID
          const allProducts = await getAllProducts()
          setProducts(allProducts)
        }
        
        // Load orders for this vendor only
        if (storedVendorId) {
          const vendorOrders = await getOrdersByVendor(storedVendorId)
          setOrders(vendorOrders)
          
          // Load inventory summary
          const summary = await getVendorInventorySummary(storedVendorId)
          setInventorySummary(summary)
          
          // Load low stock items
          const lowStock = await getLowStockItems(storedVendorId)
          setLowStockItems(lowStock)
        } else {
          // Fallback: get all orders if no vendor ID
          const allOrders = await getAllOrders()
          setOrders(allOrders)
        }
      } catch (error) {
        console.error('Error loading vendor data:', error)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [])

  // Calculate order stats
  const pendingOrders = orders.filter(o => o.status === 'Awaiting approval' || o.status === 'Awaiting fulfilment').length
  const dispatchedOrders = orders.filter(o => o.status === 'Dispatched').length
  const deliveredOrders = orders.filter(o => o.status === 'Delivered').length
  const totalOrders = orders.length

  const stats = [
    { name: 'Total Inventory', value: inventorySummary.totalStock, icon: Package, color: 'blue' },
    { name: 'Pending Orders', value: pendingOrders, icon: ShoppingCart, color: 'orange' },
    { name: 'Low Stock Items', value: inventorySummary.lowStockCount, icon: AlertCircle, color: 'red' },
    { name: 'Active Products', value: inventorySummary.totalProducts, icon: TrendingUp, color: 'green' },
  ]

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Vendor Dashboard</h1>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon
            const getColorClasses = (color: string | undefined) => {
              const colors: Record<string, { bg: string; text: string }> = {
                blue: { bg: 'bg-blue-100', text: 'text-blue-600' },
                orange: { bg: 'bg-orange-100', text: 'text-orange-600' },
                red: { bg: 'bg-red-100', text: 'text-red-600' },
                green: { bg: 'bg-green-100', text: 'text-green-600' },
              }
              return colors[color || 'blue'] || colors.blue
            }
            const colorClasses = getColorClasses(stat.color) || { bg: 'bg-blue-100', text: 'text-blue-600' }
            
            // Determine if card is clickable and get link
            let isClickable = false
            let linkHref = ''
            if (stat.name === 'Total Inventory' && inventorySummary.totalStock > 0) {
              isClickable = true
              linkHref = '/dashboard/vendor/inventory'
            } else if (stat.name === 'Pending Orders' && pendingOrders > 0) {
              isClickable = true
              linkHref = '/dashboard/vendor/orders'
            } else if (stat.name === 'Low Stock Items' && inventorySummary.lowStockCount > 0) {
              isClickable = true
              linkHref = '/dashboard/vendor/inventory'
            } else if (stat.name === 'Active Products' && inventorySummary.totalProducts > 0) {
              isClickable = true
              linkHref = '/dashboard/vendor/inventory'
            }
            
            // Get inventory breakdown
            const getInventoryBreakdown = () => {
              return products
                .slice(0, 10)
                .map(product => ({
                  name: product.name || 'Unknown',
                  category: product.category || 'N/A'
                }))
            }
            
            // Get pending orders list
            const getPendingOrdersList = () => {
              return orders
                .filter(o => o.status === 'Awaiting approval' || o.status === 'Awaiting fulfilment')
                .slice(0, 10)
                .map(order => ({
                  id: order.id,
                  employeeName: order.employeeName || 'Unknown',
                  total: order.total || 0,
                  itemsCount: order.items?.length || 0,
                  date: order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'
                }))
            }
            
            // Get low stock items
            const getLowStockItemsList = () => {
              // Low stock items should be fetched from VendorInventory, not from product stock
              // For now, return empty array - this should be updated to use VendorInventory data
              return []
            }
            
            // Get active SKUs list
            const getActiveSKUsList = () => {
              return products
                .slice(0, 10)
                .map(product => ({
                  name: product.name || 'Unknown',
                  category: product.category || 'N/A',
                  price: product.price || 0
                }))
            }
            
            const StatCard = (
              <div 
                className={`bg-white rounded-xl shadow-lg p-6 ${isClickable ? 'cursor-pointer hover:shadow-xl transition-shadow' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm mb-1">{stat.name}</p>
                    <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                  </div>
                  <div className={`${colorClasses.bg} p-3 rounded-lg`}>
                    <Icon className={`h-6 w-6 ${colorClasses.text}`} />
                  </div>
                </div>
              </div>
            )
            
            // Render tooltip based on stat type
            const renderTooltip = () => {
              if (showTooltip !== stat.name) return null
              
              if (stat.name === 'Total Inventory' && inventorySummary.totalStock > 0) {
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Inventory Summary
                    </div>
                    <div className="text-xs text-gray-300">
                      <div>Total Products: {inventorySummary.totalProducts}</div>
                      <div>Total Stock: {inventorySummary.totalStock} units</div>
                      <div>Low Stock Items: {inventorySummary.lowStockCount}</div>
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Pending Orders' && pendingOrders > 0) {
                const ordersList = getPendingOrdersList()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Pending Orders ({pendingOrders} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {ordersList.map((order: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">Order #{order.id}</div>
                          <div className="text-gray-300">Employee: {order.employeeName || 'N/A'}</div>
                          <div className="text-gray-300">Items: {order.itemsCount}</div>
                          <div className="text-gray-300">Amount: ₹{order.total.toFixed(2)}</div>
                          <div className="text-gray-400">Date: {order.date}</div>
                          {idx < ordersList.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {pendingOrders > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{pendingOrders - 10} more orders
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Low Stock Items' && inventorySummary.lowStockCount > 0) {
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Low Stock Items ({inventorySummary.lowStockCount} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {lowStockItems.slice(0, 10).map((item: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">{item.productName}</div>
                          <div className="text-red-300">SKU: {item.productSku}</div>
                          <div className="text-gray-300">Low sizes: {Object.keys(item.lowStockSizes || {}).join(', ')}</div>
                          {idx < Math.min(lowStockItems.length, 10) - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {inventorySummary.lowStockCount > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{inventorySummary.lowStockCount - 10} more items
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Active Products' && inventorySummary.totalProducts > 0) {
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Active Products ({inventorySummary.totalProducts} total)
                    </div>
                    <div className="text-xs text-gray-300">
                      Total stock: {inventorySummary.totalStock} units
                    </div>
                  </div>
                )
              }
              
              return null
            }
            
            if (isClickable) {
              return (
                <div 
                  key={stat.name} 
                  className="relative"
                  onMouseEnter={() => setShowTooltip(stat.name)}
                  onMouseLeave={() => setShowTooltip(null)}
                >
                  <Link href={linkHref} className="block">
                    {StatCard}
                  </Link>
                  {renderTooltip()}
                </div>
              )
            }
            
            return (
              <div key={stat.name}>
                {StatCard}
              </div>
            )
          })}
        </div>

        {/* Recent Orders */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Orders</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Order ID</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Employee</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Items</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Total</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Status</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      Loading orders...
                    </td>
                  </tr>
                ) : orders.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-gray-500">
                      No orders found
                    </td>
                  </tr>
                ) : (
                  orders.slice(0, 5).map((order) => (
                    <tr key={order.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 text-gray-900 font-medium">{order.id}</td>
                      <td className="py-3 px-4 text-gray-600">{order.employeeName || 'N/A'}</td>
                      <td className="py-3 px-4 text-gray-600">{order.items?.length || 0} items</td>
                      <td className="py-3 px-4 text-gray-900 font-semibold">₹{order.total?.toFixed(2) || '0.00'}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order.status === 'Delivered' ? 'bg-green-100 text-green-700' :
                          order.status === 'Dispatched' ? 'bg-blue-100 text-blue-700' :
                          order.status === 'Awaiting fulfilment' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === 'Awaiting approval' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {order.status || 'unknown'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {order.orderDate ? new Date(order.orderDate).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        }) : 'N/A'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock Alert */}
        {inventorySummary.lowStockCount > 0 && (
          <div className="bg-red-50 border-l-4 border-red-500 rounded-xl p-6 mb-8">
            <div className="flex items-center space-x-3">
              <AlertCircle className="h-6 w-6 text-red-600" />
              <div className="flex-1">
                <h3 className="font-semibold text-red-900">Low Stock Alert</h3>
                <p className="text-red-700 text-sm">
                  You have {inventorySummary.lowStockCount} product{inventorySummary.lowStockCount !== 1 ? 's' : ''} with low inventory. 
                  <Link href="/dashboard/vendor/inventory" className="ml-1 underline font-semibold">View inventory →</Link>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Order Statistics */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Order Statistics</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Orders</div>
              <div className="text-2xl font-bold text-blue-700">{totalOrders}</div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Pending</div>
              <div className="text-2xl font-bold text-orange-700">{pendingOrders}</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Dispatched</div>
              <div className="text-2xl font-bold text-blue-700">{dispatchedOrders}</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Delivered</div>
              <div className="text-2xl font-bold text-green-700">{deliveredOrders}</div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

