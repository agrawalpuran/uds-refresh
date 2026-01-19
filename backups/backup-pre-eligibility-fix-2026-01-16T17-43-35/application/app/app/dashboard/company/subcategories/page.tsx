'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Edit2, Trash2, Save, X, Loader2, ChevronDown, ChevronRight } from 'lucide-react'

interface Category {
  id: string
  _id: string
  name: string
  isSystemCategory: boolean
}

interface Subcategory {
  id: string
  _id: string
  name: string
  parentCategoryId: string
  parentCategory: Category | null
  companyId: string
  status: 'active' | 'inactive'
}

export default function CompanySubcategoriesPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [categories, setCategories] = useState<Category[]>([])
  const [subcategories, setSubcategories] = useState<Subcategory[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  const [formData, setFormData] = useState({
    parentCategoryId: '',
    name: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        const storedCompanyId = localStorage.getItem('companyId')
        if (storedCompanyId) {
          setCompanyId(storedCompanyId)
          await Promise.all([
            loadCategories(),
            loadSubcategories(storedCompanyId)
          ])
        }
      }
      loadData()
    }
  }, [])

  const loadCategories = async () => {
    try {
      console.log('[Subcategories] Loading categories...')
      const response = await fetch('/api/super-admin/categories?status=active')
      const data = await response.json()
      console.log('[Subcategories] Categories response:', data)
      
      if (data.success) {
        if (data.categories && data.categories.length > 0) {
          console.log(`[Subcategories] Loaded ${data.categories.length} categories:`, data.categories.map((c: Category) => c.name))
          setCategories(data.categories)
          // Expand all categories by default
          setExpandedCategories(new Set(data.categories.map((c: Category) => c.id)))
          setError('') // Clear any previous errors
        } else {
          // No categories exist - show helpful message
          console.warn('[Subcategories] No categories found')
          setError('No categories found. Please contact Super Admin to create categories first, or run: node scripts/initialize-global-categories.js')
          setCategories([])
        }
      } else {
        console.error('[Subcategories] API error:', data.error)
        setError(data.error || 'Failed to load categories')
        setCategories([])
      }
    } catch (error: any) {
      console.error('[Subcategories] Error loading categories:', error)
      setError(error.message || 'Failed to load categories')
      setCategories([])
    }
  }

  const loadSubcategories = async (cid: string) => {
    try {
      setLoading(true)
      // Get user email for authentication
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
      
      const url = `/api/subcategories?companyId=${cid}${userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : ''}`
      const response = await fetch(url)
      const data = await response.json()
      if (data.success) {
        setSubcategories(data.subcategories)
      } else {
        setError(data.error || 'Failed to load subcategories')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load subcategories')
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId)
    } else {
      newExpanded.add(categoryId)
    }
    setExpandedCategories(newExpanded)
  }

  const handleAdd = (categoryId?: string) => {
    setFormData({ 
      parentCategoryId: categoryId || '', 
      name: '' 
    })
    setShowAddForm(true)
    setEditingId(null)
    setError('')
    if (categoryId) {
      setExpandedCategories(new Set([...expandedCategories, categoryId]))
    }
  }

  const handleEdit = (subcategory: Subcategory) => {
    setFormData({ 
      parentCategoryId: subcategory.parentCategoryId, 
      name: subcategory.name 
    })
    setEditingId(subcategory.id)
    setShowAddForm(false)
    setError('')
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingId(null)
    setFormData({ parentCategoryId: '', name: '' })
    setError('')
  }

  const handleSave = async () => {
    if (!formData.parentCategoryId || !formData.name.trim()) {
      setError('Parent category and subcategory name are required')
      return
    }

    try {
      setSaving(true)
      setError('')

      if (editingId) {
        // Update existing subcategory
        // Get user email for authentication
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
        
        const response = await fetch('/api/subcategories', {
          method: 'PUT',
          headers: { 
            'Content-Type': 'application/json',
            ...(userEmail ? { 'X-User-Email': userEmail } : {})
          },
          body: JSON.stringify({
            subcategoryId: editingId,
            name: formData.name.trim(),
            ...(userEmail ? { userEmail } : {})
          })
        })

        const data = await response.json()
        if (data.success) {
          await loadSubcategories(companyId)
          handleCancel()
        } else {
          setError(data.error || 'Failed to update subcategory')
        }
      } else {
        // Create new subcategory
        // Get user email for authentication
        const { getUserEmail } = await import('@/lib/utils/auth-storage')
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
        
        const response = await fetch('/api/subcategories', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...(userEmail ? { 'X-User-Email': userEmail } : {})
          },
          body: JSON.stringify({
            companyId,
            parentCategoryId: formData.parentCategoryId,
            name: formData.name.trim(),
            ...(userEmail ? { userEmail } : {})
          })
        })

        const data = await response.json()
        if (data.success) {
          await loadSubcategories(companyId)
          handleCancel()
        } else {
          setError(data.error || 'Failed to create subcategory')
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save subcategory')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (subcategory: Subcategory) => {
    if (!confirm(`Are you sure you want to delete subcategory "${subcategory.name}"?`)) {
      return
    }

    try {
      // Get user email for authentication
      const { getUserEmail } = await import('@/lib/utils/auth-storage')
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
      
      const url = `/api/subcategories?subcategoryId=${subcategory.id}${userEmail ? `&userEmail=${encodeURIComponent(userEmail)}` : ''}`
      const response = await fetch(url, {
        method: 'DELETE',
        ...(userEmail ? { headers: { 'X-User-Email': userEmail } } : {})
      })

      const data = await response.json()
      if (data.success) {
        await loadSubcategories(companyId)
      } else {
        alert(data.error || 'Failed to delete subcategory')
      }
    } catch (error: any) {
      alert(error.message || 'Failed to delete subcategory')
    }
  }

  const getSubcategoriesForCategory = (categoryId: string) => {
    return subcategories.filter(s => {
      // Match using parentCategory.id (from populated object) or parentCategoryId
      const parentId = s.parentCategory?.id || 
                      (typeof s.parentCategoryId === 'object' && s.parentCategoryId !== null
                        ? (s.parentCategoryId as any).id
                        : null)
      return parentId === categoryId && s.status === 'active'
    })
  }

  return (
    <DashboardLayout actorType="company">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Subcategory Management</h1>
          <button
            onClick={() => handleAdd()}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Subcategory
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? 'Edit Subcategory' : 'Add New Subcategory'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Parent Category <span className="text-red-500">*</span></label>
                {categories.length === 0 ? (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-sm text-yellow-800">
                      No categories available. Please contact Super Admin to create categories first.
                    </p>
                  </div>
                ) : (
                  <select
                    value={formData.parentCategoryId}
                    onChange={(e) => setFormData({ ...formData, parentCategoryId: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:outline-none"
                    disabled={!!editingId}
                    required
                  >
                    <option value="">Select a category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} {cat.isSystemCategory ? '(System)' : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Subcategory Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Managers Full Shirt, Managers Half Shirt"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
            <h3 className="text-lg font-semibold text-yellow-800 mb-2">No Categories Found</h3>
            <p className="text-sm text-yellow-700 mb-4">
              No global categories are available. Please contact Super Admin to create categories first.
            </p>
            <p className="text-sm text-yellow-700">
              You can also run the initialization script: <code className="bg-yellow-100 px-2 py-1 rounded">node scripts/initialize-global-categories.js</code>
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((category) => {
              const categorySubcategories = getSubcategoriesForCategory(category.id)
              const isExpanded = expandedCategories.has(category.id)

              return (
                <div key={category.id} className="bg-white rounded-lg shadow">
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-500" />
                      )}
                      <h3 className="text-lg font-semibold">{category.name}</h3>
                      <span className="text-sm text-gray-500">
                        ({categorySubcategories.length} subcategories)
                      </span>
                      {category.isSystemCategory && (
                        <span className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                          System
                        </span>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleAdd(category.id)
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <Plus className="w-4 h-4" />
                      Add Subcategory
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="border-t">
                      {categorySubcategories.length === 0 ? (
                        <div className="p-4 text-gray-500 text-center">
                          No subcategories yet. Click "Add Subcategory" to create one.
                        </div>
                      ) : (
                        <table className="w-full">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {categorySubcategories.map((subcategory) => (
                              <tr key={subcategory.id}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">{subcategory.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {editingId === subcategory.id ? (
                                    <input
                                      type="text"
                                      value={formData.name}
                                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                      className="px-2 py-1 border rounded"
                                    />
                                  ) : (
                                    <span className="text-sm font-medium">{subcategory.name}</span>
                                  )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                  {editingId === subcategory.id ? (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={handleSave}
                                        disabled={saving}
                                        className="p-1 text-green-600 hover:text-green-700"
                                      >
                                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                      </button>
                                      <button
                                        onClick={handleCancel}
                                        className="p-1 text-gray-600 hover:text-gray-700"
                                      >
                                        <X className="w-4 h-4" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="flex gap-2">
                                      <button
                                        onClick={() => handleEdit(subcategory)}
                                        className="p-1 text-blue-600 hover:text-blue-700"
                                      >
                                        <Edit2 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => handleDelete(subcategory)}
                                        className="p-1 text-red-600 hover:text-red-700"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

