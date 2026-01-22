'use client'

/**
 * Notifications Admin Page
 * 
 * Provides admin UI for managing notification templates and viewing logs.
 * Tab-based layout with Templates and Logs tabs.
 * 
 * FUTURE EXTENSION POINTS:
 * - Add "Routing Rules" tab for per-company notification routing
 * - Add "Channels" tab for SMS/WhatsApp/Push configuration
 * - Add "Settings" tab for global notification settings
 */

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  Mail, FileText, History, Search, Filter, 
  Edit, Save, X, Check, AlertTriangle, Eye,
  ChevronLeft, ChevronRight, RefreshCw
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface NotificationTemplate {
  templateId: string
  templateName: string
  eventId: string
  eventCode: string
  eventDescription: string
  subjectTemplate: string
  bodyTemplate: string
  language: string
  isActive: boolean
  eventIsActive: boolean
  defaultRecipientType: string
  supportedPlaceholders: string[]
  createdAt: string
  updatedAt: string
}

interface NotificationLog {
  logId: string
  eventId: string
  eventCode: string
  recipientEmail: string
  recipientType: string
  subject: string
  status: 'SENT' | 'FAILED' | 'BOUNCED' | 'REJECTED'
  errorMessage: string | null
  correlationId: string | null
  wasSkipped: boolean
  createdAt: string
  sentAt: string | null
  context: any
}

