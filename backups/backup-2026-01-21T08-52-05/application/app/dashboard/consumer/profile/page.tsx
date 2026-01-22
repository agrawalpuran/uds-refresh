'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { User, Mail, Phone, MapPin, Edit, X, Save, Loader2 } from 'lucide-react'
import { getEmployeeByEmail, Employee, getVendorByEmail, updateEmployee } from '@/lib/data-mongodb'
import AddressForm, { AddressFormData } from '@/components/AddressForm'
// Removed maskEmployeeData import - employees should see their own information unmasked

export default function ConsumerProfilePage() {
  const [employee, setEmployee] = useState<Employee | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  
  // Form state for editable fields
  const [formData, setFormData] = useState({
    mobile: '',
    addressData: {
      address_line_1: '',
      address_line_2: '',
      address_line_3: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    } as AddressFormData,
    shirtSize: '',
    pantSize: '',
    shoeSize: ''
  })
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('consumer')
          if (!userEmail) {
            setLoading(false)
            return
          }
          
          // ROLE DETECTION: Check if email belongs to vendor
          const vendor = await getVendorByEmail(userEmail)
          if (vendor) {
            console.error('Consumer Profile - Email belongs to vendor, redirecting...')
            window.location.href = '/dashboard/vendor'
            return
          }
          
          const currentEmployee = await getEmployeeByEmail(userEmail)
          if (currentEmployee) {
            setEmployee(currentEmployee)
            
            // Initialize address data from structured fields or legacy address
            let addressData: AddressFormData = {
              address_line_1: '',
              address_line_2: '',
              address_line_3: '',
              city: '',
              state: '',
              pincode: '',
              country: 'India',
            }
            
            // Check if employee has structured address fields
            if (currentEmployee.address_line_1) {
              addressData = {
                address_line_1: currentEmployee.address_line_1 || '',
                address_line_2: currentEmployee.address_line_2 || '',
                address_line_3: currentEmployee.address_line_3 || '',
                city: currentEmployee.city || '',
                state: currentEmployee.state || '',
                pincode: currentEmployee.pincode || '',
                country: currentEmployee.country || 'India',
              }
            } else if (currentEmployee.address && typeof currentEmployee.address === 'string') {
              // Legacy address string - try to parse it
              try {
                const addressService = await import('@/lib/utils/address-service')
                const parsed = addressService.parseLegacyAddress ? 
                  addressService.parseLegacyAddress(currentEmployee.address) : 
                  null
                if (parsed) {
                  addressData = {
                    address_line_1: parsed.address_line_1 || currentEmployee.address.substring(0, 255) || '',
                    address_line_2: parsed.address_line_2 || '',
                    address_line_3: parsed.address_line_3 || '',
                    city: parsed.city || 'New Delhi',
                    state: parsed.state || 'Delhi',
                    pincode: parsed.pincode || '110001',
                    country: parsed.country || 'India',
                  }
                } else {
                  // If parsing not available, use the address string as L1
                  addressData = {
                    address_line_1: currentEmployee.address.substring(0, 255) || '',
                    address_line_2: '',
                    address_line_3: '',
                    city: 'New Delhi',
                    state: 'Delhi',
                    pincode: '110001',
                    country: 'India',
                  }
                }
              } catch (error) {
                // If parsing fails, use the address string as L1
                addressData = {
                  address_line_1: currentEmployee.address.substring(0, 255) || '',
                  address_line_2: '',
                  address_line_3: '',
                  city: 'New Delhi',
                  state: 'Delhi',
                  pincode: '110001',
                  country: 'India',
                }
              }
            }
            
            // Initialize form data
            setFormData({
              mobile: currentEmployee.mobile || '',
              addressData,
              shirtSize: currentEmployee.shirtSize || '',
              pantSize: currentEmployee.pantSize || '',
              shoeSize: currentEmployee.shoeSize || ''
            })
          }
        } catch (error) {
          console.error('Error loading employee:', error)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])
  
  if (loading || !employee) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-gray-600">Loading profile...</p>
        </div>
      </DashboardLayout>
    )
  }

  // CRITICAL FIX: Employees should see their own information unmasked
  // No masking needed for own profile - use employee data directly
  // Company Admins and Location Admins viewing employee profiles should also see unmasked data
  // (This is handled in their respective pages)

  const handleEditClick = () => {
    if (employee) {
      // Initialize address data from structured fields or legacy address
      let addressData: AddressFormData = {
        address_line_1: '',
        address_line_2: '',
        address_line_3: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      }
      
      // Check if employee has structured address fields
      if (employee.address_line_1) {
        addressData = {
          address_line_1: employee.address_line_1 || '',
          address_line_2: employee.address_line_2 || '',
          address_line_3: employee.address_line_3 || '',
          city: employee.city || '',
          state: employee.state || '',
          pincode: employee.pincode || '',
          country: employee.country || 'India',
        }
      } else if (employee.address && typeof employee.address === 'string') {
        // Legacy address string - use the address string as L1
        addressData = {
          address_line_1: employee.address.substring(0, 255) || '',
          address_line_2: '',
          address_line_3: '',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
        }
      }
      
      setFormData({
        mobile: employee.mobile || '',
        addressData,
        shirtSize: employee.shirtSize || '',
        pantSize: employee.pantSize || '',
        shoeSize: employee.shoeSize || ''
      })
      setIsEditModalOpen(true)
      setError(null)
      setSuccess(null)
    }
  }

  const handleSave = async () => {
    if (!employee || !employee.id) {
      setError('Employee information not available')
      return
    }

    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      // Validate required fields
      if (!formData.mobile.trim()) {
        setError('Mobile number is required')
        setSaving(false)
        return
      }
      
      // Validate address fields
      if (!formData.addressData.address_line_1.trim()) {
        setError('Address Line 1 is required')
        setSaving(false)
        return
      }
      if (!formData.addressData.city.trim()) {
        setError('City is required')
        setSaving(false)
        return
      }
      if (!formData.addressData.state.trim()) {
        setError('State is required')
        setSaving(false)
        return
      }
      if (!formData.addressData.pincode.trim() || !/^\d{6}$/.test(formData.addressData.pincode.trim())) {
        setError('Valid 6-digit pincode is required')
        setSaving(false)
        return
      }

      // Only allow updating: mobile, addressData, shirtSize, pantSize, shoeSize
      const updateData = {
        mobile: formData.mobile.trim(),
        addressData: {
          address_line_1: formData.addressData.address_line_1.trim(),
          address_line_2: formData.addressData.address_line_2.trim(),
          address_line_3: formData.addressData.address_line_3.trim(),
          city: formData.addressData.city.trim(),
          state: formData.addressData.state.trim(),
          pincode: formData.addressData.pincode.trim(),
          country: formData.addressData.country || 'India',
        },
        shirtSize: formData.shirtSize.trim(),
        pantSize: formData.pantSize.trim(),
        shoeSize: formData.shoeSize.trim()
      }

      // Update employee via API
      const updatedEmployee = await updateEmployee(employee.id, updateData)
      
      if (updatedEmployee) {
        setEmployee(updatedEmployee)
        setSuccess('Profile updated successfully!')
        setTimeout(() => {
          setIsEditModalOpen(false)
          setSuccess(null)
        }, 1500)
      } else {
        setError('Failed to update profile. Please try again.')
      }
    } catch (error: any) {
      console.error('Error updating profile:', error)
      setError(error.message || 'Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    if (employee) {
      // Reset address data
      let addressData: AddressFormData = {
        address_line_1: '',
        address_line_2: '',
        address_line_3: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      }
      
      if (employee.address_line_1) {
        addressData = {
          address_line_1: employee.address_line_1 || '',
          address_line_2: employee.address_line_2 || '',
          address_line_3: employee.address_line_3 || '',
          city: employee.city || '',
          state: employee.state || '',
          pincode: employee.pincode || '',
          country: employee.country || 'India',
        }
      } else if (employee.address && typeof employee.address === 'string') {
        // Legacy address string - use the address string as L1
        addressData = {
          address_line_1: employee.address.substring(0, 255) || '',
          address_line_2: '',
          address_line_3: '',
          city: 'New Delhi',
          state: 'Delhi',
          pincode: '110001',
          country: 'India',
        }
      }
      
      setFormData({
        mobile: employee.mobile || '',
        addressData,
        shirtSize: employee.shirtSize || '',
        pantSize: employee.pantSize || '',
        shoeSize: employee.shoeSize || ''
      })
    }
    setIsEditModalOpen(false)
    setError(null)
    setSuccess(null)
  }
  
  // Helper function to format address for display
  const formatAddress = (emp: Employee): string => {
    if (emp.address_line_1) {
      const parts = [
        emp.address_line_1,
        emp.address_line_2,
        emp.address_line_3,
        emp.city,
        emp.state,
        emp.pincode,
        emp.country && emp.country !== 'India' ? emp.country : undefined
      ].filter(Boolean)
      return parts.join(', ') || 'N/A'
    }
    return emp.address || 'N/A'
  }

  return (
    <DashboardLayout actorType="consumer">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
          <button 
            onClick={handleEditClick}
            className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2"
          >
            <Edit className="h-5 w-5" />
            <span>Edit Profile</span>
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Personal Information */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Personal Information</h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Full Name</p>
                  <p className="font-semibold text-gray-900">{employee.firstName} {employee.lastName}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Employee ID</p>
                  <p className="font-mono font-semibold text-blue-600">{employee.employeeId || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Gender</p>
                  <p className="font-semibold text-gray-900 capitalize">{employee.gender || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-semibold text-gray-900">{employee.email || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <Phone className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-600">Mobile</p>
                  <p className="font-semibold text-gray-900">{employee.mobile || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <MapPin className="h-5 w-5 text-gray-400 mt-1" />
                <div className="flex-1">
                  <p className="text-sm text-gray-600 mb-1">Address</p>
                  {employee.address_line_1 ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-gray-900">{employee.address_line_1}</p>
                      {employee.address_line_2 && (
                        <p className="text-gray-700">{employee.address_line_2}</p>
                      )}
                      {employee.address_line_3 && (
                        <p className="text-gray-700">{employee.address_line_3}</p>
                      )}
                      <p className="text-gray-700">
                        {[employee.city, employee.state, employee.pincode].filter(Boolean).join(', ')}
                        {employee.country && employee.country !== 'India' ? `, ${employee.country}` : ''}
                      </p>
                    </div>
                  ) : (
                    <p className="font-semibold text-gray-900">{formatAddress(employee)}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Work Information */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Work Information</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Company</p>
                <p className="font-semibold text-gray-900">{employee.companyName || 'N/A'}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Designation</p>
                <p className="font-semibold text-gray-900">{employee.designation}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Location</p>
                <p className="font-semibold text-gray-900">
                  {employee.locationId?.name || employee.locationId?.city || employee.location || 'N/A'}
                </p>
                {employee.locationId?.city && employee.locationId?.city !== employee.locationId?.name && (
                  <p className="text-xs text-gray-500 mt-1">{employee.locationId.city}</p>
                )}
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Status</p>
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                  employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                }`}>
                  {employee.status}
                </span>
              </div>
            </div>
          </div>

          {/* Size Information */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Size Information</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Shirt Size</p>
                <p className="text-2xl font-bold text-gray-900">{employee.shirtSize}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Pant Size</p>
                <p className="text-2xl font-bold text-gray-900">{employee.pantSize}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Shoe Size</p>
                <p className="text-2xl font-bold text-gray-900">{employee.shoeSize}</p>
              </div>
            </div>
          </div>

          {/* Eligibility & Preferences */}
          <div className="bg-white rounded-xl shadow-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Eligibility & Preferences</h2>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-600 mb-2">Eligibility ({employee.period})</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">Shirts</p>
                    <p className="font-bold text-gray-900">{employee.eligibility.shirt}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">Pants</p>
                    <p className="font-bold text-gray-900">{employee.eligibility.pant}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">Shoes</p>
                    <p className="font-bold text-gray-900">{employee.eligibility.shoe}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600">Jackets</p>
                    <p className="font-bold text-gray-900">{employee.eligibility.jacket}</p>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Dispatch Preference</p>
                <p className="font-semibold text-gray-900 capitalize">{employee.dispatchPreference}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Edit Profile</h2>
              <button
                onClick={handleCancel}
                className="text-gray-400 hover:text-gray-600 transition-colors"
                disabled={saving}
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              <div className="space-y-6">
                {/* Read-only fields section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Read-Only Information</h3>
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    <div>
                      <p className="text-xs text-gray-600">Full Name</p>
                      <p className="text-sm font-semibold text-gray-900">{employee.firstName} {employee.lastName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Employee ID</p>
                      <p className="text-sm font-mono font-semibold text-gray-900">{employee.employeeId || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Email</p>
                      <p className="text-sm font-semibold text-gray-900">{employee.email || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Company</p>
                      <p className="text-sm font-semibold text-gray-900">{employee.companyName || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Designation</p>
                      <p className="text-sm font-semibold text-gray-900">{employee.designation || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-600">Location</p>
                      <p className="text-sm font-semibold text-gray-900">
                        {employee.locationId?.name || employee.locationId?.city || employee.location || 'N/A'}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">Note: These fields can only be changed by Company Admin or Location Admin</p>
                </div>

                {/* Editable fields section */}
                <div>
                  <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Editable Information</h3>
                  <div className="space-y-4">
                    {/* Mobile Number */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mobile Number <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="tel"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        placeholder="+91-9876543210"
                        disabled={saving}
                      />
                    </div>

                    {/* Address */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">
                        Address <span className="text-red-500">*</span>
                      </label>
                      <AddressForm
                        value={formData.addressData}
                        onChange={(address) => setFormData({ ...formData, addressData: address })}
                        required={true}
                        showCountry={true}
                        disabled={saving}
                      />
                    </div>

                    {/* Size Information */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-3">Size Information</label>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Shirt Size</label>
                          <input
                            type="text"
                            value={formData.shirtSize}
                            onChange={(e) => setFormData({ ...formData, shirtSize: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                            placeholder="e.g., M, L, XL"
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Pant Size</label>
                          <input
                            type="text"
                            value={formData.pantSize}
                            onChange={(e) => setFormData({ ...formData, pantSize: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                            placeholder="e.g., 30, 32, 34"
                            disabled={saving}
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Shoe Size</label>
                          <input
                            type="text"
                            value={formData.shoeSize}
                            onChange={(e) => setFormData({ ...formData, shoeSize: e.target.value })}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                            placeholder="e.g., 8, 9, 10"
                            disabled={saving}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 flex items-center justify-end space-x-3">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}




