'use client'

import { useState, useEffect } from 'react'
import { Calendar, Clock, MapPin, Phone, User, Truck, RefreshCw } from 'lucide-react'

interface PickupManagementProps {
  shipmentId: string
  shipmentMode: 'MANUAL' | 'API'
  awbNumber?: string
  courierProviderCode?: string
}

interface PickupData {
  shipment: {
    shipmentId: string
    shipmentMode: string
    awbNumber?: string
    courierProviderCode?: string
    shipmentStatus: string
  }
  latestPickup: {
    pickupId: string
    pickupStatus: string
    pickupDate: string
    pickupTimeSlot?: string
    pickupReferenceId?: string
    contactName: string
    contactPhone: string
    createdAt: string
  } | null
  pickupHistory: Array<{
    pickupId: string
    pickupStatus: string
    pickupDate: string
    pickupTimeSlot?: string
    createdAt: string
  }>
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
  provider: {
    providerCode: string
    providerName: string
  } | null
}

import PickupModal from './PickupModal'

export default function PickupManagement({ shipmentId, shipmentMode, awbNumber, courierProviderCode }: PickupManagementProps) {
  const [pickupData, setPickupData] = useState<PickupData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [isReschedule, setIsReschedule] = useState(false)

  // Eligibility check
  const isEligible = shipmentMode === 'API' && !!awbNumber
  const canSchedule = isEligible && !pickupData?.latestPickup
  const canReschedule = isEligible && 
                       pickupData?.latestPickup && 
                       pickupData.latestPickup.pickupStatus !== 'PICKED_UP'

  useEffect(() => {
    if (isEligible) {
      fetchPickupData()
    } else {
      setLoading(false)
    }
  }, [shipmentId, isEligible])

  const fetchPickupData = async () => {
    try {
      const response = await fetch(`/api/shipments/${shipmentId}/pickup`)
      if (response.ok) {
        const data = await response.json()
        setPickupData(data)
      }
    } catch (error) {
      console.error('Failed to fetch pickup data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleScheduleClick = () => {
    setIsReschedule(false)
    setShowModal(true)
  }

  const handleRescheduleClick = () => {
    setIsReschedule(true)
    setShowModal(true)
  }

  const handleModalSuccess = () => {
    fetchPickupData()
  }

  // Don't show pickup management for MANUAL shipments or if AWB is missing
  if (!isEligible) {
    return null
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-gray-600" />
            <h2 className="text-lg font-semibold text-gray-900">Pickup Management</h2>
          </div>
          {canSchedule && (
            <button
              onClick={handleScheduleClick}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700"
            >
              Schedule Pickup
            </button>
          )}
          {canReschedule && (
            <button
              onClick={handleRescheduleClick}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-medium rounded-md hover:bg-orange-700"
            >
              Reschedule Pickup
            </button>
          )}
        </div>

        <div className="space-y-4">
          {pickupData?.provider && (
            <div>
              <label className="text-xs font-medium text-gray-500">Shipping Aggregator</label>
              <p className="text-sm font-medium text-gray-900 mt-1">{pickupData.provider.providerName}</p>
            </div>
          )}

          {courierProviderCode && (
            <div>
              <label className="text-xs font-medium text-gray-500">Courier</label>
              <p className="text-sm font-medium text-gray-900 mt-1">{courierProviderCode}</p>
            </div>
          )}

          {awbNumber && (
            <div>
              <label className="text-xs font-medium text-gray-500">AWB Number</label>
              <p className="text-sm font-medium text-blue-600 mt-1 break-all">{awbNumber}</p>
            </div>
          )}

          {pickupData?.warehouse && (
            <div>
              <label className="text-xs font-medium text-gray-500">Warehouse Pickup Address</label>
              <div className="text-sm text-gray-900 mt-1">
                <p>{pickupData.warehouse.address.addressLine1}</p>
                {pickupData.warehouse.address.addressLine2 && (
                  <p>{pickupData.warehouse.address.addressLine2}</p>
                )}
                <p>
                  {pickupData.warehouse.address.city}, {pickupData.warehouse.address.state} - {pickupData.warehouse.address.pincode}
                </p>
              </div>
            </div>
          )}

          {pickupData?.latestPickup && (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500">Pickup Status</label>
                <div className="mt-1">
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${
                    pickupData.latestPickup.pickupStatus === 'PICKED_UP' ? 'bg-green-50 text-green-700 border-green-200' :
                    pickupData.latestPickup.pickupStatus === 'SCHEDULED' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    pickupData.latestPickup.pickupStatus === 'RESCHEDULED' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    {pickupData.latestPickup.pickupStatus}
                  </span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-500">Last Pickup Date/Time</label>
                <div className="text-sm text-gray-900 mt-1">
                  <p>
                    {new Date(pickupData.latestPickup.pickupDate).toLocaleDateString('en-IN', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    })}
                  </p>
                  {pickupData.latestPickup.pickupTimeSlot && (
                    <p className="text-gray-600">{pickupData.latestPickup.pickupTimeSlot}</p>
                  )}
                </div>
              </div>

              {pickupData.latestPickup.contactName && (
                <div>
                  <label className="text-xs font-medium text-gray-500">Contact Person</label>
                  <p className="text-sm text-gray-900 mt-1">{pickupData.latestPickup.contactName}</p>
                </div>
              )}

              {pickupData.latestPickup.contactPhone && (
                <div>
                  <label className="text-xs font-medium text-gray-500">Contact Phone</label>
                  <p className="text-sm text-gray-900 mt-1">{pickupData.latestPickup.contactPhone}</p>
                </div>
              )}
            </>
          )}

          {!pickupData?.latestPickup && (
            <div className="text-sm text-gray-500 italic">
              No pickup scheduled yet. Click "Schedule Pickup" to schedule a pickup.
            </div>
          )}
        </div>
      </div>

      <PickupModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleModalSuccess}
        shipmentId={shipmentId}
        isReschedule={isReschedule}
        existingPickup={pickupData?.latestPickup || undefined}
        warehouse={pickupData?.warehouse || undefined}
      />
    </>
  )
}

