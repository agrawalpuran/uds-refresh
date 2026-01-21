'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Package, FileText, Plus, Eye, X, Receipt } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getPOsEligibleForGRN, getGRNsByVendor, createGRNByVendor, createInvoiceByVendor, getInvoicesByVendor, getProductsByVendor, getVendorById } from '@/lib/data-mongodb'
import Link from 'next/link'

export default function VendorGRNPage() {
  const [vendorId, setVendorId] = useState<string>('')
  const [activeTab, setActiveTab] = useState<'eligible' | 'my-grns' | 'my-invoices'>('eligible')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [selectedVendorDetails, setSelectedVendorDetails] = useState<any>(null)
  const [showInvoiceViewModal, setShowInvoiceViewModal] = useState(false)
  const [eligiblePOs, setEligiblePOs] = useState<any[]>([])
  const [myGRNs, setMyGRNs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [selectedPO, setSelectedPO] = useState<any>(null)
  const [grnNumber, setGrnNumber] = useState('')
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split('T')[0])
  const [remarks, setRemarks] = useState('')
  const [creating, setCreating] = useState(false)
  const [showViewModal, setShowViewModal] = useState(false)
  const [selectedGRN, setSelectedGRN] = useState<any>(null)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [invoiceNumber, setInvoiceNumber] = useState('') // System-generated (read-only)
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]) // System-generated (read-only)
  const [vendorInvoiceNumber, setVendorInvoiceNumber] = useState('') // Vendor-provided (required, editable)
  const [vendorInvoiceDate, setVendorInvoiceDate] = useState(new Date().toISOString().split('T')[0]) // Vendor-provided (required, editable)
  const [invoiceAmount, setInvoiceAmount] = useState(0)
  const [invoiceRemarks, setInvoiceRemarks] = useState('')
  const [creatingInvoice, setCreatingInvoice] = useState(false)
  const [invoices, setInvoices] = useState<any[]>([])
  const [calculatingAmount, setCalculatingAmount] = useState(false)
  const [invoiceItemsWithPrices, setInvoiceItemsWithPrices] = useState<any[]>([])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const { getVendorId, getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getVendorId: () => null, getAuthData: () => null }
      
      let storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      
      if (!storedVendorId) {
        storedVendorId = typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null
      }
      
      if (storedVendorId) {
        setVendorId(storedVendorId)
        const [eligible, grns, invoiceList] = await Promise.all([
          getPOsEligibleForGRN(storedVendorId),
          getGRNsByVendor(storedVendorId),
          getInvoicesByVendor(storedVendorId).catch(() => []) // Fetch invoices to check if invoice exists for GRN
        ])
        setEligiblePOs(eligible)
        setMyGRNs(grns)
        setInvoices(invoiceList)
      }
    } catch (error) {
      console.error('Error loading GRN data:', error)
      alert('Error loading data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateGRN = (po: any) => {
    setSelectedPO(po)
    setGrnNumber('')
    setGrnDate(new Date().toISOString().split('T')[0])
    setRemarks('')
    setShowCreateModal(true)
  }

  const handleSubmitGRN = async () => {
    if (!selectedPO || !grnNumber.trim() || !grnDate) {
      alert('Please fill in all required fields')
      return
    }

    try {
      setCreating(true)
      await createGRNByVendor(
        selectedPO.poNumber,
        grnNumber.trim(),
        new Date(grnDate),
        vendorId,
        remarks.trim() || undefined
      )
      
      alert('GRN created successfully!')
      setShowCreateModal(false)
      await loadData()
      setActiveTab('my-grns')
    } catch (error: any) {
      console.error('Error creating GRN:', error)
      alert(error.message || 'Error creating GRN. Please try again.')
    } finally {
      setCreating(false)
    }
  }

  const handleRaiseInvoice = async (grn: any) => {
    setSelectedGRN(grn)
    setCalculatingAmount(true)
    
    try {
      // Auto-populate system-generated invoice number and date (read-only)
      setInvoiceNumber(`INV-${grn.grnNumber}-${Date.now().toString().slice(-6)}`)
      setInvoiceDate(new Date().toISOString().split('T')[0])
      
      // Initialize vendor-provided fields (editable, required)
      setVendorInvoiceNumber('')
      setVendorInvoiceDate(new Date().toISOString().split('T')[0])
      setInvoiceRemarks('')
      
      // Fetch vendor products to get prices
      const vendorProducts = await getProductsByVendor(vendorId)
      const productPriceMap = new Map(
        vendorProducts.map((p: any) => [p.productId || p.id, p.price || 0])
      )
      
      // Calculate invoice items with prices
      const itemsWithPrices: any[] = []
      let totalAmount = 0
      
      if (grn.items && grn.items.length > 0) {
        for (const item of grn.items) {
          const quantity = item.deliveredQuantity || item.orderedQuantity || 0
          const unitPrice = productPriceMap.get(item.productCode) || 0
          const lineTotal = quantity * unitPrice
          
          itemsWithPrices.push({
            ...item,
            quantity,
            unitPrice,
            lineTotal
          })
          
          totalAmount += lineTotal
        }
      }
      
      setInvoiceItemsWithPrices(itemsWithPrices)
      setInvoiceAmount(totalAmount)
    } catch (error: any) {
      console.error('Error calculating invoice amount:', error)
      // Still allow invoice creation, backend will calculate
      setInvoiceAmount(0)
      setInvoiceItemsWithPrices(grn.items || [])
    } finally {
      setCalculatingAmount(false)
      setShowInvoiceModal(true)
    }
  }

  const handleSubmitInvoice = async () => {
    if (!selectedGRN || !invoiceNumber.trim() || !invoiceDate || invoiceAmount <= 0) {
      alert('Invoice amount must be greater than 0. Please check the calculated amount.')
      return
    }
    
    // Validate vendor-provided fields
    if (!vendorInvoiceNumber || !vendorInvoiceNumber.trim()) {
      alert('Vendor Invoice Number is required. Please enter your invoice number.')
      return
    }
    if (!vendorInvoiceDate) {
      alert('Vendor Invoice Date is required. Please enter your invoice date.')
      return
    }

    try {
      setCreatingInvoice(true)
      await createInvoiceByVendor(
        selectedGRN.id,
        invoiceNumber.trim(), // System-generated (internal)
        new Date(invoiceDate), // System-generated (internal)
        vendorInvoiceNumber.trim(), // Vendor-provided (required)
        new Date(vendorInvoiceDate), // Vendor-provided (required)
        invoiceAmount,
        vendorId,
        invoiceRemarks.trim() || undefined
      )
      
      alert('Invoice created successfully!')
      setShowInvoiceModal(false)
      setSelectedGRN(null)
      await loadData()
      setActiveTab('my-invoices') // Switch to My Invoices tab after creation
    } catch (error: any) {
      console.error('Error creating invoice:', error)
      alert(error.message || 'Error creating invoice. Please try again.')
    } finally {
      setCreatingInvoice(false)
    }
  }

  // Check if invoice exists for a GRN
  const hasInvoice = (grnId: string) => {
    if (!grnId || !invoices || invoices.length === 0) {
      return false
    }
    // Try multiple ID formats
    const grnIdStr = String(grnId)
    const hasInv = invoices.some((inv: any) => {
      const invGrnId = String(inv.grnId || '')
      return invGrnId === grnIdStr || invGrnId === grnId
    })
    return hasInv
  }

  // Check if GRN is approved (supports both new and old approval workflows)
  // CRITICAL: This must match the logic in getStatusBadge that shows "Approved" (green badge)
  // If the badge shows "Approved", this function MUST return true
  const isGRNApproved = (grn: any) => {
    if (!grn) {
      console.warn('[isGRNApproved] GRN is null/undefined')
      return false
    }
    
    // PRIMARY CHECK: New workflow - grnStatus === 'APPROVED' (this is the main approval field)
    // This is what shows "Approved" badge in the UI
    if (grn.grnStatus === 'APPROVED') {
      return true
    }
    
    // SECONDARY CHECK: status === 'APPROVED' (fallback - should also show "Approved" badge)
    if (grn.status === 'APPROVED') {
      return true
    }
    
    // TERTIARY CHECK: Old workflow - grnAcknowledgedByCompany === true or status === 'ACKNOWLEDGED'
    // Note: 'ACKNOWLEDGED' shows as "Acknowledged" badge (not "Approved"), but we allow invoice for backward compatibility
    if (grn.grnAcknowledgedByCompany === true || grn.status === 'ACKNOWLEDGED') {
      return true
    }
    
    return false
  }

  const getStatusBadge = (status: string, grnStatus?: string) => {
    // Simple approval workflow: show grnStatus if available, otherwise fall back to status
    const displayStatus = grnStatus || status
    
    const statusMap: Record<string, { label: string; color: string }> = {
      'RAISED': { label: 'Raised', color: 'bg-blue-100 text-blue-800' },
      'APPROVED': { label: 'Approved', color: 'bg-green-100 text-green-800' },
      'CREATED': { label: 'Created', color: 'bg-blue-100 text-blue-800' },
      'ACKNOWLEDGED': { label: 'Acknowledged', color: 'bg-green-100 text-green-800' },
      'INVOICED': { label: 'Invoiced', color: 'bg-purple-100 text-purple-800' },
      'RECEIVED': { label: 'Received', color: 'bg-gray-100 text-gray-800' },
      'CLOSED': { label: 'Closed', color: 'bg-gray-100 text-gray-800' }
    }
    
    const statusInfo = statusMap[displayStatus] || { label: displayStatus, color: 'bg-gray-100 text-gray-800' }
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
        {statusInfo.label}
      </span>
    )
  }
  

  if (loading) {
    return (
      <DashboardLayout actorType="vendor">
        <div className="flex items-center justify-center h-64">
          <div className="text-gray-500">Loading...</div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="vendor">
      <div>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Goods Receipt (GRN)</h1>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('eligible')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'eligible'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Eligible for GRN ({eligiblePOs.length})
            </button>
            <button
              onClick={() => setActiveTab('my-grns')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my-grns'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My GRNs ({myGRNs.length})
            </button>
            <button
              onClick={() => setActiveTab('my-invoices')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my-invoices'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Invoices ({invoices.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'eligible' && (
          <div>
            {eligiblePOs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p>No POs eligible for GRN creation</p>
                <p className="text-sm mt-2">POs must be fully delivered before GRN can be created</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Count</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {eligiblePOs.map((po) => (
                      <tr key={po.poId}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{po.poNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.itemCount}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.companyName}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => handleCreateGRN(po)}
                            className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Raise GRN
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-grns' && (
          <div>
            {myGRNs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p>No GRNs raised yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GRN Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GRN Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {myGRNs.map((grn) => (
                      <tr key={grn.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{grn.grnNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {grn.createdAt ? new Date(grn.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{grn.poNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {grn.poDate ? new Date(grn.poDate).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {getStatusBadge(grn.status, grn.grnStatus)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                          <button
                            onClick={() => {
                              setSelectedGRN(grn)
                              setShowViewModal(true)
                            }}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </button>
                          {(() => {
                            const grnId = grn.id || grn.grnId
                            const displayStatus = grn.grnStatus || grn.status
                            const isApproved = displayStatus === 'APPROVED' || 
                                             grn.grnStatus === 'APPROVED' || 
                                             grn.status === 'APPROVED' ||
                                             grn.grnAcknowledgedByCompany === true ||
                                             grn.status === 'ACKNOWLEDGED'
                            const hasInv = hasInvoice(grnId)
                            
                            if (isApproved && !hasInv) {
                              return (
                                <button
                                  onClick={() => {
                                    // Open detail modal - user can then click "Raise Invoice" in the modal
                                    setSelectedGRN(grn)
                                    setShowViewModal(true)
                                  }}
                                  className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                                >
                                  <Receipt className="h-4 w-4 mr-1" />
                                  Raise Invoice
                                </button>
                              )
                            }
                            return null
                          })()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-invoices' && (
          <div>
            {invoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Receipt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <p>No invoices raised yet</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor Invoice Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {invoice.vendorInvoiceNumber || invoice.invoiceNumber}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {invoice.vendorInvoiceDate 
                            ? new Date(invoice.vendorInvoiceDate).toLocaleDateString() 
                            : invoice.invoiceDate 
                            ? new Date(invoice.invoiceDate).toLocaleDateString() 
                            : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.companyName || 'N/A'}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.poNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.grnNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          ₹{invoice.invoiceAmount?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.invoiceStatus === 'APPROVED' 
                              ? 'bg-green-100 text-green-800' 
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            {invoice.invoiceStatus === 'APPROVED' ? 'Approved' : 'Raised'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={async () => {
                              setSelectedInvoice(invoice)
                              setShowInvoiceViewModal(true)
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
                            }}
                            className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Create GRN Modal */}
        {showCreateModal && selectedPO && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Create GRN</h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setGrnNumber('')
                    setGrnDate(new Date().toISOString().split('T')[0])
                    setRemarks('')
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="poNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    PO Number
                  </label>
                  <input
                    type="text"
                    id="poNumber"
                    value={selectedPO.poNumber}
                    disabled
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  />
                </div>

                <div>
                  <label htmlFor="grnNumber" className="block text-sm font-medium text-gray-700 mb-1">
                    GRN Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="grnNumber"
                    value={grnNumber}
                    onChange={(e) => setGrnNumber(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter GRN number"
                    required
                  />
                </div>

                <div>
                  <label htmlFor="grnDate" className="block text-sm font-medium text-gray-700 mb-1">
                    GRN Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="grnDate"
                    value={grnDate}
                    onChange={(e) => setGrnDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> GRN can be created only for fully delivered Purchase Orders.
                  </p>
                </div>

                <div>
                  <label htmlFor="remarks" className="block text-sm font-medium text-gray-700 mb-1">
                    Remarks (Optional)
                  </label>
                  <textarea
                    id="remarks"
                    value={remarks}
                    onChange={(e) => setRemarks(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter any additional remarks"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowCreateModal(false)
                    setGrnNumber('')
                    setGrnDate(new Date().toISOString().split('T')[0])
                    setRemarks('')
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  disabled={creating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmitGRN}
                  disabled={creating || !grnNumber.trim() || !grnDate}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                  {creating ? 'Creating...' : 'Create GRN'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* View GRN Details Modal */}
        {showViewModal && selectedGRN && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">GRN Details</h3>
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedGRN(null)
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* GRN Header Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">GRN Number</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedGRN.grnNumber}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">PO Number</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedGRN.poNumber}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">PO Date</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedGRN.poDate ? new Date(selectedGRN.poDate).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">PR Number(s)</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedGRN.prNumbers && selectedGRN.prNumbers.length > 0 
                          ? selectedGRN.prNumbers.join(', ') 
                          : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">GRN Date</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedGRN.createdAt ? new Date(selectedGRN.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="mt-1">{getStatusBadge(selectedGRN.status, selectedGRN.grnStatus)}</p>
                    </div>
                    {selectedGRN.approvedAt && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Approved Date</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {new Date(selectedGRN.approvedAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Approved By</label>
                          <p className="mt-1 text-sm text-gray-900">{selectedGRN.approvedBy || 'Company Admin'}</p>
                        </div>
                      </>
                    )}
                    {selectedGRN.grnAcknowledgedDate && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Acknowledged Date</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {new Date(selectedGRN.grnAcknowledgedDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Acknowledged By</label>
                          <p className="mt-1 text-sm text-gray-900">{selectedGRN.grnAcknowledgedBy || 'Company Admin'}</p>
                        </div>
                      </>
                    )}
                    {selectedGRN.remarks && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Remarks</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedGRN.remarks}</p>
                      </div>
                    )}
                  </div>

                  {/* GRN Items */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">GRN Items</label>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Code</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ordered Qty</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Delivered Qty</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Rejected Qty</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Condition</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Remarks</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {selectedGRN.items && selectedGRN.items.length > 0 ? (
                            selectedGRN.items.map((item: any, index: number) => (
                              <tr key={index}>
                                <td className="px-4 py-2 text-sm text-gray-900">{item.productCode}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.size}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.orderedQuantity}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.deliveredQuantity}</td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.rejectedQuantity || 0}</td>
                                <td className="px-4 py-2 text-sm">
                                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                                    item.condition === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                                    item.condition === 'PARTIAL' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {item.condition}
                                  </span>
                                </td>
                                <td className="px-4 py-2 text-sm text-gray-500">{item.remarks || '-'}</td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan={7} className="px-4 py-4 text-sm text-gray-500 text-center">No items found</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Status Information */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-2">Status Information</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      {(!selectedGRN.grnStatus || selectedGRN.grnStatus === 'RAISED') && (
                        <p>• GRN has been raised and is awaiting company approval</p>
                      )}
                      {isGRNApproved(selectedGRN) && (
                        <p>• GRN has been approved by company admin</p>
                      )}
                      {selectedGRN.status === 'CREATED' && !selectedGRN.grnStatus && (
                        <p>• GRN has been created and is awaiting company acknowledgment</p>
                      )}
                      {selectedGRN.status === 'ACKNOWLEDGED' && (
                        <p>• GRN has been acknowledged by company admin. You can now raise an invoice.</p>
                      )}
                      {selectedGRN.status === 'INVOICED' && (
                        <p>• Invoice has been raised for this GRN</p>
                      )}
                      {selectedGRN.status === 'RECEIVED' && (
                        <p>• GRN has been received</p>
                      )}
                      {selectedGRN.status === 'CLOSED' && (
                        <p>• GRN has been closed</p>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  {(() => {
                    if (!selectedGRN) return null
                    
                    // Get GRN ID - try multiple possible fields
                    const grnId = selectedGRN.id || selectedGRN.grnId || selectedGRN._id?.toString()
                    
                    // CRITICAL: Use the SAME logic as getStatusBadge to determine if GRN is approved
                    // If the badge shows "Approved", the button MUST show
                    const displayStatus = selectedGRN.grnStatus || selectedGRN.status
                    const badgeShowsApproved = displayStatus === 'APPROVED'
                    
                    // Also check old workflow for backward compatibility
                    const isApproved = badgeShowsApproved || 
                                      selectedGRN.grnStatus === 'APPROVED' || 
                                      selectedGRN.status === 'APPROVED' ||
                                      selectedGRN.grnAcknowledgedByCompany === true ||
                                      selectedGRN.status === 'ACKNOWLEDGED'
                    
                    const hasInv = hasInvoice(grnId)
                    const shouldShow = isApproved && !hasInv
                    
                    // Always log for debugging (helps identify issues)
                    console.log('[Raise Invoice Button Check]', {
                      grnId,
                      grnNumber: selectedGRN.grnNumber,
                      grnStatus: selectedGRN.grnStatus,
                      status: selectedGRN.status,
                      displayStatus,
                      badgeShowsApproved,
                      grnAcknowledgedByCompany: selectedGRN.grnAcknowledgedByCompany,
                      approvedBy: selectedGRN.approvedBy,
                      approvedAt: selectedGRN.approvedAt,
                      invoiceId: selectedGRN.invoiceId,
                      isApproved,
                      hasInv,
                      invoicesCount: invoices?.length || 0,
                      invoiceGrnIds: invoices?.map((inv: any) => inv.grnId) || [],
                      shouldShow,
                      selectedGRNKeys: Object.keys(selectedGRN)
                    })
                    
                    if (!shouldShow) {
                      // Show why button is not visible (for debugging)
                      if (!isApproved) {
                        console.warn('[Raise Invoice] ❌ Button hidden - GRN not approved:', {
                          grnStatus: selectedGRN.grnStatus,
                          status: selectedGRN.status,
                          displayStatus,
                          badgeShowsApproved,
                          acknowledged: selectedGRN.grnAcknowledgedByCompany
                        })
                      }
                      if (hasInv) {
                        console.warn('[Raise Invoice] ❌ Button hidden - Invoice already exists for GRN:', grnId)
                      }
                      return null
                    }
                    
                    console.log('[Raise Invoice] ✅ Button SHOULD BE VISIBLE for GRN:', selectedGRN.grnNumber)
                    
                    return (
                      <button
                        data-raise-invoice-btn
                        onClick={() => handleRaiseInvoice(selectedGRN)}
                        className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                      >
                        <Receipt className="h-4 w-4 inline mr-2" />
                        Raise Invoice
                      </button>
                    )
                  })()}
                  <button
                    onClick={() => {
                      setShowViewModal(false)
                      setSelectedGRN(null)
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

        {/* Raise Invoice Modal */}
        {showInvoiceModal && selectedGRN && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Raise Invoice</h3>
                  <button
                    onClick={() => {
                      setShowInvoiceModal(false)
                      setSelectedGRN(null)
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* System-Generated Invoice Details (Read-only, Internal to UDS) */}
                  <div className="bg-blue-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">System Invoice Details (Internal)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">System Invoice Number</label>
                        <input
                          type="text"
                          value={invoiceNumber}
                          readOnly
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Auto-generated by UDS</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">System Invoice Date</label>
                        <input
                          type="date"
                          value={invoiceDate}
                          readOnly
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-white"
                        />
                        <p className="mt-1 text-xs text-gray-500">Auto-generated by UDS</p>
                      </div>
                    </div>
                  </div>

                  {/* Vendor-Provided Invoice Details (Required, Editable) */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Your Invoice Details <span className="text-red-500">*</span></h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor Invoice Number <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={vendorInvoiceNumber}
                          onChange={(e) => setVendorInvoiceNumber(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                          placeholder="Enter your invoice number"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">Your company's invoice reference number</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor Invoice Date <span className="text-red-500">*</span></label>
                        <input
                          type="date"
                          value={vendorInvoiceDate}
                          onChange={(e) => setVendorInvoiceDate(e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                          required
                        />
                        <p className="mt-1 text-xs text-gray-500">Date on your invoice</p>
                      </div>
                    </div>
                  </div>

                  {/* Procurement References - Read-only */}
                  <div className="bg-gray-50 p-4 rounded-md">
                    <h4 className="text-sm font-medium text-gray-900 mb-3">Procurement References</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <label className="block text-gray-600">PO Number</label>
                        <p className="mt-1 text-gray-900 font-medium">{selectedGRN.poNumber}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600">GRN Number</label>
                        <p className="mt-1 text-gray-900 font-medium">{selectedGRN.grnNumber}</p>
                      </div>
                      <div>
                        <label className="block text-gray-600">PR Number(s)</label>
                        <p className="mt-1 text-gray-900 font-medium">
                          {selectedGRN.prNumbers && selectedGRN.prNumbers.length > 0 
                            ? selectedGRN.prNumbers.join(', ') 
                            : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-gray-600">GRN Approved Date</label>
                        <p className="mt-1 text-gray-900 font-medium">
                          {selectedGRN.approvedAt ? new Date(selectedGRN.approvedAt).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Invoice Items - Pre-populated from GRN with prices */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Invoice Items (Delivered Quantities)</label>
                    {calculatingAmount ? (
                      <div className="text-center py-4 text-gray-500">Calculating invoice amount...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Product Code</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Quantity</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Unit Price</th>
                              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Line Total</th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {invoiceItemsWithPrices && invoiceItemsWithPrices.length > 0 ? (
                              invoiceItemsWithPrices.map((item: any, index: number) => (
                                <tr key={index}>
                                  <td className="px-4 py-2 text-sm text-gray-900">{item.productCode}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{item.size || '-'}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">{item.quantity || 0}</td>
                                  <td className="px-4 py-2 text-sm text-gray-500">₹{item.unitPrice?.toFixed(2) || '0.00'}</td>
                                  <td className="px-4 py-2 text-sm text-gray-900 font-medium">₹{item.lineTotal?.toFixed(2) || '0.00'}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="px-4 py-4 text-sm text-gray-500 text-center">No items found</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Invoice Amount - Auto-calculated (Read-only) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Invoice Amount (Auto-calculated)</label>
                    <input
                      type="number"
                      value={invoiceAmount}
                      readOnly
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm bg-gray-50 font-medium text-lg"
                    />
                    <p className="mt-1 text-xs text-gray-500">Amount calculated from delivered quantities × vendor prices</p>
                  </div>

                  {/* Remarks */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Remarks (Optional)</label>
                    <textarea
                      value={invoiceRemarks}
                      onChange={(e) => setInvoiceRemarks(e.target.value)}
                      rows={3}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"
                      placeholder="Enter any additional remarks..."
                    />
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => {
                      setShowInvoiceModal(false)
                      setSelectedGRN(null)
                    }}
                    className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                    disabled={creatingInvoice}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubmitInvoice}
                    disabled={creatingInvoice}
                    className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400"
                  >
                    {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View Invoice Details Modal */}
        {showInvoiceViewModal && selectedInvoice && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-full max-w-4xl shadow-lg rounded-md bg-white">
              <div className="mt-3">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900">Invoice Details</h3>
                  <button
                    onClick={() => {
                      setShowInvoiceViewModal(false)
                      setSelectedInvoice(null)
                      setSelectedVendorDetails(null)
                    }}
                    className="text-gray-400 hover:text-gray-500"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="space-y-6">
                  {/* Vendor Company Details - Displayed at top of invoice */}
                  <div className="bg-indigo-50 p-4 rounded-md border border-indigo-200">
                    <h4 className="text-sm font-semibold text-indigo-900 mb-3">Vendor Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Vendor Name</label>
                        <p className="mt-1 text-base text-gray-900 font-semibold">
                          {selectedVendorDetails?.name || 'N/A'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Address</label>
                        <p className="mt-1 text-sm text-gray-900">
                          {selectedVendorDetails?.address_line_1 && (
                            <>{selectedVendorDetails.address_line_1}<br /></>
                          )}
                          {selectedVendorDetails?.address_line_2 && (
                            <>{selectedVendorDetails.address_line_2}<br /></>
                          )}
                          {selectedVendorDetails?.address_line_3 && (
                            <>{selectedVendorDetails.address_line_3}<br /></>
                          )}
                          {[
                            selectedVendorDetails?.city,
                            selectedVendorDetails?.state,
                            selectedVendorDetails?.pincode
                          ].filter(Boolean).join(', ') || ''}
                          {selectedVendorDetails?.country && (
                            <><br />{selectedVendorDetails.country}</>
                          )}
                          {!selectedVendorDetails?.address_line_1 && !selectedVendorDetails?.city && 'N/A'}
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Registration Number</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedVendorDetails?.registration_number || 'N/A'}</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">GST Number</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedVendorDetails?.gst_number || 'N/A'}</p>
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
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Vendor Invoice Date</label>
                        <p className="mt-1 text-sm text-gray-900 font-medium">
                          {selectedInvoice.vendorInvoiceDate ? new Date(selectedInvoice.vendorInvoiceDate).toLocaleDateString() : 'N/A'}
                        </p>
                      </div>
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
                                <td className="px-4 py-2 text-sm text-gray-500">{item.quantity || 0}</td>
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
                      </table>
                    </div>
                  </div>

                  {/* Total Amount */}
                  <div className="flex justify-end items-center space-x-4 pt-4 border-t border-gray-200">
                    <span className="text-lg font-medium text-gray-700">Total Invoice Amount:</span>
                    <span className="text-xl font-bold text-gray-900">₹{selectedInvoice.invoiceAmount?.toFixed(2) || '0.00'}</span>
                  </div>

                  {/* Vendor Bank Details Section - Only displayed if bank data exists */}
                  {selectedVendorDetails && (selectedVendorDetails.bank_name || selectedVendorDetails.account_number || selectedVendorDetails.ifsc_code) && (
                    <div className="bg-green-50 p-4 rounded-md border border-green-200">
                      <h4 className="text-sm font-semibold text-green-900 mb-3">Bank Details for Payment</h4>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {selectedVendorDetails.bank_name && (
                          <div>
                            <label className="block text-gray-600">Bank Name</label>
                            <p className="mt-1 text-gray-900 font-medium">{selectedVendorDetails.bank_name}</p>
                          </div>
                        )}
                        {selectedVendorDetails.branch_address && (
                          <div>
                            <label className="block text-gray-600">Branch Address</label>
                            <p className="mt-1 text-gray-900 font-medium">{selectedVendorDetails.branch_address}</p>
                          </div>
                        )}
                        {selectedVendorDetails.ifsc_code && (
                          <div>
                            <label className="block text-gray-600">IFSC Code</label>
                            <p className="mt-1 text-gray-900 font-medium">{selectedVendorDetails.ifsc_code}</p>
                          </div>
                        )}
                        {selectedVendorDetails.account_number && (
                          <div>
                            <label className="block text-gray-600">Account Number</label>
                            <p className="mt-1 text-gray-900 font-medium">{selectedVendorDetails.account_number}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Status and Approval Info */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="mt-1">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          selectedInvoice.invoiceStatus === 'APPROVED' 
                            ? 'bg-green-100 text-green-800' 
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {selectedInvoice.invoiceStatus === 'APPROVED' ? 'Approved' : 'Raised'}
                        </span>
                      </p>
                    </div>
                    {selectedInvoice.invoiceStatus === 'APPROVED' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Approved Date</label>
                          <p className="mt-1 text-sm text-gray-900">
                            {selectedInvoice.approvedAt ? new Date(selectedInvoice.approvedAt).toLocaleDateString() : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700">Approved By</label>
                          <p className="mt-1 text-sm text-gray-900">{selectedInvoice.approvedBy || 'N/A'}</p>
                        </div>
                      </>
                    )}
                    {selectedInvoice.remarks && (
                      <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-700">Remarks</label>
                        <p className="mt-1 text-sm text-gray-900">{selectedInvoice.remarks}</p>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mt-6 flex justify-end">
                  <button
                    onClick={() => {
                      setShowInvoiceViewModal(false)
                      setSelectedInvoice(null)
                      setSelectedVendorDetails(null)
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

