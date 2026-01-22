'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, MapPin, Edit, Trash2, User, Phone, Mail, UserPlus, UserMinus, X } from 'lucide-react'
import { getCompanyById, getLocationsByCompany, createLocation, updateLocation, deleteLocation, assignLocationAdmin, getEligibleEmployeesForLocationAdmin } from '@/lib/data-mongodb'
import AddressForm, { AddressFormData } from '@/components/AddressForm'

export default function LocationsPage() {
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [companyId, setCompanyId] = useState<string>('')
  const [adminEmail, setAdminEmail] = useState<string>('')
  const [locations, setLocations] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingLocation, setEditingLocation] = useState<any>(null)
  const [showAdminModal, setShowAdminModal] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<any>(null)
  const [eligibleEmployees, setEligibleEmployees] = useState<any[]>([])
  const [loadingEmployees, setLoadingEmployees] = useState<boolean>(false)
  const [selectedAdminId, setSelectedAdminId] = useState<string>('')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    adminId: '',
    status: 'active' as 'active' | 'inactive'
  })
  const [addressData, setAddressData] = useState<AddressFormData>({
    address_line_1: '',
    address_line_2: '',
    address_line_3: '',
    city: '',
    state: '',
    pincode: '',
    country: 'India',
  })
  const [addressErrors, setAddressErrors] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        const storedCompanyId = localStorage.getItem('companyId')
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        const storedEmail = getUserEmail('company') || ''
        
        if (storedCompanyId) {
          setCompanyId(storedCompanyId)
          setAdminEmail(storedEmail)
          
          // Load company colors
          const companyDetails = await getCompanyById(storedCompanyId)
          if (companyDetails) {
            setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
          }
          
          // Load locations
          await loadLocations(storedCompanyId)
        }
      }
      loadData()
    }
  }, [])

  const loadLocations = async (companyId: string) => {
    try {
      setLoading(true)
      const locationsData = await getLocationsByCompany(companyId)
      setLocations(locationsData || [])
    } catch (error) {
      console.error('Error loading locations:', error)
      setLocations([])
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate address fields
    const errors: { [key: string]: string } = {}
    if (!addressData.address_line_1.trim()) {
      errors.address_line_1 = 'Address Line 1 is required'
    }
    if (!addressData.city.trim()) {
      errors.city = 'City is required'
    }
    if (!addressData.state.trim()) {
      errors.state = 'State is required'
    }
    if (!addressData.pincode.trim()) {
      errors.pincode = 'Pincode is required'
    } else if (!/^\d{6}$/.test(addressData.pincode)) {
      errors.pincode = 'Pincode must be exactly 6 digits'
    }
    
    if (Object.keys(errors).length > 0) {
      setAddressErrors(errors)
      return
    }
    
    setAddressErrors({})
    
    // Re-read from localStorage if values are missing
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        currentCompanyId = localStorage.getItem('companyId') || ''
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        const retrievedEmail = getUserEmail('company') || ''
        // Normalize email: trim and lowercase
        currentAdminEmail = retrievedEmail.trim().toLowerCase()
      }
    }

    // Normalize email to ensure consistency
    currentAdminEmail = (currentAdminEmail || '').trim().toLowerCase()

    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }
    
    console.log('[Location Update] Using credentials:', {
      companyId: currentCompanyId,
      adminEmail: currentAdminEmail,
      locationId: editingLocation?.id
    })

    try {
      if (editingLocation) {
        // Update existing location - pass adminEmail for authorization
        await updateLocation(editingLocation.id, {
          name: formData.name,
          adminId: formData.adminId || undefined,
          address_line_1: addressData.address_line_1,
          address_line_2: addressData.address_line_2,
          address_line_3: addressData.address_line_3,
          city: addressData.city,
          state: addressData.state,
          pincode: addressData.pincode,
          country: addressData.country,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          status: formData.status,
          adminEmail: currentAdminEmail, // Pass email for authorization
        })
        
        console.log('[Location Update] Update successful')
      } else {
        // Create new location
        await createLocation({
          name: formData.name,
          companyId: currentCompanyId,
          adminId: formData.adminId || undefined,
          address_line_1: addressData.address_line_1,
          address_line_2: addressData.address_line_2,
          address_line_3: addressData.address_line_3,
          city: addressData.city,
          state: addressData.state,
          pincode: addressData.pincode,
          country: addressData.country,
          phone: formData.phone || undefined,
          email: formData.email || undefined,
          status: formData.status,
        })
      }
      
      // Reload locations
      await loadLocations(currentCompanyId)
      setShowAddModal(false)
      setEditingLocation(null)
      setFormData({
        name: '',
        phone: '',
        email: '',
        adminId: '',
        status: 'active'
      })
      setAddressData({
        address_line_1: '',
        address_line_2: '',
        address_line_3: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      })
      setAddressErrors({})
    } catch (error: any) {
      alert(`Error ${editingLocation ? 'updating' : 'creating'} location: ${error.message}`)
    }
  }

  const handleEdit = (location: any) => {
    setEditingLocation(location)
    setFormData({
      name: location.name || '',
      phone: location.phone || '',
      email: location.email || '',
      adminId: location.adminId?.employeeId || location.adminId?.id || '',
      status: location.status || 'active'
    })
    setAddressData({
      address_line_1: location.address_line_1 || '',
      address_line_2: location.address_line_2 || '',
      address_line_3: location.address_line_3 || '',
      city: location.city || '',
      state: location.state || '',
      pincode: location.pincode || '',
      country: location.country || 'India',
    })
    setAddressErrors({})
    setShowAddModal(true)
  }

  const handleDelete = async (locationId: string) => {
    if (!confirm('Are you sure you want to delete this location?')) {
      return
    }

    // Re-read from localStorage if values are missing
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        currentCompanyId = localStorage.getItem('companyId') || ''
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        currentAdminEmail = getUserEmail('company') || ''
      }
    }

    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    try {
      await deleteLocation(locationId, currentAdminEmail, currentCompanyId)
      await loadLocations(currentCompanyId)
    } catch (error: any) {
      alert(`Error deleting location: ${error.message}`)
    }
  }

  const handleAssignAdmin = async (location: any) => {
    // Re-read from localStorage if values are missing
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        currentCompanyId = localStorage.getItem('companyId') || ''
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        currentAdminEmail = getUserEmail('company') || ''
      }
    }
    
    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    setSelectedLocation(location)
    setSelectedAdminId(location.adminId?.employeeId || location.adminId?.id || '')
    setShowAdminModal(true)
    
    // Load eligible employees for this specific location
    try {
      setLoadingEmployees(true)
      console.log('Loading employees for location:', {
        locationId: location.id,
        locationName: location.name,
        companyId: currentCompanyId
      })
      
      const employees = await getEligibleEmployeesForLocationAdmin(
        currentCompanyId, 
        currentAdminEmail,
        location.id // Pass locationId to filter employees by location
      )
      
      console.log('Received employees:', employees?.length || 0, employees)
      setEligibleEmployees(employees || [])
      
      if (!employees || employees.length === 0) {
        console.warn('No employees found for location:', location.id, location.name)
      }
    } catch (error: any) {
      console.error('Error loading employees:', error)
      alert(`Error loading employees: ${error.message}`)
      setEligibleEmployees([])
    } finally {
      setLoadingEmployees(false)
    }
  }

  const handleSaveAdmin = async () => {
    if (!selectedLocation) {
      return
    }

    // Re-read from localStorage if values are missing
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        currentCompanyId = localStorage.getItem('companyId') || ''
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        currentAdminEmail = getUserEmail('company') || ''
      }
    }

    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    try {
      await assignLocationAdmin(
        selectedLocation.id,
        selectedAdminId || null,
        currentAdminEmail,
        currentCompanyId
      )
      
      // Reload locations
      await loadLocations(currentCompanyId)
      setShowAdminModal(false)
      setSelectedLocation(null)
      setSelectedAdminId('')
    } catch (error: any) {
      alert(`Error ${selectedAdminId ? 'assigning' : 'removing'} Location Admin: ${error.message}`)
    }
  }

  const handleRemoveAdmin = async (location: any) => {
    if (!confirm(`Are you sure you want to remove the Location Admin for ${location.name}?`)) {
      return
    }

    // Re-read from localStorage if values are missing (handles edge cases)
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        currentCompanyId = localStorage.getItem('companyId') || ''
        // Check multiple possible keys for email (userEmail, email, adminEmail)
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        currentAdminEmail = getUserEmail('company') || ''
      }
    }

    // Final validation
    if (!currentCompanyId || !currentAdminEmail) {
      console.error('Missing credentials:', { 
        companyId: currentCompanyId, 
        adminEmail: currentAdminEmail,
        fromState: { companyId, adminEmail },
        fromAuthStorage: {
          companyId: typeof window !== 'undefined' ? (await import('@/lib/utils/auth-storage')).getCompanyId() : 'N/A',
          userEmail: typeof window !== 'undefined' ? (await import('@/lib/utils/auth-storage')).getUserEmail('company') : 'N/A',
          // Note: Using tab-specific sessionStorage, not shared localStorage
        }
      })
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    try {
      console.log('Removing Location Admin:', { 
        locationId: location.id, 
        companyId: currentCompanyId, 
        adminEmail: currentAdminEmail 
      })
      await assignLocationAdmin(location.id, null, currentAdminEmail, currentCompanyId)
      await loadLocations(currentCompanyId)
      alert('Location Admin removed successfully!')
    } catch (error: any) {
      console.error('Error removing Location Admin:', error)
      alert(`Error removing Location Admin: ${error.message || 'Unknown error'}`)
    }
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Location Management</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="text-white px-4 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2"
            style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            onMouseEnter={(e) => {
              const color = companyPrimaryColor || '#f76b1c'
              const r = parseInt(color.slice(1, 3), 16)
              const g = parseInt(color.slice(3, 5), 16)
              const b = parseInt(color.slice(5, 7), 16)
              const darker = '#' + Math.max(0, r - 25).toString(16).padStart(2, '0') + Math.max(0, g - 25).toString(16).padStart(2, '0') + Math.max(0, b - 25).toString(16).padStart(2, '0')
              e.currentTarget.style.backgroundColor = darker
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = companyPrimaryColor || '#f76b1c'
            }}
          >
            <Plus className="h-5 w-5" />
            <span>Add Location</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading locations...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && locations.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Locations Found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first location.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-white px-4 py-2 rounded-lg font-semibold transition-colors inline-flex items-center space-x-2"
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            >
              <Plus className="h-5 w-5" />
              <span>Add Location</span>
            </button>
          </div>
        )}

        {/* Locations Grid */}
        {!loading && locations.length > 0 && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {locations.map((location) => (
              <div key={location.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
              <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3 flex-1">
                  <div 
                      className="p-2 rounded-lg flex-shrink-0"
                    style={{ 
                        backgroundColor: `${companyPrimaryColor || '#f76b1c'}20`
                    }}
                  >
                    <MapPin 
                      className="h-5 w-5"
                      style={{ 
                          color: companyPrimaryColor || '#f76b1c'
                      }}
                    />
                  </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{location.name}</h3>
                    <span 
                        className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${
                          location.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {location.status || 'active'}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-shrink-0">
                    <button 
                      onClick={() => handleEdit(location)}
                      className="text-blue-600 hover:text-blue-700 transition-colors"
                      title="Edit Location"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(location.id)}
                      className="text-red-600 hover:text-red-700 transition-colors"
                      title="Delete Location"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Location Details */}
                <div className="space-y-2 text-sm text-gray-600">
                  {(() => {
                    const parts: string[] = []
                    if (location.address_line_1) parts.push(location.address_line_1)
                    if (location.address_line_2) parts.push(location.address_line_2)
                    if (location.address_line_3) parts.push(location.address_line_3)
                    const cityStatePincode = [location.city, location.state, location.pincode].filter(Boolean).join(', ')
                    if (cityStatePincode) parts.push(cityStatePincode)
                    return parts.length > 0 ? (
                      <p className="flex items-start">
                        <MapPin className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                        <span>{parts.join(', ')}</span>
                      </p>
                    ) : null
                  })()}
                  {location.phone && (
                    <p className="flex items-center">
                      <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{location.phone}</span>
                    </p>
                  )}
                  {location.email && (
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{location.email}</span>
                    </p>
                  )}
                  {location.adminId && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="flex items-center text-xs text-gray-600 mb-2">
                        <User className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="font-semibold">Location Admin:</span>
                      </p>
                      <p className="text-sm font-medium text-gray-900 ml-6">
                        {location.adminId.firstName} {location.adminId.lastName}
                        {location.adminId.employeeId && ` (${location.adminId.employeeId})`}
                      </p>
                      {location.adminId.designation && (
                        <p className="text-xs text-gray-500 ml-6">{location.adminId.designation}</p>
                      )}
                    </div>
                  )}
                  
                  {/* Location Admin Actions */}
                  <div className="pt-3 border-t border-gray-200 mt-2">
                    <button
                      onClick={() => handleAssignAdmin(location)}
                      className="w-full text-sm px-3 py-2 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
                      style={{ 
                        backgroundColor: location.adminId ? `${companyPrimaryColor || '#f76b1c'}10` : `${companyPrimaryColor || '#f76b1c'}20`,
                        color: companyPrimaryColor || '#f76b1c'
                      }}
                      onMouseEnter={(e) => {
                        const color = companyPrimaryColor || '#f76b1c'
                        e.currentTarget.style.backgroundColor = `${color}30`
                      }}
                      onMouseLeave={(e) => {
                        const color = companyPrimaryColor || '#f76b1c'
                        e.currentTarget.style.backgroundColor = location.adminId ? `${color}10` : `${color}20`
                      }}
                    >
                      {location.adminId ? (
                        <>
                          <Edit className="h-4 w-4" />
                          <span>Change Admin</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          <span>Assign Admin</span>
                        </>
                      )}
                    </button>
                    {location.adminId && (
                      <button
                        onClick={() => handleRemoveAdmin(location)}
                        className="w-full mt-2 text-sm px-3 py-2 rounded-lg font-medium text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center space-x-2"
                      >
                        <UserMinus className="h-4 w-4" />
                        <span>Remove Admin</span>
                      </button>
                    )}
                  </div>
                </div>
            </div>
          ))}
        </div>
        )}

        {/* Add/Edit Location Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingLocation ? 'Edit Location' : 'Add New Location'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingLocation(null)
                    setFormData({
                      name: '',
                      phone: '',
                      email: '',
                      adminId: '',
                      status: 'active'
                    })
                    setAddressData({
                      address_line_1: '',
                      address_line_2: '',
                      address_line_3: '',
                      city: '',
                      state: '',
                      pincode: '',
                      country: 'India',
                    })
                    setAddressErrors({})
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Location Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    style={{ 
                      '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                    } as React.CSSProperties & { '--tw-ring-color'?: string }}
                    required
                  />
                </div>

                {/* Address Form */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Address *</label>
                  <AddressForm
                    value={addressData}
                    onChange={(data) => setAddressData(data)}
                    errors={addressErrors}
                    required={true}
                    showCountry={false}
                  />
                </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone</label>
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Location Admin (Employee ID)</label>
                    <input
                      type="text"
                      value={formData.adminId}
                      onChange={(e) => setFormData({ ...formData, adminId: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                      placeholder="Optional - 6-digit employee ID"
                  />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>

                <div className="flex space-x-4 pt-4">
                  <button
                    type="submit"
                    className="flex-1 text-white px-6 py-3 rounded-lg font-semibold transition-colors"
                    style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                  >
                    {editingLocation ? 'Update Location' : 'Create Location'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setEditingLocation(null)
                      setFormData({
                        name: '',
                        phone: '',
                        email: '',
                        adminId: '',
                        status: 'active'
                      })
                      setAddressData({
                        address_line_1: '',
                        address_line_2: '',
                        address_line_3: '',
                        city: '',
                        state: '',
                        pincode: '',
                        country: 'India',
                      })
                      setAddressErrors({})
                    }}
                    className="flex-1 bg-gray-200 text-gray-800 px-6 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Assign Location Admin Modal */}
        {showAdminModal && selectedLocation && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {selectedLocation.adminId ? 'Change Location Admin' : 'Assign Location Admin'}
                </h2>
                <button
                  onClick={() => {
                    setShowAdminModal(false)
                    setSelectedLocation(null)
                    setSelectedAdminId('')
                  }}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 mb-2">Location:</p>
                <p className="font-semibold text-gray-900">{selectedLocation.name}</p>
              </div>

              {loadingEmployees ? (
                <div className="text-center py-8">
                  <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                  <p className="mt-2 text-sm text-gray-600">Loading employees...</p>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Location Admin *
                    </label>
                    <select
                      value={selectedAdminId}
                      onChange={(e) => setSelectedAdminId(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                      style={{ 
                        '--tw-ring-color': companyPrimaryColor || '#f76b1c',
                      } as React.CSSProperties & { '--tw-ring-color'?: string }}
                      onFocus={(e) => {
                        const color = companyPrimaryColor || '#f76b1c'
                        e.target.style.borderColor = color
                        e.target.style.boxShadow = '0 0 0 2px ' + color + '40'
                      }}
                      onBlur={(e) => {
                        e.target.style.borderColor = '#d1d5db'
                        e.target.style.boxShadow = 'none'
                      }}
                    >
                      <option value="">-- Select Employee --</option>
                      {eligibleEmployees.map((emp) => (
                        <option key={emp.employeeId} value={emp.employeeId}>
                          {emp.displayName}
                        </option>
                      ))}
                    </select>
                    {eligibleEmployees.length === 0 && (
                      <p className="mt-2 text-sm text-gray-500">
                        No eligible employees found. Employees must be active and belong to your company.
                      </p>
                    )}
                  </div>

                  {selectedLocation.adminId && (
                    <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <p className="text-sm text-yellow-800">
                        <strong>Current Admin:</strong> {selectedLocation.adminId.firstName} {selectedLocation.adminId.lastName}
                        {selectedLocation.adminId.employeeId && ` (${selectedLocation.adminId.employeeId})`}
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        Selecting a new employee will replace the current admin.
                      </p>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      type="button"
                      onClick={() => {
                        setShowAdminModal(false)
                        setSelectedLocation(null)
                        setSelectedAdminId('')
                      }}
                      className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveAdmin}
                      disabled={!selectedAdminId}
                      className="flex-1 text-white py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                    >
                      {selectedLocation.adminId ? 'Update Admin' : 'Assign Admin'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}



