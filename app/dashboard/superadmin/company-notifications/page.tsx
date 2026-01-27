'use client'

/**
 * Company Notifications Admin Page
 * 
 * Super Admin interface to manage notification settings per company.
 * - Select company from dropdown
 * - General Settings: Master switch, branding, quiet hours
 * - Events: Enable/disable specific events for the company
 * - Templates: Custom email templates per event
 */

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  Building2, Bell, Settings, FileText,
  Save, X, Check, AlertTriangle, RefreshCw, 
  Palette, Clock, Users, Eye, Edit2, Search
} from 'lucide-react'

// =============================================================================
// TYPES
// =============================================================================

interface Company {
  id: string
  name: string
}

interface EventConfig {
  eventCode: string
  eventDescription: string
  defaultRecipientType: string
  isEnabled: boolean
  hasCustomTemplate: boolean
  customSubject?: string
  customBody?: string
}

interface CompanyNotificationConfig {
  id?: string
  companyId: string
  notificationsEnabled: boolean
  eventConfigs: Array<{
    eventCode: string
    isEnabled: boolean
    customSubject?: string
    customBody?: string
    recipients?: string[]
  }>
  ccEmails: string[]
  bccEmails: string[]
  brandName?: string
  brandColor?: string
  logoUrl?: string
  quietHoursEnabled: boolean
  quietHoursStart?: string
  quietHoursEnd?: string
  quietHoursTimezone?: string
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export default function CompanyNotificationsPage() {
  // State
  const [companies, setCompanies] = useState<Company[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [config, setConfig] = useState<CompanyNotificationConfig | null>(null)
  const [events, setEvents] = useState<EventConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState<'general' | 'events' | 'templates'>('general')
  const [successMessage, setSuccessMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  
  // Template editor state
  const [editingEvent, setEditingEvent] = useState<string | null>(null)
  const [templateSubject, setTemplateSubject] = useState('')
  const [templateBody, setTemplateBody] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  
  // Search/filter
  const [eventSearch, setEventSearch] = useState('')
  const [recipientFilter, setRecipientFilter] = useState<string>('ALL')

  // =============================================================================
  // DATA LOADING
  // =============================================================================

  // Load companies list
  useEffect(() => {
    loadCompanies()
  }, [])

  // Load company config when selected
  useEffect(() => {
    if (selectedCompanyId) {
      loadCompanyConfig(selectedCompanyId)
    }
  }, [selectedCompanyId])

  const loadCompanies = async () => {
    try {
      const response = await fetch('/api/companies')
      if (response.ok) {
        const data = await response.json()
        setCompanies(data.companies || data || [])
      }
    } catch (error) {
      console.error('Failed to load companies:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCompanyConfig = async (companyId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/admin/company/${companyId}/notifications`)
      if (response.ok) {
        const data = await response.json()
        setConfig(data.config)
        setEvents(data.events || [])
        setSelectedCompany(companies.find(c => c.id === companyId) || null)
      } else {
        setErrorMessage('Failed to load company notification config')
      }
    } catch (error) {
      console.error('Failed to load config:', error)
      setErrorMessage('Failed to load company notification config')
    } finally {
      setLoading(false)
    }
  }

  // =============================================================================
  // SAVE FUNCTIONS
  // =============================================================================

  const saveGeneralSettings = async () => {
    if (!selectedCompanyId || !config) return
    
    try {
      setSaving(true)
      const response = await fetch(`/api/admin/company/${selectedCompanyId}/notifications`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notificationsEnabled: config.notificationsEnabled,
          brandName: config.brandName,
          brandColor: config.brandColor,
          logoUrl: config.logoUrl,
          ccEmails: config.ccEmails,
          bccEmails: config.bccEmails,
          quietHoursEnabled: config.quietHoursEnabled,
          quietHoursStart: config.quietHoursStart,
          quietHoursEnd: config.quietHoursEnd,
          quietHoursTimezone: config.quietHoursTimezone,
        }),
      })
      
      if (response.ok) {
        setSuccessMessage('Settings saved successfully!')
        setTimeout(() => setSuccessMessage(''), 3000)
      } else {
        setErrorMessage('Failed to save settings')
      }
    } catch (error) {
      setErrorMessage('Failed to save settings')
    } finally {
      setSaving(false)
    }
  }

  const toggleEvent = async (eventCode: string, isEnabled: boolean) => {
    if (!selectedCompanyId) return
    
    try {
      const response = await fetch(
        `/api/admin/company/${selectedCompanyId}/notifications/events/${eventCode}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isEnabled }),
        }
      )
      
      if (response.ok) {
        // Update local state
        setEvents(prev => prev.map(e => 
          e.eventCode === eventCode ? { ...e, isEnabled } : e
        ))
        setSuccessMessage(`Event ${isEnabled ? 'enabled' : 'disabled'}`)
        setTimeout(() => setSuccessMessage(''), 2000)
      }
    } catch (error) {
      setErrorMessage('Failed to toggle event')
    }
  }

  const saveCustomTemplate = async () => {
    if (!selectedCompanyId || !editingEvent) return
    
    try {
      setSaving(true)
      const response = await fetch(
        `/api/admin/company/${selectedCompanyId}/notifications/events/${editingEvent}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            isEnabled: events.find(e => e.eventCode === editingEvent)?.isEnabled ?? true,
            customSubject: templateSubject || undefined,
            customBody: templateBody || undefined,
          }),
        }
      )
      
