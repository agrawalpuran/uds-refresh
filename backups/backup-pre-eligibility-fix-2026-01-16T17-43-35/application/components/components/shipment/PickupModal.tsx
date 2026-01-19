'use client'

import { useState, useEffect } from 'react'

interface PickupModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
  shipmentId: string
  isReschedule: boolean
  existingPickup?: {
    pickupId: string
    pickupStatus: string
    pickupDate: string
    pickupTimeSlot?: string
    contactName: string
    contactPhone: string
  } | null
  warehouse?: {
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
}

export default function PickupModal({ isOpen, onClose, onSuccess, shipmentId, isReschedule, existingPickup, warehouse }: PickupModalProps) {
  const [formData, setFormData] = useState({
    contactName: warehouse?.contactName || '',
    contactPhone: warehouse?.contactPhone || '',
    pickupDate: '',
    pickupTimeSlot: '10:00-13:00',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isOpen && warehouse) {
      // Prefill form with warehouse data
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      setFormData({
        contactName: existingPickup?.contactName || warehouse.contactName || '',
        contactPhone: existingPickup?.contactPhone || warehouse.contactPhone || '',
        pickupDate: existingPickup?.pickupDate 
          ? new Date(existingPickup.pickupDate).toISOString().split('T')[0]
          : tomorrow.toISOString().split('T')[0],
        pickupTimeSlot: existingPickup?.pickupTimeSlot || '10:00-13:00',
      })
      setErrors({})
    }
  }, [isOpen, warehouse, existingPickup])

  const validatePhone = (phone: string): string | null => {
    // Remove all non-digits
    let digitsOnly = phone.replace(/\D/g, '')
    
    // Reject masked values
    if (digitsOnly.includes('*') || digitsOnly.includes('X') || /^9{6,}/.test(digitsOnly)) {
      return 'Phone number appears to be masked or invalid'
    }
    
    // Strip country code
    if (digitsOnly.length >= 12 && digitsOnly.startsWith('91')) {
      digitsOnly = digitsOnly.substring(2)
    }
    
    // Strip leading 0
    if (digitsOnly.length > 10 && digitsOnly.startsWith('0')) {
      digitsOnly = digitsOnly.substring(1)
    }
    
    // Must be exactly 10 digits
    if (digitsOnly.length !== 10 || !/^\d{10}$/.test(digitsOnly)) {
      return 'Phone number must be exactly 10 digits'
    }
    
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors({})

    // Validate phone number
    const phoneError = validatePhone(formData.contactPhone)
    if (phoneError) {
      setErrors({ contactPhone: phoneError })
      return
    }

    // Validate required fields
    if (!formData.contactName.trim()) {
      setErrors({ contactName: 'Contact name is required' })
      return
    }

    if (!formData.pickupDate) {
      setErrors({ pickupDate: 'Pickup date is required' })
      return
    }

    if (!warehouse?.warehouseId) {
      setErrors({ general: 'Warehouse information is missing' })
      return
    }

    setLoading(true)

    try {
      const endpoint = isReschedule
        ? `/api/shipments/${shipmentId}/pickup/reschedule`
        : `/api/shipments/${shipmentId}/pickup/schedule`

      const response = await fetch(endpoint, {
        method: isReschedule ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          warehouseId: warehouse.warehouseId,
          contactName: formData.contactName.trim(),
          contactPhone: formData.contactPhone.trim(),
          pickupDate: formData.pickupDate,
          pickupTimeSlot: formData.pickupTimeSlot,
        }),
      })

      const data = await response.json()

      // ====================================================
      // CRITICAL: Check both HTTP status and success field
      // Shiprocket may return HTTP 200 but with success: false
      // Only proceed if BOTH HTTP status is OK AND success is true
      // ====================================================
      if (!response.ok || data.success === false) {
        // Extract error message from response
        const errorMessage = data.error || 
                            data.message || 
                            'Failed to schedule pickup. Please check the error details and try again.'
        
        // Include additional details if available (but don't show full JSON in UI)
        const errorDetails = data.details?.Message || data.details?.message || ''
        const fullErrorMessage = errorDetails ? `${errorMessage}\n\n${errorDetails}` : errorMessage
        
        throw new Error(fullErrorMessage)
      }

      // Final validation: Ensure success is explicitly true
      if (data.success !== true) {
        throw new Error('Pickup scheduling failed: Shiprocket did not confirm success. Please check Shiprocket dashboard.')
      }

      // Only call onSuccess if we have confirmed success from Shiprocket
      onSuccess()
      onClose()
    } catch (error: any) {
      setErrors({ general: error.message || 'An error occurred' })
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-semibold mb-4">
          {isReschedule ? 'Reschedule Pickup' : 'Schedule Pickup'}
        </h2>

        {errors.general && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
            {errors.general}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Warehouse Address
            </label>
            <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
              {warehouse?.address.addressLine1}
              {warehouse?.address.addressLine2 && `, ${warehouse.address.addressLine2}`}
              <br />
              {warehouse?.address.city}, {warehouse?.address.state} - {warehouse?.address.pincode}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.contactName}
              onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.contactName && (
              <p className="text-red-500 text-xs mt-1">{errors.contactName}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Contact Phone <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              value={formData.contactPhone}
              onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="10-digit phone number"
              required
            />
            {errors.contactPhone && (
              <p className="text-red-500 text-xs mt-1">{errors.contactPhone}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.pickupDate}
              onChange={(e) => setFormData({ ...formData, pickupDate: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
            {errors.pickupDate && (
              <p className="text-red-500 text-xs mt-1">{errors.pickupDate}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Pickup Time Slot
            </label>
            <select
              value={formData.pickupTimeSlot}
              onChange={(e) => setFormData({ ...formData, pickupTimeSlot: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="10:00-13:00">10:00 AM - 1:00 PM</option>
              <option value="13:00-16:00">1:00 PM - 4:00 PM</option>
              <option value="16:00-19:00">4:00 PM - 7:00 PM</option>
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              disabled={loading}
            >
              {loading ? 'Processing...' : isReschedule ? 'Reschedule' : 'Schedule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


