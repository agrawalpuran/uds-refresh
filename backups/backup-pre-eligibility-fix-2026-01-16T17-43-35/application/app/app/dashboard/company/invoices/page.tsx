'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { FileText, CheckCircle, Eye, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getInvoicesForCompany, approveInvoice } from '@/lib/data-mongodb'

export default function CompanyInvoicesPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [showViewModal, setShowViewModal] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getCompanyId, getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getCompanyId: () => null, getAuthData: () => null }
      
      let storedCompanyId = getCompanyId() || getAuthData('company')?.companyId || null
      
      if (!storedCompanyId) {
        storedCompanyId = typeof window !== 'undefined' ? localStorage.getItem('companyId') : null
      }
      
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

  const handleView = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowViewModal(true)
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
      }
    } catch (error: any) {
      console.error('Error approving invoice:', error)
      alert(error.message || 'Error approving invoice. Please try again.')
    } finally {
      setApproving(null)
    }
  }

  const getStatusBadge = (status: string) => {
    if (status === 'RAISED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          RAISED
        </span>
      )
    }
    if (status === 'APPROVED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          APPROVED
        </span>
      )
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {status}
      </span>
    )
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
                      {getStatusBadge(invoice.invoiceStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleView(invoice)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      {invoice.invoiceStatus === 'RAISED' && (
                        <button
                          onClick={() => handleApprove(invoice)}
                          disabled={approving === invoice.id}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {approving === invoice.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* View Invoice Details Modal */}
        {showViewModal && selectedInvoice && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Invoice Details</h3>
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedInvoice(null)
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* System Invoice Details (Internal to UDS) */}
                  <div className="bg-blue-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">System Invoice Details (Internal)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">System Invoice Number</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedInvoice.invoiceNumber || 'N/A'}</p>
                        <p className="mt-1 text-xs text-gray-500">Auto-generated by UDS</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">System Invoice Date</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedInvoice.invoiceDate ? new Date(selectedInvoice.invoiceDate).toLocaleDateString() : 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">Auto-generated by UDS</p>
                      </div>
                    </div>
                  </div>

                  {/* Vendor Invoice Details */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Vendor Invoice Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor Invoice Number</label>
                        <p className="mt-1 text-sm text-gray-900 font-medium">{selectedInvoice.vendorInvoiceNumber || 'N/A'}</p>
                        <p className="mt-1 text-xs text-gray-500">Provided by vendor</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor Invoice Date</label>
                        <p className="mt-1 text-sm text-gray-900 font-medium">
                          {selectedInvoice.vendorInvoiceDate ? new Date(selectedInvoice.vendorInvoiceDate).toLocaleDateString() : 'N/A'}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">Provided by vendor</p>
                      </div>
                    </div>
                  </div>

                  {/* Status and Amount */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="mt-1">{getStatusBadge(selectedInvoice.invoiceStatus)}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Invoice Amount</label>
                      <p className="mt-1 text-sm text-gray-900 font-medium">₹{selectedInvoice.invoiceAmount?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>

                  {/* Procurement References */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Procurement References</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="block text-gray-600">PO Number</label>
                        <p className="mt-1 text-gray-900 font-medium">{selectedInvoice.poNumber}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600">GRN Number</label>
                        <p className="mt-1 text-gray-900 font-medium">{selectedInvoice.grnNumber}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600">PR Number(s)</label>
                        <p className="mt-1 text-gray-900 font-medium">
                          {selectedInvoice.prNumbers && selectedInvoice.prNumbers.length > 0 
                            ? selectedInvoice.prNumbers.join(', ') 
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-gray-600">GRN Approved Date</label>
                        <p className="mt-1 text-gray-900 font-medium">
                          {selectedInvoice.grnApprovedDate ? new Date(selectedInvoice.grnApprovedDate).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Items */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Items</label>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Code</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Name</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedInvoice.invoiceItems && selectedInvoice.invoiceItems.length > 0 ? (
                            selectedInvoice.invoiceItems.map((item: any, index: number) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-sm text-gray-900">{item.productCode}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.productName || 'N/A'}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.size || '-'}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.quantity}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">₹{item.unitPrice?.toFixed(2) || '0.00'}</td>
                                <td className="px-4 py-2 text-sm text-gray-900 font-medium">₹{item.lineTotal?.toFixed(2) || '0.00'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={6} className="px-4 py-4 text-sm text-gray-500 text-center">No items found</td>
                            </tr>
                          )}
                        </tbody>
                        {selectedInvoice.taxAmount && selectedInvoice.taxAmount > 0 && (
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={5} className="px-4 py-2 text-sm text-right font-medium text-gray-700">Tax / Additional Charges:</td>
                              <td className="px-4 py-2 text-sm text-gray-900 font-medium">₹{selectedInvoice.taxAmount.toFixed(2)}</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>

                  {selectedInvoice.remarks && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Remarks</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedInvoice.remarks}</p>
                    </div>
                  )}

                  {selectedInvoice.approvedAt && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Approved Date</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {new Date(selectedInvoice.approvedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Approved By</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedInvoice.approvedBy || 'N/A'}</p>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  {selectedInvoice.invoiceStatus === 'RAISED' && (
                    <button
                      onClick={() => handleApprove(selectedInvoice)}
                      disabled={approving === selectedInvoice.id}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {approving === selectedInvoice.id ? 'Approving...' : 'Approve Invoice'}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedInvoice(null)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}

