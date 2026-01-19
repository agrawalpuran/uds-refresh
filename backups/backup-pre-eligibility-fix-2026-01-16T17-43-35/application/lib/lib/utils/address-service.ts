/**
 * Address Service
 * 
 * Centralized service for address operations in UDS.
 * Provides utilities for creating, updating, validating, and formatting addresses.
 */

import Address from '../models/Address'
import connectDB from '../db/mongodb'

export interface AddressInput {
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country?: string
}

export interface AddressOutput {
  id: string
  address_line_1: string
  address_line_2?: string
  address_line_3?: string
  city: string
  state: string
  pincode: string
  country: string
}

/**
 * Validate address data
 * Returns validation errors if any, empty array if valid
 */
export function validateAddress(address: Partial<AddressInput>): string[] {
  const errors: string[] = []

  if (!address.address_line_1 || address.address_line_1.trim().length === 0) {
    errors.push('Address Line 1 (House/Building/Street) is required')
  } else if (address.address_line_1.length > 255) {
    errors.push('Address Line 1 must not exceed 255 characters')
  }

  if (address.address_line_2 && address.address_line_2.length > 255) {
    errors.push('Address Line 2 must not exceed 255 characters')
  }

  if (address.address_line_3 && address.address_line_3.length > 255) {
    errors.push('Address Line 3 must not exceed 255 characters')
  }

  if (!address.city || address.city.trim().length === 0) {
    errors.push('City is required')
  } else if (address.city.length > 100) {
    errors.push('City must not exceed 100 characters')
  }

  if (!address.state || address.state.trim().length === 0) {
    errors.push('State is required')
  } else if (address.state.length > 100) {
    errors.push('State must not exceed 100 characters')
  }

  if (!address.pincode || address.pincode.trim().length === 0) {
    errors.push('Pincode is required')
  } else if (!/^\d{6}$/.test(address.pincode.trim())) {
    errors.push('Pincode must be exactly 6 digits (e.g., "110001")')
  }

  if (address.country && address.country.length > 50) {
    errors.push('Country must not exceed 50 characters')
  }

  return errors
}

/**
 * Create a new address
 */
export async function createAddress(addressData: AddressInput): Promise<AddressOutput> {
  await connectDB()

  // Validate address
  const errors = validateAddress(addressData)
  if (errors.length > 0) {
    throw new Error(`Address validation failed: ${errors.join(', ')}`)
  }

  // Normalize data
  const normalizedAddress = {
    address_line_1: addressData.address_line_1.trim(),
    address_line_2: addressData.address_line_2?.trim() || undefined,
    address_line_3: addressData.address_line_3?.trim() || undefined,
    city: addressData.city.trim(),
    state: addressData.state.trim(),
    pincode: addressData.pincode.trim(),
    country: addressData.country?.trim() || 'India',
  }

  // Remove undefined fields
  Object.keys(normalizedAddress).forEach(key => {
    if (normalizedAddress[key as keyof typeof normalizedAddress] === undefined) {
      delete normalizedAddress[key as keyof typeof normalizedAddress]
    }
  })

  const address = new Address(normalizedAddress)
  await address.save()

  return {
    id: address._id.toString(),
    address_line_1: address.address_line_1,
    address_line_2: address.address_line_2,
    address_line_3: address.address_line_3,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
  }
}

/**
 * Update an existing address
 */
export async function updateAddress(
  addressId: string,
  addressData: Partial<AddressInput>
): Promise<AddressOutput> {
  await connectDB()

  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const existingAddress = await Address.findOne({ id: addressId })
  if (!existingAddress) {
    throw new Error(`Address with ID ${addressId} not found`)
  }

  // Merge with existing data for validation
  const mergedAddress = {
    address_line_1: addressData.address_line_1 ?? existingAddress.address_line_1,
    address_line_2: addressData.address_line_2 ?? existingAddress.address_line_2,
    address_line_3: addressData.address_line_3 ?? existingAddress.address_line_3,
    city: addressData.city ?? existingAddress.city,
    state: addressData.state ?? existingAddress.state,
    pincode: addressData.pincode ?? existingAddress.pincode,
    country: addressData.country ?? existingAddress.country,
  }

  const errors = validateAddress(mergedAddress)
  if (errors.length > 0) {
    throw new Error(`Address validation failed: ${errors.join(', ')}`)
  }

  // Normalize and update
  const updateData: any = {}
  if (addressData.address_line_1 !== undefined) {
    updateData.address_line_1 = addressData.address_line_1.trim()
  }
  if (addressData.address_line_2 !== undefined) {
    updateData.address_line_2 = addressData.address_line_2?.trim() || undefined
  }
  if (addressData.address_line_3 !== undefined) {
    updateData.address_line_3 = addressData.address_line_3?.trim() || undefined
  }
  if (addressData.city !== undefined) {
    updateData.city = addressData.city.trim()
  }
  if (addressData.state !== undefined) {
    updateData.state = addressData.state.trim()
  }
  if (addressData.pincode !== undefined) {
    updateData.pincode = addressData.pincode.trim()
  }
  if (addressData.country !== undefined) {
    updateData.country = addressData.country.trim()
  }

  // Remove undefined fields
  Object.keys(updateData).forEach(key => {
    if (updateData[key] === undefined) {
      delete updateData[key]
    }
  })

  // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
  const updatedAddress = await Address.findOneAndUpdate(
    { id: addressId },
    updateData,
    { new: true, runValidators: true }
  )

  if (!updatedAddress) {
    throw new Error(`Failed to update address with ID ${addressId}`)
  }

  return {
    id: updatedAddress._id.toString(),
    address_line_1: updatedAddress.address_line_1,
    address_line_2: updatedAddress.address_line_2,
    address_line_3: updatedAddress.address_line_3,
    city: updatedAddress.city,
    state: updatedAddress.state,
    pincode: updatedAddress.pincode,
    country: updatedAddress.country,
  }
}

