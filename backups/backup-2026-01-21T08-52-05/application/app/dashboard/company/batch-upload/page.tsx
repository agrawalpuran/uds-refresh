'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Upload, Download, FileText, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { getCompanyById, getBranchByAdminEmail, getCompanyByAdminEmail, getLocationByAdminEmail } from '@/lib/data-mongodb'

export default function BatchUploadPage() {
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [isBranchAdmin, setIsBranchAdmin] = useState<boolean>(false)
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState<boolean>(false)
  const [branchInfo, setBranchInfo] = useState<any>(null)
  const [locationInfo, setLocationInfo] = useState<any>(null)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadUserInfo = async () => {
        // Use auth-storage utility to get email for company actor type
        const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage
        const userEmail = getUserEmail('company')
        const storedCompanyId = getCompanyId() || localStorage.getItem('companyId')
        
        if (userEmail) {
          // Normalize email (trim and lowercase)
          const normalizedEmail = userEmail.trim().toLowerCase()
          
          // Check if user is Branch Admin, Location Admin, or Company Admin
          const [branch, location, company] = await Promise.all([
            getBranchByAdminEmail(normalizedEmail),
            getLocationByAdminEmail(normalizedEmail),
            getCompanyByAdminEmail(normalizedEmail)
          ])
          
          setIsBranchAdmin(!!branch)
          setIsLocationAdmin(!!location)
          setIsCompanyAdmin(!!company)
          setBranchInfo(branch)
          setLocationInfo(location)
          
          // Get company for colors
          const targetCompanyId = branch?.companyId?.id || branch?.companyId || location?.companyId?.id || location?.companyId || storedCompanyId || company?.id
          if (targetCompanyId) {
            setCompanyId(targetCompanyId)
            const companyDetails = await getCompanyById(targetCompanyId)
            if (companyDetails) {
              setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
              setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
            }
          }
        } else if (storedCompanyId) {
          const companyDetails = await getCompanyById(storedCompanyId)
          if (companyDetails) {
            setCompanyPrimaryColor(companyDetails.primaryColor || '#f76b1c')
            setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || '#f76b1c')
          }
        }
      }
      loadUserInfo()
    }
  }, [])
  const [orderFile, setOrderFile] = useState<File | null>(null)
  const [orderUploaded, setOrderUploaded] = useState(false)
  const [orderUploading, setOrderUploading] = useState(false)
  const [orderUploadResults, setOrderUploadResults] = useState<any>(null)
  const [companyId, setCompanyId] = useState<string>('')

  const handleOrderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      // Validate file type
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        alert('Please select an Excel file (.xlsx or .xls)')
        return
      }
      setOrderFile(file)
      setOrderUploaded(false)
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

      // Get user email and company ID using auth-storage utility
      const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
      
      console.log('[handleOrderUpload] Checking access...')
      console.log('[handleOrderUpload] userEmail from storage:', userEmail)
      console.log('[handleOrderUpload] isCompanyAdmin state:', isCompanyAdmin)
      
      if (!userEmail) {
        alert('User email not found. Please log in again.')
        setOrderUploading(false)
        return
      }

      // Normalize email (trim and lowercase)
      const normalizedEmail = userEmail.trim().toLowerCase()
      console.log('[handleOrderUpload] normalizedEmail:', normalizedEmail)

      // Determine company ID
      const targetCompanyId = companyId || getCompanyId() || localStorage.getItem('companyId')
      console.log('[handleOrderUpload] targetCompanyId:', targetCompanyId)
      
      if (!targetCompanyId) {
        alert('Company information not found')
        setOrderUploading(false)
        return
      }

      // Double-check admin status before proceeding
      if (!isCompanyAdmin) {
        // Try to verify admin status one more time
        const { getCompanyByAdminEmail } = await import('@/lib/data-mongodb')
        const company = await getCompanyByAdminEmail(normalizedEmail)
        console.log('[handleOrderUpload] Re-checking admin status, company:', company)
        
        if (!company) {
          alert('Access denied: Only Company Admins can upload bulk orders. Please ensure you are logged in as a company administrator.')
          setOrderUploading(false)
          return
        }
      }

      // Import upload function
      const { uploadBulkOrdersExcel } = await import('@/lib/data-mongodb')
      console.log('[handleOrderUpload] Calling uploadBulkOrdersExcel...')
      
      // Upload Excel file (use normalized email)
      const data = await uploadBulkOrdersExcel(orderFile, targetCompanyId, normalizedEmail)
      console.log('[handleOrderUpload] Upload completed, results:', data)

      setOrderUploadResults(data)
      setOrderUploaded(true)
    } catch (error: any) {
      console.error('Error uploading bulk orders:', error)
      alert(`Error processing file: ${error.message || 'Unknown error'}`)
    } finally {
      setOrderUploading(false)
    }
  }

  const downloadTemplate = () => {
    const csvContent = `First Name,Last Name,Designation,Gender,Location,Email,Mobile,Shirt Size,Pant Size,Shoe Size,Address,Dispatch Preference,Status,Date of Joining,Shirt Cycle (months),Pant Cycle (months),Shoe Cycle (months),Jacket Cycle (months)
John,Doe,Software Engineer,Male,New York Office,john.doe@company.com,+1234567890,L,32,10,123 Main St New York NY 10001,direct,active,2025-10-01,6,6,6,12
Jane,Smith,Product Manager,Female,San Francisco Office,jane.smith@company.com,+1234567891,M,28,7,456 Market St San Francisco CA 94102,regional,active,2025-10-01,6,6,6,12`
    
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employee_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const downloadOrderTemplate = async () => {
    try {
      // Get user email and company ID using auth-storage utility
      const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
      // CRITICAL SECURITY FIX: Use only tab-specific auth storage
      const userEmail = getUserEmail('company')
      
      console.log('[downloadOrderTemplate] Checking access...')
      console.log('[downloadOrderTemplate] userEmail from storage:', userEmail)
      console.log('[downloadOrderTemplate] isCompanyAdmin state:', isCompanyAdmin)
      
      if (!userEmail) {
        alert('User email not found. Please log in again.')
        return
      }

      // Normalize email (trim and lowercase)
      const normalizedEmail = userEmail.trim().toLowerCase()
      console.log('[downloadOrderTemplate] normalizedEmail:', normalizedEmail)

      const targetCompanyId = companyId || getCompanyId() || localStorage.getItem('companyId')
      console.log('[downloadOrderTemplate] targetCompanyId:', targetCompanyId)
      
      if (!targetCompanyId) {
        alert('Company information not found')
        return
      }

      // Double-check admin status before proceeding
      if (!isCompanyAdmin) {
        // Try to verify admin status one more time
        const { getCompanyByAdminEmail } = await import('@/lib/data-mongodb')
        const company = await getCompanyByAdminEmail(normalizedEmail)
        console.log('[downloadOrderTemplate] Re-checking admin status, company:', company)
        
        if (!company) {
          alert('Access denied: Only Company Admins can download bulk order templates. Please ensure you are logged in as a company administrator.')
          return
        }
      }

      // Import download function
      const { downloadBulkOrderTemplate } = await import('@/lib/data-mongodb')
      console.log('[downloadOrderTemplate] Calling downloadBulkOrderTemplate...')
      await downloadBulkOrderTemplate(targetCompanyId, normalizedEmail)
      console.log('[downloadOrderTemplate] Template download initiated')
    } catch (error: any) {
      console.error('Error downloading template:', error)
      alert(`Error downloading template: ${error.message || 'Unknown error'}`)
    }
  }

  const downloadResultsExcel = (results: any[], type: 'accepted' | 'rejected') => {
    try {
      // Import xlsx
      import('xlsx').then((XLSX) => {
        const data = results.map((r: any) => ({
          'Row Number': r.rowNumber,
          'Employee ID': r.employeeId,
          'Product Code': r.productCode || r.productId,
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
        a.download = `bulk_orders_${type}_${Date.now()}.xlsx`
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

  return (
    <DashboardLayout actorType="company">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Bulk Order Upload</h1>
        
        {/* Branch Admin Notice */}
        {isBranchAdmin && branchInfo && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">Branch Admin Restrictions</h3>
              <p className="text-sm text-blue-800">
                You are uploading as a <strong>Branch Admin</strong> for <strong>{branchInfo.name}</strong>. 
                You can only upload employees that belong to your branch. Employees uploaded must be assigned to this branch.
              </p>
            </div>
          </div>
        )}

        {/* Location Admin (Site Admin) Notice */}
        {isLocationAdmin && locationInfo && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">Site Admin Restrictions</h3>
              <p className="text-sm text-blue-800">
                You are uploading as a <strong>Site Admin</strong> for <strong>{locationInfo.name}</strong>. 
                You can only upload employees that belong to your location. Employees uploaded must be assigned to this location.
              </p>
            </div>
          </div>
        )}

        {/* Bulk Order Section */}
        <div>
          
          {/* Company Admin Only Notice */}
          {!isCompanyAdmin && (
            <div className="mb-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-yellow-900 mb-1">Access Restricted</h3>
                <p className="text-sm text-yellow-800">
                  Bulk Order Upload via Excel is available only to <strong>Company Admins</strong>. 
                  Please contact your administrator for access.
                </p>
              </div>
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-8">
            {/* Upload Section */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Upload Bulk Orders</h2>
              
              <div className="mb-6">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  {orderFile ? (
                    <div>
                      <FileText className="h-8 w-8 text-green-600 mx-auto mb-2" />
                      <p className="text-gray-900 font-semibold">{orderFile.name}</p>
                      <p className="text-gray-600 text-sm">{(orderFile.size / 1024).toFixed(2)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-gray-600 mb-2">Drag and drop your Excel file here</p>
                      <p className="text-gray-500 text-sm mb-4">or</p>
                      <label className="inline-block bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors cursor-pointer">
                        Browse Files
                        <input
                          type="file"
                          accept=".xlsx,.xls"
                          onChange={handleOrderFileChange}
                          className="hidden"
                        />
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {orderFile && !orderUploaded && !orderUploadResults && (
                <button
                  onClick={handleOrderUpload}
                  disabled={orderUploading}
                  className="w-full text-white py-3 rounded-lg font-semibold transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
                  style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                >
                  {orderUploading ? 'Processing...' : 'Upload and Process Orders'}
                </button>
              )}

              {orderUploadResults && (
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Upload Summary</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <div>
                        <p className="text-sm text-gray-600">Total Rows</p>
                        <p className="text-2xl font-bold text-gray-900">{orderUploadResults.summary?.total || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-green-600">Successful</p>
                        <p className="text-2xl font-bold text-green-600">{orderUploadResults.summary?.successful || 0}</p>
                      </div>
                      <div>
                        <p className="text-sm text-red-600">Failed</p>
                        <p className="text-2xl font-bold text-red-600">{orderUploadResults.summary?.failed || 0}</p>
                      </div>
                    </div>
                    <div className="flex space-x-2">
                      <button
                        onClick={() => {
                          const accepted = orderUploadResults.results.filter((r: any) => r.status === 'success')
                          if (accepted.length === 0) {
                            alert('No accepted orders to download')
                            return
                          }
                          downloadResultsExcel(accepted, 'accepted')
                        }}
                        className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download Accepted ({orderUploadResults.summary?.successful || 0})</span>
                      </button>
                      <button
                        onClick={() => {
                          const rejected = orderUploadResults.results.filter((r: any) => r.status === 'failed')
                          if (rejected.length === 0) {
                            alert('No rejected orders to download')
                            return
                          }
                          downloadResultsExcel(rejected, 'rejected')
                        }}
                        className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-colors flex items-center justify-center space-x-2"
                      >
                        <Download className="h-4 w-4" />
                        <span>Download Rejected ({orderUploadResults.summary?.failed || 0})</span>
                      </button>
                    </div>
                  </div>

                  {orderUploadResults.results && orderUploadResults.results.length > 0 && (
                    <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 sticky top-0">
                          <tr>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Row</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Employee ID</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Product Code</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Size</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Qty</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Status</th>
                            <th className="text-left py-2 px-4 font-semibold text-gray-700">Result</th>
                          </tr>
                        </thead>
                        <tbody>
                          {orderUploadResults.results.map((result: any, idx: number) => (
                            <tr key={idx} className={result.status === 'success' ? 'bg-green-50' : 'bg-red-50'}>
                              <td className="py-2 px-4">{result.rowNumber}</td>
                              <td className="py-2 px-4">{result.employeeId}</td>
                              <td className="py-2 px-4 font-mono text-xs">{result.productCode || result.productId}</td>
                              <td className="py-2 px-4">{result.size || 'N/A'}</td>
                              <td className="py-2 px-4">{result.quantity}</td>
                              <td className="py-2 px-4">
                                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                  result.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                }`}>
                                  {result.status}
                                </span>
                              </td>
                              <td className="py-2 px-4">
                                {result.status === 'success' ? (
                                  <span className="text-green-700 font-mono text-xs">Order: {result.orderId}</span>
                                ) : (
                                  <span className="text-red-700 text-xs">{result.error}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Instructions Section */}
            <div className="bg-white rounded-xl shadow-lg p-8">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Instructions</h2>
              
              <div className="space-y-4 mb-6">
                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Excel Template Structure:</h3>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li><strong>Sheet 1: Employee Reference</strong> (Read-only) - Lists all active employees</li>
                    <li><strong>Sheet 2: Product Reference</strong> (Read-only) - Lists all eligible products</li>
                    <li><strong>Sheet 3: Bulk Orders</strong> (Input) - Enter orders here</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Required Columns (Bulk Orders sheet):</h3>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li><strong>Employee ID</strong> - Must match an ID from Employee Reference sheet</li>
                    <li><strong>Product Code</strong> - Must match Product Code from Product Reference sheet (readable ID)</li>
                    <li><strong>Size</strong> - REQUIRED. Must be one of the supported sizes listed in Product Reference sheet</li>
                    <li><strong>Quantity</strong> - Number of items (must be &gt; 0)</li>
                    <li><strong>Shipping Location</strong> - Optional, defaults to employee's dispatch preference</li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Important Notes:</h3>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li>Only products eligible for the employee's designation will be accepted</li>
                    <li>If no eligibility is defined for a designation, no products can be ordered</li>
                    <li>Each employee will receive a separate order</li>
                    <li>Multiple products per employee are allowed in the same order</li>
                    <li>Orders will be created with status "Awaiting approval"</li>
                    <li>Eligibility is validated based on subcategory-level rules</li>
                    <li className="text-blue-700 font-semibold">
                      Only Company Admins can use this feature
                    </li>
                  </ul>
                </div>

                <div>
                  <h3 className="font-semibold text-gray-900 mb-2">Validation Rules:</h3>
                  <ul className="list-disc list-inside text-gray-600 space-y-1 text-sm">
                    <li>Employee must exist and be active</li>
                    <li>Employee must have a designation with eligibility configured</li>
                    <li>Product Code must match a valid product from Product Reference sheet</li>
                    <li><strong>Size must be supported by the product</strong> - Orders with unsupported sizes will be rejected</li>
                    <li>Product must be mapped to an eligible subcategory</li>
                    <li>Quantity must not exceed subcategory eligibility limits</li>
                  </ul>
                </div>
              </div>

              <button
                onClick={downloadOrderTemplate}
                className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2"
              >
                <Download className="h-5 w-5" />
                <span>Download Template</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}











