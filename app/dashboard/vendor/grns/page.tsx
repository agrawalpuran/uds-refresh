'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { Package, FileText, Plus, Eye, X, Receipt, Building2, ChevronDown } from 'lucide-react'
import { useState, useEffect, useMemo } from 'react'
import { getPOsEligibleForGRN, getAllOrdersEligibleForGRN, getGRNsByVendor, createGRNByVendor, createGRNForManualOrder, createInvoiceByVendor, getInvoicesByVendor, getProductsByVendor, getVendorById } from '@/lib/data-mongodb'
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
  // Company filter state
  const [selectedCompany, setSelectedCompany] = useState<string>('all')
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
      
      // SECURITY FIX: No localStorage fallback - use only sessionStorage (tab-specific)
      const storedVendorId = getVendorId() || getAuthData('vendor')?.vendorId || null
      
      if (storedVendorId) {
        setVendorId(storedVendorId)
        // POST-DELIVERY WORKFLOW EXTENSION: Use getAllOrdersEligibleForGRN to include both PR→PO and Manual orders
        const [eligible, grns, invoiceList] = await Promise.all([
          getAllOrdersEligibleForGRN(storedVendorId), // Fetches BOTH PO-based and Manual order-based eligible items
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
      
      // POST-DELIVERY WORKFLOW EXTENSION: Detect if this is a manual order or PO-based order
      // Manual orders have orderId instead of poNumber
      const isManualOrder = selectedPO.sourceType === 'MANUAL' || (selectedPO.orderId && !selectedPO.poNumber)
      
      if (isManualOrder) {
        // Create GRN for manual order (uses orderId)
        await createGRNForManualOrder(
          selectedPO.orderId,
          grnNumber.trim(),
          new Date(grnDate),
          vendorId,
          remarks.trim() || undefined
        )
      } else {
        // Create GRN for PO-based order (uses poNumber)
        await createGRNByVendor(
          selectedPO.poNumber,
          grnNumber.trim(),
          new Date(grnDate),
          vendorId,
          remarks.trim() || undefined
        )
      }
      
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

  // Check if invoice exists for a GRN (excluding rejected invoices - vendor can re-raise)
  const hasInvoice = (grnId: string) => {
    if (!grnId || !invoices || invoices.length === 0) {
      return false
    }
    // Try multiple ID formats
    const grnIdStr = String(grnId)
    const hasInv = invoices.some((inv: any) => {
      const invGrnId = String(inv.grnId || '')
      const matchesGrn = invGrnId === grnIdStr || invGrnId === grnId
      // Don't count rejected invoices - vendor should be able to re-raise
      const effectiveStatus = inv.unified_invoice_status || inv.invoiceStatus
      const isRejected = effectiveStatus === 'REJECTED'
      return matchesGrn && !isRejected
    })
    return hasInv
  }
  
  // Get rejection details for an invoice (from WorkflowRejection collection)
  const getRejectionInfo = (invoice: any) => {
    // Check if invoice has rejection data embedded (from API)
    if (invoice.rejectionInfo) {
      return invoice.rejectionInfo
    }
    // Check unified status
    const effectiveStatus = invoice.unified_invoice_status || invoice.invoiceStatus
    if (effectiveStatus === 'REJECTED') {
      return {
        isRejected: true,
        // These fields may be added by the API when fetching invoices
        reasonCode: invoice.rejectionReasonCode,
        reasonLabel: invoice.rejectionReasonLabel,
        remarks: invoice.rejectionRemarks,
        rejectedBy: invoice.rejectedBy,
        rejectedAt: invoice.rejectedAt,
      }
    }
    return null
  }

  // ==========================================================================
  // COMPANY FILTER LOGIC
  // Extract unique companies from all data sources and filter accordingly
  // ==========================================================================
  
  // Get unique companies from all data
  const companies = useMemo(() => {
    const companyMap = new Map<string, { id: string; name: string }>()
    
    // From eligible POs
    eligiblePOs.forEach(po => {
      if (po.companyId && po.companyName) {
        companyMap.set(po.companyId, { id: po.companyId, name: po.companyName })
      }
    })
    
    // From GRNs
    myGRNs.forEach(grn => {
      if (grn.companyId && grn.companyName) {
        companyMap.set(grn.companyId, { id: grn.companyId, name: grn.companyName })
      }
    })
    
    // From invoices
    invoices.forEach(inv => {
      if (inv.companyId && inv.companyName) {
        companyMap.set(inv.companyId, { id: inv.companyId, name: inv.companyName })
      }
    })
    
    return Array.from(companyMap.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [eligiblePOs, myGRNs, invoices])
  
  // Filtered data based on selected company
  const filteredEligiblePOs = useMemo(() => {
    if (selectedCompany === 'all') return eligiblePOs
    return eligiblePOs.filter(po => po.companyId === selectedCompany)
  }, [eligiblePOs, selectedCompany])
  
  const filteredGRNs = useMemo(() => {
    if (selectedCompany === 'all') return myGRNs
    return myGRNs.filter(grn => grn.companyId === selectedCompany)
  }, [myGRNs, selectedCompany])
  
  const filteredInvoices = useMemo(() => {
    if (selectedCompany === 'all') return invoices
    return invoices.filter(inv => inv.companyId === selectedCompany)
  }, [invoices, selectedCompany])

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
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Goods Receipt (GRN)</h1>
        </div>

        {/* Company Filter */}
        {companies.length > 0 && (
          <div className="mb-6 flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 text-gray-700">
              <Building2 className="h-5 w-5 text-gray-500" />
              <span className="font-medium">Filter by Company:</span>
            </div>
            <div className="relative">
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="appearance-none bg-white border border-gray-300 rounded-lg px-4 py-2 pr-10 text-sm font-medium text-gray-700 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer min-w-[200px]"
              >
                <option value="all">All Companies ({companies.length})</option>
                {companies.map(company => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
            </div>
            {selectedCompany !== 'all' && (
              <button
                onClick={() => setSelectedCompany('all')}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear filter
              </button>
            )}
          </div>
        )}

        {/* Tabs - counts now reflect filtered data */}
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
              Eligible for GRN ({filteredEligiblePOs.length})
            </button>
            <button
              onClick={() => setActiveTab('my-grns')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my-grns'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My GRNs ({filteredGRNs.length})
            </button>
            <button
              onClick={() => setActiveTab('my-invoices')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'my-invoices'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              My Invoices ({filteredInvoices.length})
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'eligible' && (
          <div>
            {filteredEligiblePOs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Package className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                {selectedCompany !== 'all' ? (
                  <>
                    <p>No POs eligible for GRN from this company</p>
                    <p className="text-sm mt-2">
                      <button 
                        onClick={() => setSelectedCompany('all')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View all companies
                      </button>
                    </p>
                  </>
                ) : (
                  <>
                    <p>No POs eligible for GRN creation</p>
                    <p className="text-sm mt-2">POs must be fully delivered before GRN can be created</p>
                  </>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Delivery Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Item Count</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredEligiblePOs.map((po) => {
                      // POST-DELIVERY WORKFLOW EXTENSION: Handle both PO-based and Manual orders
                      const isManualOrder = po.sourceType === 'MANUAL' || (po.orderId && !po.poNumber)
                      const reference = isManualOrder ? po.orderId : po.poNumber
                      const rowKey = po.poId || po.orderId || `item-${reference}`
                      
                      return (
                        <tr key={rowKey} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm">
                            {isManualOrder ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800">
                                Direct Order
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                                PO
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{reference}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {po.deliveryDate ? new Date(po.deliveryDate).toLocaleDateString() : 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{po.itemCount || po.totalItems || 'N/A'}</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {po.companyName || 'N/A'}
                            </span>
                          </td>
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
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'my-grns' && (
          <div>
            {filteredGRNs.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                {selectedCompany !== 'all' ? (
                  <>
                    <p>No GRNs found for this company</p>
                    <p className="text-sm mt-2">
                      <button 
                        onClick={() => setSelectedCompany('all')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View all companies
                      </button>
                    </p>
                  </>
                ) : (
                  <p>No GRNs raised yet</p>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GRN Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GRN Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">PO Number</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Company</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredGRNs.map((grn) => (
                      <tr key={grn.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{grn.grnNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {grn.createdAt ? new Date(grn.createdAt).toLocaleDateString() : 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {grn.poNumber || (grn.orderId ? `Order: ${grn.orderId}` : 'N/A')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {grn.companyName || 'N/A'}
                          </span>
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
            {filteredInvoices.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Receipt className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                {selectedCompany !== 'all' ? (
                  <>
                    <p>No invoices found for this company</p>
                    <p className="text-sm mt-2">
                      <button 
                        onClick={() => setSelectedCompany('all')}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        View all companies
                      </button>
                    </p>
                  </>
                ) : (
                  <p>No invoices raised yet</p>
                )}
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
                    {filteredInvoices.map((invoice) => (
                      <tr key={invoice.id} className="hover:bg-gray-50">
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                            {invoice.companyName || 'N/A'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.poNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{invoice.grnNumber}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                          ₹{invoice.invoiceAmount?.toFixed(2) || '0.00'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {(() => {
                            // Check unified status first, then fall back to legacy
                            const effectiveStatus = invoice.unified_invoice_status || invoice.invoiceStatus
                            
                            if (effectiveStatus === 'APPROVED') {
                              return (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                  Approved
                                </span>
                              )
                            }
                            if (effectiveStatus === 'REJECTED') {
                              return (
                                <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                  Rejected
                                </span>
                              )
                            }
                            return (
                              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                Raised
                              </span>
                            )
                          })()}
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

              {/* POST-DELIVERY WORKFLOW EXTENSION: Detect and display manual order badge */}
              {(() => {
                const isManualOrder = selectedPO.sourceType === 'MANUAL' || (selectedPO.orderId && !selectedPO.poNumber)
                return isManualOrder ? (
                  <div className="mb-4 p-2 bg-purple-50 border border-purple-200 rounded-md">
                    <span className="text-sm text-purple-700 font-medium">📦 Direct Order GRN</span>
                  </div>
                ) : null
              })()}

              <div className="space-y-4">
                <div>
                  {/* POST-DELIVERY WORKFLOW EXTENSION: Show PO Number or Order ID based on type */}
                  <label htmlFor="reference" className="block text-sm font-medium text-gray-700 mb-1">
                    {selectedPO.sourceType === 'MANUAL' || (selectedPO.orderId && !selectedPO.poNumber) 
                      ? 'Order ID' 
                      : 'PO Number'}
                  </label>
                  <input
                    type="text"
                    id="reference"
                    value={selectedPO.poNumber || selectedPO.orderId || ''}
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

        {/* View Invoice Details Modal - Compact Layout */}
        {showInvoiceViewModal && selectedInvoice && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-10 mx-auto p-4 border w-full max-w-3xl shadow-lg rounded-md bg-white">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">Invoice Details</h3>
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
                        <p><span className="text-gray-500">PO:</span> <span className="font-medium">{selectedInvoice.poNumber || selectedInvoice.orderId || 'N/A'}</span></p>
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
                      {(() => {
                        const effectiveStatus = selectedInvoice.unified_invoice_status || selectedInvoice.invoiceStatus
                        if (effectiveStatus === 'APPROVED') {
                          return <span className="px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-800">Approved</span>
                        }
                        if (effectiveStatus === 'REJECTED') {
                          return <span className="px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800">Rejected</span>
                        }
                        return <span className="px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">Raised</span>
                      })()}
                      {selectedInvoice.invoiceStatus === 'APPROVED' && (
                        <span className="text-gray-500 ml-2">
                          by {selectedInvoice.approvedBy || 'N/A'} on {selectedInvoice.approvedAt ? new Date(selectedInvoice.approvedAt).toLocaleDateString() : 'N/A'}
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
                      <p className="mt-2 text-yellow-700 bg-yellow-50 px-2 py-1 rounded text-xs">
                        <strong>Note:</strong> Invoice rejected. You can raise a new invoice for this GRN with corrections.
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Computer-generated notice */}
                <p className="text-center text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                  This is a computer-generated invoice and does not require a signature.
                </p>
                
                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setShowInvoiceViewModal(false)
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
      </div>
    </DashboardLayout>
  )
}