/**
 * Get address by ID
 */
export async function getAddressById(addressId: string): Promise<AddressOutput | null> {
  try {
    if (!addressId) {
      console.warn('[getAddressById] No addressId provided')
      return null
    }

    await connectDB()

    // String ID lookup only (ObjectId fallback removed - all IDs are now strings)
    const address = await Address.findOne({ id: addressId })
    if (!address) {
      console.warn(`[getAddressById] Address not found for ID: ${addressId}`)
      return null
    }

    return {
      id: address.id || address._id.toString(),
      address_line_1: address.address_line_1,
      address_line_2: address.address_line_2,
      address_line_3: address.address_line_3,
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
    }
  } catch (error: any) {
    console.error(`[getAddressById] Error fetching address ${addressId}:`, error?.message || error)
    return null // Return null instead of throwing to prevent cascading failures
  }
}

/**
 * Format address for display
 * Returns a formatted string representation of the address
 */
export function formatAddress(address: AddressOutput | Partial<AddressInput>): string {
  const parts: string[] = []

  if (address.address_line_1) {
    parts.push(address.address_line_1)
  }
  if (address.address_line_2) {
    parts.push(address.address_line_2)
  }
  if (address.address_line_3) {
    parts.push(address.address_line_3)
  }

  const cityStatePincode = [
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean).join(', ')

  if (cityStatePincode) {
    parts.push(cityStatePincode)
  }

  if (address.country && address.country !== 'India') {
    parts.push(address.country)
  }

  return parts.join(', ')
}

/**
 * Format address for single line display (compact)
 */
export function formatAddressSingleLine(address: AddressOutput | Partial<AddressInput>): string {
  const parts: string[] = []

  if (address.address_line_1) {
    parts.push(address.address_line_1)
  }
  if (address.address_line_2) {
    parts.push(address.address_line_2)
  }
  if (address.address_line_3) {
    parts.push(address.address_line_3)
  }

  const cityStatePincode = [
    address.city,
    address.state,
    address.pincode,
  ].filter(Boolean).join(', ')

  if (cityStatePincode) {
    parts.push(cityStatePincode)
  }

  return parts.join(', ')
}

/**
 * Parse legacy address string into structured format (for migration)
 * Attempts to extract city, state, pincode from free-form text
 */
export function parseLegacyAddress(addressString: string): Partial<AddressInput> {
  if (!addressString || addressString.trim().length === 0) {
    return {}
  }

  // Try to extract pincode (6 digits)
  const pincodeMatch = addressString.match(/\b\d{6}\b/)
  const pincode = pincodeMatch ? pincodeMatch[0] : undefined

  // Common Indian states (for extraction)
  const states = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
    'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
    'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
    'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
    'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
    'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
  ]

  let state: string | undefined
  let city: string | undefined

  // Try to find state
  for (const stateName of states) {
    if (addressString.includes(stateName)) {
      state = stateName
      break
    }
  }

  // Split by commas and try to identify city (usually before state)
  const parts = addressString.split(',').map(p => p.trim()).filter(p => p.length > 0)
  
  // If we found state, try to find city before it
  if (state) {
    const stateIndex = parts.findIndex(p => p.includes(state))
    if (stateIndex > 0) {
      city = parts[stateIndex - 1]
    }
  } else if (parts.length >= 2) {
    // Assume last part might be state, second last might be city
    city = parts[parts.length - 2]
    state = parts[parts.length - 1]
  }

  // Everything before city/state/pincode is address lines
  const addressLines = parts.filter((part, index) => {
    if (pincode && part.includes(pincode)) return false
    if (state && part.includes(state)) return false
    if (city && part === city) return false
    return true
  })

  return {
    address_line_1: addressLines[0] || addressString.split(',')[0] || addressString,
    address_line_2: addressLines[1] || undefined,
    address_line_3: addressLines[2] || undefined,
    city: city || undefined,
    state: state || undefined,
    pincode: pincode || undefined,
    country: 'India',
  }
}

