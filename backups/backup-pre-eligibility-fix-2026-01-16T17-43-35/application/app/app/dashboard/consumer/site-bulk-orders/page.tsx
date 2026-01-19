'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Upload, Download, FileText, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { getLocationByAdminEmail, getCompanyById } from '@/lib/data-mongodb'
import { getUserEmail } from '@/lib/utils/auth-storage'

export default function SiteBulkOrdersPage() {
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [locationInfo, setLocationInfo] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const [orderFile, setOrderFile] = useState<File | null>(null)
  const [orderUploading, setOrderUploading] = useState(false)
  const [orderUploadResults, setOrderUploadResults] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadUserInfo = async () => {
        try {
          setLoading(true)
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('consumer')
          
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Normalize email
          const normalizedEmail = userEmail.trim().toLowerCase()
          
          // Check if user is Location Admin (Site Admin)
          const location = await getLocationByAdminEmail(normalizedEmail)
          
          if (!location) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          setIsLocationAdmin(true)
          setLocationInfo(location)

          // Get company for colors
          const targetCompanyId = location.companyId?.id || location.companyId
          if (targetCompanyId) {
            setCompanyId(targetCompanyId)
            const companyDetails = await getCompanyById(targetCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            }
          }
        } catch (error) {
          console.error('Error loading user info:', error)
          setAccessDenied(true)
        } finally {
          setLoading(false)
        }
      }
      loadUserInfo()
    }
  }, [])

  const handleOrderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Please select an Excel file (.xlsx or .xls)')
        return
      }
      setOrderFile(file)
      setOrderUploadResults(null)
    }
  }

  const handleOrderUpload = async () => {
    if (!orderFile) {
      alert('Please select an Excel file')
      return
    }

    try {
      setOrderUploading(true)
      setOrderUploadResults(null)

      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('consumer')
      
      if (!userEmail) {
        alert('User email not found. Please log in again.')
        setOrderUploading(false)
        return
      }

      const normalizedEmail = userEmail.trim().toLowerCase()

      // Create form data
      const formData = new FormData()
      formData.append('file', orderFile)
      formData.append('adminEmail', normalizedEmail)

      // Upload Excel file
      const response = await fetch('/api/orders/site-bulk-excel', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to upload orders')
      }

      setOrderUploadResults(data)
    } catch (error: any) {
      console.error('Error uploading bulk orders:', error)
      alert(`Error processing file: ${error.message || 'Unknown error'}`)
    } finally {
      setOrderUploading(false)
    }
  }

  const downloadOrderTemplate = async () => {
    try {
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('consumer')
      
      if (!userEmail) {
        alert('User email not found. Please log in again.')
        return
      }

      const normalizedEmail = userEmail.trim().toLowerCase()

      // Download template
      const response = await fetch(`/api/orders/site-bulk-template?adminEmail=${encodeURIComponent(normalizedEmail)}`)
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to download template')
      }

      // Get filename from Content-Disposition header or use default
      const contentDisposition = response.headers.get('Content-Disposition')
      let filename = 'site_bulk_order_template.xlsx'
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i)
        if (filenameMatch) {
          filename = filenameMatch[1]
        }
      }

      // Create blob and download
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error: any) {
      console.error('Error downloading template:', error)
      alert(`Error downloading template: ${error.message || 'Unknown error'}`)
    }
  }

  const downloadResultsExcel = (results: any[], type: 'accepted' | 'rejected') => {
    try {
      import('xlsx').then((XLSX) => {
        const data = results.map((r: any) => ({
          'Row Number': r.rowNumber,
          'Employee ID': r.employeeId,
          'Product Code': r.productCode,
          'Size': r.size || 'N/A',
          'Quantity': r.quantity,
          ...(type === 'accepted' ? { 'Order ID': r.orderId } : { 'Rejection Reason': r.error || 'Unknown error' })
        }))

        const worksheet = XLSX.utils.json_to_sheet(data)
        const workbook = XLSX.utils.book_new()
        XLSX.utils.book_append_sheet(workbook, worksheet, type === 'accepted' ? 'Accepted Orders' : 'Rejected Orders')

        const excelBuffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `site_bulk_orders_${type}_${Date.now()}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      })
    } catch (error: any) {
      console.error('Error downloading results:', error)
      alert(`Error downloading results: ${error.message || 'Unknown error'}`)
    }
  }

  if (loading) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="consumer">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8 max-w-md">
            <h2 className="text-2xl font-bold text-red-900 mb-4">Access Denied</h2>
            <p className="text-red-700 mb-4">
              You are not authorized to access this page. Only Site Admins can upload bulk orders for their location.
            </p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="consumer">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Site Bulk Order Upload</h1>
          <p className="text-gray-600">
            Upload bulk orders for employees in your location using an Excel template.
          </p>
        </div>

        {/* Site Admin Notice */}
        {isLocationAdmin && locationInfo && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">Site Admin Restrictions</h3>
              <p className="text-sm text-blue-800">
                You are uploading as a <strong>Site Admin</strong> for <strong>{locationInfo.name}</strong>. 
                You can only place orders for employees that belong to your location. 
                Orders for employees from other locations will be rejected.
              </p>
            </div>
          </div>
        )}

        {/* Instructions Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <div className="flex items-start space-x-3 mb-4">
            <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <h3 className="font-semibold text-gray-900 mb-2">How to Upload Bulk Orders</h3>
              <ol className="list-decimal list-inside text-gray-600 space-y-1 text-sm">
                <li>Download the Excel template below</li>
                <li>Review the "Employee Reference" sheet - only employees from your location are listed</li>
                <li>Review the "Product Reference" sheet - products available based on eligibility</li>
                <li>Fill in the "Bulk Orders" sheet with Employee ID, Product Code, Size, and Quantity</li>
                <li>Upload the completed Excel file</li>
                <li>Review accepted and rejected orders, download reports if needed</li>
              </ol>
            </div>
          </div>
          <button
            onClick={downloadOrderTemplate}
            style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
            className="text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center space-x-2"
          >
            <Download className="h-5 w-5" />
            <span>Download Excel Template</span>
          </button>
        </div>

        {/* Upload Card */}
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Bulk Orders</h2>

          {!orderUploadResults && (
            <>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center mb-4">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600 mb-2">Drag and drop your Excel file here</p>
                <p className="text-gray-500 text-sm mb-4">or</p>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleOrderFileChange}
                  className="mt-4"
                />
                {orderFile && (
                  <p className="mt-4 text-sm text-gray-600">
                    Selected: <span className="font-semibold">{orderFile.name}</span>
                  </p>
                )}
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setOrderFile(null)
                    setOrderUploadResults(null)
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Clear
                </button>
                <button
                  onClick={handleOrderUpload}
                  disabled={!orderFile || orderUploading}
                  style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                  className="flex-1 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {orderUploading ? 'Processing...' : 'Upload & Process Orders'}
                </button>
              </div>
            </>
          )}

          {orderUploadResults && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Total Rows</p>
                    <p className="text-2xl font-bold text-gray-900">{orderUploadResults.summary.total}</p>
                  </div>
                  <div>
                    <p className="text-sm text-green-600">Successful</p>
                    <p className="text-2xl font-bold text-green-600">{orderUploadResults.summary.successful}</p>
                  </div>
                  <div>
                    <p className="text-sm text-red-600">Failed</p>
                    <p className="text-2xl font-bold text-red-600">{orderUploadResults.summary.failed}</p>
                  </div>
                </div>
              </div>

              {/* Accepted Orders */}
              {orderUploadResults.results.filter((r: any) => r.status === 'success').length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-green-700">Accepted Orders</h3>
                    <button
                      onClick={() => downloadResultsExcel(
                        orderUploadResults.results.filter((r: any) => r.status === 'success'),
                        'accepted'
                      )}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Download Accepted Orders
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-green-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-green-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Row</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Employee ID</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Product Code</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Size</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Qty</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Order ID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderUploadResults.results
                          .filter((r: any) => r.status === 'success')
                          .map((result: any, index: number) => (
                            <tr key={index} className="border-b bg-green-50">
                              <td className="py-2 px-4">{result.rowNumber}</td>
                              <td className="py-2 px-4 font-mono text-xs">{result.employeeId}</td>
                              <td className="py-2 px-4">{result.productCode}</td>
                              <td className="py-2 px-4">{result.size}</td>
                              <td className="py-2 px-4">{result.quantity}</td>
                              <td className="py-2 px-4 font-mono text-xs text-green-700">{result.orderId}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Rejected Orders */}
              {orderUploadResults.results.filter((r: any) => r.status === 'failed').length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold text-red-700">Rejected Orders</h3>
                    <button
                      onClick={() => downloadResultsExcel(
                        orderUploadResults.results.filter((r: any) => r.status === 'failed'),
                        'rejected'
                      )}
                      className="text-sm text-red-600 hover:text-red-800 font-medium"
                    >
                      Download Rejected Orders
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto border border-red-200 rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Row</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Employee ID</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Product Code</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Size</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Qty</th>
                          <th className="text-left py-2 px-4 font-semibold text-gray-700">Rejection Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orderUploadResults.results
                          .filter((r: any) => r.status === 'failed')
                          .map((result: any, index: number) => (
                            <tr key={index} className="border-b bg-red-50">
                              <td className="py-2 px-4">{result.rowNumber}</td>
                              <td className="py-2 px-4 font-mono text-xs">{result.employeeId}</td>
                              <td className="py-2 px-4">{result.productCode}</td>
                              <td className="py-2 px-4">{result.size}</td>
                              <td className="py-2 px-4">{result.quantity}</td>
                              <td className="py-2 px-4 text-xs text-red-700">{result.error}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setOrderUploadResults(null)
                    setOrderFile(null)
                  }}
                  className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                >
                  Upload Another File
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}

