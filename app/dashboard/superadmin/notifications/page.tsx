'use client'

/**
 * Notifications Admin Page - Enhanced
 * 
 * Full management of notification events, templates, and logs.
 * - Events Tab: Create, edit, enable/disable notification triggers
 * - Templates Tab: Create, edit, preview email templates
 * - Logs Tab: View notification history with filtering
 */

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  Mail, FileText, History, Search, Filter, Plus,
  Edit, Save, X, Check, AlertTriangle, Eye, Trash2,
  ChevronLeft, ChevronRight, RefreshCw, Zap, Settings
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface NotificationEvent {
  eventId: string
  eventCode: string
  eventDescription: string
  defaultRecipientType: 'EMPLOYEE' | 'VENDOR' | 'COMPANY_ADMIN' | 'SUPER_ADMIN'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

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

// Available placeholders for templates
const AVAILABLE_PLACEHOLDERS = [
  { key: 'employeeName', description: 'Employee full name' },
  { key: 'employeeEmail', description: 'Employee email address' },
  { key: 'orderId', description: 'Order ID' },
  { key: 'orderStatus', description: 'Current order status' },
  { key: 'previousStatus', description: 'Previous order status' },
  { key: 'prNumber', description: 'PR number' },
  { key: 'poNumber', description: 'PO number' },
  { key: 'vendorName', description: 'Vendor name' },
  { key: 'companyName', description: 'Company name' },
  { key: 'awbNumber', description: 'AWB/tracking number' },
  { key: 'shipmentDate', description: 'Shipment date' },
  { key: 'deliveryDate', description: 'Delivery date' },
]

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function NotificationsAdminPage() {
  // Tab state
  const [activeTab, setActiveTab] = useState<'events' | 'templates' | 'logs'>('events')

  // Events state
  const [events, setEvents] = useState<NotificationEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)
  const [showEventModal, setShowEventModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<Partial<NotificationEvent> | null>(null)
  const [eventSaving, setEventSaving] = useState(false)
  const [eventError, setEventError] = useState<string | null>(null)

  // Templates state
  const [templates, setTemplates] = useState<NotificationTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [showTemplateModal, setShowTemplateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<Partial<NotificationTemplate> | null>(null)
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)

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
  const [previewTemplate, setPreviewTemplate] = useState<NotificationTemplate | null>(null)
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

  // Success message state
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // =============================================================================
  // DATA FETCHING
  // =============================================================================

  useEffect(() => {
    loadEvents()
    loadTemplates()
  }, [])

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs()
    }
  }, [activeTab, logsPagination.page, logsFilters])

  async function loadEvents() {
    setEventsLoading(true)
    try {
      const res = await fetch('/api/admin/notifications/events')
      const data = await res.json()
      if (data.success) {
        setEvents(data.events)
      }
    } catch (error) {
      console.error('Error loading events:', error)
    } finally {
      setEventsLoading(false)
    }
  }

  async function loadTemplates() {
    setTemplatesLoading(true)
    try {
      const res = await fetch('/api/admin/notifications/templates')
      const data = await res.json()
      if (data.success) {
        setTemplates(data.templates)
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
      }
    } catch (error) {
      console.error('Error loading logs:', error)
    } finally {
      setLogsLoading(false)
    }
  }

  // =============================================================================
  // EVENT ACTIONS
  // =============================================================================

  function openEventModal(event?: NotificationEvent) {
    if (event) {
      setEditingEvent({ ...event })
    } else {
      setEditingEvent({
        eventCode: '',
        eventDescription: '',
        defaultRecipientType: 'EMPLOYEE',
        isActive: true,
      })
    }
    setEventError(null)
    setShowEventModal(true)
  }

  async function handleSaveEvent() {
    if (!editingEvent) return
    
    if (!editingEvent.eventCode?.trim()) {
      setEventError('Event code is required')
      return
    }
    if (!editingEvent.eventDescription?.trim()) {
      setEventError('Event description is required')
      return
    }

    setEventSaving(true)
    setEventError(null)

    try {
      const isNew = !editingEvent.eventId
      const url = isNew 
        ? '/api/admin/notifications/events'
        : `/api/admin/notifications/events/${editingEvent.eventId}`
      
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventCode: editingEvent.eventCode?.toUpperCase().replace(/\s+/g, '_'),
          eventDescription: editingEvent.eventDescription,
          defaultRecipientType: editingEvent.defaultRecipientType,
          isActive: editingEvent.isActive,
        }),
      })

      const data = await res.json()

      if (data.success) {
        await loadEvents()
        setShowEventModal(false)
        setEditingEvent(null)
        showSuccess(isNew ? 'Event created successfully' : 'Event updated successfully')
      } else {
        setEventError(data.error || 'Failed to save event')
      }
    } catch (error: any) {
      setEventError(error.message || 'Error saving event')
    } finally {
      setEventSaving(false)
    }
  }

  async function handleToggleEventActive(event: NotificationEvent) {
    try {
      const res = await fetch(`/api/admin/notifications/events/${event.eventId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !event.isActive }),
      })

      const data = await res.json()
      if (data.success) {
        await loadEvents()
        await loadTemplates() // Refresh templates too as they show event status
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  async function handleDeleteEvent(event: NotificationEvent) {
    if (!confirm(`Are you sure you want to delete event "${event.eventCode}"?\n\nThis will also delete all associated templates.`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/notifications/events/${event.eventId}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (data.success) {
        await loadEvents()
        await loadTemplates()
        showSuccess('Event deleted successfully')
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  // =============================================================================
  // TEMPLATE ACTIONS
  // =============================================================================

  function openTemplateModal(template?: NotificationTemplate) {
    if (template) {
      setEditingTemplate({ ...template })
    } else {
      setEditingTemplate({
        templateName: '',
        eventId: events[0]?.eventId || '',
        subjectTemplate: '',
        bodyTemplate: getDefaultTemplateBody(),
        language: 'en',
        isActive: true,
      })
    }
    setTemplateError(null)
    setShowTemplateModal(true)
  }

  function getDefaultTemplateBody(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background-color: #4A90A4; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { padding: 20px; background-color: #f9f9f9; border-radius: 0 0 8px 8px; }
    .footer { padding: 10px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Notification Title</h1>
    </div>
    <div class="content">
      <p>Hello {{employeeName}},</p>
      <p>Your notification message goes here.</p>
      <p>Thank you for using UDS!</p>
    </div>
    <div class="footer">
      <p>This is an automated notification from UDS (Uniform Distribution System).</p>
    </div>
  </div>
</body>
</html>`
  }

  async function handleSaveTemplate() {
    if (!editingTemplate) return
    
    if (!editingTemplate.templateName?.trim()) {
      setTemplateError('Template name is required')
      return
    }
    if (!editingTemplate.eventId) {
      setTemplateError('Please select an event')
      return
    }
    if (!editingTemplate.subjectTemplate?.trim()) {
      setTemplateError('Subject template is required')
      return
    }
    if (!editingTemplate.bodyTemplate?.trim()) {
      setTemplateError('Body template is required')
      return
    }

    setTemplateSaving(true)
    setTemplateError(null)

    try {
      const isNew = !editingTemplate.templateId
      const url = isNew 
        ? '/api/admin/notifications/templates'
        : `/api/admin/notifications/templates/${editingTemplate.templateId}`
      
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateName: editingTemplate.templateName,
          eventId: editingTemplate.eventId,
          subjectTemplate: editingTemplate.subjectTemplate,
          bodyTemplate: editingTemplate.bodyTemplate,
          language: editingTemplate.language || 'en',
          isActive: editingTemplate.isActive,
        }),
      })

      const data = await res.json()

      if (data.success) {
        await loadTemplates()
        setShowTemplateModal(false)
        setEditingTemplate(null)
        showSuccess(isNew ? 'Template created successfully' : 'Template updated successfully')
      } else {
        setTemplateError(data.error || 'Failed to save template')
      }
    } catch (error: any) {
      setTemplateError(error.message || 'Error saving template')
    } finally {
      setTemplateSaving(false)
    }
  }

  async function handleToggleTemplateActive(template: NotificationTemplate) {
    try {
      const res = await fetch(`/api/admin/notifications/templates/${template.templateId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !template.isActive }),
      })

      const data = await res.json()
      if (data.success) {
        await loadTemplates()
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  async function handleDeleteTemplate(template: NotificationTemplate) {
    if (!confirm(`Are you sure you want to delete template "${template.templateName}"?`)) {
      return
    }

    try {
      const res = await fetch(`/api/admin/notifications/templates/${template.templateId}`, {
        method: 'DELETE',
      })

      const data = await res.json()
      if (data.success) {
        await loadTemplates()
        showSuccess('Template deleted successfully')
      } else {
        alert(`Failed: ${data.error}`)
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`)
    }
  }

  // =============================================================================
  // HELPERS
  // =============================================================================

  function showSuccess(message: string) {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 3000)
  }

  function renderPreview(template: string): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      const value = (previewContext as any)[key]
      return value !== undefined ? `<span style="background:#fef3c7;padding:0 4px;border-radius:2px;">${value}</span>` : match
    })
  }

  function insertPlaceholder(placeholder: string) {
    if (!editingTemplate) return
    const text = `{{${placeholder}}}`
    setEditingTemplate({
      ...editingTemplate,
      bodyTemplate: (editingTemplate.bodyTemplate || '') + text
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
            Define notification triggers, create email templates, and view logs
          </p>
        </div>

        {/* Success message */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-800">
            <Check className="h-5 w-5" />
            {successMessage}
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('events')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                activeTab === 'events'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Zap className="h-5 w-5" />
              Events ({events.length})
            </button>
            <button
              onClick={() => setActiveTab('templates')}
              className={`flex items-center gap-2 px-6 py-4 font-medium transition-colors ${
                activeTab === 'templates'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <FileText className="h-5 w-5" />
              Templates ({templates.length})
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
          </div>
        </div>

        {/* ================================================================= */}
        {/* EVENTS TAB */}
        {/* ================================================================= */}
        {activeTab === 'events' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-medium text-gray-900">Notification Events (Triggers)</h2>
                <p className="text-sm text-gray-500">Define when notifications should be triggered</p>
              </div>
              <button
                onClick={() => openEventModal()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="h-4 w-4" />
                New Event
              </button>
            </div>
            
            {eventsLoading ? (
              <div className="p-8 text-center text-gray-500">Loading events...</div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Zap className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="mb-4">No events defined yet</p>
                <button
                  onClick={() => openEventModal()}
                  className="text-blue-600 hover:text-blue-800"
                >
                  Create your first event
                </button>
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {events.map((event) => (
                  <div key={event.eventId} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <code className="px-2 py-1 bg-gray-100 text-gray-800 rounded font-mono text-sm">
                            {event.eventCode}
                          </code>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            event.isActive 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {event.isActive ? 'Active' : 'Disabled'}
                          </span>
                          <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800">
                            {event.defaultRecipientType}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 mt-2">{event.eventDescription}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          ID: {event.eventId} • Updated: {new Date(event.updatedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => openEventModal(event)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleEventActive(event)}
                          className={`px-3 py-1 text-sm rounded ${
                            event.isActive
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {event.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteEvent(event)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TEMPLATES TAB */}
        {/* ================================================================= */}
        {activeTab === 'templates' && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="font-medium text-gray-900">Email Templates</h2>
                <p className="text-sm text-gray-500">Customize notification messages for each event</p>
              </div>
              <button
                onClick={() => openTemplateModal()}
                disabled={events.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                <Plus className="h-4 w-4" />
                New Template
              </button>
            </div>
            
            {templatesLoading ? (
              <div className="p-8 text-center text-gray-500">Loading templates...</div>
            ) : templates.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="mb-4">No templates defined yet</p>
                {events.length === 0 ? (
                  <p className="text-sm">Create an event first, then add templates</p>
                ) : (
                  <button
                    onClick={() => openTemplateModal()}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    Create your first template
                  </button>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {templates.map((template) => (
                  <div key={template.templateId} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">{template.templateName}</span>
                          <span className={`px-2 py-0.5 text-xs rounded-full ${
                            template.isActive && template.eventIsActive
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-gray-100 text-gray-600'
                          }`}>
                            {template.isActive && template.eventIsActive ? 'Active' : 
                             !template.eventIsActive ? 'Event Disabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          <code className="px-1 bg-gray-100 rounded text-xs">{template.eventCode}</code>
                          <span className="mx-2">•</span>
                          {template.eventDescription}
                        </div>
                        <div className="text-sm text-gray-600 mt-2">
                          <span className="font-medium">Subject:</span>{' '}
                          <span className="font-mono text-xs">{template.subjectTemplate}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => {
                            setPreviewTemplate(template)
                            setShowPreview(true)
                          }}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Preview"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => openTemplateModal(template)}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => handleToggleTemplateActive(template)}
                          className={`px-3 py-1 text-sm rounded ${
                            template.isActive
                              ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              : 'bg-green-100 text-green-700 hover:bg-green-200'
                          }`}
                        >
                          {template.isActive ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteTemplate(template)}
                          className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* LOGS TAB */}
        {/* ================================================================= */}
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
                    {events.map(e => (
                      <option key={e.eventCode} value={e.eventCode}>{e.eventCode}</option>
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
                                'bg-yellow-100 text-yellow-800'
                              }`}>
                                {log.wasSkipped ? 'SKIPPED' : log.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate">
                              {log.subject}
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
                        className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="text-sm text-gray-600">
                        Page {logsPagination.page} of {logsPagination.totalPages}
                      </span>
                      <button
                        onClick={() => setLogsPagination(p => ({ ...p, page: p.page + 1 }))}
                        disabled={!logsPagination.hasNext}
                        className="p-2 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50"
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

        {/* ================================================================= */}
        {/* EVENT MODAL */}
        {/* ================================================================= */}
        {showEventModal && editingEvent && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  {editingEvent.eventId ? 'Edit Event' : 'Create New Event'}
                </h3>
                <button onClick={() => setShowEventModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {eventError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    {eventError}
                  </div>
                )}
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Event Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingEvent.eventCode || ''}
                    onChange={(e) => setEditingEvent({
                      ...editingEvent,
                      eventCode: e.target.value.toUpperCase().replace(/\s+/g, '_')
                    })}
                    placeholder="e.g., ORDER_SHIPPED"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-xs text-gray-500 mt-1">Unique identifier for this trigger (uppercase, underscores)</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={editingEvent.eventDescription || ''}
                    onChange={(e) => setEditingEvent({
                      ...editingEvent,
                      eventDescription: e.target.value
                    })}
                    rows={2}
                    placeholder="When is this notification triggered?"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Recipient Type
                  </label>
                  <select
                    value={editingEvent.defaultRecipientType || 'EMPLOYEE'}
                    onChange={(e) => setEditingEvent({
                      ...editingEvent,
                      defaultRecipientType: e.target.value as any
                    })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="EMPLOYEE">Employee</option>
                    <option value="VENDOR">Vendor</option>
                    <option value="COMPANY_ADMIN">Company Admin</option>
                    <option value="SUPER_ADMIN">Super Admin</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="eventActive"
                    checked={editingEvent.isActive !== false}
                    onChange={(e) => setEditingEvent({
                      ...editingEvent,
                      isActive: e.target.checked
                    })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor="eventActive" className="text-sm text-gray-700">
                    Event is active (triggers will fire)
                  </label>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                <button
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEvent}
                  disabled={eventSaving}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {eventSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {eventSaving ? 'Saving...' : 'Save Event'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TEMPLATE MODAL */}
        {/* ================================================================= */}
        {showTemplateModal && editingTemplate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[95vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  {editingTemplate.templateId ? 'Edit Template' : 'Create New Template'}
                </h3>
                <button onClick={() => setShowTemplateModal(false)} className="p-1 text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1 space-y-4">
                {templateError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded flex items-center gap-2 text-red-800">
                    <AlertTriangle className="h-5 w-5" />
                    {templateError}
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Template Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editingTemplate.templateName || ''}
                      onChange={(e) => setEditingTemplate({
                        ...editingTemplate,
                        templateName: e.target.value
                      })}
                      placeholder="e.g., Order Shipped - Employee Notification"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Event <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={editingTemplate.eventId || ''}
                      onChange={(e) => setEditingTemplate({
                        ...editingTemplate,
                        eventId: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select an event...</option>
                      {events.map(e => (
                        <option key={e.eventId} value={e.eventId}>
                          {e.eventCode} - {e.eventDescription.substring(0, 50)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Subject Template <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingTemplate.subjectTemplate || ''}
                    onChange={(e) => setEditingTemplate({
                      ...editingTemplate,
                      subjectTemplate: e.target.value
                    })}
                    placeholder="Your Order {{orderId}} Status: {{orderStatus}}"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                {/* Placeholders */}
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="text-sm font-medium text-blue-800 mb-2">Available Placeholders (click to insert):</div>
                  <div className="flex flex-wrap gap-1">
                    {AVAILABLE_PLACEHOLDERS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => insertPlaceholder(p.key)}
                        className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs hover:bg-blue-200 font-mono"
                        title={p.description}
                      >
                        {`{{${p.key}}}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Body Template (HTML) <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={editingTemplate.bodyTemplate || ''}
                    onChange={(e) => setEditingTemplate({
                      ...editingTemplate,
                      bodyTemplate: e.target.value
                    })}
                    rows={15}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="templateActive"
                    checked={editingTemplate.isActive !== false}
                    onChange={(e) => setEditingTemplate({
                      ...editingTemplate,
                      isActive: e.target.checked
                    })}
                    className="h-4 w-4 text-blue-600 rounded"
                  />
                  <label htmlFor="templateActive" className="text-sm text-gray-700">
                    Template is active
                  </label>
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex justify-end gap-2">
                <button
                  onClick={() => setShowTemplateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTemplate}
                  disabled={templateSaving}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {templateSaving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {templateSaving ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* PREVIEW MODAL */}
        {/* ================================================================= */}
        {showPreview && previewTemplate && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">
                  Preview: {previewTemplate.templateName}
                </h3>
                <button onClick={() => setShowPreview(false)} className="p-1 text-gray-500 hover:text-gray-700">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 overflow-y-auto flex-1">
                <div className="mb-4">
                  <div className="text-sm font-medium text-gray-500 mb-1">Subject:</div>
                  <div 
                    className="p-2 bg-gray-50 rounded border border-gray-200"
                    dangerouslySetInnerHTML={{ __html: renderPreview(previewTemplate.subjectTemplate) }}
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Body:</div>
                  <div 
                    className="p-4 bg-gray-50 rounded border border-gray-200"
                    dangerouslySetInnerHTML={{ __html: renderPreview(previewTemplate.bodyTemplate) }}
                  />
                </div>
              </div>
              <div className="px-4 py-3 border-t border-gray-200 bg-gray-50">
                <div className="text-xs text-gray-500">
                  <span className="font-medium">Sample values shown with </span>
                  <span className="bg-yellow-100 px-1 rounded">yellow highlight</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* LOG DETAIL MODAL */}
        {/* ================================================================= */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <h3 className="font-medium text-gray-900">Log Details</h3>
                <button onClick={() => setSelectedLog(null)} className="p-1 text-gray-500 hover:text-gray-700">
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
                    <div className="text-sm">{selectedLog.sentAt ? new Date(selectedLog.sentAt).toLocaleString() : 'N/A'}</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500 mb-1">Subject</div>
                  <div className="p-2 bg-gray-50 rounded border border-gray-200 text-sm">{selectedLog.subject}</div>
                </div>
                {selectedLog.errorMessage && (
                  <div>
                    <div className="text-sm font-medium text-red-600 mb-1">Error Message</div>
                    <div className="p-2 bg-red-50 rounded border border-red-200 text-sm text-red-800">{selectedLog.errorMessage}</div>
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
                <button onClick={() => setSelectedLog(null)} className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
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
