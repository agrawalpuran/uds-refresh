'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Edit2, Trash2, Save, X, Loader2 } from 'lucide-react'

interface Category {
  id: string
  _id: string
  name: string
  isSystemCategory: boolean
  status: 'active' | 'inactive'
}

export default function SuperAdminCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    isSystemCategory: false
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/super-admin/categories')
      const data = await response.json()
      if (data.success) {
        setCategories(data.categories)
      } else {
        setError(data.error || 'Failed to load categories')
      }
    } catch (error: any) {
      setError(error.message || 'Failed to load categories')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = () => {
    setFormData({ name: '', isSystemCategory: false })
    setShowAddForm(true)
    setError('')
  }

  const handleEdit = (category: Category) => {
    setFormData({ name: category.name, isSystemCategory: category.isSystemCategory })
    setEditingId(category.id)
    setShowAddForm(false)
    setError('')
  }

  const handleCancel = () => {
    setShowAddForm(false)
    setEditingId(null)
    setFormData({ name: '', isSystemCategory: false })
    setError('')
  }

  const handleSave = async () => {
    if (!formData.name.trim()) {
      setError('Category name is required')
      return
    }

    try {
      setSaving(true)
      setError('')

      if (editingId) {
        // Update existing category
        const response = await fetch('/api/super-admin/categories', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoryId: editingId,
            name: formData.name.trim(),
            status: 'active'
          })
        })

        const data = await response.json()
        if (data.success) {
          await loadCategories()
          handleCancel()
        } else {
          setError(data.error || 'Failed to update category')
        }
      } else {
        // Create new category
        const response = await fetch('/api/super-admin/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formData.name.trim(),
            isSystemCategory: formData.isSystemCategory
          })
        })

        const data = await response.json()
        if (data.success) {
          await loadCategories()
          handleCancel()
        } else {
          setError(data.error || 'Failed to create category')
        }
      }
    } catch (error: any) {
      setError(error.message || 'Failed to save category')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (category: Category) => {
    if (category.isSystemCategory) {
      alert('Cannot delete system categories')
      return
    }

    if (!confirm(`Are you sure you want to delete category "${category.name}"?`)) {
      return
    }

    try {
      const response = await fetch(`/api/super-admin/categories?categoryId=${category.id}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        await loadCategories()
      } else {
        alert(data.error || 'Failed to delete category')
      }
    } catch (error: any) {
      alert(error.message || 'Failed to delete category')
    }
  }

  const activeCategories = categories.filter(c => c.status === 'active')
  const inactiveCategories = categories.filter(c => c.status === 'inactive')

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Category Management</h1>
          <button
            onClick={handleAdd}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            Add Category
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        {showAddForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h2 className="text-lg font-semibold mb-4">Add New Category</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Category Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="e.g., Shirt, Pant, Shoe"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isSystemCategory"
                  checked={formData.isSystemCategory}
                  onChange={(e) => setFormData({ ...formData, isSystemCategory: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="isSystemCategory" className="text-sm">
                  System Category (cannot be deleted)
                </label>
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
        ) : (
          <>
            {/* Active Categories */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Active Categories ({activeCategories.length})</h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {activeCategories.map((category) => (
                      <tr key={category.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{category.id}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingId === category.id ? (
                            <input
                              type="text"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              className="px-2 py-1 border rounded"
                            />
                          ) : (
                            <span className="text-sm font-medium">{category.name}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs rounded ${
                            category.isSystemCategory 
                              ? 'bg-blue-100 text-blue-800' 
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {category.isSystemCategory ? 'System' : 'Custom'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {editingId === category.id ? (
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
                                onClick={() => handleEdit(category)}
                                className="p-1 text-blue-600 hover:text-blue-700"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              {!category.isSystemCategory && (
                                <button
                                  onClick={() => handleDelete(category)}
                                  className="p-1 text-red-600 hover:text-red-700"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Inactive Categories */}
            {inactiveCategories.length > 0 && (
              <div>
                <h2 className="text-xl font-semibold mb-4">Inactive Categories ({inactiveCategories.length})</h2>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {inactiveCategories.map((category) => (
                        <tr key={category.id} className="opacity-60">
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{category.id}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm">{category.name}</td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs rounded ${
                              category.isSystemCategory 
                                ? 'bg-blue-100 text-blue-800' 
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {category.isSystemCategory ? 'System' : 'Custom'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  )
}

