'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Building2, Edit, Trash2, User, Phone, Mail, UserPlus, UserMinus, X } from 'lucide-react'
import { getCompanyById, getBranchesByCompany, createBranch, updateBranch, deleteBranch } from '@/lib/data-mongodb'
import AddressForm, { AddressFormData } from '@/components/AddressForm'

export default function BranchesPage() {
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [companyId, setCompanyId] = useState<string>('')
  const [adminEmail, setAdminEmail] = useState<string>('')
  const [branches, setBranches] = useState<any[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingBranch, setEditingBranch] = useState<any>(null)
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
        // SECURITY FIX: Use ONLY sessionStorage
        const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
        const storedCompanyId = getCompanyId()
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
          
          // Load branches
          await loadBranches(storedCompanyId)
        }
      }
      loadData()
    }
  }, [])

  const loadBranches = async (companyId: string) => {
    try {
      setLoading(true)
      const branchesData = await getBranchesByCompany(companyId)
      setBranches(branchesData || [])
    } catch (error) {
      console.error('Error loading branches:', error)
      setBranches([])
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
        // SECURITY FIX: Use ONLY sessionStorage
        const { getUserEmail, getCompanyId: getCompanyIdAuth } = await import('@/lib/utils/auth-storage')
        currentCompanyId = getCompanyIdAuth() || ''
        currentAdminEmail = getUserEmail('company') || ''
      }
    }

    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    try {
      if (editingBranch) {
        // Update existing branch - pass adminEmail for authorization
        await updateBranch(editingBranch.id, {
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
      } else {
        // Create new branch
        await createBranch({
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
      
      // Reload branches
      await loadBranches(currentCompanyId)
      setShowAddModal(false)
      setEditingBranch(null)
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
      alert(`Error ${editingBranch ? 'updating' : 'creating'} branch: ${error.message}`)
    }
  }

  const handleEdit = (branch: any) => {
    setEditingBranch(branch)
    setFormData({
      name: branch.name || '',
      phone: branch.phone || '',
      email: branch.email || '',
      adminId: branch.adminId?.employeeId || branch.adminId?.id || '',
      status: branch.status || 'active'
    })
    setAddressData({
      address_line_1: branch.address_line_1 || '',
      address_line_2: branch.address_line_2 || '',
      address_line_3: branch.address_line_3 || '',
      city: branch.city || '',
      state: branch.state || '',
      pincode: branch.pincode || '',
      country: branch.country || 'India',
    })
    setAddressErrors({})
    setShowAddModal(true)
  }

  const handleDelete = async (branchId: string) => {
    if (!confirm('Are you sure you want to delete this branch?')) {
      return
    }

    // Re-read from localStorage if values are missing
    let currentCompanyId = companyId || ''
    let currentAdminEmail = adminEmail || ''
    
    if (!currentCompanyId || !currentAdminEmail) {
      if (typeof window !== 'undefined') {
        // SECURITY FIX: Use ONLY sessionStorage
        const { getUserEmail, getCompanyId: getCompanyIdAuth } = await import('@/lib/utils/auth-storage')
        currentCompanyId = getCompanyIdAuth() || ''
        currentAdminEmail = getUserEmail('company') || ''
      }
    }

    if (!currentCompanyId || !currentAdminEmail) {
      alert('Company ID or Admin Email not found. Please log in again.')
      return
    }

    try {
      await deleteBranch(branchId)
      await loadBranches(currentCompanyId)
    } catch (error: any) {
      alert(`Error deleting branch: ${error.message}`)
    }
  }

  const formatAddress = (branch: any): string => {
    const parts: string[] = []
    if (branch.address_line_1) parts.push(branch.address_line_1)
    if (branch.address_line_2) parts.push(branch.address_line_2)
    if (branch.address_line_3) parts.push(branch.address_line_3)
    const cityStatePincode = [branch.city, branch.state, branch.pincode].filter(Boolean).join(', ')
    if (cityStatePincode) parts.push(cityStatePincode)
    return parts.join(', ')
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Branch Management</h1>
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
            <span>Add Branch</span>
          </button>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            <p className="mt-4 text-gray-600">Loading branches...</p>
          </div>
        )}

        {/* Empty State */}
        {!loading && branches.length === 0 && (
          <div className="text-center py-12 bg-white rounded-xl shadow-lg">
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No Branches Found</h3>
            <p className="text-gray-600 mb-4">Get started by adding your first branch.</p>
            <button
              onClick={() => setShowAddModal(true)}
              className="text-white px-4 py-2 rounded-lg font-semibold transition-colors inline-flex items-center space-x-2"
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            >
              <Plus className="h-5 w-5" />
              <span>Add Branch</span>
            </button>
          </div>
        )}

        {/* Branches Grid */}
        {!loading && branches.length > 0 && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {branches.map((branch) => (
              <div key={branch.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3 flex-1">
                    <div 
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{ 
                        backgroundColor: `${companyPrimaryColor || '#f76b1c'}20`
                      }}
                    >
                      <Building2 
                        className="h-5 w-5"
                        style={{ 
                          color: companyPrimaryColor || '#f76b1c'
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-gray-900 truncate">{branch.name}</h3>
                      <span 
                        className={`text-xs px-2 py-1 rounded-full inline-block mt-1 ${
                          branch.status === 'active' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {branch.status || 'active'}
                      </span>
                    </div>
                  </div>
                  <div className="flex space-x-2 flex-shrink-0">
                    <button 
                      onClick={() => handleEdit(branch)}
                      className="text-blue-600 hover:text-blue-700 transition-colors"
                      title="Edit Branch"
                    >
                      <Edit className="h-4 w-4" />
                    </button>
                    <button 
                      onClick={() => handleDelete(branch.id)}
                      className="text-red-600 hover:text-red-700 transition-colors"
                      title="Delete Branch"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                
                {/* Branch Details */}
                <div className="space-y-2 text-sm text-gray-600">
                  {formatAddress(branch) && (
                    <p className="flex items-start">
                      <Building2 className="h-4 w-4 mr-2 mt-0.5 flex-shrink-0" />
                      <span>{formatAddress(branch)}</span>
                    </p>
                  )}
                  {branch.phone && (
                    <p className="flex items-center">
                      <Phone className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{branch.phone}</span>
                    </p>
                  )}
                  {branch.email && (
                    <p className="flex items-center">
                      <Mail className="h-4 w-4 mr-2 flex-shrink-0" />
                      <span>{branch.email}</span>
                    </p>
                  )}
                  {branch.adminId && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="flex items-center text-xs text-gray-600 mb-2">
                        <User className="h-4 w-4 mr-2 flex-shrink-0" />
                        <span className="font-semibold">Branch Admin:</span>
                      </p>
                      <p className="text-sm font-medium text-gray-900 ml-6">
                        {branch.adminId.firstName} {branch.adminId.lastName}
                        {branch.adminId.employeeId && ` (${branch.adminId.employeeId})`}
                      </p>
                      {branch.adminId.designation && (
                        <p className="text-xs text-gray-500 ml-6">{branch.adminId.designation}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Branch Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold text-gray-900">
                  {editingBranch ? 'Edit Branch' : 'Add New Branch'}
                </h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    setEditingBranch(null)
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Branch Name *</label>
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Branch Admin (Employee ID)</label>
                  <input
                    type="text"
                    value={formData.adminId}
                    onChange={(e) => setFormData({ ...formData, adminId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    placeholder="Optional - 6-digit employee ID"
                  />
                  <p className="mt-1 text-xs text-gray-500">Leave empty if no admin assigned</p>
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
                    {editingBranch ? 'Update Branch' : 'Create Branch'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddModal(false)
                      setEditingBranch(null)
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
      </div>
    </DashboardLayout>
  )
}

