'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import DashboardLayout from '@/components/DashboardLayout'
import { Settings, Save, CheckCircle, XCircle } from 'lucide-react'
import { 
  getCompanyByAdminEmail, 
  isCompanyAdmin,
  getCompanyById,
  updateCompanySettings
} from '@/lib/data-mongodb'

export default function CompanySettingsPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [companyName, setCompanyName] = useState<string>('')
  const [logo, setLogo] = useState<string>('')
  const [primaryColor, setPrimaryColor] = useState<string>('#f76b1c')
  const [secondaryColor, setSecondaryColor] = useState<string>('#f76b1c')
  const [showPrices, setShowPrices] = useState<boolean>(false)
  const [allowPersonalPayments, setAllowPersonalPayments] = useState<boolean>(false)
  const [enableEmployeeOrder, setEnableEmployeeOrder] = useState<boolean>(false)
  const [allowLocationAdminViewFeedback, setAllowLocationAdminViewFeedback] = useState<boolean>(false)
  const [allowEligibilityConsumptionReset, setAllowEligibilityConsumptionReset] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [accessDenied, setAccessDenied] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const router = useRouter()

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadData = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const { getUserEmail } = await import('@/lib/utils/auth-storage')
          const userEmail = getUserEmail('company')
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          const company = await getCompanyByAdminEmail(userEmail)
          if (!company) {
            setAccessDenied(true)
            setLoading(false)
            router.push('/login/company')
            return
          }

          const adminStatus = await isCompanyAdmin(userEmail, company.id)
          if (!adminStatus) {
            setAccessDenied(true)
            setLoading(false)
            router.push('/login/company')
            return
          }

          setCompanyId(company.id)
          
          // Fetch full company details including settings
          const companyDetails = await getCompanyById(company.id)
          if (companyDetails) {
            setCompanyName(companyDetails.name || '')
            setLogo(companyDetails.logo || '')
            setPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            setSecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            setShowPrices(companyDetails.showPrices || false)
            setAllowPersonalPayments(companyDetails.allowPersonalPayments || false)
            // Explicitly check for boolean false - if undefined, default to false
            // Log for debugging
            console.log('[Settings] Loading company details:', {
              enableEmployeeOrder: companyDetails.enableEmployeeOrder,
              type: typeof companyDetails.enableEmployeeOrder,
              isUndefined: companyDetails.enableEmployeeOrder === undefined,
              isNull: companyDetails.enableEmployeeOrder === null,
              allowLocationAdminViewFeedback: companyDetails.allowLocationAdminViewFeedback,
              allowLocationAdminViewFeedbackType: typeof companyDetails.allowLocationAdminViewFeedback
            })
            setEnableEmployeeOrder(companyDetails.enableEmployeeOrder === true)
            setAllowLocationAdminViewFeedback(companyDetails.allowLocationAdminViewFeedback === true)
            setAllowEligibilityConsumptionReset(companyDetails.allowEligibilityConsumptionReset === true)
            console.log('[Settings] Set allowLocationAdminViewFeedback to:', companyDetails.allowLocationAdminViewFeedback === true)
          }
        } catch (error) {
          console.error('Error loading settings:', error)
          setAccessDenied(true)
        } finally {
          setLoading(false)
        }
      }

      loadData()
    }
  }, [router])

  const handleSave = async () => {
    try {
      setSaving(true)
      setSaveSuccess(false)
      
      // Log the values being sent
      console.log('[Settings] Saving with values:', {
        enableEmployeeOrder,
        type: typeof enableEmployeeOrder,
        showPrices,
        allowPersonalPayments
      })
      
      const result = await updateCompanySettings(companyId, {
        name: companyName,
        logo,
        primaryColor,
        secondaryColor,
        showPrices,
        allowPersonalPayments,
        enableEmployeeOrder,
        allowLocationAdminViewFeedback,
        allowEligibilityConsumptionReset,
      })
      
      // Log the result
      console.log('[Settings] Save result:', result)
      console.log('[Settings] Save result keys:', result ? Object.keys(result) : 'null')
      
      // updateCompanySettings now returns the company object directly (not wrapped)
      // The API returns { success: true, company: {...}, message: '...' }
      // but updateCompanySettings extracts and returns just the company object
      let savedCompany = null
      if (result && result.company) {
        // If result is still wrapped (fallback)
        savedCompany = result.company
        console.log('[Settings] Extracted company from wrapped result')
      } else if (result && typeof result === 'object' && 'id' in result) {
        // If result itself is the company object (expected after fix)
        savedCompany = result
        console.log('[Settings] Result is company object directly')
      }
      
      console.log('[Settings] Saved company object:', savedCompany)
      console.log('[Settings] Saved company enableEmployeeOrder:', savedCompany?.enableEmployeeOrder, 'type:', typeof savedCompany?.enableEmployeeOrder)
      
      // Update state from the returned company object
      if (savedCompany && savedCompany.enableEmployeeOrder !== undefined) {
        const newValue = savedCompany.enableEmployeeOrder === true
        console.log('[Settings] Setting state to:', newValue, 'from value:', savedCompany.enableEmployeeOrder)
        setEnableEmployeeOrder(newValue)
      } else {
        console.warn('[Settings] No enableEmployeeOrder in saved company, will reload...')
      }
      
      // Update allowLocationAdminViewFeedback from saved company
      if (savedCompany && savedCompany.allowLocationAdminViewFeedback !== undefined) {
        const newValue = savedCompany.allowLocationAdminViewFeedback === true
        console.log('[Settings] Setting allowLocationAdminViewFeedback to:', newValue, 'from value:', savedCompany.allowLocationAdminViewFeedback)
        setAllowLocationAdminViewFeedback(newValue)
      }
      
      // Update allowEligibilityConsumptionReset from saved company
      if (savedCompany && savedCompany.allowEligibilityConsumptionReset !== undefined) {
        const newValue = savedCompany.allowEligibilityConsumptionReset === true
        console.log('[Settings] Setting allowEligibilityConsumptionReset to:', newValue, 'from value:', savedCompany.allowEligibilityConsumptionReset)
        setAllowEligibilityConsumptionReset(newValue)
      }
      
      // Reload company details to ensure UI is in sync
      // Wait a bit to ensure database write is complete
      await new Promise(resolve => setTimeout(resolve, 1000))
      const companyDetails = await getCompanyById(companyId)
      if (companyDetails) {
        console.log('[Settings] Reloaded company details:', companyDetails)
        console.log('[Settings] Reloaded company enableEmployeeOrder:', companyDetails.enableEmployeeOrder, 'type:', typeof companyDetails.enableEmployeeOrder)
        console.log('[Settings] Reloaded company allowLocationAdminViewFeedback:', companyDetails.allowLocationAdminViewFeedback, 'type:', typeof companyDetails.allowLocationAdminViewFeedback)
        console.log('[Settings] Reloaded company allowEligibilityConsumptionReset:', companyDetails.allowEligibilityConsumptionReset, 'type:', typeof companyDetails.allowEligibilityConsumptionReset)
        const reloadedEmployeeOrderValue = companyDetails.enableEmployeeOrder === true
        console.log('[Settings] Setting state from reloaded company to:', reloadedEmployeeOrderValue)
        setEnableEmployeeOrder(reloadedEmployeeOrderValue)
        
        // Also update allowLocationAdminViewFeedback from reloaded company
        if (companyDetails.allowLocationAdminViewFeedback !== undefined) {
          const reloadedFeedbackValue = companyDetails.allowLocationAdminViewFeedback === true
          console.log('[Settings] Setting allowLocationAdminViewFeedback from reloaded company to:', reloadedFeedbackValue)
          setAllowLocationAdminViewFeedback(reloadedFeedbackValue)
        }
        
        // Also update allowEligibilityConsumptionReset from reloaded company
        if (companyDetails.allowEligibilityConsumptionReset !== undefined) {
          const reloadedResetValue = companyDetails.allowEligibilityConsumptionReset === true
          console.log('[Settings] Setting allowEligibilityConsumptionReset from reloaded company to:', reloadedResetValue)
          setAllowEligibilityConsumptionReset(reloadedResetValue)
        }
      }
      
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error: any) {
      alert(`Error saving settings: ${error.message}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading settings...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-red-600 font-semibold">Access Denied</p>
            <p className="text-gray-600 mt-2">You are not authorized to view this page.</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div className="p-6">
        <div className="mb-6">
          <div className="flex items-center space-x-3 mb-2">
            <Settings className="h-8 w-8" style={{ color: primaryColor || '#f76b1c' }} />
            <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
          </div>
          <p className="text-gray-600">Configure company-wide settings and preferences</p>
        </div>

        <div className="bg-white rounded-lg shadow p-6 max-w-3xl">
          <div className="space-y-6">
            {/* Company Branding Section */}
            <div className="border-b pb-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Company Branding</h2>
              
              {/* Company Name */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                  style={{ 
                    '--tw-ring-color': primaryColor || '#f76b1c',
                    '--tw-border-color': primaryColor || '#f76b1c'
                  } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                  onFocus={(e) => {
                    e.target.style.borderColor = primaryColor || '#f76b1c'
                    e.target.style.boxShadow = `0 0 0 2px ${primaryColor || '#f76b1c'}40`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db'
                    e.target.style.boxShadow = 'none'
                  }}
                  placeholder="Enter company name"
                />
              </div>

              {/* Logo URL */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo URL
                </label>
                <input
                  type="url"
                  value={logo}
                  onChange={(e) => setLogo(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                  style={{ 
                    '--tw-ring-color': primaryColor || '#f76b1c',
                    '--tw-border-color': primaryColor || '#f76b1c'
                  } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                  onFocus={(e) => {
                    e.target.style.borderColor = primaryColor || '#f76b1c'
                    e.target.style.boxShadow = `0 0 0 2px ${primaryColor || '#f76b1c'}40`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#d1d5db'
                    e.target.style.boxShadow = 'none'
                  }}
                  placeholder="https://example.com/logo.png"
                />
                {logo && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-500 mb-1">Logo Preview:</p>
                    <div className="w-20 h-20 border border-gray-200 rounded-lg overflow-hidden bg-gray-50 flex items-center justify-center">
                      <img src={logo} alt="Logo preview" className="max-w-full max-h-full object-contain" onError={(e) => {
                        e.currentTarget.style.display = 'none'
                      }} />
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Color */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    style={{ 
                      '--tw-ring-color': primaryColor || '#f76b1c',
                      '--tw-border-color': primaryColor || '#f76b1c'
                    } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                    onFocus={(e) => {
                      e.target.style.borderColor = primaryColor || '#f76b1c'
                      e.target.style.boxShadow = `0 0 0 2px ${primaryColor || '#f76b1c'}40`
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#d1d5db'
                      e.target.style.boxShadow = 'none'
                    }}
                    placeholder="#f76b1c"
                  />
                </div>
                <div className="mt-2 flex items-center space-x-2">
                  <div className="w-8 h-8 rounded" style={{ backgroundColor: primaryColor }}></div>
                  <span className="text-xs text-gray-500">Preview</span>
                </div>
              </div>

              {/* Secondary Color */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Secondary Color
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-16 h-10 border border-gray-300 rounded-lg cursor-pointer"
                  />
                  <input
                    type="text"
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 outline-none"
                    style={{ 
                      '--tw-ring-color': primaryColor || '#f76b1c',
                      '--tw-border-color': primaryColor || '#f76b1c'
                    } as React.CSSProperties & { '--tw-ring-color'?: string; '--tw-border-color'?: string }}
                    onFocus={(e) => {
                      e.target.style.borderColor = primaryColor || '#f76b1c'
                      e.target.style.boxShadow = `0 0 0 2px ${primaryColor || '#f76b1c'}40`
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#d1d5db'
                      e.target.style.boxShadow = 'none'
                    }}
                    placeholder="#f76b1c"
                  />
                </div>
                <div className="mt-2 flex items-center space-x-2">
                  <div className="w-8 h-8 rounded" style={{ backgroundColor: secondaryColor }}></div>
                  <span className="text-xs text-gray-500">Preview</span>
                </div>
              </div>
            </div>

            {/* Show Prices Setting */}
            <div className="border-b pb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Display Product Prices
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Control whether product prices are visible to employees in the catalog and order pages.
                    When disabled, prices will be hidden from all employee-facing interfaces.
                  </p>
                  <div className="flex items-center space-x-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showPrices}
                        onChange={(e) => setShowPrices(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {showPrices ? 'Prices Visible' : 'Prices Hidden'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Enable Employee Order Setting */}
            <div className="border-b pb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Enable Employee Order
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Controls whether employees are allowed to log in and place orders.
                    Company and Location Admin access is not affected by this setting.
                  </p>
                  <div className="flex items-center space-x-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={enableEmployeeOrder}
                        onChange={(e) => setEnableEmployeeOrder(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {enableEmployeeOrder ? 'Employee Orders Enabled' : 'Employee Orders Disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Allow Personal Payments Setting */}
            <div className="border-b pb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Allow Personal Payment Orders
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Enable employees to order products beyond their eligibility limits by making personal payments.
                    When enabled, employees can purchase additional items that exceed their entitlement by paying personally.
                  </p>
                  <div className="flex items-center space-x-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowPersonalPayments}
                        onChange={(e) => setAllowPersonalPayments(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {allowPersonalPayments ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Allow Location Admin to View Product Feedback Setting */}
            <div className="border-b pb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Allow Location Admin to View Product Feedback
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Control whether Location Admins can view product feedback submitted by employees.
                    When disabled (default), Location Admins cannot see any feedback. When enabled, Location Admins can view feedback in read-only mode.
                    Company Admins and Vendors always have access to feedback.
                  </p>
                  <div className="flex items-center space-x-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowLocationAdminViewFeedback}
                        onChange={(e) => setAllowLocationAdminViewFeedback(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {allowLocationAdminViewFeedback ? 'Location Admins Can View Feedback' : 'Location Admins Cannot View Feedback'}
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Allow Eligibility Consumption Reset Setting */}
            <div className="border-b pb-6">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Allow Reset of Consumed Eligibility on Designation Refresh
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    When enabled, refreshing designation eligibility will reset consumed eligibility to zero for affected employees.
                    This allows employees to start fresh with their eligibility quota after a designation refresh.
                    <span className="block mt-2 text-xs text-yellow-600 font-medium">
                      ⚠️ Warning: This will reset consumed eligibility counts, effectively allowing employees to order items again that they may have already ordered.
                    </span>
                  </p>
                  <div className="flex items-center space-x-3">
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allowEligibilityConsumptionReset}
                        onChange={(e) => setAllowEligibilityConsumptionReset(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ml-3 text-sm font-medium text-gray-700">
                        {allowEligibilityConsumptionReset ? 'Reset Enabled' : 'Reset Disabled'}
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
                <span className="text-sm font-medium">Settings saved successfully!</span>
              </div>
            )}
            <div className="ml-auto">
              <button
                onClick={handleSave}
                disabled={saving}
                className="text-white px-6 py-2 rounded-lg font-semibold transition-colors flex items-center space-x-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
                style={{ 
                  backgroundColor: primaryColor || '#f76b1c',
                  opacity: saving ? 0.7 : 1
                }}
                onMouseEnter={(e) => {
                  if (!saving) {
                    const color = primaryColor || '#f76b1c'
                    // Darken the color by 10%
                    const r = parseInt(color.slice(1, 3), 16)
                    const g = parseInt(color.slice(3, 5), 16)
                    const b = parseInt(color.slice(5, 7), 16)
                    const darker = `#${Math.max(0, r - 25).toString(16).padStart(2, '0')}${Math.max(0, g - 25).toString(16).padStart(2, '0')}${Math.max(0, b - 25).toString(16).padStart(2, '0')}`
                    e.currentTarget.style.backgroundColor = darker
                  }
                }}
                onMouseLeave={(e) => {
                  if (!saving) {
                    e.currentTarget.style.backgroundColor = primaryColor || '#f76b1c'
                  }
                }}
              >
                <Save className="h-5 w-5" />
                <span>{saving ? 'Saving...' : 'Save Settings'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

