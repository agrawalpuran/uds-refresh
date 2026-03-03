'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Plus, Edit2, Trash2, Save, X, Loader2, Ruler, ChevronDown, ChevronUp } from 'lucide-react'

interface MeasurementPoint {
  key: string
  label: string
  description: string
  iso_reference: string
  unit: 'cm' | 'inches'
  min_value: number
  max_value: number
  precision: number
  is_required: boolean
  display_order: number
}

interface Specification {
  id?: string
  companyId: string
  garment_category: string
  specification_name: string
  description: string
  measurement_points: MeasurementPoint[]
  is_active: boolean
}

const DEFAULT_POINT: MeasurementPoint = {
  key: '',
  label: '',
  description: '',
  iso_reference: '',
  unit: 'cm',
  min_value: 0,
  max_value: 200,
  precision: 0.5,
  is_required: true,
  display_order: 0,
}

const ISO_PRESETS: MeasurementPoint[] = [
  { key: 'chest_girth', label: 'Chest Girth', description: 'Circumference at fullest part of chest', iso_reference: 'ISO 8559-1:6.1.6', unit: 'cm', min_value: 60, max_value: 160, precision: 0.5, is_required: true, display_order: 1 },
  { key: 'waist_girth', label: 'Waist Girth', description: 'Circumference at natural waistline', iso_reference: 'ISO 8559-1:6.1.9', unit: 'cm', min_value: 50, max_value: 150, precision: 0.5, is_required: true, display_order: 2 },
  { key: 'hip_girth', label: 'Hip Girth', description: 'Circumference at fullest part of hips', iso_reference: 'ISO 8559-1:6.1.12', unit: 'cm', min_value: 60, max_value: 160, precision: 0.5, is_required: true, display_order: 3 },
  { key: 'shoulder_width', label: 'Shoulder Width', description: 'Distance between shoulder points', iso_reference: 'ISO 8559-1:6.2.1', unit: 'cm', min_value: 30, max_value: 65, precision: 0.5, is_required: true, display_order: 4 },
  { key: 'arm_length', label: 'Arm Length', description: 'Shoulder point to wrist', iso_reference: 'ISO 8559-1:6.2.8', unit: 'cm', min_value: 40, max_value: 90, precision: 0.5, is_required: true, display_order: 5 },
  { key: 'neck_girth', label: 'Neck Girth', description: 'Circumference at base of neck', iso_reference: 'ISO 8559-1:6.1.1', unit: 'cm', min_value: 28, max_value: 55, precision: 0.5, is_required: false, display_order: 6 },
  { key: 'back_length', label: 'Back Length', description: 'Nape to waist at back', iso_reference: 'ISO 8559-1:6.2.5', unit: 'cm', min_value: 30, max_value: 60, precision: 0.5, is_required: false, display_order: 7 },
  { key: 'inseam_length', label: 'Inseam Length', description: 'Crotch to floor along inside leg', iso_reference: 'ISO 8559-1:6.2.12', unit: 'cm', min_value: 55, max_value: 100, precision: 0.5, is_required: true, display_order: 8 },
  { key: 'thigh_girth', label: 'Thigh Girth', description: 'Circumference at fullest part of thigh', iso_reference: 'ISO 8559-1:6.1.14', unit: 'cm', min_value: 35, max_value: 85, precision: 0.5, is_required: false, display_order: 9 },
  { key: 'bicep_girth', label: 'Bicep Girth', description: 'Circumference at fullest part of upper arm', iso_reference: 'ISO 8559-1:6.1.17', unit: 'cm', min_value: 20, max_value: 55, precision: 0.5, is_required: false, display_order: 10 },
  { key: 'outseam_length', label: 'Outseam Length', description: 'Waist to floor along outside leg', iso_reference: 'ISO 8559-1:6.2.13', unit: 'cm', min_value: 80, max_value: 130, precision: 0.5, is_required: false, display_order: 11 },
  { key: 'knee_girth', label: 'Knee Girth', description: 'Circumference around the knee', iso_reference: 'ISO 8559-1:6.1.15', unit: 'cm', min_value: 30, max_value: 60, precision: 0.5, is_required: false, display_order: 12 },
  { key: 'calf_girth', label: 'Calf Girth', description: 'Circumference at fullest part of calf', iso_reference: 'ISO 8559-1:6.1.16', unit: 'cm', min_value: 25, max_value: 55, precision: 0.5, is_required: false, display_order: 13 },
  { key: 'bottom_width', label: 'Bottom Width', description: 'Width of trouser hem opening', iso_reference: '', unit: 'cm', min_value: 14, max_value: 35, precision: 0.5, is_required: false, display_order: 14 },
  { key: 'front_rise', label: 'Front Rise', description: 'Waistband to crotch seam at front', iso_reference: 'ISO 8559-1:6.2.11', unit: 'cm', min_value: 20, max_value: 40, precision: 0.5, is_required: false, display_order: 15 },
]

