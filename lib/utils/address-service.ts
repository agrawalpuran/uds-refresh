/**
 * Address Service
 * 
 * Server-side service for address operations in UDS.
 * Provides utilities for creating, updating, and fetching addresses from the database.
 * 
 * NOTE: For client-side utilities (validation, formatting, parsing), use address-utils.ts instead.
 */

import Address from '../models/Address'
import connectDB from '../db/mongodb'

// Re-export pure utility functions from address-utils for backward compatibility
// These can be used on both client and server
export {
  validateAddress,
  formatAddress,
  formatAddressSingleLine,
  parseLegacyAddress,
  type AddressInput,
  type AddressOutput,
} from './address-utils'

// Import types for use in this file
import type { AddressInput, AddressOutput } from './address-utils'
import { validateAddress } from './address-utils'

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
