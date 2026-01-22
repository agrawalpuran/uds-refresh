'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Edit, Trash2, Save, X, CheckCircle } from 'lucide-react'
import {
  getUniqueDesignationsByCompany,
  getSubcategoriesByCompany,
  getDesignationSubcategoryEligibilities,
  createDesignationSubcategoryEligibility,
  updateDesignationSubcategoryEligibility,
  deleteDesignationSubcategoryEligibility,
  refreshEmployeeEligibilityForDesignation,
} from '@/lib/data-mongodb'

interface Subcategory {
  id: string
  _id: string
  name: string
  parentCategoryId: string
  parentCategory: {
    id: string
    name: string
    isSystemCategory: boolean
  } | null
  companyId: string
  status: 'active' | 'inactive'
}

interface SubcategoryGroup {
  categoryId: string
  categoryName: string
  subcategories: Subcategory[]
}

interface SubcategoryEligibilityForm {
  quantity: number
  renewalFrequency: number // Renewal frequency in months
}

export default function DesignationEligibilityPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [eligibilities, setEligibilities] = useState<any[]>([])
  const [availableDesignations, setAvailableDesignations] = useState<string[]>([])
  const [subcategoryGroups, setSubcategoryGroups] = useState<SubcategoryGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [formData, setFormData] = useState({
    designation: '',
    gender: 'male' as 'male' | 'female',
    selectedSubcategories: [] as string[], // Array of subcategory IDs
    subcategoryQuantities: {} as Record<string, SubcategoryEligibilityForm>, // subcategoryId -> { quantity }
    refreshEligibility: false, // Refresh eligibility for all employees with this designation
  })

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          const storedCompanyId = localStorage.getItem('companyId')
          if (storedCompanyId) {
            setCompanyId(storedCompanyId)
            
            // Load designations and subcategories in parallel
            console.log('[Designation Eligibility] Loading data for companyId:', storedCompanyId)
            
            const [designationsData, subcategoriesData, eligibilitiesData] = await Promise.all([
              getUniqueDesignationsByCompany(storedCompanyId),
              getSubcategoriesByCompany(storedCompanyId),
              getDesignationSubcategoryEligibilities(storedCompanyId),
            ])
            
            console.log('[Designation Eligibility] Data loaded:', {
              designationsCount: designationsData.length,
              subcategoriesCount: subcategoriesData.length,
              eligibilitiesCount: eligibilitiesData.length,
            })
            
            setAvailableDesignations(designationsData)
            setEligibilities(eligibilitiesData)
            
            // Debug logging
            console.log('[Designation Eligibility] Subcategories data received:', {
              count: subcategoriesData.length,
              subcategories: subcategoriesData.map((s: any) => ({
                id: s.id,
                name: s.name,
                status: s.status,
                hasParentCategory: !!s.parentCategory,
                parentCategory: s.parentCategory,
              }))
            })
            
            if (subcategoriesData.length === 0) {
              console.warn('[Designation Eligibility] ⚠️ NO SUBCATEGORIES FOUND!')
              console.warn('This could mean:')
              console.warn('  1. No subcategories have been created for this company yet')
              console.warn('  2. All subcategories are inactive (status != "active")')
              console.warn('  3. Company ID mismatch between frontend and backend')
              console.warn('  4. Authentication/authorization issue')
              console.warn('')
              console.warn('To fix:')
              console.warn('  1. Go to Subcategories page and verify subcategories exist')
              console.warn('  2. Check that subcategories have status="active"')
              console.warn('  3. Verify companyId matches:', storedCompanyId)
            }
            
            // Group subcategories by parent category
            const grouped = new Map<string, SubcategoryGroup>()
            
            subcategoriesData.forEach((sub: any) => {
              // Only filter by active status, but allow subcategories even if parentCategory is missing (we'll handle it)
              if (sub.status === 'active') {
                // Check if parentCategory exists
                if (!sub.parentCategory) {
                  console.warn(`[Designation Eligibility] Subcategory ${sub.id} (${sub.name}) has no parentCategory populated`)
                  // Try to skip this one, or we could fetch the parent category separately
                  return
                }
                
                const categoryId = sub.parentCategory.id
                const categoryName = sub.parentCategory.name
                
                if (!categoryId || !categoryName) {
                  console.warn(`[Designation Eligibility] Subcategory ${sub.id} (${sub.name}) has invalid parentCategory data:`, sub.parentCategory)
                  return
                }
                
                if (!grouped.has(categoryId)) {
                  grouped.set(categoryId, {
                    categoryId,
                    categoryName,
                    subcategories: [],
                  })
                }
                
                grouped.get(categoryId)!.subcategories.push({
                  id: sub.id,
                  _id: sub._id,
                  name: sub.name,
                  parentCategoryId: sub.parentCategoryId || sub.parentCategory.id,
                  parentCategory: sub.parentCategory,
                  companyId: sub.companyId,
                  status: sub.status,
                })
              } else {
                console.log(`[Designation Eligibility] Skipping inactive subcategory: ${sub.id} (${sub.name})`)
              }
            })
            
            console.log('[Designation Eligibility] Grouped subcategories:', {
              groupCount: grouped.size,
              groups: Array.from(grouped.entries()).map(([id, group]) => ({
                categoryId: id,
                categoryName: group.categoryName,
                subcategoryCount: group.subcategories.length,
              }))
            })
            
            // Convert to array and sort by category name
            const groupsArray = Array.from(grouped.values()).sort((a, b) => 
              a.categoryName.localeCompare(b.categoryName)
            )
            
            // Sort subcategories within each group by name
            groupsArray.forEach(group => {
              group.subcategories.sort((a, b) => a.name.localeCompare(b.name))
            })
            
            setSubcategoryGroups(groupsArray)
          }
        } catch (error) {
          console.error('Error loading data:', error)
        } finally {
          setLoading(false)
        }
      }
      loadData()
    }
  }, [])

  const handleToggleSubcategory = (subcategoryId: string) => {
    setFormData((prev) => {
      const isSelected = prev.selectedSubcategories.includes(subcategoryId)
      const newSelected = isSelected
        ? prev.selectedSubcategories.filter((id) => id !== subcategoryId)
        : [...prev.selectedSubcategories, subcategoryId]
      
      // Remove quantity and frequency data if unselected
      const newQuantities = { ...prev.subcategoryQuantities }
      if (isSelected) {
        delete newQuantities[subcategoryId]
      } else {
        // Initialize with default values (user must enter)
        newQuantities[subcategoryId] = { 
          quantity: 0,
          renewalFrequency: 6 // Default: 6 months
        }
      }
      
      return {
        ...prev,
        selectedSubcategories: newSelected,
        subcategoryQuantities: newQuantities,
      }
    })
  }

  const handleQuantityChange = (subcategoryId: string, quantity: number) => {
    setFormData((prev) => ({
      ...prev,
      subcategoryQuantities: {
        ...prev.subcategoryQuantities,
        [subcategoryId]: {
          ...prev.subcategoryQuantities[subcategoryId],
          quantity: quantity >= 0 ? quantity : 0,
          renewalFrequency: prev.subcategoryQuantities[subcategoryId]?.renewalFrequency || 6,
        },
      },
    }))
  }

  const handleFrequencyChange = (subcategoryId: string, frequency: number) => {
    setFormData((prev) => ({
      ...prev,
      subcategoryQuantities: {
        ...prev.subcategoryQuantities,
        [subcategoryId]: {
          ...prev.subcategoryQuantities[subcategoryId],
          quantity: prev.subcategoryQuantities[subcategoryId]?.quantity || 0,
          renewalFrequency: frequency >= 1 ? frequency : 1,
        },
      },
    }))
  }

  const handleAdd = async () => {
    if (!formData.designation || formData.selectedSubcategories.length === 0) {
      alert('Please fill in designation and select at least one subcategory')
      return
    }

    // Validate quantities and frequencies
    for (const subcategoryId of formData.selectedSubcategories) {
      const quantity = formData.subcategoryQuantities[subcategoryId]?.quantity || 0
      const renewalFrequency = formData.subcategoryQuantities[subcategoryId]?.renewalFrequency || 0
      
      if (quantity <= 0) {
        const subcategory = subcategoryGroups
          .flatMap(g => g.subcategories)
          .find(s => s.id === subcategoryId)
        const subcategoryName = subcategory?.name || subcategoryId
        alert(`Please enter a valid quantity (greater than 0) for "${subcategoryName}"`)
        return
      }
      
      if (renewalFrequency <= 0) {
        const subcategory = subcategoryGroups
          .flatMap(g => g.subcategories)
          .find(s => s.id === subcategoryId)
        const subcategoryName = subcategory?.name || subcategoryId
        alert(`Please enter a valid renewal frequency (greater than 0) for "${subcategoryName}"`)
        return
      }
    }

    try {
      // Create eligibility for each selected subcategory
      const promises = formData.selectedSubcategories.map(subcategoryId => {
        const quantity = formData.subcategoryQuantities[subcategoryId]?.quantity || 0
        const renewalFrequency = formData.subcategoryQuantities[subcategoryId]?.renewalFrequency || 6
        return createDesignationSubcategoryEligibility(
        companyId,
        formData.designation,
          subcategoryId,
          quantity,
          renewalFrequency, // Use user-entered frequency
          'months', // Renewal unit (always months for now)
        formData.gender
      )
      })

      await Promise.all(promises)
      
      // Reload eligibilities
      const refreshedEligibilities = await getDesignationSubcategoryEligibilities(companyId)
        setEligibilities(refreshedEligibilities)
      
      // If refreshEligibility was checked, trigger refresh
      if (formData.refreshEligibility) {
        try {
          console.log('🔄 Refreshing employee eligibility...')
          const refreshResult = await refreshEmployeeEligibilityForDesignation(
            companyId,
            formData.designation,
            formData.gender
          )
          if (refreshResult.success) {
            alert(`✅ Eligibility refreshed successfully! Updated ${refreshResult.employeesUpdated} employee(s).`)
          } else {
            alert(`⚠️ Refresh completed with warnings: ${refreshResult.message}`)
          }
        } catch (error: any) {
          console.error('Error refreshing eligibility:', error)
          alert(`⚠️ Eligibility saved, but refresh failed: ${error.message || 'Unknown error'}`)
        }
      }
      
      // Reset form
      setFormData({
        designation: '',
        gender: 'male',
        selectedSubcategories: [],
        subcategoryQuantities: {},
        refreshEligibility: false,
      })
      setShowAddForm(false)
    } catch (error: any) {
      console.error('Error creating eligibility:', error)
      alert(`Error creating eligibility: ${error.message || 'Unknown error occurred'}`)
    }
  }

  const handleEdit = (eligibility: any) => {
    // Find all eligibilities for this designation and gender
    const relatedEligibilities = eligibilities.filter(
      (e: any) => e.designationId === eligibility.designationId && e.gender === eligibility.gender
    )
    
    // CRITICAL FIX: Use id field (string ID) instead of _id (ObjectId)
    // Eligibility objects use string IDs, not ObjectIds
    const eligibilityId = eligibility.id || eligibility._id
    if (!eligibilityId) {
      console.error('Cannot edit: eligibility missing id field', eligibility)
      alert('Error: Cannot edit eligibility - missing ID')
      return
    }
    
    setEditingId(eligibilityId)
    
    // Populate form with existing data
    const selectedSubcategories: string[] = []
    const subcategoryQuantities: Record<string, SubcategoryEligibilityForm> = {}
    
    relatedEligibilities.forEach((e: any) => {
      if (e.subcategory?.id) {
        selectedSubcategories.push(e.subcategory.id)
        subcategoryQuantities[e.subcategory.id] = {
          quantity: e.quantity || 0,
          renewalFrequency: e.renewalFrequency || 6, // Load saved frequency or default to 6
        }
      }
    })
    
    setFormData({
      designation: eligibility.designationId,
      gender: eligibility.gender === 'unisex' ? 'male' : (eligibility.gender || 'male'),
      selectedSubcategories,
      subcategoryQuantities,
      refreshEligibility: false, // Default to false when editing
    })
    setShowAddForm(false)
  }

  const handleUpdate = async () => {
    if (!editingId || !formData.designation || formData.selectedSubcategories.length === 0) {
      alert('Please fill in designation and select at least one subcategory')
      return
    }

    // Validate quantities and frequencies
    for (const subcategoryId of formData.selectedSubcategories) {
      const quantity = formData.subcategoryQuantities[subcategoryId]?.quantity || 0
      const renewalFrequency = formData.subcategoryQuantities[subcategoryId]?.renewalFrequency || 0
      
      if (quantity <= 0) {
        const subcategory = subcategoryGroups
          .flatMap(g => g.subcategories)
          .find(s => s.id === subcategoryId)
        const subcategoryName = subcategory?.name || subcategoryId
        alert(`Please enter a valid quantity (greater than 0) for "${subcategoryName}"`)
        return
      }
      
      if (renewalFrequency <= 0) {
        const subcategory = subcategoryGroups
          .flatMap(g => g.subcategories)
          .find(s => s.id === subcategoryId)
        const subcategoryName = subcategory?.name || subcategoryId
        alert(`Please enter a valid renewal frequency (greater than 0) for "${subcategoryName}"`)
        return
      }
    }

    try {
      // Find all existing eligibilities for this designation and gender
      const existingEligibilities = eligibilities.filter(
        (e: any) => e.designationId === formData.designation && e.gender === formData.gender
      )
      
      // Get IDs of subcategories that should exist
      const targetSubcategoryIds = new Set(formData.selectedSubcategories)
      
      // Update or create eligibilities
      const promises: Promise<any>[] = []
      
      for (const subcategoryId of formData.selectedSubcategories) {
        const quantity = formData.subcategoryQuantities[subcategoryId]?.quantity || 0
        const renewalFrequency = formData.subcategoryQuantities[subcategoryId]?.renewalFrequency || 6
        const existing = existingEligibilities.find(
          (e: any) => e.subcategory?.id === subcategoryId
        )
        
        if (existing) {
          // Update existing
          // CRITICAL FIX: Use id field (string ID) instead of _id (ObjectId)
          const existingId = existing.id || existing._id
          if (!existingId) {
            console.error('Cannot update: eligibility missing id field', existing)
            continue
          }
          promises.push(
            updateDesignationSubcategoryEligibility(
              existingId,
              quantity,
              renewalFrequency, // Use user-entered frequency
              'months', // Renewal unit (always months for now)
              'active'
            )
          )
        } else {
          // Create new
          promises.push(
            createDesignationSubcategoryEligibility(
              companyId,
              formData.designation,
              subcategoryId,
              quantity,
              renewalFrequency, // Use user-entered frequency
              'months', // Renewal unit (always months for now)
              formData.gender
            )
          )
        }
      }
      
      // Delete eligibilities that are no longer selected
      for (const existing of existingEligibilities) {
        if (!targetSubcategoryIds.has(existing.subcategory?.id)) {
          // CRITICAL FIX: Use id field (string ID) instead of _id (ObjectId)
          const existingId = existing.id || existing._id
          if (existingId) {
            promises.push(deleteDesignationSubcategoryEligibility(existingId))
          }
        }
      }
      
      await Promise.all(promises)
      
      // Reload eligibilities
      const refreshedEligibilities = await getDesignationSubcategoryEligibilities(companyId)
      setEligibilities(refreshedEligibilities)
      
      // If refreshEligibility was checked, trigger refresh
      if (formData.refreshEligibility) {
        try {
          console.log('🔄 Refreshing employee eligibility...')
          const refreshResult = await refreshEmployeeEligibilityForDesignation(
            companyId,
            formData.designation,
            formData.gender
          )
          if (refreshResult.success) {
            alert(`✅ Eligibility refreshed successfully! Updated ${refreshResult.employeesUpdated} employee(s).`)
          } else {
            alert(`⚠️ Refresh completed with warnings: ${refreshResult.message}`)
          }
        } catch (error: any) {
          console.error('Error refreshing eligibility:', error)
          alert(`⚠️ Eligibility updated, but refresh failed: ${error.message || 'Unknown error'}`)
        }
      }
      
      // Reset form
      setEditingId(null)
      setFormData({
        designation: '',
        gender: 'male',
        selectedSubcategories: [],
        subcategoryQuantities: {},
        refreshEligibility: false,
      })
    } catch (error: any) {
      console.error('Error updating eligibility:', error)
      alert(`Error updating eligibility: ${error.message || 'Unknown error occurred'}`)
    }
  }

  const handleDelete = async (eligibility: any) => {
    if (!confirm('Are you sure you want to delete this eligibility rule?')) {
      return
    }

    try {
      // Delete all eligibilities for this designation and gender
      const relatedEligibilities = eligibilities.filter(
        (e: any) => e.designationId === eligibility.designationId && e.gender === eligibility.gender
      )
      
      await Promise.all(
        relatedEligibilities.map((e: any) => {
          // CRITICAL FIX: Use id field (string ID) instead of _id (ObjectId)
          const eligibilityId = e.id || e._id
          if (eligibilityId) {
            return deleteDesignationSubcategoryEligibility(eligibilityId)
          }
          return Promise.resolve()
        })
      )
      
      // Reload eligibilities
      const refreshedEligibilities = await getDesignationSubcategoryEligibilities(companyId)
      setEligibilities(refreshedEligibilities)
    } catch (error: any) {
      alert(`Error deleting eligibility: ${error.message}`)
    }
  }

  const handleCancel = () => {
    setEditingId(null)
    setShowAddForm(false)
    setFormData({
      designation: '',
      gender: 'male',
      selectedSubcategories: [],
      subcategoryQuantities: {},
      refreshEligibility: false,
    })
  }

  // Group eligibilities by designation and gender for display
  const groupedEligibilities = new Map<string, any[]>()
  eligibilities.forEach((elig: any) => {
    const key = `${elig.designationId}::${elig.gender}`
    if (!groupedEligibilities.has(key)) {
      groupedEligibilities.set(key, [])
    }
    groupedEligibilities.get(key)!.push(elig)
  })

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-[400px]">
          <p className="text-gray-600">Loading...</p>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Designation Product Eligibility</h1>
            <p className="text-gray-600 mt-2">
              Manage uniform item eligibility and quantities for each designation at the subcategory level
            </p>
          </div>
          {!showAddForm && !editingId && (
            <button
              onClick={() => setShowAddForm(true)}
              className="bg-primary-500 text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary-600 transition-colors flex items-center space-x-2"
            >
              <Plus className="h-5 w-5" />
              <span>Add Designation Mapping</span>
            </button>
          )}
        </div>

        {/* Add/Edit Form */}
        {(showAddForm || editingId) && (
          <div className="bg-white rounded-xl shadow-lg p-6 mb-6 border-2 border-primary-200">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingId ? 'Edit Designation Eligibility' : 'Add New Designation Eligibility'}
            </h2>
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Designation Name
                </label>
                <select
                  value={formData.designation}
                  onChange={(e) => setFormData({ ...formData, designation: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                  disabled={!!editingId}
                >
                  <option value="">Select a designation...</option>
                  {availableDesignations.map((designation) => (
                    <option key={designation} value={designation}>
                      {designation}
                    </option>
                  ))}
                </select>
                {availableDesignations.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    No designations found in database. Please add employees with designations first.
                  </p>
                )}
                {availableDesignations.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {availableDesignations.length} designation{availableDesignations.length !== 1 ? 's' : ''} found in your company
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Gender Filter
                </label>
                <select
                  value={formData.gender}
                  onChange={(e) => {
                const newGender = e.target.value as 'male' | 'female'
                setFormData({ 
                  ...formData, 
                  gender: newGender,
                      // Clear selections when gender changes
                      selectedSubcategories: [],
                      subcategoryQuantities: {},
                })
              }}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent bg-white"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Select which gender this eligibility rule applies to. Products marked as "Unisex" will automatically appear under both Male and Female views.
                </p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-3">
                  Subcategories & Quantity Settings
                </label>
                {subcategoryGroups.length === 0 ? (
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800 mb-2">
                      No active subcategories found for your company.
                    </p>
                    <p className="text-xs text-yellow-700 mb-2">
                      Please create subcategories first in the Subcategories management page.
                    </p>
                    <p className="text-xs text-gray-600">
                      <strong>Debug:</strong> Check browser console (F12) for detailed subcategory loading information.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {subcategoryGroups.map((group) => (
                      <div key={group.categoryId} className="border border-gray-200 rounded-lg p-4">
                        <h3 className="text-sm font-semibold text-gray-900 mb-3">
                          {group.categoryName}
                        </h3>
                        <div className="space-y-3">
                          {group.subcategories.map((subcategory) => {
                            const isSelected = formData.selectedSubcategories.includes(subcategory.id)
                            const quantity = formData.subcategoryQuantities[subcategory.id]?.quantity || 0
                            const renewalFrequency = formData.subcategoryQuantities[subcategory.id]?.renewalFrequency || 6
                    
                    return (
                      <div
                                key={subcategory.id}
                                className={`p-3 border-2 rounded-lg transition-colors ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                                <div className="flex flex-col space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-3">
                          <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleToggleSubcategory(subcategory.id)}
                                      className="w-5 h-5 text-primary-500 rounded focus:ring-primary-500"
                                    />
                                    <span className="text-sm font-medium text-gray-900">
                                      {subcategory.name}
                                    </span>
                                  </div>
                                </div>
                                  
                                  {isSelected && (
                                    <div className="flex items-center space-x-4 pt-2 border-t border-gray-200">
                                      <div className="flex items-center space-x-2">
                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">
                                          Quantity:
                                        </label>
                                        <input
                                          type="number"
                                          min="1"
                                          value={quantity > 0 ? quantity : ''}
                                          onChange={(e) => {
                                            const inputValue = e.target.value.trim()
                                            if (inputValue === '') {
                                              handleQuantityChange(subcategory.id, 0)
                                              return
                                            }
                                            const numValue = parseInt(inputValue, 10)
                                            if (!isNaN(numValue) && numValue >= 0) {
                                              handleQuantityChange(subcategory.id, numValue)
                                            }
                                          }}
                                          onBlur={(e) => {
                                            const inputValue = e.target.value.trim()
                                            const numValue = parseInt(inputValue, 10)
                                            if (inputValue === '' || isNaN(numValue) || numValue <= 0) {
                                              handleQuantityChange(subcategory.id, 1)
                                            }
                                          }}
                                          className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                          placeholder="0"
                                        />
                                      </div>
                                      <div className="flex items-center space-x-2">
                                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap">
                                          Frequency (months):
                                        </label>
                                        <input
                                          type="number"
                                          min="1"
                                          value={renewalFrequency > 0 ? renewalFrequency : ''}
                                          onChange={(e) => {
                                            const inputValue = e.target.value.trim()
                                            if (inputValue === '') {
                                              handleFrequencyChange(subcategory.id, 0)
                                              return
                                            }
                                            const numValue = parseInt(inputValue, 10)
                                            if (!isNaN(numValue) && numValue >= 1) {
                                              handleFrequencyChange(subcategory.id, numValue)
                                            }
                                          }}
                                          onBlur={(e) => {
                                            const inputValue = e.target.value.trim()
                                            const numValue = parseInt(inputValue, 10)
                                            if (inputValue === '' || isNaN(numValue) || numValue <= 0) {
                                              handleFrequencyChange(subcategory.id, 6)
                                            }
                                          }}
                                          className="w-20 px-2 py-1 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent text-sm"
                                          placeholder="6"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )
                          })}
                  </div>
              </div>
                    ))}
                </div>
              )}
              </div>

              {/* Refresh Eligibility Checkbox */}
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <input
                    type="checkbox"
                    id="refreshEligibility"
                    checked={formData.refreshEligibility}
                    onChange={(e) => setFormData({ ...formData, refreshEligibility: e.target.checked })}
                    className="mt-1 w-5 h-5 text-primary-500 rounded focus:ring-primary-500"
                  />
                  <div className="flex-1">
                    <label htmlFor="refreshEligibility" className="text-sm font-semibold text-yellow-900 cursor-pointer">
                      Refresh Eligibility for All Employees
                    </label>
                    <p className="text-xs text-yellow-800 mt-1">
                      When checked, eligibility will be recomputed and applied to ALL employees with this designation and gender. 
                      This will reset their current eligibility values based on the subcategory configuration above.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={editingId ? handleUpdate : handleAdd}
                  className="bg-primary-500 text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary-600 transition-colors flex items-center space-x-2"
                >
                  <Save className="h-5 w-5" />
                  <span>{editingId ? 'Update' : 'Create'}</span>
                </button>
                <button
                  onClick={handleCancel}
                  className="bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-semibold hover:bg-gray-300 transition-colors flex items-center space-x-2"
                >
                  <X className="h-5 w-5" />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
          <div className="flex items-start space-x-3">
            <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-900">How it works:</p>
              <ul className="text-sm text-blue-800 mt-1 space-y-1 list-disc list-inside">
                <li>Eligibility is configured at the subcategory level (not category level)</li>
                <li>Only subcategories created for your company are shown</li>
                <li>Select subcategories and specify the quantity of products allowed per renewal cycle</li>
                <li>Default renewal cycle is 6 months (configurable in future updates)</li>
                <li>Set gender filter to apply rules to specific genders (Male or Female)</li>
                <li>If no eligibility rule exists for a designation, all company products are visible (backward compatibility)</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Eligibilities List */}
        <div className="bg-white rounded-xl shadow-lg overflow-hidden">
          {Array.from(groupedEligibilities.entries()).length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-gray-600 mb-4">No designation eligibility rules configured yet.</p>
              <p className="text-sm text-gray-500">
                Click "Add Designation Mapping" to create your first rule.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left py-4 px-6 text-gray-700 font-semibold">Designation</th>
                    <th className="text-left py-4 px-6 text-gray-700 font-semibold">Gender</th>
                    <th className="text-left py-4 px-6 text-gray-700 font-semibold">Subcategories</th>
                    <th className="text-left py-4 px-6 text-gray-700 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {Array.from(groupedEligibilities.entries()).map(([key, groupEligs]) => {
                    const [designationId, gender] = key.split('::')
                    const subcategories = groupEligs
                      .map((e: any) => e.subcategory?.name || 'Unknown')
                      .filter(Boolean)
                      .join(', ')
                    
                    // DEBUG: Check for duplicate IDs
                    const idCounts = new Map<string, number>()
                    groupEligs.forEach((elig: any) => {
                      const eligId = elig.id || elig._id
                      if (eligId) {
                        idCounts.set(eligId, (idCounts.get(eligId) || 0) + 1)
                      }
                    })
                    const duplicates = Array.from(idCounts.entries()).filter(([_, count]) => count > 1)
                    if (duplicates.length > 0) {
                      console.warn(`[Designation Eligibility] ⚠️ DUPLICATE IDs found for ${designationId}::${gender}:`, duplicates)
                      duplicates.forEach(([duplicateId, count]) => {
                        const duplicateEligs = groupEligs.filter((e: any) => (e.id || e._id) === duplicateId)
                        console.warn(`  - ID "${duplicateId}" appears ${count} times:`, duplicateEligs.map((e: any) => ({
                          id: e.id || e._id,
                          subCategoryId: e.subCategoryId,
                          subcategoryName: e.subcategory?.name,
                          designationId: e.designationId,
                          gender: e.gender
                        })))
                      })
                    }
                    
                    return (
                      <tr key={key} className="hover:bg-gray-50">
                        <td className="py-4 px-6 text-gray-900 font-medium">{designationId}</td>
                        <td className="py-4 px-6 text-gray-600 capitalize">{gender}</td>
                        <td className="py-4 px-6 text-gray-600">
                          <div className="space-y-1">
                            {groupEligs.map((elig: any, index: number) => {
                              // CRITICAL FIX: Create unique key by combining eligibility id with subcategory id
                              // This ensures uniqueness even if multiple eligibilities have the same id
                              const eligId = elig.id || elig._id || `temp-${index}`
                              const subcatId = elig.subCategoryId || elig.subcategory?.id || `subcat-${index}`
                              const uniqueKey = `${eligId}-${subcatId}-${index}`
                              return (
                                <div key={uniqueKey} className="text-sm">
                                  <span className="font-medium">{elig.subcategory?.name || 'Unknown'}</span>
                                  {' '}
                                  <span className="text-gray-500">
                                    (Qty: {elig.quantity}, Renewal: {elig.renewalFrequency} {elig.renewalUnit})
                                  </span>
                                </div>
                              )
                            })}
                        </div>
                      </td>
                        <td className="py-4 px-6 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                              onClick={() => handleEdit(groupEligs[0])}
                            className="text-blue-600 hover:text-blue-700"
                            title="Edit"
                          >
                              <Edit className="h-4 w-4" />
                          </button>
                          <button
                              onClick={() => handleDelete(groupEligs[0])}
                            className="text-red-600 hover:text-red-700"
                            title="Delete"
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
      </div>
    </DashboardLayout>
  )
}
