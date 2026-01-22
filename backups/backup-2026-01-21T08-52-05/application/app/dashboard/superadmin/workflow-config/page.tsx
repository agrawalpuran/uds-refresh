'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { 
  Settings, Save, CheckCircle, Building2, Search, ChevronDown, ChevronUp
} from 'lucide-react'
import { 
  getAllCompanies,
  getCompanyById,
  updateCompanySettings
} from '@/lib/data-mongodb'

export default function WorkflowConfigPage() {
  const [companies, setCompanies] = useState<any[]>([])
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('')
  const [selectedCompany, setSelectedCompany] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set())
  
  // Workflow flags state
  const [enable_pr_po_workflow, setEnable_pr_po_workflow] = useState<boolean>(false)
  const [enable_site_admin_pr_approval, setEnable_site_admin_pr_approval] = useState<boolean>(true)
  const [require_company_admin_po_approval, setRequire_company_admin_po_approval] = useState<boolean>(true)
  const [allow_multi_pr_po, setAllow_multi_pr_po] = useState<boolean>(true)

  // Load all companies
  useEffect(() => {
    const loadCompanies = async () => {
      try {
        setLoading(true)
        const companiesData = await getAllCompanies()
        setCompanies(companiesData)
      } catch (error) {
        console.error('Error loading companies:', error)
        alert('Error loading companies. Please check the console for details.')
      } finally {
        setLoading(false)
      }
    }
    loadCompanies()
  }, [])

  // Load company details when selected
  useEffect(() => {
    const loadCompanyDetails = async () => {
      if (!selectedCompanyId) {
        setSelectedCompany(null)
        return
      }

      try {
        setLoading(true)
        const company = await getCompanyById(selectedCompanyId)
        if (company) {
          setSelectedCompany(company)
          // Set workflow flags from company data
          setEnable_pr_po_workflow(company.enable_pr_po_workflow === true)
          setEnable_site_admin_pr_approval(
            company.enable_site_admin_pr_approval !== undefined 
              ? company.enable_site_admin_pr_approval === true 
              : (company.enable_site_admin_approval !== undefined 
                  ? company.enable_site_admin_approval === true 
                  : true)
          )
          setRequire_company_admin_po_approval(
            company.require_company_admin_po_approval !== undefined 
              ? company.require_company_admin_po_approval === true 
              : (company.require_company_admin_approval !== undefined 
                  ? company.require_company_admin_approval === true 
                  : true)
          )
          setAllow_multi_pr_po(
            company.allow_multi_pr_po !== undefined 
              ? company.allow_multi_pr_po === true 
              : true
          )
        } else {
          setSelectedCompany(null)
        }
      } catch (error) {
        console.error('Error loading company details:', error)
        alert('Error loading company details. Please check the console for details.')
      } finally {
        setLoading(false)
      }
    }

    loadCompanyDetails()
  }, [selectedCompanyId])

  const handleSave = async () => {
    if (!selectedCompanyId) {
      alert('Please select a company first')
      return
    }

    try {
      setSaving(true)
      setSaveSuccess(false)
      
      await updateCompanySettings(selectedCompanyId, {
        enable_pr_po_workflow,
        enable_site_admin_pr_approval,
        require_company_admin_po_approval,
        allow_multi_pr_po,
      })
      
      // Reload company details
      const updatedCompany = await getCompanyById(selectedCompanyId)
      if (updatedCompany) {
        setSelectedCompany(updatedCompany)
      }
      
      // Reload companies list to reflect changes
      const updatedCompanies = await getAllCompanies()
      setCompanies(updatedCompanies)
      
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error: any) {
      console.error('Error saving workflow settings:', error)
      alert(`Error saving workflow settings: ${error.message || 'Unknown error occurred'}`)
    } finally {
      setSaving(false)
    }
  }

  const filteredCompanies = companies.filter(c =>
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.id.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const toggleCompanyExpansion = (companyId: string) => {
    const newExpanded = new Set(expandedCompanies)
    if (newExpanded.has(companyId)) {
      newExpanded.delete(companyId)
    } else {
      newExpanded.add(companyId)
    }
    setExpandedCompanies(newExpanded)
  }

  return (
    <DashboardLayout actorType="superadmin">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-2">
            <Settings className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Workflow Configuration</h1>
          </div>
          <p className="text-gray-600">Manage PR → PO workflow settings for all companies</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Company List Panel */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-3">Companies</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search companies..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  />
                </div>
              </div>
              
              <div className="max-h-[600px] overflow-y-auto">
                {loading && companies.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">Loading companies...</div>
                ) : filteredCompanies.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">No companies found</div>
                ) : (
                  <div className="divide-y divide-gray-200">
                    {filteredCompanies.map((company) => {
                      const isSelected = selectedCompanyId === company.id
                      const isExpanded = expandedCompanies.has(company.id)
                      const workflowEnabled = company.enable_pr_po_workflow === true
                      
                      return (
                        <div
                          key={company.id}
                          className={`p-4 cursor-pointer transition-colors ${
                            isSelected
                              ? 'bg-blue-50 border-l-4 border-l-blue-600'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedCompanyId(company.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-2">
                                <Building2 className="h-4 w-4 text-gray-500" />
                                <h3 className="font-medium text-gray-900">{company.name}</h3>
                              </div>
                              <p className="text-xs text-gray-500 mt-1">ID: {company.id}</p>
                              <div className="mt-2 flex items-center space-x-2">
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                    workflowEnabled
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-gray-100 text-gray-800'
                                  }`}
                                >
                                  {workflowEnabled ? 'Workflow Enabled' : 'Workflow Disabled'}
                                </span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                toggleCompanyExpansion(company.id)
                              }}
                              className="ml-2 p-1 hover:bg-gray-200 rounded"
                            >
                              {isExpanded ? (
                                <ChevronUp className="h-4 w-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="h-4 w-4 text-gray-500" />
                              )}
                            </button>
                          </div>
                          
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-gray-200 space-y-2 text-xs text-gray-600">
                              <div className="flex justify-between">
                                <span>Site Admin PR Approval:</span>
                                <span className={company.enable_site_admin_pr_approval !== undefined 
                                  ? (company.enable_site_admin_pr_approval ? 'text-green-600' : 'text-gray-400')
                                  : (company.enable_site_admin_approval ? 'text-green-600' : 'text-gray-400')
                                }>
                                  {company.enable_site_admin_pr_approval !== undefined 
                                    ? (company.enable_site_admin_pr_approval ? 'Yes' : 'No')
                                    : (company.enable_site_admin_approval ? 'Yes' : 'No')
                                  }
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Company Admin PO Approval:</span>
                                <span className={company.require_company_admin_po_approval !== undefined 
                                  ? (company.require_company_admin_po_approval ? 'text-green-600' : 'text-gray-400')
                                  : (company.require_company_admin_approval ? 'text-green-600' : 'text-gray-400')
                                }>
                                  {company.require_company_admin_po_approval !== undefined 
                                    ? (company.require_company_admin_po_approval ? 'Yes' : 'No')
                                    : (company.require_company_admin_approval ? 'Yes' : 'No')
                                  }
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Multi-PR PO:</span>
                                <span className={company.allow_multi_pr_po ? 'text-green-600' : 'text-gray-400'}>
                                  {company.allow_multi_pr_po ? 'Yes' : 'No'}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Workflow Configuration Panel */}
          <div className="lg:col-span-2">
            {selectedCompany ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    {selectedCompany.name}
                  </h2>
                  <p className="text-sm text-gray-500">Company ID: {selectedCompany.id}</p>
                </div>

                <div className="space-y-6">
                  {/* Enable PR → PO Workflow */}
                  <div className="border-b pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Enable PR → Approval → PO Workflow
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Enables the Purchase Requisition (PR) to Purchase Order (PO) workflow with approval steps.
                          When enabled, orders act as Purchase Requisitions that require approval before being converted to Purchase Orders.
                        </p>
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enable_pr_po_workflow}
                              onChange={(e) => {
                                setEnable_pr_po_workflow(e.target.checked)
                                // Disable other toggles if workflow is disabled
                                if (!e.target.checked) {
                                  setEnable_site_admin_pr_approval(false)
                                  setRequire_company_admin_po_approval(false)
                                  setAllow_multi_pr_po(false)
                                } else {
                                  // Enable with defaults when workflow is enabled
                                  setEnable_site_admin_pr_approval(true)
                                  setRequire_company_admin_po_approval(true)
                                  setAllow_multi_pr_po(true)
                                }
                              }}
                              className="sr-only peer"
                            />
                            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-700">
                              {enable_pr_po_workflow ? 'Workflow Enabled' : 'Workflow Disabled'}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Require Site Admin PR Approval */}
                  <div className="border-b pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Require Site Admin PR Approval
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Site Admin must approve Purchase Requisitions (Orders) before they proceed to Company Admin.
                          The Site Admin is determined by the employee's location.
                        </p>
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={enable_site_admin_pr_approval}
                              onChange={(e) => setEnable_site_admin_pr_approval(e.target.checked)}
                              disabled={!enable_pr_po_workflow}
                              className="sr-only peer"
                            />
                            <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${!enable_pr_po_workflow ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                            <span className={`ml-3 text-sm font-medium ${!enable_pr_po_workflow ? 'text-gray-400' : 'text-gray-700'}`}>
                              {enable_site_admin_pr_approval ? 'Site Admin Approval Required' : 'Site Admin Approval Not Required'}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Require Company Admin PO Approval */}
                  <div className="border-b pb-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Require Company Admin PO Approval
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Company Admin must approve Purchase Orders before they are sent to vendors.
                          This approval happens at the PO creation stage, after Site Admin approval (if enabled).
                        </p>
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={require_company_admin_po_approval}
                              onChange={(e) => setRequire_company_admin_po_approval(e.target.checked)}
                              disabled={!enable_pr_po_workflow}
                              className="sr-only peer"
                            />
                            <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${!enable_pr_po_workflow ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                            <span className={`ml-3 text-sm font-medium ${!enable_pr_po_workflow ? 'text-gray-400' : 'text-gray-700'}`}>
                              {require_company_admin_po_approval ? 'Company Admin Approval Required' : 'Company Admin Approval Not Required'}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Allow Multiple PRs in One PO */}
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Allow Grouping Multiple PRs into One PO
                        </h3>
                        <p className="text-sm text-gray-600 mb-4">
                          Company Admin can group multiple approved Purchase Requisitions into a single Purchase Order.
                          This allows for bulk ordering and better vendor management.
                        </p>
                        <div className="flex items-center space-x-3">
                          <label className="relative inline-flex items-center cursor-pointer">
                            <input
                              type="checkbox"
                              checked={allow_multi_pr_po}
                              onChange={(e) => setAllow_multi_pr_po(e.target.checked)}
                              disabled={!enable_pr_po_workflow}
                              className="sr-only peer"
                            />
                            <div className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${!enable_pr_po_workflow ? 'opacity-50 cursor-not-allowed' : ''}`}></div>
                            <span className={`ml-3 text-sm font-medium ${!enable_pr_po_workflow ? 'text-gray-400' : 'text-gray-700'}`}>
                              {allow_multi_pr_po ? 'Multiple PRs Allowed' : 'Single PR per PO'}
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Save Button */}
                <div className="mt-8 pt-6 border-t flex items-center justify-between">
                  {saveSuccess && (
                    <div className="flex items-center space-x-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Workflow settings saved successfully!</span>
                    </div>
                  )}
                  <div className="ml-auto">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed hover:bg-blue-700"
                    >
                      <Save className="h-5 w-5" />
                      <span>{saving ? 'Saving...' : 'Save Settings'}</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
                <Building2 className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">No Company Selected</h3>
                <p className="text-gray-600">Select a company from the list to configure workflow settings</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

