'use client'

import DashboardLayout from '@/components/DashboardLayout'
import PickupModal from '@/components/shipment/PickupModal'
import { Truck, Calendar, Package, MapPin, Phone, User, ExternalLink, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'

interface OrderAwaitingPickup {
  orderId: string
  prNumber: string
  poNumber?: string
  shipmentId: string
  awbNumber: string
  courierProviderCode?: string
  providerShipmentReference?: string
  shipmentStatus: string
  warehouse: {
    warehouseId: string
    warehouseName: string
    address: {
      addressLine1: string
      addressLine2?: string
      city: string
      state: string
      pincode: string
    }
    contactName?: string
    contactPhone?: string
  } | null
  order: {
    id: string
    pr_number: string
    employeeName: string
    companyName: string
    status: string
    dispatchStatus: string
    dispatchedDate?: string
  } | null
  latestPickup: {
    pickupId: string
    pickupStatus: string
    pickupDate: string
    pickupTimeSlot?: string
  } | null
  createdAt: string
}

export default function AwaitingPickupPage() {
  const router = useRouter()
  const [orders, setOrders] = useState<OrderAwaitingPickup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedOrder, setSelectedOrder] = useState<OrderAwaitingPickup | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [isReschedule, setIsReschedule] = useState(false)

  useEffect(() => {
    loadOrders()
  }, [])

  const loadOrders = async () => {
    try {
      setLoading(true)
      setError(null)

      // Get vendor ID
      const { getVendorId, getAuthData } = typeof window !== 'undefined'
        ? await import('@/lib/utils/auth-storage')
        : { getVendorId: () => null, getAuthData: () => null }

      let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      if (!storedVendorId) {
        storedVendorId = typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null
      }

      if (!storedVendorId) {
        throw new Error('Vendor ID not found. Please log in again.')
      }

      // Fetch orders awaiting pickup
      const response = await fetch(`/api/vendor/orders/awaiting-pickup?vendorId=${storedVendorId}`)

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
        throw new Error(errorData.error || 'Failed to load orders awaiting pickup')
      }

      const data = await response.json()
      setOrders(data.orders || [])
    } catch (err: any) {
      console.error('Error loading orders awaiting pickup:', err)
      setError(err.message || 'Failed to load orders')
    } finally {
      setLoading(false)
    }
  }

  const handleSchedulePickup = (order: OrderAwaitingPickup) => {
    setSelectedOrder(order)
    setIsReschedule(false)
    setShowModal(true)
  }

  const handleReschedulePickup = (order: OrderAwaitingPickup) => {
    setSelectedOrder(order)
    setIsReschedule(true)
    setShowModal(true)
  }

  const handleModalSuccess = () => {
    setShowModal(false)
    setSelectedOrder(null)
    loadOrders() // Refresh the list
  }

  const getPickupStatusColor = (status: string) => {
    switch (status) {
      case 'PICKED_UP':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'SCHEDULED':
        return 'bg-blue-100 text-blue-700 border-blue-200'
      case 'RESCHEDULED':
        return 'bg-orange-100 text-orange-700 border-orange-200'
      case 'FAILED':
        return 'bg-red-100 text-red-700 border-red-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="p-6">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-24 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Truck className="h-6 w-6 text-gray-600" />
            <h1 className="text-2xl font-bold text-gray-900">Orders Awaiting Pickup</h1>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
              {orders.length} {orders.length === 1 ? 'order' : 'orders'}
            </span>
          </div>
          <button
            onClick={loadOrders}
            className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-md text-red-700">
            {error}
          </div>
        )}

        {orders.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Truck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Orders Awaiting Pickup</h3>
            <p className="text-gray-500">
              All shipments with AWB numbers have pickups scheduled or completed.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Order Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      AWB / Tracking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Warehouse
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pickup Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {orders.map((order) => (
                    <tr key={order.shipmentId} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            PR: {order.prNumber}
                          </div>
                          {order.poNumber && (
                            <div className="text-gray-500">PO: {order.poNumber}</div>
                          )}
                          {order.order && (
                            <>
                              <div className="text-gray-500 mt-1">
                                {order.order.employeeName} • {order.order.companyName}
                              </div>
                              <div className="text-xs text-gray-400 mt-1">
                                Order ID: {order.order.id}
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          <div className="font-medium text-blue-600 break-all">
                            {order.awbNumber}
                          </div>
                          {order.courierProviderCode && (
                            <div className="text-gray-500 text-xs mt-1">
                              {order.courierProviderCode}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        {order.warehouse ? (
                          <div className="text-sm">
                            <div className="font-medium text-gray-900">
                              {order.warehouse.warehouseName}
                            </div>
                            <div className="text-gray-500 text-xs mt-1">
                              {order.warehouse.address.addressLine1}
                              {order.warehouse.address.addressLine2 && `, ${order.warehouse.address.addressLine2}`}
                              <br />
                              {order.warehouse.address.city}, {order.warehouse.address.state} - {order.warehouse.address.pincode}
                            </div>
                            {order.warehouse.contactPhone && (
                              <div className="text-gray-500 text-xs mt-1">
                                📞 {order.warehouse.contactPhone}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">No warehouse</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {order.latestPickup ? (
                          <div>
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${getPickupStatusColor(order.latestPickup.pickupStatus)}`}>
                              {order.latestPickup.pickupStatus}
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                              {new Date(order.latestPickup.pickupDate).toLocaleDateString('en-IN', {
                                year: 'numeric',
                                month: 'short',
                                day: 'numeric'
                              })}
                            </div>
                            {order.latestPickup.pickupTimeSlot && (
                              <div className="text-xs text-gray-500">
                                {order.latestPickup.pickupTimeSlot}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400 italic">Not scheduled</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center gap-2">
                          {!order.latestPickup ? (
                            <button
                              onClick={() => handleSchedulePickup(order)}
                              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                              disabled={!order.warehouse}
                            >
                              Schedule Pickup
                            </button>
                          ) : order.latestPickup.pickupStatus !== 'PICKED_UP' ? (
                            <button
                              onClick={() => handleReschedulePickup(order)}
                              className="px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 text-sm"
                              disabled={!order.warehouse}
                            >
                              Reschedule
                            </button>
                          ) : (
                            <span className="text-gray-400 text-sm">Completed</span>
                          )}
                          <button
                            onClick={() => router.push(`/dashboard/vendor/orders/${order.orderId}`)}
                            className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 text-sm flex items-center gap-1"
                          >
                            View <ExternalLink className="h-3 w-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pickup Modal */}
        {selectedOrder && (
          <PickupModal
            isOpen={showModal}
            onClose={() => {
              setShowModal(false)
              setSelectedOrder(null)
            }}
            onSuccess={handleModalSuccess}
            shipmentId={selectedOrder.shipmentId}
            isReschedule={isReschedule}
            existingPickup={selectedOrder.latestPickup || undefined}
            warehouse={selectedOrder.warehouse || undefined}
          />
        )}
      </div>
    </DashboardLayout>
  )
}

