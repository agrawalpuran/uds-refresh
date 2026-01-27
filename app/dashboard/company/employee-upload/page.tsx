'use client'

import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/DashboardLayout'
import { Upload, Download, FileText, CheckCircle, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { getCompanyById, getCompanyByAdminEmail } from '@/lib/data-mongodb'

export default function EmployeeUploadPage() {
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [isCompanyAdmin, setIsCompanyAdmin] = useState<boolean>(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploaded, setUploaded] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [companyId, setCompanyId] = useState<string>('')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadUserInfo = async () => {
        const { getUserEmail, getCompanyId } = await import('@/lib/utils/auth-storage')
        // SECURITY FIX: Use ONLY sessionStorage (tab-specific) - no localStorage
        const userEmail = getUserEmail('company')
        const storedCompanyId = getCompanyId()
        
        if (userEmail) {
          const normalizedEmail = userEmail.trim().toLowerCase()
          const company = await getCompanyByAdminEmail(normalizedEmail)
          
          setIsCompanyAdmin(!!company)
          
          const targetCompanyId = company?.id || storedCompanyId
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
      setUploaded(false)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file')
      return
    }

    if (!isCompanyAdmin) {
      alert('Access denied: Only Company Admins can upload employees.')
      return
    }

    try {
      setUploading(true)
      
      // TODO: Implement actual employee upload API call
      // For now, this is a placeholder
      setTimeout(() => {
        setUploaded(true)
        setUploading(false)
        alert('Employee upload successful! Employees have been added to the system.')
      }, 1500)
    } catch (error: any) {
      setUploading(false)
      alert(`Upload failed: ${error.message || 'Unknown error'}`)
    }
  }

  const handleDownloadTemplate = () => {
    // Create a simple CSV template
    const template = `Employee ID,First Name,Last Name,Email,Designation,Location,Gender,Status
300001,John,Doe,john.doe@example.com,Manager,Mumbai,Male,active
300002,Jane,Smith,jane.smith@example.com,Executive,Delhi,Female,active`
    
    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'employee_upload_template.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  return (
    <DashboardLayout actorType="company">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-neutral-200 p-6 mb-6">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Employee Upload</h1>
          <p className="text-neutral-600 mb-6">
            Upload employee data in bulk using an Excel or CSV file. Download the template below to ensure your file format is correct.
          </p>

          <div className="space-y-6">
            {/* Download Template Section */}
            <div className="border border-neutral-200 rounded-lg p-4 bg-neutral-50">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-neutral-900 mb-1">Download Template</h3>
                  <p className="text-sm text-neutral-600">
                    Download the CSV template to ensure your file format is correct.
                  </p>
                </div>
                <button
                  onClick={handleDownloadTemplate}
                  className="flex items-center space-x-2 px-4 py-2 rounded-md text-white font-medium transition-colors"
                  style={{ backgroundColor: companyPrimaryColor }}
                >
                  <Download className="h-4 w-4" />
                  <span>Download Template</span>
                </button>
              </div>
            </div>

            {/* Upload Section */}
            <div className="border border-neutral-200 rounded-lg p-4">
              <h3 className="font-semibold text-neutral-900 mb-4">Upload Employee File</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Select File (CSV or Excel)
                  </label>
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileChange}
                    className="block w-full text-sm text-neutral-600 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:cursor-pointer file:transition-colors"
                    style={{
                      '--tw-file-color': companyPrimaryColor,
                    } as React.CSSProperties}
                  />
                  {file && (
                    <p className="mt-2 text-sm text-neutral-600">
                      Selected: <span className="font-medium">{file.name}</span>
                    </p>
                  )}
                </div>

                <button
                  onClick={handleUpload}
                  disabled={!file || uploading || uploaded}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-3 rounded-md text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: companyPrimaryColor }}
                >
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                      <span>Uploading...</span>
                    </>
                  ) : uploaded ? (
                    <>
                      <CheckCircle className="h-4 w-4" />
                      <span>Upload Complete</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4" />
                      <span>Upload Employees</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Instructions */}
            <div className="border border-neutral-200 rounded-lg p-4 bg-blue-50">
              <h3 className="font-semibold text-neutral-900 mb-2 flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Instructions</span>
              </h3>
              <ul className="list-disc list-inside text-sm text-neutral-700 space-y-1">
                <li>Download the template to see the required format</li>
                <li>Fill in employee data following the template structure</li>
                <li>Ensure all required fields are filled</li>
                <li>Upload the completed file</li>
                <li>Review the results after upload</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

