'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { FileText, CheckCircle, Eye, X, XCircle } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getInvoicesForCompany, approveInvoice, getVendorById } from '@/lib/data-mongodb'
import { RejectionModal } from '@/components/workflow'

export default function CompanyInvoicesPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [selectedVendorDetails, setSelectedVendorDetails] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)
  // Rejection state
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rejectingInvoice, setRejectingInvoice] = useState<any>(null)
  const [rejecting, setRejecting] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getCompanyId, getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getCompanyId: () => null, getAuthData: () => null }
      
      // SECURITY FIX: No localStorage fallback
      const storedCompanyId = getCompanyId() || getAuthData('company')?.companyId || null
      
      if (storedCompanyId) {
        setCompanyId(storedCompanyId)
        const invoiceList = await getInvoicesForCompany(storedCompanyId)
        setInvoices(invoiceList)
      }
    } catch (error) {
      console.error('Error loading invoice data:', error)
      alert('Error loading data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleView = async (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowViewModal(true)
    
    // Fetch vendor details for display
    if (invoice.vendorId) {
      try {
        const vendor = await getVendorById(invoice.vendorId)
        setSelectedVendorDetails(vendor)
      } catch (error) {
        console.error('Error fetching vendor details:', error)
        setSelectedVendorDetails(null)
      }
    } else {
      setSelectedVendorDetails(null)
    }
  }

  const handleApprove = async (invoice: any) => {
    if (!confirm(`Are you sure you want to approve Invoice ${invoice.invoiceNumber}?`)) {
      return
    }

    try {
      setApproving(invoice.id)
      
      // Get company admin name/ID - fetch actual employee name
      const { getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getAuthData: () => null }
      
      const authData = getAuthData('company')
      let approvedBy = 'Company Admin' // Default fallback
      
      // Try to get employee name from database
      if (authData?.email) {
        try {
          const { getEmployeeByEmail } = await import('@/lib/data-mongodb')
          const employee = await getEmployeeByEmail(authData.email)
          if (employee) {
            // Format: "FirstName LastName" or "FirstName LastName (EmployeeID)" or just "EmployeeID"
            if (employee.firstName && employee.lastName) {
              approvedBy = `${employee.firstName} ${employee.lastName}`
            } else if (employee.firstName) {
              approvedBy = employee.firstName
            } else if (employee.employeeId) {
              approvedBy = employee.employeeId
            } else if (employee.id) {
              approvedBy = employee.id
            }
          }
        } catch (error) {
          console.warn('Could not fetch employee name, using fallback:', error)
        }
      }
      
      // Fallback to authData name/email if employee lookup failed
      if (approvedBy === 'Company Admin' && authData) {
        approvedBy = authData.name || authData.email || 'Company Admin'
      }
      
      await approveInvoice(invoice.id, approvedBy)
      
      alert('Invoice approved successfully!')
      await loadData()
      if (showViewModal && selectedInvoice?.id === invoice.id) {
        setShowViewModal(false)
        setSelectedInvoice(null)
        setSelectedVendorDetails(null)
      }
    } catch (error: any) {
      console.error('Error approving invoice:', error)
      alert(error.message || 'Error approving invoice. Please try again.')
    } finally {
      setApproving(null)
    }
  }

  const handleReject = (invoice: any) => {
    setRejectingInvoice(invoice)
    setShowRejectModal(true)
  }

  const handleConfirmReject = async (reasonCode: string, remarks?: string) => {
    if (!rejectingInvoice) return

    try {
      setRejecting(true)

      // Get user context using proper auth-storage functions
      const { getUserEmail, getCompanyId } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getUserEmail: () => null, getCompanyId: () => null }
      
      const userEmail = getUserEmail('company') || ''
      const storedCompanyId = getCompanyId() || companyId

      // Call the workflow reject API with auth headers
      const response = await fetch('/api/workflow/reject', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-company-id': storedCompanyId,
          'x-user-id': userEmail,
          'x-user-role': 'COMPANY_ADMIN',
          'x-user-name': userEmail,
        },
        body: JSON.stringify({
          entityType: 'INVOICE',
          entityId: rejectingInvoice.id,
          reasonCode,
          remarks,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.message || 'Failed to reject invoice')
      }

      alert(`Invoice rejected successfully!`)

      // Close modal and reload data
      setShowRejectModal(false)
      setRejectingInvoice(null)
      
      // Also close view modal if open
      if (showViewModal && selectedInvoice?.id === rejectingInvoice.id) {
        setShowViewModal(false)
        setSelectedInvoice(null)
        setSelectedVendorDetails(null)
      }

      await loadData()
    } catch (error: any) {
      console.error('Error rejecting invoice:', error)
      alert(`Error rejecting invoice: ${error.message || 'Unknown error'}`)
    } finally {
      setRejecting(false)
    }
  }

  const getStatusBadge = (status: string, unifiedStatus?: string) => {
    // Check unified status first (workflow status takes precedence)
    const effectiveStatus = unifiedStatus || status
    
    if (effectiveStatus === 'RAISED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          RAISED
        </span>
      )
    }
    if (effectiveStatus === 'APPROVED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          APPROVED
        </span>
      )
    }
    if (effectiveStatus === 'REJECTED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          REJECTED
        </span>
      )
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {effectiveStatus}
      </span>
    )
  }
  
  // Helper to check if invoice can have actions (not rejected or approved)
  const canTakeAction = (invoice: any) => {
    const unifiedStatus = invoice.unified_invoice_status
    const legacyStatus = invoice.invoiceStatus
    
    // If unified status exists, use it; otherwise fall back to legacy
    const effectiveStatus = unifiedStatus || legacyStatus
    
    return effectiveStatus === 'RAISED' || effectiveStatus === 'PENDING_APPROVAL'
  }

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
        </div>

        {invoices.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p>No invoices found</p>
            <p className="text-sm mt-2">Invoices raised by vendors will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GRN Number</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{invoice.invoiceNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {invoice.invoiceDate ? new Date(invoice.invoiceDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.vendorName || invoice.vendorId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.poNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.grnNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">₹{invoice.invoiceAmount?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getStatusBadge(invoice.invoiceStatus, invoice.unified_invoice_status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleView(invoice)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      {canTakeAction(invoice) && (
                        <>
                          <button
                            onClick={() => handleApprove(invoice)}
                            disabled={approving === invoice.id}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            {approving === invoice.id ? 'Approving...' : 'Approve'}
                          </button>
                          <button
                            onClick={() => handleReject(invoice)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Reject
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* View Invoice Details Modal - Compact Layout */}
        {showViewModal && selectedInvoice && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-4 border w-full max-w-3xl shadow-lg rounded-md bg-white">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedInvoice(null)
                      setSelectedVendorDetails(null)
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="space-y-3">
                  {/* Vendor Company Details - Compact Layout */}
                  <div className="bg-indigo-50 px-3 py-2 rounded border border-indigo-200">
                    <h4 className="text-xs font-semibold text-indigo-700 mb-2">Vendor Details</h4>
                    <div className="flex gap-4">
                      {/* Left: Name & Address */}
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-gray-900">{selectedVendorDetails?.name || 'N/A'}</p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {[
                            selectedVendorDetails?.address_line_1,
                            selectedVendorDetails?.address_line_2,
                            [selectedVendorDetails?.city, selectedVendorDetails?.state, selectedVendorDetails?.pincode].filter(Boolean).join(', '),
                            selectedVendorDetails?.country
                          ].filter(Boolean).join(' • ') || 'N/A'}
                        </p>
                      </div>
                      {/* Right: Registration & GST */}
                      <div className="text-right text-xs">
                        <p><span className="text-gray-500">Reg:</span> <span className="font-medium">{selectedVendorDetails?.registration_number || 'N/A'}</span></p>
                        <p><span className="text-gray-500">GST:</span> <span className="font-medium">{selectedVendorDetails?.gst_number || 'N/A'}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Invoice Details + Procurement References - Combined Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-50 px-3 py-2 rounded">
                      <h4 className="text-xs font-semibold text-gray-700 mb-1">Vendor Invoice</h4>
                      <div className="flex justify-between text-xs">
                        <div>
                          <span className="text-gray-500">Number:</span>
                          <span className="ml-1 font-semibold text-gray-900">{selectedInvoice.vendorInvoiceNumber || 'N/A'}</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Date:</span>
                          <span className="ml-1 font-medium">{selectedInvoice.vendorInvoiceDate ? new Date(selectedInvoice.vendorInvoiceDate).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-gray-50 px-3 py-2 rounded">
                      <h4 className="text-xs font-semibold text-gray-700 mb-1">Procurement References</h4>
                      <div className="grid grid-cols-2 gap-x-3 text-xs">
                        <p><span className="text-gray-500">PO:</span> <span className="font-medium text-orange-600">{selectedInvoice.poNumber || 'N/A'}</span></p>
                        <p><span className="text-gray-500">GRN:</span> <span className="font-medium">{selectedInvoice.grnNumber}</span></p>
                        <p><span className="text-gray-500">PR:</span> <span className="font-medium">{selectedInvoice.prNumbers?.length > 0 ? selectedInvoice.prNumbers.join(', ') : 'N/A'}</span></p>
                        <p><span className="text-gray-500">Approved:</span> <span className="font-medium">{selectedInvoice.grnApprovedDate ? new Date(selectedInvoice.grnApprovedDate).toLocaleDateString() : 'N/A'}</span></p>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Items - Compact Table */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-700 mb-1">Invoice Items</h4>
                    <div className="overflow-x-auto border rounded">
                      <table className="min-w-full divide-y divide-gray-200 text-xs">
                        <thead className="bg-gray-100">
                          <tr>
                            <th className="px-2 py-1.5 text-left font-medium text-gray-600 uppercase">Code</th>
                            <th className="px-2 py-1.5 text-left font-medium text-gray-600 uppercase">Product</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600 uppercase">Size</th>
                            <th className="px-2 py-1.5 text-center font-medium text-gray-600 uppercase">Qty</th>
                            <th className="px-2 py-1.5 text-right font-medium text-gray-600 uppercase">Price</th>
                            <th className="px-2 py-1.5 text-right font-medium text-gray-600 uppercase">Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-100">
                          {selectedInvoice.invoiceItems && selectedInvoice.invoiceItems.length > 0 ? (
                            selectedInvoice.invoiceItems.map((item: any, index: number) => (
                              <tr key={index}>
                                <td className="px-2 py-1.5 text-gray-900">{item.productCode}</td>
                                <td className="px-2 py-1.5 text-gray-600">{item.productName || 'N/A'}</td>
                                <td className="px-2 py-1.5 text-center text-gray-600">{item.size || '-'}</td>
                                <td className="px-2 py-1.5 text-center text-gray-600">{item.quantity || 0}</td>
                                <td className="px-2 py-1.5 text-right text-gray-600">₹{item.unitPrice?.toFixed(2) || '0.00'}</td>
                                <td className="px-2 py-1.5 text-right font-medium text-gray-900">₹{item.lineTotal?.toFixed(2) || '0.00'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-2 py-3 text-gray-500 text-center">No items found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Total Amount - Compact */}
                  <div className="flex justify-end items-center pt-2 border-t border-gray-200">
                    <span className="text-sm text-gray-600 mr-3">Total Invoice Amount:</span>
                    <span className="text-lg font-bold text-gray-900">₹{selectedInvoice.invoiceAmount?.toFixed(2) || '0.00'}</span>
                  </div>

                  {/* Vendor Bank Details - Single Row Layout */}
                  {selectedVendorDetails && (selectedVendorDetails.bank_name || selectedVendorDetails.account_number || selectedVendorDetails.ifsc_code) && (
                    <div className="bg-green-50 px-3 py-2 rounded border border-green-200">
                      <h4 className="text-xs font-semibold text-green-800 mb-1">Bank Details for Payment</h4>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs">
                        {selectedVendorDetails.bank_name && (
                          <span><span className="text-gray-500">Bank:</span> <span className="font-medium">{selectedVendorDetails.bank_name}</span></span>
                        )}
                        {selectedVendorDetails.ifsc_code && (
                          <span><span className="text-gray-500">IFSC:</span> <span className="font-medium">{selectedVendorDetails.ifsc_code}</span></span>
                        )}
                        {selectedVendorDetails.account_number && (
                          <span><span className="text-gray-500">A/C:</span> <span className="font-medium">{selectedVendorDetails.account_number}</span></span>
                        )}
                        {selectedVendorDetails.branch_address && (
                          <span><span className="text-gray-500">Branch:</span> <span className="font-medium">{selectedVendorDetails.branch_address}</span></span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status - Compact */}
                  <div className="flex items-center justify-between text-xs pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">Status:</span>
                      {getStatusBadge(selectedInvoice.invoiceStatus, selectedInvoice.unified_invoice_status)}
                      {selectedInvoice.approvedAt && (selectedInvoice.invoiceStatus === 'APPROVED' || selectedInvoice.unified_invoice_status === 'APPROVED') && (
                        <span className="text-gray-500 ml-2">
                          by {selectedInvoice.approvedBy || 'N/A'} on {new Date(selectedInvoice.approvedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    {selectedInvoice.remarks && (
                      <span className="text-gray-500"><span className="font-medium">Remarks:</span> {selectedInvoice.remarks}</span>
                    )}
                  </div>

                  {/* Rejection Details - Compact */}
                  {(selectedInvoice.unified_invoice_status === 'REJECTED' || selectedInvoice.invoiceStatus === 'REJECTED') && (
                    <div className="bg-red-50 px-3 py-2 rounded border border-red-200 text-xs">
                      <div className="flex flex-wrap gap-x-4 gap-y-1">
                        {selectedInvoice.rejectionReasonCode && (
                          <span><span className="text-gray-500">Reason:</span> <span className="font-medium text-red-800">{selectedInvoice.rejectionReasonLabel || selectedInvoice.rejectionReasonCode}</span></span>
                        )}
                        {selectedInvoice.rejectedAt && (
                          <span><span className="text-gray-500">Date:</span> <span className="font-medium">{new Date(selectedInvoice.rejectedAt).toLocaleDateString()}</span></span>
                        )}
                        {selectedInvoice.rejectedBy && (
                          <span><span className="text-gray-500">By:</span> <span className="font-medium">{selectedInvoice.rejectedBy}</span></span>
                        )}
                      </div>
                      {selectedInvoice.rejectionRemarks && (
                        <p className="mt-1 text-gray-700">{selectedInvoice.rejectionRemarks}</p>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Computer-generated notice */}
                <p className="text-center text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                  This is a computer-generated invoice and does not require a signature.
                </p>
                
                <div className="mt-3 flex justify-end space-x-3">
                  {canTakeAction(selectedInvoice) && (
                    <>
                      <button
                        onClick={() => handleApprove(selectedInvoice)}
                        disabled={approving === selectedInvoice.id}
                        className="px-4 py-1.5 border border-transparent rounded text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                      >
                        {approving === selectedInvoice.id ? 'Approving...' : 'Approve Invoice'}
                      </button>
                      <button
                        onClick={() => handleReject(selectedInvoice)}
                        className="px-4 py-1.5 border border-transparent rounded text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                      >
                        Reject Invoice
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedInvoice(null)
                      setSelectedVendorDetails(null)
                    }}
                    className="px-4 py-1.5 border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rejection Modal */}
        <RejectionModal
          isOpen={showRejectModal}
          onClose={() => {
            setShowRejectModal(false)
            setRejectingInvoice(null)
          }}
          onConfirm={handleConfirmReject}
          entityDisplayId={rejectingInvoice?.invoiceNumber || rejectingInvoice?.id || ''}
          entityType="Invoice"
          isLoading={rejecting}
          allowedReasonCodes={[
            { code: 'INCORRECT_AMOUNT', label: 'Incorrect Amount' },
            { code: 'MISSING_DOCUMENTS', label: 'Missing Documents' },
            { code: 'GRN_MISMATCH', label: 'GRN Mismatch' },
            { code: 'PO_MISMATCH', label: 'PO Mismatch' },
            { code: 'DUPLICATE_INVOICE', label: 'Duplicate Invoice' },
            { code: 'VENDOR_ISSUE', label: 'Vendor Issue' },
            { code: 'QUALITY_ISSUE', label: 'Quality Issue' },
            { code: 'PRICING_DISCREPANCY', label: 'Pricing Discrepancy' },
            { code: 'TAX_CALCULATION_ERROR', label: 'Tax Calculation Error' },
            { code: 'OTHER', label: 'Other' },
          ]}
          isReasonMandatory={true}
        />
      </div>
    </DashboardLayout>
  )
}

