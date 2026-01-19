'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { getAllCompanies, getAllVendors, Company, Vendor } from '@/lib/data-mongodb'
import { Building2, MapPin, Users, ShoppingCart, Plus, Loader2, CheckCircle2, AlertCircle, HelpCircle, ToggleLeft, ToggleRight } from 'lucide-react'

interface Branch {
  _id: string
  id?: string
  name: string
  companyId: string | { _id: string; id: string }
}

interface Employee {
  _id: string
  id?: string
  employeeId: string
  firstName?: string
  lastName?: string
  email?: string
}

export default function CreateTestOrderPage() {
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null) // null = checking

  // Form state
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string>('')
  const [numOrders, setNumOrders] = useState<number>(1)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [selectedVendorIds, setSelectedVendorIds] = useState<string[]>([])
  const [numEmployees, setNumEmployees] = useState<number>(1)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [autoApproveLocationAdmin, setAutoApproveLocationAdmin] = useState<boolean>(true)
  const [updatingFeatureFlag, setUpdatingFeatureFlag] = useState<boolean>(false)

  // Check feature flag on mount
  useEffect(() => {
    const checkFeatureFlag = async () => {
      try {
        const response = await fetch('/api/superadmin/feature-config')
        if (response.ok) {
          const config = await response.json()
          setFeatureEnabled(config.testOrdersEnabled === true)
        } else {
          // If API fails, default to enabled
          setFeatureEnabled(true)
        }
      } catch (error) {
        console.error('Error checking feature flag:', error)
        setFeatureEnabled(true) // Default to enabled on error
      }
    }
    checkFeatureFlag()
  }, [])

  // Toggle feature flag
  const handleToggleFeature = async (enabled: boolean) => {
    try {
      setUpdatingFeatureFlag(true)
      const response = await fetch('/api/superadmin/feature-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testOrdersEnabled: enabled,
          updatedBy: 'superadmin'
        }),
      })

      if (response.ok) {
        setFeatureEnabled(enabled)
        setSuccess(`Test Order feature ${enabled ? 'enabled' : 'disabled'} successfully`)
      } else {
        const data = await response.json()
        throw new Error(data.error || 'Failed to update feature flag')
      }
    } catch (error: any) {
      console.error('Error updating feature flag:', error)
      setError(error.message || 'Failed to update feature flag')
    } finally {
      setUpdatingFeatureFlag(false)
    }
  }

  // Load companies on mount
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setLoading(true)
        const companiesData = await getAllCompanies()
        setCompanies(companiesData)
      } catch (error) {
        console.error('Error loading companies:', error)
        setError('Failed to load companies')
      } finally {
        setLoading(false)
      }
    }
    loadCompanies()
  }, [])

  // Load branches when company is selected
  useEffect(() => {
    const loadBranches = async () => {
      if (!selectedCompanyId) {
        setBranches([])
        setSelectedBranchId('')
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/companies/${selectedCompanyId}/branches`)
        if (response.ok) {
          const branchesData = await response.json()
          setBranches(branchesData)
        } else {
          setBranches([])
        }
      } catch (error) {
        console.error('Error loading branches:', error)
        setBranches([])
      } finally {
        setLoading(false)
      }
    }
    loadBranches()
  }, [selectedCompanyId])

  // Load vendors when company is selected
  useEffect(() => {
    const loadVendors = async () => {
      if (!selectedCompanyId) {
        setVendors([])
        setSelectedVendorIds([])
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/companies/${selectedCompanyId}/vendors`)
        if (response.ok) {
          const vendorsData = await response.json()
          setVendors(vendorsData)
        } else {
          setVendors([])
        }
      } catch (error) {
        console.error('Error loading vendors:', error)
        setVendors([])
      } finally {
        setLoading(false)
      }
    }
    loadVendors()
  }, [selectedCompanyId])

  // Load employees when branch is selected
  useEffect(() => {
    const loadEmployees = async () => {
      if (!selectedBranchId || !selectedCompanyId) {
        setEmployees([])
        return
      }

      try {
        setLoading(true)
        const response = await fetch(`/api/branches/${selectedBranchId}/employees?limit=${numEmployees}`)
        if (response.ok) {
          const employeesData = await response.json()
          setEmployees(employeesData)
        } else {
          setEmployees([])
        }
      } catch (error) {
        console.error('Error loading employees:', error)
        setEmployees([])
      } finally {
        setLoading(false)
      }
    }
    loadEmployees()
  }, [selectedBranchId, selectedCompanyId, numEmployees])

  const handleVendorToggle = (vendorId: string) => {
    setSelectedVendorIds(prev => {
      if (prev.includes(vendorId)) {
        return prev.filter(id => id !== vendorId)
      } else {
        return [...prev, vendorId]
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!selectedCompanyId || !selectedBranchId || selectedVendorIds.length === 0) {
      setError('Please fill all required fields')
      return
    }

    if (employees.length === 0) {
      setError('No employees found for the selected branch')
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      setSuccess(null)

      const response = await fetch('/api/superadmin/create-test-orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          companyId: selectedCompanyId,
          branchId: selectedBranchId,
          vendorIds: selectedVendorIds,
          numEmployees: numEmployees,
          autoApproveLocationAdmin: autoApproveLocationAdmin,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create test orders')
      }

      // Build success message with order numbers and PR numbers
      const orderDetails = data.orders.map((o: any) => {
        if (o.prNumber && o.prNumber !== 'N/A') {
          return `${o.orderId} (PR: ${o.prNumber})`
        }
        return o.orderId
      }).join(', ')
      setSuccess(`Successfully created ${data.ordersCreated} test order(s)! Orders: ${orderDetails}`)
      
      // Reset form
      setSelectedCompanyId('')
      setSelectedBranchId('')
      setSelectedVendorIds([])
      setNumOrders(1)
      setNumEmployees(1)
      setAutoApproveLocationAdmin(true)
    } catch (error: any) {
      console.error('Error creating test orders:', error)
      setError(error.message || 'Failed to create test orders')
    } finally {
      setSubmitting(false)
    }
  }

  const isFormValid = selectedCompanyId && selectedBranchId && selectedVendorIds.length > 0 && employees.length > 0

  // Feature disabled guard
  if (featureEnabled === null) {
    return (
      <DashboardLayout actorType="superadmin">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 text-center">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">Checking feature availability...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (featureEnabled === false) {
    return (
      <DashboardLayout actorType="superadmin">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center mb-6">
              <AlertCircle className="h-12 w-12 mx-auto text-gray-400 mb-4" />
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Feature Disabled</h1>
              <p className="text-gray-600 mb-4">
                The Test Order feature is currently disabled. Enable it using the toggle below.
              </p>
            </div>
            
            {/* Feature Toggle */}
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Test Order Feature
                  </label>
                  <p className="text-xs text-gray-500">
                    Enable or disable the Test Order creation feature. This does not affect existing orders.
                  </p>
                </div>
                <button
                  onClick={() => handleToggleFeature(true)}
                  disabled={updatingFeatureFlag}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {updatingFeatureFlag ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Enabling...
                    </>
                  ) : (
                    <>
                      <ToggleRight className="h-5 w-5" />
                      Enable Feature
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="superadmin">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Create Test Order</h1>
              <p className="text-gray-600 mt-2">
                Create test orders for employees. Configure auto-approval behavior using the checkbox below.
              </p>
            </div>
            {/* Feature Toggle */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600 font-medium">Feature Status:</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-medium ${featureEnabled ? 'text-green-600' : 'text-gray-400'}`}>
                  {featureEnabled ? 'Enabled' : 'Disabled'}
                </span>
                <button
                  onClick={() => handleToggleFeature(!featureEnabled)}
                  disabled={updatingFeatureFlag}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 ${
                    featureEnabled 
                      ? 'bg-green-600 focus:ring-green-500' 
                      : 'bg-gray-300 focus:ring-gray-400'
                  }`}
                  title={`Click to ${featureEnabled ? 'disable' : 'enable'} Test Order feature`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      featureEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <p className="text-green-800">{success}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 space-y-6">
          {/* Company Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Building2 className="inline h-4 w-4 mr-1" />
              Company <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                setSelectedCompanyId(e.target.value)
                setSelectedBranchId('')
                setSelectedVendorIds([])
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={loading || submitting}
            >
              <option value="">Select a company</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </div>

          {/* Branch Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <MapPin className="inline h-4 w-4 mr-1" />
              Branch <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => {
                setSelectedBranchId(e.target.value)
                setEmployees([])
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={!selectedCompanyId || loading || submitting}
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* Number of Employees */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="inline h-4 w-4 mr-1" />
              Number of Employees (Orders) <span className="text-red-500">*</span>
            </label>
            <select
              value={numEmployees}
              onChange={(e) => setNumEmployees(Number(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              disabled={!selectedBranchId || loading || submitting}
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map((num) => (
                <option key={num} value={num}>
                  {num}
                </option>
              ))}
            </select>
            {employees.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                Found {employees.length} employee(s) from selected branch
              </p>
            )}
          </div>

          {/* Auto Approve Location Admin Checkbox */}
          <div className="flex items-start space-x-3 p-4 bg-gray-50 rounded-md border border-gray-200">
            <input
              type="checkbox"
              id="autoApproveLocationAdmin"
              checked={autoApproveLocationAdmin}
              onChange={(e) => setAutoApproveLocationAdmin(e.target.checked)}
              className="mt-1 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              disabled={loading || submitting}
            />
            <div className="flex-1">
              <label htmlFor="autoApproveLocationAdmin" className="block text-sm font-medium text-gray-700 cursor-pointer">
                Auto approve by Location Admin?
              </label>
              <p className="mt-1 text-xs text-gray-500">
                If enabled, PRs will be automatically approved at Location Admin level.
                If disabled, PRs will remain pending for Location Admin approval.
              </p>
            </div>
          </div>

          {/* Vendor Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <ShoppingCart className="inline h-4 w-4 mr-1" />
              Vendors <span className="text-red-500">*</span>
            </label>
            <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
              {vendors.length === 0 ? (
                <p className="text-sm text-gray-500">No vendors available for this company</p>
              ) : (
                <div className="space-y-2">
                  {vendors.map((vendor) => (
                    <label key={vendor.id} className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedVendorIds.includes(vendor.id)}
                        onChange={() => handleVendorToggle(vendor.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        disabled={loading || submitting}
                      />
                      <span className="text-sm text-gray-700">{vendor.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            {selectedVendorIds.length > 0 && (
              <p className="mt-2 text-sm text-gray-600">
                {selectedVendorIds.length} vendor(s) selected
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-4">
            <button
              type="submit"
              disabled={!isFormValid || submitting || loading}
              className="w-full bg-blue-600 text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Creating Orders...
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  Create Test Orders
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </DashboardLayout>
  )
}