      if (response.ok) {
        setSuccessMessage('Template saved!')
        setTimeout(() => setSuccessMessage(''), 3000)
        // Refresh events
        loadCompanyConfig(selectedCompanyId)
        setEditingEvent(null)
      } else {
        setErrorMessage('Failed to save template')
      }
    } catch (error) {
      setErrorMessage('Failed to save template')
    } finally {
      setSaving(false)
    }
  }

  const resetToDefault = async () => {
    if (!selectedCompanyId) return
    
    if (!confirm('Reset all notification settings to system defaults? This cannot be undone.')) {
      return
    }
    
    try {
      setSaving(true)
      const response = await fetch(`/api/admin/company/${selectedCompanyId}/notifications`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        setSuccessMessage('Reset to defaults!')
        loadCompanyConfig(selectedCompanyId)
      }
    } catch (error) {
      setErrorMessage('Failed to reset')
    } finally {
      setSaving(false)
    }
  }


  // =============================================================================
  // FILTERED EVENTS
  // =============================================================================

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.eventCode.toLowerCase().includes(eventSearch.toLowerCase()) ||
                         event.eventDescription.toLowerCase().includes(eventSearch.toLowerCase())
    const matchesFilter = recipientFilter === 'ALL' || event.defaultRecipientType === recipientFilter
    return matchesSearch && matchesFilter
  })

  // Group events by recipient type
  const groupedEvents = {
    EMPLOYEE: filteredEvents.filter(e => e.defaultRecipientType === 'EMPLOYEE'),
    VENDOR: filteredEvents.filter(e => e.defaultRecipientType === 'VENDOR'),
    COMPANY_ADMIN: filteredEvents.filter(e => e.defaultRecipientType === 'COMPANY_ADMIN'),
    LOCATION_ADMIN: filteredEvents.filter(e => e.defaultRecipientType === 'LOCATION_ADMIN'),
  }

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-indigo-600" />
            Company Notification Settings
          </h1>
          <p className="text-gray-600 mt-1">
            Configure notification triggers and templates for each company
          </p>
        </div>

        {/* Messages */}
        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
            <Check className="w-5 h-5" />
            {successMessage}
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
            <AlertTriangle className="w-5 h-5" />
            {errorMessage}
            <button onClick={() => setErrorMessage('')} className="ml-auto">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Company Selector */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-gray-700">Select Company:</label>
            <select
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="flex-1 max-w-md px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="">-- Select a company --</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.id})
                </option>
              ))}
            </select>
            {selectedCompanyId && (
              <button
                onClick={() => loadCompanyConfig(selectedCompanyId)}
                className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Main Content */}
        {selectedCompanyId && config && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Company Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">
                    {selectedCompany?.name || 'Company'}
                  </h2>
                  <p className="text-indigo-100 text-sm">ID: {selectedCompanyId}</p>
                </div>
                <div className="flex items-center gap-3">
                  {/* Master Switch */}
                  <div className="flex items-center gap-2 bg-white/10 rounded-lg px-4 py-2">
                    <span className="text-white text-sm">Notifications:</span>
                    <button
                      onClick={() => setConfig({ ...config, notificationsEnabled: !config.notificationsEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        config.notificationsEnabled ? 'bg-green-500' : 'bg-gray-400'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          config.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-white text-sm font-medium">
                      {config.notificationsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <button
                    onClick={resetToDefault}
                    className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
                  >
                    Reset to Defaults
                  </button>
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200">
              <div className="flex">
                {[
                  { id: 'general', label: 'General Settings', icon: Settings },
                  { id: 'events', label: 'Events', icon: Bell },
                  { id: 'templates', label: 'Templates', icon: FileText },
                ].map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                      activeTab === tab.id
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    <tab.icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {/* General Settings Tab */}
              {activeTab === 'general' && (
                <div className="space-y-6">
                  {/* Branding Section */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                      <Palette className="w-5 h-5 text-indigo-600" />
                      Branding
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Brand Name (in emails)
                        </label>
                        <input
                          type="text"
                          value={config.brandName || ''}
                          onChange={(e) => setConfig({ ...config, brandName: e.target.value })}
                          placeholder="Company Name or UDS"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Brand Color
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={config.brandColor || '#4A90A4'}
                            onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                            className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                          />
                          <input
                            type="text"
                            value={config.brandColor || '#4A90A4'}
                            onChange={(e) => setConfig({ ...config, brandColor: e.target.value })}
                            placeholder="#4A90A4"
                            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                          />
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Logo URL (optional)
                        </label>
                        <input
                          type="url"
                          value={config.logoUrl || ''}
                          onChange={(e) => setConfig({ ...config, logoUrl: e.target.value })}
                          placeholder="https://company.com/logo.png"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Additional Recipients */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                      <Users className="w-5 h-5 text-indigo-600" />
                      Additional Recipients
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          CC Emails (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={(config.ccEmails || []).join(', ')}
                          onChange={(e) => setConfig({ 
                            ...config, 
                            ccEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                          })}
                          placeholder="admin@company.com, hr@company.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          BCC Emails (comma-separated)
                        </label>
                        <input
                          type="text"
                          value={(config.bccEmails || []).join(', ')}
                          onChange={(e) => setConfig({ 
                            ...config, 
                            bccEmails: e.target.value.split(',').map(s => s.trim()).filter(Boolean) 
                          })}
                          placeholder="audit@company.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Quiet Hours */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2 mb-4">
                      <Clock className="w-5 h-5 text-indigo-600" />
                      Quiet Hours
                    </h3>
                    <div className="space-y-4">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={config.quietHoursEnabled || false}
                          onChange={(e) => setConfig({ ...config, quietHoursEnabled: e.target.checked })}
                          className="w-5 h-5 text-indigo-600 rounded"
                        />
                        <span className="text-sm text-gray-700">
                          Enable quiet hours (no notifications during specified time)
                        </span>
                      </label>
                      
                      {config.quietHoursEnabled && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-8">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Start Time
                            </label>
                            <input
                              type="time"
                              value={config.quietHoursStart || '22:00'}
                              onChange={(e) => setConfig({ ...config, quietHoursStart: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              End Time
                            </label>
                            <input
                              type="time"
                              value={config.quietHoursEnd || '08:00'}
                              onChange={(e) => setConfig({ ...config, quietHoursEnd: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Timezone
                            </label>
                            <select
                              value={config.quietHoursTimezone || 'Asia/Kolkata'}
                              onChange={(e) => setConfig({ ...config, quietHoursTimezone: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                              <option value="UTC">UTC</option>
                              <option value="America/New_York">America/New_York (EST)</option>
                              <option value="Europe/London">Europe/London (GMT)</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={saveGeneralSettings}
                      disabled={saving}
                      className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50"
                    >
                      {saving ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save Settings
                    </button>
                  </div>
                </div>
              )}

              {/* Events Tab */}
              {activeTab === 'events' && (
                <div className="space-y-4">
                  {/* Search, Filter and Add Button */}
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={eventSearch}
                        onChange={(e) => setEventSearch(e.target.value)}
                        placeholder="Search events..."
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                      />
                    </div>
                    <select
                      value={recipientFilter}
                      onChange={(e) => setRecipientFilter(e.target.value)}
                      className="px-4 py-2 border border-gray-300 rounded-lg"
                    >
                      <option value="ALL">All Recipients</option>
                      <option value="EMPLOYEE">Employee</option>
                      <option value="VENDOR">Vendor</option>
                      <option value="COMPANY_ADMIN">Company Admin</option>
                      <option value="LOCATION_ADMIN">Location Admin</option>
                    </select>
                  </div>

                  {/* Events by Recipient Type */}
                  {Object.entries(groupedEvents).map(([type, typeEvents]) => (
                    typeEvents.length > 0 && (
                      <div key={type} className="mb-6">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${
                            type === 'EMPLOYEE' ? 'bg-blue-500' :
                            type === 'VENDOR' ? 'bg-orange-500' :
                            type === 'COMPANY_ADMIN' ? 'bg-purple-500' :
                            'bg-green-500'
                          }`} />
                          {type.replace('_', ' ')} Notifications ({typeEvents.length})
                        </h3>
                        <div className="bg-gray-50 rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-gray-100 text-left text-xs font-medium text-gray-500 uppercase">
                                <th className="px-4 py-3">Event</th>
                                <th className="px-4 py-3">Description</th>
                                <th className="px-4 py-3 text-center">Email</th>
                                <th className="px-4 py-3 text-center">Custom</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                              {typeEvents.map(event => (
                                <tr key={event.eventCode} className="hover:bg-gray-50">
                                  <td className="px-4 py-3">
                                    <code className="text-sm bg-gray-200 px-2 py-1 rounded">
                                      {event.eventCode}
                                    </code>
                                  </td>
                                  <td className="px-4 py-3 text-sm text-gray-600">
                                    {event.eventDescription}
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    <button
                                      onClick={() => toggleEvent(event.eventCode, !event.isEnabled)}
                                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                                        event.isEnabled ? 'bg-green-500' : 'bg-gray-300'
                                      }`}
                                    >
                                      <span
                                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                          event.isEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                      />
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-center">
                                    {event.hasCustomTemplate ? (
                                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                                        <Check className="w-3 h-3" />
                                        Custom
                                      </span>
                                    ) : (
                                      <span className="text-gray-400 text-xs">Default</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  ))}
                </div>
              )}

              {/* Templates Tab */}
              {activeTab === 'templates' && (
                <div className="space-y-4">
                  {!editingEvent ? (
                    <>
                      <p className="text-gray-600 mb-4">
                        Click "Edit Template" to customize the email template for any event.
                        Leave empty to use system defaults.
                      </p>
                      
                      <div className="grid gap-4">
                        {events.map(event => (
                          <div 
                            key={event.eventCode}
                            className="bg-gray-50 rounded-lg p-4 flex items-center justify-between"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <code className="text-sm bg-gray-200 px-2 py-1 rounded">
                                  {event.eventCode}
                                </code>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${
                                  event.defaultRecipientType === 'EMPLOYEE' ? 'bg-blue-100 text-blue-700' :
                                  event.defaultRecipientType === 'VENDOR' ? 'bg-orange-100 text-orange-700' :
                                  event.defaultRecipientType === 'COMPANY_ADMIN' ? 'bg-purple-100 text-purple-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  {event.defaultRecipientType}
                                </span>
                                {event.hasCustomTemplate && (
                                  <span className="px-2 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full">
                                    Customized
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-600 mt-1">{event.eventDescription}</p>
                            </div>
                            <button
                              onClick={() => {
                                setEditingEvent(event.eventCode)
                                setTemplateSubject(event.customSubject || '')
                                setTemplateBody(event.customBody || '')
                              }}
                              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                            >
                              <Edit2 className="w-4 h-4" />
                              Edit Template
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-medium">
                          Editing: <code className="bg-gray-100 px-2 py-1 rounded">{editingEvent}</code>
                        </h3>
                        <button
                          onClick={() => setEditingEvent(null)}
                          className="text-gray-500 hover:text-gray-700"
                        >
                          <X className="w-5 h-5" />
                        </button>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Subject Template
                        </label>
                        <input
                          type="text"
                          value={templateSubject}
                          onChange={(e) => setTemplateSubject(e.target.value)}
                          placeholder="Leave empty to use default"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          Use placeholders like {'{{employeeName}}'}, {'{{orderId}}'}, {'{{brandName}}'}
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Body Template (HTML)
                        </label>
                        <textarea
                          value={templateBody}
                          onChange={(e) => setTemplateBody(e.target.value)}
                          placeholder="Leave empty to use default"
                          rows={15}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                        />
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <h4 className="text-sm font-medium text-blue-800 mb-2">Available Placeholders:</h4>
                        <div className="flex flex-wrap gap-2">
                          {['employeeName', 'employeeEmail', 'orderId', 'orderStatus', 'previousStatus',
                            'poNumber', 'grnNumber', 'invoiceNumber', 'vendorName', 'companyName',
                            'brandName', 'brandColor', 'locationName', 'approvedBy', 'acknowledgedBy'
                          ].map(p => (
                            <code key={p} className="px-2 py-1 bg-white border border-blue-200 rounded text-xs">
                              {`{{${p}}}`}
                            </code>
                          ))}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t">
                        <button
                          onClick={() => {
                            setTemplateSubject('')
                            setTemplateBody('')
                          }}
                          className="text-gray-600 hover:text-gray-800"
                        >
                          Clear / Use Default
                        </button>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => setEditingEvent(null)}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveCustomTemplate}
                            disabled={saving}
                            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium disabled:opacity-50"
                          >
                            {saving ? (
                              <RefreshCw className="w-4 h-4 animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Save Template
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* No Company Selected */}
        {!selectedCompanyId && !loading && (
          <div className="bg-gray-50 rounded-xl border-2 border-dashed border-gray-300 p-12 text-center">
            <Building2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Select a Company
            </h3>
            <p className="text-gray-600">
              Choose a company from the dropdown above to configure its notification settings.
            </p>
          </div>
        )}

        {/* Loading */}
        {loading && selectedCompanyId && (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        )}
      </div>

    </DashboardLayout>
  )
}
