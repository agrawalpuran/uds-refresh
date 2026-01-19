'use client'

/**
 * AddressForm Component
 * 
 * Standardized address input form for UDS application.
 * Provides consistent address fields (L1, L2, L3, City, State, Pincode) across all forms.
 * 
 * Features:
 * - Structured address fields (L1-L3, City, State, Pincode)
 * - Validation
 * - Optional pincode-based city/state auto-fill
 * - Consistent styling and labels
 */

import { useState, useEffect } from 'react'

export interface AddressFormData {
  address_line_1: string
  address_line_2: string
  address_line_3: string
  city: string
  state: string
  pincode: string
  country: string
}

interface AddressFormProps {
  value: Partial<AddressFormData>
  onChange: (address: AddressFormData) => void
  errors?: { [key: string]: string }
  required?: boolean
  showCountry?: boolean
  className?: string
  disabled?: boolean
}

// Indian pincode to city/state mapping (common ones)
const PINCODE_MAP: { [pincode: string]: { city: string; state: string } } = {
  '110001': { city: 'New Delhi', state: 'Delhi' },
  '400001': { city: 'Mumbai', state: 'Maharashtra' },
  '560001': { city: 'Bangalore', state: 'Karnataka' },
  '600001': { city: 'Chennai', state: 'Tamil Nadu' },
  '700001': { city: 'Kolkata', state: 'West Bengal' },
  '380001': { city: 'Ahmedabad', state: 'Gujarat' },
  '411001': { city: 'Pune', state: 'Maharashtra' },
  '500001': { city: 'Hyderabad', state: 'Telangana' },
  '302001': { city: 'Jaipur', state: 'Rajasthan' },
  '110092': { city: 'New Delhi', state: 'Delhi' },
  // Add more as needed
}

export default function AddressForm({
  value,
  onChange,
  errors = {},
  required = true,
  showCountry = false,
  className = '',
  disabled = false,
}: AddressFormProps) {
  const [formData, setFormData] = useState<AddressFormData>({
    address_line_1: value.address_line_1 || '',
    address_line_2: value.address_line_2 || '',
    address_line_3: value.address_line_3 || '',
    city: value.city || '',
    state: value.state || '',
    pincode: value.pincode || '',
    country: value.country || 'India',
  })

  // Update form data when value prop changes
  useEffect(() => {
    setFormData({
      address_line_1: value.address_line_1 || '',
      address_line_2: value.address_line_2 || '',
      address_line_3: value.address_line_3 || '',
      city: value.city || '',
      state: value.state || '',
      pincode: value.pincode || '',
      country: value.country || 'India',
    })
  }, [value])

  const handleChange = (field: keyof AddressFormData, newValue: string) => {
    const updated = { ...formData, [field]: newValue }
    setFormData(updated)
    onChange(updated)
  }

  const handlePincodeChange = (pincode: string) => {
    // Validate pincode format (6 digits)
    const cleanedPincode = pincode.replace(/\D/g, '').slice(0, 6)
    
    const updated = { ...formData, pincode: cleanedPincode }
    
    // Auto-fill city and state if pincode matches
    if (cleanedPincode.length === 6 && PINCODE_MAP[cleanedPincode]) {
      updated.city = PINCODE_MAP[cleanedPincode].city
      updated.state = PINCODE_MAP[cleanedPincode].state
    }
    
    setFormData(updated)
    onChange(updated)
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Address Line 1 (L1) - House / Building / Street */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address Line 1 (House/Building/Street) {required && <span className="text-red-500">*</span>}
        </label>
        <input
          type="text"
          value={formData.address_line_1}
          onChange={(e) => handleChange('address_line_1', e.target.value)}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
            errors.address_line_1 ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="House number, Building name, Street"
          required={required}
          disabled={disabled}
          maxLength={255}
        />
        {errors.address_line_1 && (
          <p className="mt-1 text-sm text-red-500">{errors.address_line_1}</p>
        )}
      </div>

      {/* Address Line 2 (L2) - Area / Locality */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address Line 2 (Area/Locality)
        </label>
        <input
          type="text"
          value={formData.address_line_2}
          onChange={(e) => handleChange('address_line_2', e.target.value)}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
            errors.address_line_2 ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Area, Locality, Sector"
          disabled={disabled}
          maxLength={255}
        />
        {errors.address_line_2 && (
          <p className="mt-1 text-sm text-red-500">{errors.address_line_2}</p>
        )}
      </div>

      {/* Address Line 3 (L3) - Landmark / Optional */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Address Line 3 (Landmark - Optional)
        </label>
        <input
          type="text"
          value={formData.address_line_3}
          onChange={(e) => handleChange('address_line_3', e.target.value)}
          className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
            errors.address_line_3 ? 'border-red-500' : 'border-gray-300'
          }`}
          placeholder="Near landmark, Additional info"
          disabled={disabled}
          maxLength={255}
        />
        {errors.address_line_3 && (
          <p className="mt-1 text-sm text-red-500">{errors.address_line_3}</p>
        )}
      </div>

      {/* City, State, Pincode Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* City */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            City {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={formData.city}
            onChange={(e) => handleChange('city', e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
              errors.city ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="City"
            required={required}
            disabled={disabled}
            maxLength={100}
          />
          {errors.city && (
            <p className="mt-1 text-sm text-red-500">{errors.city}</p>
          )}
        </div>

        {/* State */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            State {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={formData.state}
            onChange={(e) => handleChange('state', e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
              errors.state ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="State"
            required={required}
            disabled={disabled}
            maxLength={100}
          />
          {errors.state && (
            <p className="mt-1 text-sm text-red-500">{errors.state}</p>
          )}
        </div>

        {/* Pincode */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Pincode {required && <span className="text-red-500">*</span>}
          </label>
          <input
            type="text"
            value={formData.pincode}
            onChange={(e) => handlePincodeChange(e.target.value)}
            className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none ${
              errors.pincode ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="6-digit pincode"
            required={required}
            disabled={disabled}
            maxLength={6}
            pattern="[0-9]{6}"
          />
          {errors.pincode && (
            <p className="mt-1 text-sm text-red-500">{errors.pincode}</p>
          )}
          {formData.pincode.length === 6 && !PINCODE_MAP[formData.pincode] && (
            <p className="mt-1 text-xs text-gray-500">Enter city and state manually</p>
          )}
        </div>
      </div>

      {/* Country (optional, default to India) */}
      {showCountry && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Country
          </label>
          <input
            type="text"
            value={formData.country}
            onChange={(e) => handleChange('country', e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="Country"
            disabled={disabled}
            maxLength={50}
          />
        </div>
      )}
    </div>
  )
}

