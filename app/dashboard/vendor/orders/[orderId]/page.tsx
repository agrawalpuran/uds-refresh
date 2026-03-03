'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { ArrowLeft, Package, Truck, MapPin, Calendar, User, Mail, FileText, X, Scissors } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'

interface PRWithEmployee extends any {
  employeeAddress?: {
    address_line_1?: string
    address_line_2?: string
    address_line_3?: string
    city?: string
    state?: string
    pincode?: string
    country?: string
  }
  employeeEmail?: string
  employeeFullName?: string
}

export default function OrderDetailsPage() {
  const router = useRouter()
  const params = useParams()
  const orderId = params?.orderId as string

  const [poNumber, setPONumber] = useState<string | null>(null)
  const [poDate, setPODate] = useState<Date | null>(null)
  const [prs, setPRs] = useState<PRWithEmployee[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [courierNames, setCourierNames] = useState<Map<string, string>>(new Map())
  const [mtmMeasurements, setMtmMeasurements] = useState<Record<string, any[]>>({})

  useEffect(() => {
    let cancelled = false
    if (orderId) {
      const loadOrderDetails = async () => {
        try {
          setLoading(true)
          setError(null)

          // Get vendor ID for authorization
          const { getVendorId, getAuthData } = typeof window !== 'undefined'
            ? await import('@/lib/utils/auth-storage')
            : { getVendorId: () => null, getAuthData: () => null }

          // SECURITY FIX: No localStorage fallback
          const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null

          if (!storedVendorId) {
            throw new Error('Vendor ID not found. Please log in again.')
          }

          // Fetch order details (now returns all PRs for the PO)
          const response = await fetch(`/api/vendor/orders/${orderId}?vendorId=${storedVendorId}`)
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }))
            throw new Error(errorData.error || 'Failed to load order details')
          }

          const data = await response.json()
          if (cancelled) return
          setPONumber(data.poNumber)
          setPODate(data.poDate ? new Date(data.poDate) : null)
      
      // Fetch courier names for all unique courier codes
      const courierCodes = new Set<string>()
      ;(data.prs || []).forEach((pr: any) => {
        if (pr.shipment?.courierProviderCode) {
          courierCodes.add(pr.shipment.courierProviderCode)
        }
      })
      
      const courierNamesMap = new Map<string, string>()
      if (courierCodes.size > 0) {
        try {
          const courierRes = await fetch('/api/superadmin/manual-courier-providers?isActive=true')
          if (courierRes.ok) {
            const courierData = await courierRes.json()
            const couriers = courierData.couriers || []
            couriers.forEach((courier: any) => {
              if (courierCodes.has(courier.courierCode)) {
                courierNamesMap.set(courier.courierCode, courier.courierName)
              }
            })
          }
        } catch (err) {
          console.warn('Failed to fetch courier names:', err)
        }
      }
      if (cancelled) return
      setCourierNames(courierNamesMap)
      
      // Batch-fetch unique employees (deduplicate IDs to avoid redundant requests)
      const prsList: any[] = data.prs || []
      const employeeIdToPr = new Map<string, any[]>()
      for (const pr of prsList) {
        const eid = pr.employeeId
          ? (typeof pr.employeeId === 'object' ? pr.employeeId.id : pr.employeeId)
          : pr.employeeIdNum || null
        if (eid) {
          if (!employeeIdToPr.has(eid)) employeeIdToPr.set(eid, [])
          employeeIdToPr.get(eid)!.push(pr)
        }
      }

      const uniqueEmpIds = [...employeeIdToPr.keys()]
      const empDataMap = new Map<string, any>()
      if (uniqueEmpIds.length > 0) {
        const empResults = await Promise.all(
          uniqueEmpIds.map(eid =>
            fetch(`/api/employees?employeeId=${eid}&forShipment=true`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          )
        )
        uniqueEmpIds.forEach((eid, i) => {
          const raw = empResults[i]
          empDataMap.set(eid, Array.isArray(raw) ? raw[0] : raw)
        })
      }
      if (cancelled) return

      const prsWithEmployeeData = prsList.map((pr: any) => {
        const employeeId = pr.employeeId
          ? (typeof pr.employeeId === 'object' ? pr.employeeId.id : pr.employeeId)
          : pr.employeeIdNum || null
        let employeeAddress = null
        let employeeEmail = pr.employeeEmail || 'N/A'
        let employeeFullName = pr.employeeName || 'N/A'

        const employee = employeeId ? empDataMap.get(employeeId) : null
        if (employee) {
          if (employee.address_line_1 || employee.address) {
            employeeAddress = {
              address_line_1: employee.address_line_1 || employee.address?.address_line_1 || '',
              address_line_2: employee.address_line_2 || employee.address?.address_line_2 || '',
              address_line_3: employee.address_line_3 || employee.address?.address_line_3 || '',
              city: employee.city || employee.address?.city || '',
              state: employee.state || employee.address?.state || '',
              pincode: employee.pincode || employee.address?.pincode || '',
              country: employee.country || employee.address?.country || 'India',
            }
          }
          if (employee.email) employeeEmail = employee.email
          if (employee.firstName && employee.lastName) {
            employeeFullName = `${employee.firstName} ${employee.lastName}`.trim()
          } else if (employee.firstName) {
            employeeFullName = employee.firstName
          }
        }

        return { ...pr, employeeAddress, employeeEmail, employeeFullName }
      })
      if (cancelled) return
      setPRs(prsWithEmployeeData)

      // Fetch MTM measurements in parallel (not sequentially)
      const mtmPrs = prsWithEmployeeData.filter((pr: any) => {
        const prId = pr._id || pr.id
        return prId && pr.items?.some((item: any) => item.fit_type === 'MTM')
      })
      const mtmMap: Record<string, any[]> = {}
      if (mtmPrs.length > 0) {
        const mtmResults = await Promise.all(
          mtmPrs.map((pr: any) => {
            const prId = pr._id || pr.id
            return fetch(`/api/mtm/order-measurements?orderId=${prId}`)
              .then(r => r.ok ? r.json() : null)
              .catch(() => null)
          })
        )
        mtmPrs.forEach((pr: any, i: number) => {
          const prId = pr._id || pr.id
          const d = mtmResults[i]
          if (d) mtmMap[prId] = Array.isArray(d) ? d : d.measurements || []
        })
      }
      if (cancelled) return
      setMtmMeasurements(mtmMap)
        } catch (err: any) {
          console.error('Error loading order details:', err)
          setError(err.message || 'Failed to load order details')
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
      loadOrderDetails()
    }
    return () => { cancelled = true }
  }, [orderId])

  const formatDate = (date: Date | string | null) => {
    if (!date) return 'N/A'
    const d = new Date(date)
    return d.toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric'
    })
  }

  const formatAddress = (address: any) => {
    if (!address) return 'Address not available'
    const parts = []
    if (address.address_line_1) parts.push(address.address_line_1)
    if (address.address_line_2) parts.push(address.address_line_2)
    if (address.address_line_3) parts.push(address.address_line_3)
    const cityState = [
      address.city,
      address.state,
      address.pincode
    ].filter(Boolean).join(', ')
    if (cityState) parts.push(cityState)
    if (address.country && address.country !== 'India') parts.push(address.country)
    return parts.length > 0 ? parts.join(', ') : 'Address not available'
  }

  // Calculate totals
  const totalPRs = prs.length
  const poTotal = prs.reduce((sum, pr) => sum + (pr.total || 0), 0)

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading order details...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <X className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600 mb-4">{error}</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (!prs || prs.length === 0) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <Package className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600 mb-4">No order details found</p>
            <button
              onClick={() => router.back()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-4 max-w-6xl mx-auto">
        {/* Compact Header */}
        <div className="mb-3">
          <button
            onClick={() => router.back()}
            className="mb-2 p-1.5 hover:bg-gray-100 rounded transition-colors inline-flex items-center gap-1.5 text-gray-600 hover:text-gray-900 text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </button>
          
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                {poNumber ? `PO Number: ${poNumber}` : 'Order Details'}
              </h1>
              {poDate && (
                <p className="text-xs text-gray-600 mt-0.5">PO Date: {formatDate(poDate)}</p>
              )}
            </div>
            {prs[0]?.status && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
                prs[0].status === 'Delivered' ? 'bg-green-100 text-green-700' :
                prs[0].status === 'Dispatched' ? 'bg-blue-100 text-blue-700' :
                prs[0].status === 'Awaiting fulfilment' ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-700'
              }`}>
                {prs[0].status}
              </span>
            )}
          </div>
        </div>

        {/* Compact PR List */}
        <div className="space-y-3">
          {prs.map((pr, prIndex) => {
            const shipment = pr.shipment || null
            const address = pr.employeeAddress || {
              address_line_1: pr.shipping_address_line_1,
              address_line_2: pr.shipping_address_line_2,
              address_line_3: pr.shipping_address_line_3,
              city: pr.shipping_city,
              state: pr.shipping_state,
              pincode: pr.shipping_pincode,
              country: pr.shipping_country || 'India',
            }

            // Determine shipment status: use shipment status if available, otherwise derive from order delivery status
            const effectiveShipmentStatus = shipment?.shipmentStatus || 
              (pr.deliveryStatus === 'DELIVERED' ? 'DELIVERED' : 
               pr.deliveryStatus === 'PARTIALLY_DELIVERED' ? 'IN_TRANSIT' :
               pr.dispatchStatus === 'SHIPPED' ? 'IN_TRANSIT' :
               shipment?.shipmentStatus || 'CREATED')

            // Debug: Log shipment data
            if (pr.shipment) {
              console.log(`[PR ${pr.pr_number}] Shipment data:`, {
                dispatchedDate: pr.shipment.dispatchedDate,
                modeOfTransport: pr.shipment.modeOfTransport,
                courierProviderCode: pr.shipment.courierProviderCode,
                shipmentStatus: pr.shipment.shipmentStatus,
                deliveryStatus: pr.deliveryStatus,
                effectiveShipmentStatus,
              })
            }

            return (
              <div key={pr._id || pr.id || prIndex} className="bg-white rounded-lg border border-gray-200 p-3">
                {/* PR Header - Compact */}
                <div className="flex items-start justify-between mb-2 pb-2 border-b border-gray-100">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-blue-600" />
                      <h2 className="text-sm font-bold text-gray-900">
                        PR: {pr.pr_number || `PR-${prIndex + 1}`}
                      </h2>
                    </div>
                    <p className="text-xs text-gray-600 mt-0.5">PR Date: {formatDate(pr.pr_date || pr.orderDate)}</p>
                  </div>
                </div>

                {/* Employee Info - Compact Inline */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2 text-xs bg-blue-50 rounded p-2">
                  <div>
                    <span className="text-gray-500">Employee:</span>
                    <span className="ml-1 font-medium text-gray-900">{pr.employeeFullName || 'N/A'}</span>
                    {pr.employeeIdNum && (
                      <span className="ml-1 text-gray-600">({pr.employeeIdNum})</span>
                    )}
                  </div>
                  <div>
                    <span className="text-gray-500">Email:</span>
                    <span className="ml-1 text-gray-900 break-all">{pr.employeeEmail || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Delivery Address:</span>
                    <span className="ml-1 text-gray-900">{formatAddress(address)}</span>
                  </div>
                </div>

                {/* Ordered Items - Compact List */}
                <div className="mb-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Package className="h-3.5 w-3.5 text-gray-500" />
                    <span className="text-xs font-semibold text-gray-700">Ordered Items:</span>
                  </div>
                  <div className="space-y-1">
                    {pr.items && pr.items.length > 0 ? (
                      pr.items.map((item: any, itemIndex: number) => {
                        const prId = pr._id || pr.id
                        const itemMTM = item.fit_type === 'MTM'
                          ? mtmMeasurements[prId]?.find((m: any) => m.item_index === itemIndex)
                          : null

                        return (
                          <div key={itemIndex} className="text-xs py-0.5">
                            <div className="flex justify-between items-center">
                              <span className="text-gray-700 flex-1">
                                {item.uniformName || 'Product'}
                                {item.fit_type === 'MTM' ? (
                                  <span className="inline-flex items-center ml-1.5 text-[9px] px-1 py-0.5 gap-0.5 bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium">
                                    <Scissors className="h-2 w-2" />
                                    MTM
                                  </span>
                                ) : (
                                  item.size && ` (Size: ${item.size})`
                                )}
                                <span className="text-gray-500"> x {item.quantity}</span>
                              </span>
                              <span className="text-gray-900 font-medium ml-2">₹{(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                            {itemMTM && itemMTM.measurements && (
                              <div className="mt-1 ml-2 p-1.5 bg-violet-50 rounded border border-violet-100">
                                <p className="text-[10px] font-medium text-violet-700 mb-0.5">Measurements:</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-0">
                                  {itemMTM.measurements.map((m: any, mi: number) => (
                                    <span key={mi} className="text-[10px] text-gray-600">
                                      {m.label || m.key}: <span className="font-medium">{m.value}{m.unit}</span>
                                    </span>
                                  ))}
                                </div>
                                {itemMTM.special_instructions && (
                                  <p className="text-[10px] text-gray-500 mt-0.5 italic">Note: {itemMTM.special_instructions}</p>
                                )}
                              </div>
                            )}
                          </div>
                        )
                      })
                    ) : (
                      <p className="text-xs text-gray-500 italic">No items found</p>
                    )}
                  </div>
                  {pr.total && (
                    <div className="mt-1.5 pt-1.5 border-t border-gray-100 flex justify-between items-center text-xs">
                      <span className="font-semibold text-gray-700">PR Total:</span>
                      <span className="font-bold text-gray-900">₹{pr.total.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                {/* Shipment Info - Compact */}
                {(shipment || pr.deliveryStatus || pr.dispatchStatus) && (
                  <div className="mt-2 pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Truck className="h-3.5 w-3.5 text-gray-500" />
                      <span className="text-xs font-semibold text-gray-700">Shipment:</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs bg-green-50 rounded p-2">
                      {effectiveShipmentStatus && (
                        <div>
                          <span className="text-gray-500">Status:</span>
                          <span className={`ml-1 px-1.5 py-0.5 rounded text-xs font-semibold ${
                            effectiveShipmentStatus === 'DELIVERED' ? 'bg-green-100 text-green-700' :
                            effectiveShipmentStatus === 'IN_TRANSIT' ? 'bg-blue-100 text-blue-700' :
                            effectiveShipmentStatus === 'CREATED' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {effectiveShipmentStatus}
                          </span>
                        </div>
                      )}
                      <div>
                        <span className="text-gray-500">Shipment Date:</span>
                        <span className="ml-1 text-gray-900 font-medium">
                          {shipment?.dispatchedDate 
                            ? formatDate(shipment.dispatchedDate) 
                            : (pr.dispatchedDate ? formatDate(pr.dispatchedDate) : 'N/A')}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Mode of Transport:</span>
                        <span className="ml-1 text-gray-900 font-medium">
                          {shipment?.modeOfTransport || pr.modeOfTransport || 'N/A'}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Courier Service:</span>
                        <span className="ml-1 text-gray-900 font-medium">
                          {shipment?.courierProviderCode 
                            ? (courierNames.get(shipment.courierProviderCode) || shipment.courierProviderCode)
                            : (pr.carrierName || 'N/A')}
                        </span>
                      </div>
                      {shipment?.providerShipmentReference && (
                        <div>
                          <span className="text-gray-500">AWB:</span>
                          <span className="ml-1 text-blue-600 font-medium break-all">{shipment.providerShipmentReference}</span>
                        </div>
                      )}
                      {pr.shipmentReferenceNumber && (
                        <div>
                          <span className="text-gray-500">Shipment Ref No:</span>
                          <span className="ml-1 text-gray-900 font-medium break-all">{pr.shipmentReferenceNumber}</span>
                        </div>
                      )}
                      {pr.trackingNumber && (
                        <div>
                          <span className="text-gray-500">Tracking No:</span>
                          <span className="ml-1 text-blue-600 font-medium break-all">{pr.trackingNumber}</span>
                        </div>
                      )}
                      {shipment?.expectedDeliveryDate && (
                        <div>
                          <span className="text-gray-500">Expected Delivery:</span>
                          <span className="ml-1 text-gray-900">{formatDate(shipment.expectedDeliveryDate)}</span>
                        </div>
                      )}
                      {pr.deliveredDate && (
                        <div>
                          <span className="text-gray-500">Delivered Date:</span>
                          <span className="ml-1 text-gray-900 font-medium">{formatDate(pr.deliveredDate)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Summary Footer - Compact */}
        <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between items-center text-sm">
          <span className="text-gray-600">Total PRs: <span className="font-semibold text-gray-900">{totalPRs}</span></span>
          <span className="text-gray-600">PO Total: <span className="font-bold text-gray-900 text-base">₹{poTotal.toFixed(2)}</span></span>
        </div>

        {/* Close Button */}
        <div className="mt-4 flex justify-center">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </DashboardLayout>
  )
}
