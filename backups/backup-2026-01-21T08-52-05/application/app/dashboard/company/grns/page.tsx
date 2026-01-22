'use client'

import DashboardLayout from '@/components/DashboardLayout'
import { FileText, CheckCircle, Eye, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { getGRNsRaisedByVendors, approveGRN } from '@/lib/data-mongodb'

export default function CompanyGRNPage() {
  const [companyId, setCompanyId] = useState<string>('')
  const [grns, setGrns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approving, setApproving] = useState<string | null>(null)
  const [selectedGRN, setSelectedGRN] = useState<any>(null)
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
        const grnsList = await getGRNsRaisedByVendors(storedCompanyId)
        setGrns(grnsList)
      }
    } catch (error) {
      console.error('Error loading GRN data:', error)
      alert('Error loading data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

  const handleView = (grn: any) => {
    setSelectedGRN(grn)
    setShowViewModal(true)
  }

  const handleApprove = async (grn: any) => {
    if (!confirm(`Are you sure you want to approve GRN ${grn.grnNumber}?`)) {
      return
    }

    try {
      setApproving(grn.id)
      
      // Get company admin name/ID
      const { getAuthData } = typeof window !== 'undefined' 
        ? await import('@/lib/utils/auth-storage') 
        : { getAuthData: () => null }
      
      const authData = getAuthData('company')
      const approvedBy = authData?.name || authData?.email || 'Company Admin'
      
      await approveGRN(grn.id, approvedBy)
      
      alert('GRN approved successfully!')
      await loadData()
      if (showViewModal && selectedGRN?.id === grn.id) {
        setShowViewModal(false)
        setSelectedGRN(null)
      }
    } catch (error: any) {
      console.error('Error approving GRN:', error)
      alert(error.message || 'Error approving GRN. Please try again.')
    } finally {
      setApproving(null)
    }
  }

  const getStatusBadge = (grnStatus: string | undefined) => {
    if (!grnStatus || grnStatus === 'RAISED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          RAISED
        </span>
      )
    }
    if (grnStatus === 'APPROVED') {
      return (
        <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          APPROVED
        </span>
      )
    }
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        {grnStatus}
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
          <h1 className="text-3xl font-bold text-gray-900">GRN</h1>
        </div>

        {grns.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <p>No GRNs raised by vendors</p>
            <p className="text-sm mt-2">GRNs raised by vendors will appear here</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {grns.map((grn) => (
                  <tr key={grn.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{grn.grnNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {grn.createdAt ? new Date(grn.createdAt).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{grn.poNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {grn.poDate ? new Date(grn.poDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{grn.vendorName || grn.vendorId}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {getStatusBadge(grn.grnStatus)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                      <button
                        onClick={() => handleView(grn)}
                        className="inline-flex items-center px-3 py-1 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </button>
                      {(!grn.grnStatus || grn.grnStatus === 'RAISED') && (
                        <button
                          onClick={() => handleApprove(grn)}
                          disabled={approving === grn.id}
                          className="inline-flex items-center px-3 py-1 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          {approving === grn.id ? 'Approving...' : 'Approve'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                      <label className="block text-sm font-medium text-gray-700">Vendor</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedGRN.vendorName || selectedGRN.vendorId}</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">GRN Date</label>
                      <p className="mt-1 text-sm text-gray-900">
                        {selectedGRN.createdAt ? new Date(selectedGRN.createdAt).toLocaleDateString() : 'N/A'}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Status</label>
                      <p className="mt-1">{getStatusBadge(selectedGRN.grnStatus)}</p>
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
                </div>
                
                <div className="mt-6 flex justify-end space-x-3">
                  {(!selectedGRN.grnStatus || selectedGRN.grnStatus === 'RAISED') && (
                    <button
                      onClick={() => handleApprove(selectedGRN)}
                      disabled={approving === selectedGRN.id}
                      className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:bg-gray-400"
                    >
                      {approving === selectedGRN.id ? 'Approving...' : 'Approve GRN'}
                    </button>
                  )}
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
      </div>
    </DashboardLayout>
  )
}

