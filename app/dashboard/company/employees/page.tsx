'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Upload, Search, Edit, Trash2, Download, FileText, X, Save, ChevronDown, ChevronRight, Info } from 'lucide-react'
import { 
  getEmployeesByCompany, 
  getCompanyById, 
  createEmployee, 
  updateEmployee, 
  deleteEmployee,
  getLocationsByCompany,
  getUniqueDesignationsByCompany,
  getUniqueShirtSizesByCompany,
  getUniquePantSizesByCompany,
  getUniqueShoeSizesByCompany
} from '@/lib/data-mongodb'
import AddressForm, { AddressFormData } from '@/components/AddressForm'
// Data masking removed for Company Admin - they should see all employee information unmasked

export default function EmployeesPage() {
  const [searchTerm, setSearchTerm] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>('')
  const [companyName, setCompanyName] = useState<string>('')
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companyEmployees, setCompanyEmployees] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  const [locationAdmins, setLocationAdmins] = useState<Set<string>>(new Set())
  const [uniqueLocationAdminCount, setUniqueLocationAdminCount] = useState<number>(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadResults, setUploadResults] = useState<any>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [expandedLocations, setExpandedLocations] = useState<Set<string>>(new Set())
  const [showLegend, setShowLegend] = useState(true)
  const [availableDesignations, setAvailableDesignations] = useState<string[]>([])
  const [availableShirtSizes, setAvailableShirtSizes] = useState<string[]>([])
  const [availablePantSizes, setAvailablePantSizes] = useState<string[]>([])
  const [availableShoeSizes, setAvailableShoeSizes] = useState<string[]>([])
  
  // Form state for add/edit employee
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    designation: '',
    gender: 'male' as 'male' | 'female',
    email: '',
    mobile: '',
    shirtSize: '',
    pantSize: '',
    shoeSize: '',
    address: '', // DEPRECATED: Keep for backward compatibility
    addressData: {
      address_line_1: '',
      address_line_2: '',
      address_line_3: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    } as AddressFormData,
    locationId: '',
    dispatchPreference: 'direct' as 'direct' | 'central' | 'regional',
    status: 'active' as 'active' | 'inactive',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01').toISOString().split('T')[0],
  })

  // Get company ID from localStorage (set during login) - company admin is linked to only one company
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // SECURITY FIX: Use ONLY sessionStorage (tab-specific) - NO localStorage
          const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
          let targetCompanyId = getCompanyId()
          
          // If companyId not in sessionStorage, try to get it from admin email
          if (!targetCompanyId) {
            const userEmail = getUserEmail('company')
            if (userEmail) {
              const { getCompanyByAdminEmail } = await import('@/lib/data-mongodb')
              const company = await getCompanyByAdminEmail(userEmail)
              if (company && company.id) {
                targetCompanyId = String(company.id)
              }
            }
          }
          
          if (targetCompanyId) {
            setCompanyId(targetCompanyId)
            // Load company details
            const company = await getCompanyById(targetCompanyId)
            if (company) {
              setCompanyName(company.name || '')
              setCompanyPrimaryColor(company.primaryColor || '#f76b1c')
            }
            // Filter employees by company - only show employees linked to this company
            const filtered = await getEmployeesByCompany(targetCompanyId)
            console.log(`[EmployeesPage] Loaded ${filtered.length} employees for company ${targetCompanyId}`)
            console.log(`[EmployeesPage] Employee data:`, filtered)
            if (filtered && Array.isArray(filtered) && filtered.length > 0) {
              console.log(`[EmployeesPage] First employee sample:`, filtered[0])
            }
            setCompanyEmployees(filtered || [])
            // Load locations for the company (for Branch dropdown)
            const companyLocations = await getLocationsByCompany(targetCompanyId)
            setLocations(companyLocations || [])
            // Load available designations and sizes for the company (for dropdowns)
            const [designations, shirtSizes, pantSizes, shoeSizes] = await Promise.all([
              getUniqueDesignationsByCompany(targetCompanyId),
              getUniqueShirtSizesByCompany(targetCompanyId),
              getUniquePantSizesByCompany(targetCompanyId),
              getUniqueShoeSizesByCompany(targetCompanyId)
            ])
            setAvailableDesignations(designations || [])
            setAvailableShirtSizes(shirtSizes || [])
            setAvailablePantSizes(pantSizes || [])
            setAvailableShoeSizes(shoeSizes || [])
            
            // Build set of Location Admin employee IDs for quick lookup
            // CRITICAL FIX: location.adminId stores STRING ID (6-digit numeric), not ObjectId
            // Use employee.id or employee.employeeId (string IDs), not employee._id
            const adminIds = new Set<string>()
            const adminEmployeeIds = new Set<string>() // Track employeeId (numeric string)
            const uniqueAdminIds = new Set<string>() // Track unique employees by string ID
            
            if (companyLocations && Array.isArray(companyLocations)) {
              companyLocations.forEach((loc: any) => {
                if (loc.adminId) {
                  // Handle populated adminId object (now returns string IDs)
                  if (typeof loc.adminId === 'object') {
                    // Populated adminId: { id: '300032', employeeId: '300032', firstName: ..., ... }
                    // PRIMARY: Use id or employeeId (6-digit numeric string)
                    const adminStringId = loc.adminId.id || loc.adminId.employeeId
                    if (adminStringId && /^[A-Za-z0-9_-]{1,50}$/.test(String(adminStringId))) {
                      adminIds.add(String(adminStringId))
                      uniqueAdminIds.add(String(adminStringId))
                    }
                    
                    // Also track employeeId for matching
                    const adminEmployeeId = loc.adminId.employeeId?.toString()
                    if (adminEmployeeId) {
                      adminEmployeeIds.add(adminEmployeeId)
                    }
                    
                    console.log('[EmployeesPage] Found Location Admin from location:', {
                      location: loc.name,
                      locationId: loc.id,
                      adminStringId: adminStringId,
                      adminEmployeeId: adminEmployeeId,
                      adminIdStructure: {
                        id: loc.adminId.id,
                        employeeId: loc.adminId.employeeId
                      }
                    })
                  } else if (typeof loc.adminId === 'string') {
                    // String ID (6-digit numeric) - this is what's stored in location.adminId
                    if (/^[A-Za-z0-9_-]{1,50}$/.test(loc.adminId)) {
                      // It's a 6-digit numeric string ID
                      adminIds.add(loc.adminId)
                      uniqueAdminIds.add(loc.adminId)
                      adminEmployeeIds.add(loc.adminId)
                    }
                  }
                }
              })
            }
            
            console.log('[EmployeesPage] Location Admins by string ID:', adminIds.size, Array.from(adminIds))
            console.log('[EmployeesPage] Location Admins by employeeId (numeric):', adminEmployeeIds.size, Array.from(adminEmployeeIds))
            console.log('[EmployeesPage] Unique Location Admin employees (for count):', uniqueAdminIds.size, Array.from(uniqueAdminIds))
            
            // Merge employeeIds into the main set for comprehensive matching
            if (adminEmployeeIds.size > 0) {
              adminEmployeeIds.forEach(id => adminIds.add(id))
            }
            
            console.log('[EmployeesPage] Total Location Admin IDs (for matching):', adminIds.size, Array.from(adminIds))
            setLocationAdmins(adminIds)
            
            // Store unique admin count separately for display
            // This represents the actual number of unique employees who are Location Admins
            const uniqueAdminCount = uniqueAdminIds.size
            console.log('[EmployeesPage] Unique Location Admin count:', uniqueAdminCount)
            setUniqueLocationAdminCount(uniqueAdminCount)
          } else {
            console.error('[EmployeesPage] No companyId found in localStorage or from admin email')
            alert('Company information not found. Please log in again.')
          }
        } catch (error) {
          console.error('Error loading employees:', error)
          alert(`Error loading employees: ${error instanceof Error ? error.message : 'Unknown error'}`)
        } finally {
          setLoading(false)
        }
      }
      
      loadData()
    }
  }, [])

  // Helper function to get Location name from employee.locationId
  const getLocationName = (employee: any): string => {
    // First try to get from populated locationId
    if (employee.locationId && typeof employee.locationId === 'object' && employee.locationId.name) {
      return employee.locationId.name
    }
    // Try to find in locations array
    if (employee.locationId) {
      const locationIdStr = employee.locationId.toString()
      const location = locations.find((loc: any) => 
        loc._id?.toString() === locationIdStr || 
        loc.id === locationIdStr ||
        loc._id?.toString() === employee.locationId?._id?.toString()
      )
      if (location && location.name) {
        return location.name
      }
    }
    // No location found
    return 'N/A'
  }
  
  // Helper function to check if employee is a Site Admin (Location Admin)
  const isSiteAdmin = (employee: any): boolean => {
    if (!employee || locationAdmins.size === 0) return false
    
    // CRITICAL FIX: location.adminId stores STRING ID (6-digit numeric), not ObjectId
    // Use employee.id or employee.employeeId (string IDs), not employee._id
    let isAdmin = false
    
    // Primary: Check employee.id (6-digit numeric string)
    if (employee.id && /^[A-Za-z0-9_-]{1,50}$/.test(String(employee.id))) {
      if (locationAdmins.has(String(employee.id))) {
        isAdmin = true
      }
    }
    
    // Fallback: Check employeeId (numeric string like '300032')
    if (!isAdmin && employee.employeeId && /^[A-Za-z0-9_-]{1,50}$/.test(String(employee.employeeId))) {
      if (locationAdmins.has(String(employee.employeeId))) {
        isAdmin = true
      }
    }
    
    // Debug logging for Location Admins (log all matches, not just failures)
    if (isAdmin && typeof window !== 'undefined') {
      console.log('[EmployeesPage] ✓ Location Admin MATCHED:', {
        employeeId: employee.employeeId,
        id: employee.id,
        name: `${employee.firstName || ''} ${employee.lastName || ''}`,
        locationAdmins: Array.from(locationAdmins)
      })
    }
    
    return isAdmin
  }

  const filteredEmployees = companyEmployees.filter(emp => {
    if (!emp) return false
    const firstName = emp.firstName || ''
    const lastName = emp.lastName || ''
    const email = emp.email || ''
    const designation = emp.designation || ''
    const employeeId = emp.employeeId || ''
    const locationName = getLocationName(emp)
    
    if (searchTerm === '') return true
    
    return `${firstName} ${lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      designation.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      locationName.toLowerCase().includes(searchTerm.toLowerCase())
  })

  // Group employees by location
  const employeesByLocation = filteredEmployees.reduce((acc: Record<string, any[]>, emp: any) => {
    const locationName = getLocationName(emp)
    if (!acc[locationName]) {
      acc[locationName] = []
    }
    acc[locationName].push(emp)
    return acc
  }, {})

  // Get sorted location names
  const locationNames = Object.keys(employeesByLocation).sort()
  
  // Debug logging
  if (typeof window !== 'undefined' && locationNames.length > 0) {
    console.log('[EmployeesPage] Grouped employees by location:', {
      locationCount: locationNames.length,
      locations: locationNames,
      totalEmployees: filteredEmployees.length
    })
  }

  // Toggle location expansion
  const toggleLocation = (locationName: string) => {
    const newExpanded = new Set(expandedLocations)
    if (newExpanded.has(locationName)) {
      newExpanded.delete(locationName)
    } else {
      newExpanded.add(locationName)
    }
    setExpandedLocations(newExpanded)
  }

  // Expand all locations by default on first load
  useEffect(() => {
    if (locationNames.length > 0 && expandedLocations.size === 0) {
      setExpandedLocations(new Set(locationNames))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationNames.length, filteredEmployees.length])

  const handleBulkOrderUpload = async () => {
    if (!selectedFile || !companyId) {
      alert('Please select a file and ensure company ID is set')
      return
    }

    try {
      setUploading(true)
      
      // Read CSV file
      const text = await selectedFile.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length < 2) {
        alert('CSV file must have at least a header row and one data row')
        setUploading(false)
        return
      }

      // Parse CSV (simple parser - assumes no commas in values)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      const employeeIdIndex = headers.findIndex(h => h === 'employee id' || h === 'employeeno' || h === 'employee no')
      const skuIndex = headers.findIndex(h => h === 'sku')
      const sizeIndex = headers.findIndex(h => h === 'size')
      const quantityIndex = headers.findIndex(h => h === 'quantity')

      if (employeeIdIndex === -1 || skuIndex === -1 || sizeIndex === -1 || quantityIndex === -1) {
        alert('CSV must contain columns: Employee ID, SKU, Size, Quantity')
        setUploading(false)
        return
      }

      const orders = []
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim())
        if (values.length >= 4) {
          orders.push({
            employeeId: values[employeeIdIndex],
            sku: values[skuIndex],
            size: values[sizeIndex],
            quantity: values[quantityIndex],
            rowNumber: i + 1 // +1 because we start from line 2 (after header)
          })
        }
      }

      if (orders.length === 0) {
        alert('No valid orders found in CSV file')
        setUploading(false)
        return
      }

      // Send to API
      const response = await fetch('/api/orders/bulk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          orders,
          companyId
        })
      })

      const data = await response.json()

      if (!response.ok) {
        alert(`Error: ${data.error}`)
        setUploading(false)
        return
      }

      setUploadResults(data)
    } catch (error: any) {
      console.error('Error uploading bulk orders:', error)
      alert(`Error processing file: ${error.message}`)
    } finally {
      setUploading(false)
    }
  }

  const downloadReport = (results: any) => {
    // Create CSV content
    const headers = ['Row Number', 'Employee ID', 'SKU', 'Size', 'Quantity', 'Status', 'Order ID / Error']
    const rows = results.results.map((r: any) => [
      r.rowNumber,
      r.employeeId,
      r.sku,
      r.size,
      r.quantity,
      r.status,
      r.status === 'success' ? r.orderId : r.error || ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map((row: any[]) => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `bulk_order_report_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const resetForm = () => {
    setFormData({
      firstName: '',
      lastName: '',
      designation: '',
      gender: 'male',
      email: '',
      mobile: '',
      shirtSize: '',
      pantSize: '',
      shoeSize: '',
      address: '',
      addressData: {
        address_line_1: '',
        address_line_2: '',
        address_line_3: '',
        city: '',
        state: '',
        pincode: '',
        country: 'India',
      },
      locationId: '',
      dispatchPreference: 'direct',
      status: 'active',
      period: '2024-2025',
      dateOfJoining: new Date('2025-10-01').toISOString().split('T')[0],
    })
  }

  const handleAddEmployee = () => {
    resetForm()
    setShowAddModal(true)
  }

  const handleEditEmployee = async (employee: any) => {
    setEditingEmployee(employee)
    
    // Extract locationId properly - the dropdown uses location.id (6-digit string like "400006")
    let locationIdValue = ''
    if (employee.locationId) {
      if (typeof employee.locationId === 'object' && employee.locationId !== null && !Array.isArray(employee.locationId)) {
        // Populated location object - use the id field (6-digit string)
        locationIdValue = employee.locationId.id || ''
        
        // If id is not available but _id is, try to find location in locations array
        if (!locationIdValue && employee.locationId._id) {
          const location = locations.find((loc: any) => 
            loc._id?.toString() === employee.locationId._id?.toString()
          )
          locationIdValue = location?.id || ''
        }
      } else if (typeof employee.locationId === 'string') {
        // Check if it's a location ID string (6 digits) or ObjectId string (24 hex chars)
        if (/^[A-Za-z0-9_-]{1,50}$/.test(employee.locationId)) {
          // It's a location ID string (like "400006")
          locationIdValue = employee.locationId
        } else if (/^[0-9a-fA-F]{24}$/.test(employee.locationId)) {
          // It's an ObjectId string (24 hex chars) - find the location to get its id
          const location = locations.find((loc: any) => 
            loc._id?.toString() === employee.locationId
          )
          locationIdValue = location?.id || ''
        }
      }
    }
    
    console.log('[handleEditEmployee] Setting locationId:', {
      employeeId: employee.employeeId || employee.id,
      locationIdRaw: employee.locationId,
      locationIdType: typeof employee.locationId,
      locationIdValue: locationIdValue,
      locationIdIsObject: typeof employee.locationId === 'object' && employee.locationId !== null,
      locationIdId: employee.locationId?.id,
      locationId_id: employee.locationId?._id?.toString(),
      locationsCount: locations.length
    })
    
    // Extract structured address if available, otherwise parse legacy address
    let addressData: AddressFormData = {
      address_line_1: '',
      address_line_2: '',
      address_line_3: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India',
    }
    
    if (employee.address && typeof employee.address === 'object') {
      // New structured address format
      addressData = {
        address_line_1: employee.address.address_line_1 || '',
        address_line_2: employee.address.address_line_2 || '',
        address_line_3: employee.address.address_line_3 || '',
        city: employee.address.city || '',
        state: employee.address.state || '',
        pincode: employee.address.pincode || '',
        country: employee.address.country || 'India',
      }
    } else if (employee.address && typeof employee.address === 'string') {
      // Legacy address string - try to parse it
      const { parseLegacyAddress } = await import('@/lib/utils/address-utils')
      const parsed = parseLegacyAddress(employee.address)
      addressData = {
        address_line_1: parsed.address_line_1 || employee.address.substring(0, 255) || '',
        address_line_2: parsed.address_line_2 || '',
        address_line_3: parsed.address_line_3 || '',
        city: parsed.city || 'New Delhi',
        state: parsed.state || 'Delhi',
        pincode: parsed.pincode || '110001',
        country: parsed.country || 'India',
      }
    }
    
    setFormData({
      firstName: employee.firstName || '',
      lastName: employee.lastName || '',
      designation: employee.designation || '',
      gender: employee.gender || 'male',
      email: employee.email || '',
      mobile: employee.mobile || '',
      shirtSize: employee.shirtSize || '',
      pantSize: employee.pantSize || '',
      shoeSize: employee.shoeSize || '',
      address: employee.address && typeof employee.address === 'string' ? employee.address : '', // Keep for backward compatibility
      addressData: addressData,
      locationId: locationIdValue,
      dispatchPreference: employee.dispatchPreference || 'direct',
      status: employee.status || 'active',
      period: employee.period || '2024-2025',
      dateOfJoining: employee.dateOfJoining ? new Date(employee.dateOfJoining).toISOString().split('T')[0] : new Date('2025-10-01').toISOString().split('T')[0],
    })
    setShowEditModal(true)
  }

  const handleDeleteEmployee = async (employee: any) => {
    if (!confirm(`Are you sure you want to delete employee ${employee.firstName} ${employee.lastName} (${employee.employeeId})?`)) {
      return
    }

    try {
      await deleteEmployee(employee.id)
      // Reload employees
      const filtered = await getEmployeesByCompany(companyId)
      setCompanyEmployees(filtered)
      alert('Employee deleted successfully')
    } catch (error: any) {
      console.error('Error deleting employee:', error)
      alert(`Error deleting employee: ${error.message}`)
    }
  }

  const handleSaveEmployee = async () => {
    if (!formData.firstName || !formData.lastName || !formData.email || !formData.designation) {
      alert('Please fill in all required fields (First Name, Last Name, Email, Designation)')
      return
    }

    try {
      setSaving(true)
      
      // Prepare address data - use structured format if available
      const addressData = formData.addressData.address_line_1 
        ? formData.addressData 
        : undefined
      
      const employeePayload: any = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        designation: formData.designation,
        gender: formData.gender,
        email: formData.email,
        mobile: formData.mobile,
        shirtSize: formData.shirtSize,
        pantSize: formData.pantSize,
        shoeSize: formData.shoeSize,
        locationId: formData.locationId || undefined,
        dispatchPreference: formData.dispatchPreference,
        status: formData.status,
        period: formData.period,
        dateOfJoining: formData.dateOfJoining ? new Date(formData.dateOfJoining) : undefined,
      }
      
      // Add address data (prefer structured format)
      if (addressData) {
        employeePayload.addressData = addressData
      } else if (formData.address) {
        // Fallback to legacy address string
        employeePayload.address = formData.address
      }
      
      if (showEditModal && editingEmployee) {
        // Update existing employee
        await updateEmployee(editingEmployee.id, employeePayload)
        alert('Employee updated successfully')
        setShowEditModal(false)
      } else {
        // Create new employee
        if (!companyId || !companyName) {
          alert('Company information not found')
          return
        }
        
        await createEmployee({
          ...employeePayload,
          companyId,
          companyName,
        })
        alert('Employee created successfully')
        setShowAddModal(false)
      }
      
      // Reload employees
      const filtered = await getEmployeesByCompany(companyId)
      setCompanyEmployees(filtered)
      resetForm()
      setEditingEmployee(null)
    } catch (error: any) {
      console.error('Error saving employee:', error)
      alert(`Error saving employee: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {companyName ? `${companyName} - Employee Management` : 'Employee Management'}
          </h1>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowUploadModal(true)}
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
              className="text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
            >
              <Upload className="h-5 w-5" />
              <span className="hidden sm:inline">Bulk Order Upload</span>
              <span className="sm:hidden">Bulk Upload</span>
            </button>
            <button 
              onClick={handleAddEmployee}
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
              className="text-white px-4 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center justify-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Add Employee</span>
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-xl shadow-lg p-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search employees by ID, name, email, designation, or branch..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ 
                '--tw-ring-color': companyPrimaryColor || '#f76b1c'
              } as React.CSSProperties}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:border-transparent"
              onFocus={(e) => {
                e.target.style.borderColor = companyPrimaryColor || '#f76b1c'
                e.target.style.boxShadow = `0 0 0 2px ${companyPrimaryColor || '#f76b1c'}40`
              }}
              onBlur={(e) => {
                e.target.style.borderColor = ''
                e.target.style.boxShadow = ''
              }}
            />
          </div>
        </div>

        {/* Legend - Small */}
        {showLegend && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mb-4 flex items-center justify-between text-xs">
            <div className="flex items-center space-x-3 flex-1">
              <Info className="h-3 w-3 text-blue-600 flex-shrink-0" />
              <div className="flex items-center space-x-4 text-blue-800">
                <div className="flex items-center space-x-1.5">
                  <div className="w-6 h-4 rounded" style={{ backgroundColor: '#eff6ff', borderLeft: '3px solid #3b82f6' }}></div>
                  <span>Blue rows = Location Admin</span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                    Site Admin
                  </span>
                  <span>Badge</span>
                </div>
                {uniqueLocationAdminCount > 0 && (
                  <span className="text-blue-900 font-semibold">
                    ({uniqueLocationAdminCount} found)
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowLegend(false)}
              className="text-blue-600 hover:text-blue-800 ml-2"
              title="Hide legend"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Employee Table - Grouped by Location */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-xl shadow-lg p-8 text-center text-gray-500">
              Loading employees...
            </div>
          ) : locationNames.length === 0 ? (
            <div className="bg-white rounded-xl shadow-lg p-8 text-center text-gray-500">
              {companyEmployees.length === 0 
                ? 'No employees found' 
                : `No employees match search "${searchTerm}" (${companyEmployees.length} total employees)`}
            </div>
          ) : (
            locationNames.map((locationName) => {
              const locationEmployees = employeesByLocation[locationName]
              const isExpanded = expandedLocations.has(locationName)
              const employeeCount = locationEmployees.length
              
              return (
                <div key={locationName} className="bg-white rounded-xl shadow-lg overflow-hidden">
                  {/* Location Header - Collapsible */}
                  <button
                    onClick={() => toggleLocation(locationName)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center space-x-3">
                      {isExpanded ? (
                        <ChevronDown className="h-5 w-5 text-gray-600" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-gray-600" />
                      )}
                      <h3 className="text-lg font-semibold text-gray-900">
                        {locationName}
                      </h3>
                      <span className="px-2 py-1 bg-gray-200 text-gray-700 text-xs font-semibold rounded-full">
                        {employeeCount} {employeeCount === 1 ? 'employee' : 'employees'}
                      </span>
                    </div>
                  </button>

                  {/* Location Employees Table */}
                  {isExpanded && (
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <table className="w-full min-w-[1200px]">
                        <thead className="bg-gray-50 sticky top-0 z-10">
                          <tr>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Employee ID</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Name</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Designation</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Gender</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Email</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Sizes</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Status</th>
                            <th className="text-left py-4 px-6 text-gray-700 font-semibold bg-gray-50 whitespace-nowrap">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {locationEmployees.map((employee) => {
                            // Company Admin can see all employee information unmasked
                            const isAdmin = isSiteAdmin(employee)
                            
                            return (
                              <tr 
                                key={employee.id} 
                                className={`border-b transition-colors ${
                                  isAdmin 
                                    ? 'bg-blue-50 hover:bg-blue-100 border-l-4 border-blue-500' 
                                    : 'hover:bg-gray-50'
                                }`}
                                style={isAdmin ? { 
                                  backgroundColor: '#eff6ff',
                                  borderLeft: '4px solid #3b82f6'
                                } : {}}
                              >
                                <td className="py-4 px-6 whitespace-nowrap">
                                  <span className="font-mono text-sm font-semibold" style={{ color: companyPrimaryColor || '#f76b1c' }}>
                                    {employee.employeeId || 'N/A'}
                                  </span>
                                </td>
                                <td className="py-4 px-6 text-gray-900 font-medium whitespace-nowrap">
                                  <div className="flex items-center space-x-2">
                                    <span>{employee.firstName} {employee.lastName}</span>
                                    {isSiteAdmin(employee) && (
                                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-xs font-semibold rounded-full">
                                        Site Admin
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-4 px-6 text-gray-600 whitespace-nowrap">{employee.designation}</td>
                                <td className="py-4 px-6 text-gray-600 capitalize whitespace-nowrap">{employee.gender}</td>
                                <td className="py-4 px-6 text-gray-600 whitespace-nowrap">{employee.email}</td>
                                <td className="py-4 px-6 text-gray-600 text-sm whitespace-nowrap">
                                  Shirt: {employee.shirtSize}, Pant: {employee.pantSize}, Shoe: {employee.shoeSize}
                                </td>
                                <td className="py-4 px-6 whitespace-nowrap">
                                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                                    employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                                  }`}>
                                    {employee.status}
                                  </span>
                                </td>
                                <td className="py-4 px-6 whitespace-nowrap">
                                  <div className="flex space-x-2">
                                    <button 
                                      onClick={() => handleEditEmployee(employee)}
                                      className="text-blue-600 hover:text-blue-700"
                                      title="Edit Employee"
                                    >
                                      <Edit className="h-4 w-4" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteEmployee(employee)}
                                      className="text-red-600 hover:text-red-700"
                                      title="Delete Employee"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>

        {/* Bulk Order Upload Modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl sm:rounded-xl p-4 sm:p-8 max-w-4xl w-full mx-0 sm:mx-4 my-0 sm:my-8 max-h-screen sm:max-h-[90vh] overflow-y-auto modal-mobile">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Bulk Order Upload</h2>
              <p className="text-gray-600 mb-6">
                Upload a CSV file with the following columns:
                <br />
                <span className="font-semibold">Employee ID, SKU, Size, Quantity</span>
                <br />
                <span className="text-sm text-gray-500 mt-2 block">
                  Note: Only employees from your company can be ordered for. Orders will be validated for eligibility.
                </span>
              </p>

              {!uploadResults && (
                <>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600 mb-2">Drag and drop your CSV file here</p>
                    <p className="text-gray-500 text-sm mb-4">or</p>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setSelectedFile(file)
                        }
                      }}
                      className="mt-4"
                    />
                    {selectedFile && (
                      <p className="mt-4 text-sm text-gray-600">
                        Selected: <span className="font-semibold">{selectedFile.name}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setShowUploadModal(false)
                        setSelectedFile(null)
                        setUploadResults(null)
                      }}
                      className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkOrderUpload}
                      disabled={!selectedFile || uploading}
                      style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                      className="flex-1 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {uploading ? 'Processing...' : 'Upload & Process Orders'}
                    </button>
                  </div>
                </>
              )}

              {uploadResults && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Summary</h3>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Rows</p>
                        <p className="text-2xl font-bold text-gray-900">{uploadResults.summary.total}</p>
                      </div>
                      <div>
                        <p className="text-sm text-green-600">Successful</p>
                        <p className="text-2xl font-bold text-green-600">{uploadResults.summary.successful}</p>
                      </div>
                      <div>
                        <p className="text-sm text-red-600">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{uploadResults.summary.failed}</p>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Row</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Employee ID</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">SKU</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Size</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Qty</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Status</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Order ID / Error</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadResults.results.map((result: any, index: number) => (
                          <tr key={index} className={`border-b ${result.status === 'success' ? 'bg-green-50' : 'bg-red-50'}`}>
                            <td className="py-2 px-4">{result.rowNumber}</td>
                            <td className="py-2 px-4 font-mono text-xs">{result.employeeId}</td>
                            <td className="py-2 px-4">{result.sku}</td>
                            <td className="py-2 px-4">{result.size}</td>
                            <td className="py-2 px-4">{result.quantity}</td>
                            <td className="py-2 px-4">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                result.status === 'success' 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {result.status}
                              </span>
                            </td>
                            <td className="py-2 px-4 text-xs">
                              {result.status === 'success' ? (
                                <span className="font-mono text-green-700">{result.orderId}</span>
                              ) : (
                                <span className="text-red-700">{result.error}</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        downloadReport(uploadResults)
                      }}
                      className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
                    >
                      <Download className="h-5 w-5" />
                      <span>Download Report</span>
                    </button>
                    <button
                      onClick={() => {
                        setShowUploadModal(false)
                        setSelectedFile(null)
                        setUploadResults(null)
                        // Reload employees to show updated data
                        window.location.reload()
                      }}
                      className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Add Employee Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl sm:rounded-xl p-4 sm:p-8 max-w-4xl w-full mx-0 sm:mx-4 my-0 sm:my-8 max-h-screen sm:max-h-[90vh] overflow-y-auto modal-mobile">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Add New Employee</h2>
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    resetForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile *</label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
                  <select
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Designation</option>
                    {availableDesignations.map((designation) => (
                      <option key={designation} value={designation}>
                        {designation}
                      </option>
                    ))}
                    {/* If current designation is not in the list, show it as an option */}
                    {formData.designation && !availableDesignations.includes(formData.designation) && (
                      <option value={formData.designation}>{formData.designation}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch *</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        locationId: e.target.value
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Branch</option>
                    {locations.map((location) => (
                      <option key={location.id || location._id?.toString()} value={location.id || location._id?.toString()}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shirt Size *</label>
                  <select
                    value={formData.shirtSize}
                    onChange={(e) => setFormData({ ...formData, shirtSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Shirt Size</option>
                    {availableShirtSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.shirtSize && !availableShirtSizes.includes(formData.shirtSize) && (
                      <option value={formData.shirtSize}>{formData.shirtSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pant Size *</label>
                  <select
                    value={formData.pantSize}
                    onChange={(e) => setFormData({ ...formData, pantSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Pant Size</option>
                    {availablePantSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.pantSize && !availablePantSizes.includes(formData.pantSize) && (
                      <option value={formData.pantSize}>{formData.pantSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shoe Size *</label>
                  <select
                    value={formData.shoeSize}
                    onChange={(e) => setFormData({ ...formData, shoeSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Shoe Size</option>
                    {availableShoeSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.shoeSize && !availableShoeSizes.includes(formData.shoeSize) && (
                      <option value={formData.shoeSize}>{formData.shoeSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Preference *</label>
                  <select
                    value={formData.dispatchPreference}
                    onChange={(e) => setFormData({ ...formData, dispatchPreference: e.target.value as 'direct' | 'central' | 'regional' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="direct">Direct</option>
                    <option value="central">Central</option>
                    <option value="regional">Regional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining *</label>
                  <input
                    type="date"
                    value={formData.dateOfJoining}
                    onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <AddressForm
                    value={formData.addressData}
                    onChange={(address) => setFormData({ ...formData, addressData: address })}
                    required={true}
                    className=""
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false)
                    resetForm()
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEmployee}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <Save className="h-5 w-5" />
                  <span>{saving ? 'Saving...' : 'Save Employee'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit Employee Modal */}
        {showEditModal && editingEmployee && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-xl sm:rounded-xl p-4 sm:p-8 max-w-4xl w-full mx-0 sm:mx-4 my-0 sm:my-8 max-h-screen sm:max-h-[90vh] overflow-y-auto modal-mobile">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Edit Employee</h2>
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingEmployee(null)
                    resetForm()
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                  <input
                    type="text"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                  <input
                    type="text"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Mobile *</label>
                  <input
                    type="tel"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Designation *</label>
                  <select
                    value={formData.designation}
                    onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Designation</option>
                    {availableDesignations.map((designation) => (
                      <option key={designation} value={designation}>
                        {designation}
                      </option>
                    ))}
                    {/* If current designation is not in the list, show it as an option */}
                    {formData.designation && !availableDesignations.includes(formData.designation) && (
                      <option value={formData.designation}>{formData.designation}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Gender *</label>
                  <select
                    value={formData.gender}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'male' | 'female' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Branch *</label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => {
                      setFormData({ 
                        ...formData, 
                        locationId: e.target.value
                      })
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Branch</option>
                    {locations.map((location) => (
                      <option key={location.id || location._id?.toString()} value={location.id || location._id?.toString()}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shirt Size *</label>
                  <select
                    value={formData.shirtSize}
                    onChange={(e) => setFormData({ ...formData, shirtSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Shirt Size</option>
                    {availableShirtSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.shirtSize && !availableShirtSizes.includes(formData.shirtSize) && (
                      <option value={formData.shirtSize}>{formData.shirtSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Pant Size *</label>
                  <select
                    value={formData.pantSize}
                    onChange={(e) => setFormData({ ...formData, pantSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Pant Size</option>
                    {availablePantSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.pantSize && !availablePantSizes.includes(formData.pantSize) && (
                      <option value={formData.pantSize}>{formData.pantSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Shoe Size *</label>
                  <select
                    value={formData.shoeSize}
                    onChange={(e) => setFormData({ ...formData, shoeSize: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="">Select Shoe Size</option>
                    {availableShoeSizes.map((size) => (
                      <option key={size} value={size}>
                        {size}
                      </option>
                    ))}
                    {formData.shoeSize && !availableShoeSizes.includes(formData.shoeSize) && (
                      <option value={formData.shoeSize}>{formData.shoeSize}</option>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Dispatch Preference *</label>
                  <select
                    value={formData.dispatchPreference}
                    onChange={(e) => setFormData({ ...formData, dispatchPreference: e.target.value as 'direct' | 'central' | 'regional' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="direct">Direct</option>
                    <option value="central">Central</option>
                    <option value="regional">Regional</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Status *</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date of Joining *</label>
                  <input
                    type="date"
                    value={formData.dateOfJoining}
                    onChange={(e) => setFormData({ ...formData, dateOfJoining: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#f76b1c] focus:border-transparent"
                    required
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address *</label>
                  <AddressForm
                    value={formData.addressData}
                    onChange={(address) => setFormData({ ...formData, addressData: address })}
                    required={true}
                    className=""
                  />
                </div>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false)
                    setEditingEmployee(null)
                    resetForm()
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEmployee}
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <Save className="h-5 w-5" />
                  <span>{saving ? 'Saving...' : 'Update Employee'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}