export default function MTMSpecificationsPage() {
  const [companyId, setCompanyId] = useState('')
  const [specs, setSpecs] = useState<Specification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingSpec, setEditingSpec] = useState<Specification | null>(null)
  const [expandedSpec, setExpandedSpec] = useState<string | null>(null)

  // Form state
  const [formName, setFormName] = useState('')
  const [formCategory, setFormCategory] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formPoints, setFormPoints] = useState<MeasurementPoint[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getCompanyId } = await import('@/lib/utils/auth-storage')
      const cid = getCompanyId()
      if (!cid) return
      setCompanyId(cid)

      const res = await fetch(`/api/mtm/specifications?companyId=${cid}`)
      if (res.ok) {
        const data = await res.json()
        setSpecs(Array.isArray(data) ? data : data.specifications || [])
      }
    } catch (error) {
      console.error('Error loading specifications:', error)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setFormName('')
    setFormCategory('')
    setFormDescription('')
    setFormPoints([])
    setEditingSpec(null)
    setShowForm(false)
  }

  const openCreateForm = () => {
    resetForm()
    setShowForm(true)
  }

  const handleDelete = async (spec: Specification) => {
    if (!confirm(`Are you sure you want to delete "${spec.specification_name}"? This cannot be undone.`)) return
    try {
      const res = await fetch(`/api/mtm/specifications?specId=${spec.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Delete failed')
      }
      await loadData()
    } catch (error: any) {
      alert(error.message || 'Error deleting specification')
    }
  }

  const openEditForm = (spec: Specification) => {
    setFormName(spec.specification_name)
    setFormCategory(spec.garment_category)
    setFormDescription(spec.description)
    setFormPoints([...spec.measurement_points])
    setEditingSpec(spec)
    setShowForm(true)
  }

  const addPresetPoints = (category: string) => {
    const presets: Record<string, string[]> = {
      shirt: ['chest_girth', 'shoulder_width', 'arm_length', 'neck_girth', 'back_length', 'bicep_girth'],
      pant: ['waist_girth', 'hip_girth', 'inseam_length', 'outseam_length', 'thigh_girth', 'knee_girth', 'calf_girth', 'bottom_width', 'front_rise'],
      jacket: ['chest_girth', 'shoulder_width', 'arm_length', 'neck_girth', 'back_length', 'waist_girth', 'bicep_girth'],
    }
    const keys = presets[category.toLowerCase()] || presets['shirt'] || []
    const points = keys
      .map(k => ISO_PRESETS.find(p => p.key === k))
      .filter(Boolean) as MeasurementPoint[]
    setFormPoints(points.map((p, i) => ({ ...p, display_order: i + 1 })))
  }

  const addPoint = () => {
    setFormPoints(prev => [...prev, { ...DEFAULT_POINT, display_order: prev.length + 1 }])
  }

  const removePoint = (index: number) => {
    setFormPoints(prev => prev.filter((_, i) => i !== index))
  }

  const updatePoint = (index: number, field: string, value: any) => {
    setFormPoints(prev => prev.map((p, i) => i === index ? { ...p, [field]: value } : p))
  }

  const handleSave = async () => {
    if (!formName || !formCategory || formPoints.length === 0) {
      alert('Please fill in name, category, and add at least one measurement point.')
      return
    }
    for (const p of formPoints) {
      if (!p.key || !p.label) {
        alert('Each measurement point must have a key and label.')
        return
      }
    }

    try {
      setSaving(true)
      const payload = {
        companyId,
        garment_category: formCategory,
        specification_name: formName,
        description: formDescription,
        measurement_points: formPoints,
        is_active: true,
        ...(editingSpec?.id && { specId: editingSpec.id }),
      }

      const method = editingSpec?.id ? 'PUT' : 'POST'
      const res = await fetch('/api/mtm/specifications', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Save failed')
      }

      resetForm()
      await loadData()
    } catch (error: any) {
      alert(error.message || 'Error saving specification')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">MTM Measurement Templates</h1>
            <p className="text-sm text-gray-500 mt-1">Define measurement points for custom-fit garments</p>
          </div>
          {!showForm && (
            <button
              onClick={openCreateForm}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"
            >
              <Plus className="h-4 w-4" />
              New Template
            </button>
          )}
        </div>

        {/* Create/Edit Form */}
        {showForm && (
          <div className="mb-6 bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingSpec ? 'Edit Template' : 'New Measurement Template'}
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Template Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Standard Shirt Template"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Garment Category <span className="text-red-500">*</span></label>
                <select
                  value={formCategory}
                  onChange={(e) => {
                    setFormCategory(e.target.value)
                    if (formPoints.length === 0 && e.target.value) {
                      addPresetPoints(e.target.value)
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                >
                  <option value="">Select category</option>
                  <option value="shirt">Shirt</option>
                  <option value="pant">Pant / Trouser</option>
                  <option value="jacket">Jacket / Blazer</option>
                  <option value="shoe">Shoe</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                rows={2}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
              />
            </div>

            {/* Measurement Points */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">Measurement Points <span className="text-red-500">*</span></label>
                <div className="flex gap-2">
                  {formCategory && formPoints.length === 0 && (
                    <button
                      onClick={() => addPresetPoints(formCategory)}
                      className="text-xs px-3 py-1 bg-violet-100 text-violet-700 rounded-lg hover:bg-violet-200 font-medium"
                    >
                      Load ISO Presets
                    </button>
                  )}
                  <button
                    onClick={addPoint}
                    className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                  >
                    + Add Custom
                  </button>
                </div>
              </div>

              {formPoints.length === 0 ? (
                <p className="text-sm text-gray-400 italic py-4 text-center">
                  Select a category to load ISO-standard presets, or add custom measurement points.
                </p>
              ) : (
                <div className="space-y-2">
                  {formPoints.map((point, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-2">
                        <input
                          value={point.key}
                          onChange={(e) => updatePoint(idx, 'key', e.target.value.replace(/\s/g, '_').toLowerCase())}
                          placeholder="key (e.g. chest_girth)"
                          className="px-2 py-1.5 border border-gray-300 rounded text-xs"
                        />
                        <input
                          value={point.label}
                          onChange={(e) => updatePoint(idx, 'label', e.target.value)}
                          placeholder="Label"
                          className="px-2 py-1.5 border border-gray-300 rounded text-xs"
                        />
                        <div className="flex gap-1">
                          <input
                            type="number"
                            value={point.min_value}
                            onChange={(e) => updatePoint(idx, 'min_value', parseFloat(e.target.value) || 0)}
                            placeholder="Min"
                            className="w-1/2 px-2 py-1.5 border border-gray-300 rounded text-xs"
                          />
                          <input
                            type="number"
                            value={point.max_value}
                            onChange={(e) => updatePoint(idx, 'max_value', parseFloat(e.target.value) || 200)}
                            placeholder="Max"
                            className="w-1/2 px-2 py-1.5 border border-gray-300 rounded text-xs"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <select
                            value={point.unit}
                            onChange={(e) => updatePoint(idx, 'unit', e.target.value)}
                            className="px-2 py-1.5 border border-gray-300 rounded text-xs"
                          >
                            <option value="cm">cm</option>
                            <option value="inches">inches</option>
                          </select>
                          <label className="flex items-center gap-1 text-xs">
                            <input
                              type="checkbox"
                              checked={point.is_required}
                              onChange={(e) => updatePoint(idx, 'is_required', e.target.checked)}
                              className="w-3 h-3"
                            />
                            Req
                          </label>
                        </div>
                      </div>
                      <button
                        onClick={() => removePoint(idx)}
                        className="p-1 text-red-500 hover:text-red-700"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Form Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={resetForm}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editingSpec ? 'Update' : 'Create'} Template
              </button>
            </div>
          </div>
        )}

        {/* Specifications List */}
        {specs.length === 0 && !showForm ? (
          <div className="text-center py-12">
            <Ruler className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-2">No measurement templates yet</p>
            <p className="text-sm text-gray-400 mb-4">Create a template to define measurement points for custom-fit garments</p>
            <button
              onClick={openCreateForm}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm"
            >
              Create First Template
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {specs.map((spec) => (
              <div key={spec.id} className="bg-white rounded-lg border border-gray-200">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedSpec(expandedSpec === spec.id ? null : spec.id || null)}
                >
                  <div className="flex items-center gap-3">
                    <Ruler className="h-5 w-5 text-violet-600" />
                    <div>
                      <p className="font-semibold text-gray-900">{spec.specification_name}</p>
                      <p className="text-xs text-gray-500">
                        Category: <span className="capitalize">{spec.garment_category}</span> · {spec.measurement_points.length} points
                        {!spec.is_active && <span className="ml-2 text-red-500">(Inactive)</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditForm(spec) }}
                      className="p-1.5 text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded"
                      title="Edit"
                    >
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(spec) }}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    {expandedSpec === spec.id ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </div>
                </div>

                {expandedSpec === spec.id && (
                  <div className="border-t border-gray-200 p-4 bg-gray-50">
                    {spec.description && <p className="text-sm text-gray-600 mb-3">{spec.description}</p>}
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-gray-100">
                            <th className="text-left p-2 font-semibold text-gray-600">#</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Key</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Label</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Range</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Unit</th>
                            <th className="text-left p-2 font-semibold text-gray-600">Required</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {[...spec.measurement_points].sort((a, b) => a.display_order - b.display_order).map((pt, i) => (
                            <tr key={i}>
                              <td className="p-2 text-gray-500">{pt.display_order}</td>
                              <td className="p-2 font-mono text-gray-700">{pt.key}</td>
                              <td className="p-2 text-gray-900">{pt.label}</td>
                              <td className="p-2 text-gray-600">{pt.min_value}–{pt.max_value}</td>
                              <td className="p-2 text-gray-600">{pt.unit}</td>
                              <td className="p-2">
                                {pt.is_required ? (
                                  <span className="text-green-600 font-medium">Yes</span>
                                ) : (
                                  <span className="text-gray-400">No</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