interface Pagination {
  page: number
  pageSize: number
  total: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NotificationsAdminPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'templates' | 'logs'>('templates')

  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplate, setSelectedTemplate] = useState<NotificationTemplate | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<NotificationTemplate | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  // Logs state
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPagination, setLogsPagination] = useState<Pagination>({
    page: 1, pageSize: 50, total: 0, totalPages: 0, hasNext: false, hasPrev: false
  })
  const [logsFilters, setLogsFilters] = useState({
    status: '',
    eventCode: '',
    startDate: '',
    endDate: '',
    recipientEmail: '',
  })
  const [selectedLog, setSelectedLog] = useState<NotificationLog | null>(null)

  // Preview state
  const [showPreview, setShowPreview] = useState(false)
  const [previewContext] = useState({
    employeeName: 'John Doe',
    employeeEmail: 'john.doe@example.com',
    orderId: 'ORD-123456',
    orderStatus: 'Dispatched',
    previousStatus: 'Awaiting fulfilment',
    prNumber: 'PR-2024-001',
    poNumber: 'PO-2024-001',
    vendorName: 'Acme Uniforms',
    companyName: 'Example Corporation',
  })

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  // Load templates on mount
  useEffect(() => {
    loadTemplates()
  }, [])

  // Load logs when switching to logs tab or filters change
  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs()
    }
  }, [activeTab, logsPagination.page, logsFilters])

  async function loadTemplates() {
    setTemplatesLoading(true)
    try {
      const res = await fetch('/api/admin/notifications/templates')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
      } else {
        console.error('Failed to load templates:', data.error)
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setTemplatesLoading(false)
    }
  }

  async function loadLogs() {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({
        page: logsPagination.page.toString(),
        pageSize: logsPagination.pageSize.toString(),
      })
      
      if (logsFilters.status) params.set('status', logsFilters.status)
      if (logsFilters.eventCode) params.set('eventCode', logsFilters.eventCode)
      if (logsFilters.startDate) params.set('startDate', logsFilters.startDate)
      if (logsFilters.endDate) params.set('endDate', logsFilters.endDate)
      if (logsFilters.recipientEmail) params.set('recipientEmail', logsFilters.recipientEmail)

      const res = await fetch(`/api/admin/notifications/logs?${params}`)
      const data = await res.json()
      
      if (data.success) {
        setLogs(data.logs)
        setLogsPagination(data.pagination)
      } else {
        console.error('Failed to load logs:', data.error)
      }
    } catch (error) {
      console.error('Error loading logs:', error)
    } finally {
      setLogsLoading(false)
    }
  }

  // =============================================================================
  // TEMPLATE ACTIONS
  // =============================================================================

  function handleEditTemplate(template: NotificationTemplate) {
    setEditingTemplate({ ...template })
    setSaveError(null)
    setSaveSuccess(false)
  }

  function handleCancelEdit() {
    setEditingTemplate(null)
    setSaveError(null)
  }

  async function handleSaveTemplate() {
    if (!editingTemplate) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const res = await fetch(`/api/admin/notifications/templates/${editingTemplate.templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: editingTemplate.templateName,
          subjectTemplate: editingTemplate.subjectTemplate,
          bodyTemplate: editingTemplate.bodyTemplate,
          isActive: editingTemplate.isActive,
        }),
      })

      const data = await res.json()

      if (data.success) {
        // Update template in list
        setTemplates(prev => prev.map(t => 
          t.templateId === editingTemplate.templateId ? data.template : t
        ))
        setEditingTemplate(null)
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
        
        // Show warnings if any
        if (data.warnings && data.warnings.length > 0) {
          console.warn('Template saved with warnings:', data.warnings)
        }
      } else {
        setSaveError(data.error || 'Failed to save template')
      }
    } catch (error: any) {
      setSaveError(error.message || 'Error saving template')
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(template: NotificationTemplate) {
    try {
      const res = await fetch(`/api/admin/notifications/templates/${template.templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      })

      const data = await res.json()

      if (data.success) {
        setTemplates(prev => prev.map(t => 
          t.templateId === template.templateId ? data.template : t
        ))
      } else {
        alert(`Failed to toggle template: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Error toggling template: ${error.message}`)
    }
  }

  // =============================================================================
  // PREVIEW RENDERING
  // =============================================================================

  function renderPreview(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = (previewContext as any)[key]
      return value !== undefined ? value : match
    })
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Notification Management
          </h1>
          <p className="text-gray-600 mt-1">
            Manage email notification templates and view notification logs
          </p>
        </div>

        {/* Success message */}
        {saveSuccess && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
            <Check className="h-5 w-5" />
            Template saved successfully
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                activeTab === 'templates'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="h-5 w-5" />
              Templates
            </button>
            <button
              onClick={() => setActiveTab('logs')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                activeTab === 'logs'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <History className="h-5 w-5" />
              Logs
            </button>
            {/* FUTURE: Add more tabs here
            <button className="...">Routing Rules</button>
            <button className="...">Channels</button>
            */}
          </div>
        </div>

        {/* Templates Tab */}
        {activeTab === 'templates' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {templatesLoading ? (
              <div className="p-8 text-center text-gray-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No templates found. Run the seeding script to create initial templates.
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {templates.map((template) => (
                  <div key={template.templateId} className="p-4">
                    {/* Template Header */}
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">
                            {template.templateName}
                          </span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            template.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {template.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          <span className="font-mono bg-gray-100 px-1 rounded">
                            {template.eventCode}
                          </span>
                          <span className="mx-2">•</span>
                          {template.eventDescription}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSelectedTemplate(template)
                            setShowPreview(true)
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleEditTemplate(template)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleActive(template)}
                          className={`px-3 py-1 text-sm rounded ${
                            template.isActive
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {template.isActive ? 'Disable' : 'Enable'}
                        </button>
                      </div>
                    </div>

                    {/* Editing Mode */}
                    {editingTemplate?.templateId === template.templateId && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        {saveError && (
                          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-800">
                            <AlertTriangle className="h-5 w-5" />
                            {saveError}
                          </div>
                        )}

                        {/* Template Name */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Template Name
                          </label>
                          <input
                            type="text"
                            value={editingTemplate.templateName}
                            onChange={(e) => setEditingTemplate({
                              ...editingTemplate,
                              templateName: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>

                        {/* Subject */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Subject Template
                          </label>
                          <input
                            type="text"
                            value={editingTemplate.subjectTemplate}
                            onChange={(e) => setEditingTemplate({
                              ...editingTemplate,
                              subjectTemplate: e.target.value
                            })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                          />
                        </div>

                        {/* Body */}
                        <div className="mb-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Body Template (HTML)
                          </label>
                          <textarea
                            value={editingTemplate.bodyTemplate}
                            onChange={(e) => setEditingTemplate({
                              ...editingTemplate,
                              bodyTemplate: e.target.value
                            })}
                            rows={12}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                          />
                        </div>

                        {/* Placeholders Info */}
                        <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                          <div className="text-sm font-medium text-blue-800 mb-1">
                            Supported Placeholders:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {template.supportedPlaceholders.map((p) => (
                              <code key={p} className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                                {`{{${p}}}`}
                              </code>
                            ))}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                            disabled={saving}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={handleSaveTemplate}
                            disabled={saving}
                            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                          >
                            {saving ? (
                              <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                Saving...
                              </>
                            ) : (
                              <>
                                <Save className="h-4 w-4" />
                                Save Changes
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Template Info (collapsed) */}
                    {editingTemplate?.templateId !== template.templateId && (
                      <div className="mt-2 text-sm text-gray-600">
                        <span className="font-medium">Subject: </span>
                        <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                          {template.subjectTemplate}
                        </span>
                        <span className="mx-2 text-gray-400">•</span>
                        <span className="text-gray-500">
                          Last updated: {new Date(template.updatedAt).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Logs Tab */}
        {activeTab === 'logs' && (
          <div className="space-y-4">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Filter className="h-5 w-5 text-gray-500" />
                <span className="font-medium text-gray-700">Filters</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Status</label>
                  <select
                    value={logsFilters.status}
                    onChange={(e) => {
                      setLogsFilters(f => ({ ...f, status: e.target.value }))
                      setLogsPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">All</option>
                    <option value="SENT">Sent</option>
                    <option value="FAILED">Failed</option>
                    <option value="REJECTED">Rejected/Skipped</option>
                    <option value="BOUNCED">Bounced</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Event</label>
                  <select
                    value={logsFilters.eventCode}
                    onChange={(e) => {
                      setLogsFilters(f => ({ ...f, eventCode: e.target.value }))
                      setLogsPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  >
                    <option value="">All Events</option>
                    {[...new Set(templates.map(t => t.eventCode))].map(code => (
                      <option key={code} value={code}>{code}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">From Date</label>
                  <input
                    type="date"
                    value={logsFilters.startDate}
                    onChange={(e) => {
                      setLogsFilters(f => ({ ...f, startDate: e.target.value }))
                      setLogsPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">To Date</label>
                  <input
                    type="date"
                    value={logsFilters.endDate}
                    onChange={(e) => {
                      setLogsFilters(f => ({ ...f, endDate: e.target.value }))
                      setLogsPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Recipient</label>
                  <input
                    type="text"
                    placeholder="Email..."
                    value={logsFilters.recipientEmail}
                    onChange={(e) => {
                      setLogsFilters(f => ({ ...f, recipientEmail: e.target.value }))
                      setLogsPagination(p => ({ ...p, page: 1 }))
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-between items-center">
                <button
                  onClick={() => {
                    setLogsFilters({ status: '', eventCode: '', startDate: '', endDate: '', recipientEmail: '' })
                    setLogsPagination(p => ({ ...p, page: 1 }))
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear filters
                </button>
                <button
                  onClick={loadLogs}
                  className="flex items-center gap-1 px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded"
                >
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              {logsLoading ? (
                <div className="p-8 text-center text-gray-500">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No logs found matching the filters
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Time</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Recipient</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subject</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Correlation ID</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {logs.map((log) => (
                          <tr key={log.logId} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                              {new Date(log.createdAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3">
                              <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                                {log.eventCode}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {log.recipientEmail}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 text-xs rounded-full ${
                                log.status === 'SENT' ? 'bg-green-100 text-green-800' :
                                log.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                                log.status === 'REJECTED' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {log.wasSkipped ? 'SKIPPED' : log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                              {log.subject}
                            </td>
                            <td className="px-4 py-3">
                              {log.correlationId && (
                                <span className="font-mono text-xs text-gray-500">
                                  {log.correlationId}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <button
                                onClick={() => setSelectedLog(log)}
                                className="text-blue-600 hover:text-blue-800 text-sm"
                              >
                                View
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {((logsPagination.page - 1) * logsPagination.pageSize) + 1} to{' '}
                      {Math.min(logsPagination.page * logsPagination.pageSize, logsPagination.total)} of{' '}
                      {logsPagination.total} results
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setLogsPagination(p => ({ ...p, page: p.page - 1 }))}
                        disabled={!logsPagination.hasPrev}
                        className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {logsPagination.page} of {logsPagination.totalPages}
                      </span>
                      <button
                        onClick={() => setLogsPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={!logsPagination.hasNext}
                        className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Preview Modal */}
        {showPreview && selectedTemplate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  Preview: {selectedTemplate.templateName}
                </h3>
                <button
                  onClick={() => setShowPreview(false)}
                  className="p-1 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-500 mb-1">Subject:</div>
                  <div className="p-2 bg-gray-50 rounded border border-gray-200">
                    {renderPreview(selectedTemplate.subjectTemplate)}
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Body:</div>
                  <div 
                    className="p-4 bg-gray-50 rounded border border-gray-200"
                    dangerouslySetInnerHTML={{ 
                      __html: renderPreview(selectedTemplate.bodyTemplate) 
                    }}
                  />
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Sample context used:</span>{' '}
                  {Object.entries(previewContext).map(([k, v]) => `${k}="${v}"`).join(', ')}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Log Detail Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  Log Details: {selectedLog.logId}
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="p-1 text-gray-500 hover:text-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-gray-500">Event</div>
                    <div className="font-mono text-sm">{selectedLog.eventCode}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Status</div>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      selectedLog.status === 'SENT' ? 'bg-green-100 text-green-800' :
                      selectedLog.status === 'FAILED' ? 'bg-red-100 text-red-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {selectedLog.wasSkipped ? 'SKIPPED (Duplicate)' : selectedLog.status}
                    </span>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Recipient</div>
                    <div className="text-sm">{selectedLog.recipientEmail}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Correlation ID</div>
                    <div className="font-mono text-xs">{selectedLog.correlationId || 'N/A'}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Created</div>
                    <div className="text-sm">{new Date(selectedLog.createdAt).toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-500">Sent At</div>
                    <div className="text-sm">
                      {selectedLog.sentAt ? new Date(selectedLog.sentAt).toLocaleString() : 'N/A'}
                    </div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Subject</div>
                  <div className="p-2 bg-gray-50 rounded border border-gray-200 text-sm">
                    {selectedLog.subject}
                  </div>
                </div>
                {selectedLog.errorMessage && (
                  <div>
                    <div className="text-sm font-medium text-red-600 mb-1">Error Message</div>
                    <div className="p-2 bg-red-50 rounded border border-red-200 text-sm text-red-800">
                      {selectedLog.errorMessage}
                    </div>
                  </div>
                )}
                {selectedLog.context && (
                  <div>
                    <div className="text-sm font-medium text-gray-500 mb-1">Context</div>
                    <pre className="p-2 bg-gray-50 rounded border border-gray-200 text-xs overflow-x-auto">
                      {JSON.stringify(selectedLog.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end">
                <button
                  onClick={() => setSelectedLog(null)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
