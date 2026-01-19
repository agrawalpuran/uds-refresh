'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import DashboardLayout from '@/components/DashboardLayout'
import { Users, ShoppingCart, DollarSign, TrendingUp, FileText, CheckCircle, IndianRupee, RefreshCw, MessageSquare, Building2, Store } from 'lucide-react'
import { getEmployeesByCompany, getOrdersByCompany, getProductsByCompany, getCompanyByAdminEmail, isCompanyAdmin, getPendingApprovalCount, getPendingApprovals, getCompanyById, getEmployeeByEmail, getPendingReturnRequestCount, getNewFeedbackCount, getLocationsByCompany } from '@/lib/data-mongodb'
// Data masking removed for Company Admin - they should see all employee information unmasked

export default function CompanyDashboard() {
  const [companyId, setCompanyId] = useState<string>('')
  const [companyName, setCompanyName] = useState<string>('')
  const [companyPrimaryColor, setCompanyPrimaryColor] = useState<string>('#f76b1c')
  const [companySecondaryColor, setCompanySecondaryColor] = useState<string>('#f76b1c')
  const [adminName, setAdminName] = useState<string>('')
  const [companyEmployees, setCompanyEmployees] = useState<any[]>([])
  const [companyOrders, setCompanyOrders] = useState<any[]>([])
  const [pendingApprovalCount, setPendingApprovalCount] = useState<number>(0)
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([])
  const [pendingReturnCount, setPendingReturnCount] = useState<number>(0)
  const [newFeedbackCount, setNewFeedbackCount] = useState<number>(0)
  const [branchCount, setBranchCount] = useState<number>(0)
  const [vendorCount, setVendorCount] = useState<number>(0)
  const [vendorProductCount, setVendorProductCount] = useState<number>(0)
  const [showTooltip, setShowTooltip] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [accessDenied, setAccessDenied] = useState(false)
  const router = useRouter()

  // Helper function to remove "ICICI Bank - " prefix from branch names
  const getBranchName = (employee: any): string => {
    const branchName = employee.branchName || (employee.branchId && typeof employee.branchId === 'object' && employee.branchId.name) || 'N/A'
    if (branchName === 'N/A') return 'N/A'
    return branchName.replace(/^ICICI Bank\s*-\s*/i, '')
  }
  
  // Verify admin access and get company ID
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const verifyAccess = async () => {
        try {
          setLoading(true)
          // Use tab-specific authentication storage
          const { getUserEmail, getCompanyId, setAuthData } = await import('@/lib/utils/auth-storage')
          // CRITICAL SECURITY FIX: Use only tab-specific auth storage
          const userEmail = getUserEmail('company')
          if (!userEmail) {
            setAccessDenied(true)
            setLoading(false)
            return
          }

          // Get company by admin email
          const company = await getCompanyByAdminEmail(userEmail)
          if (!company) {
            setAccessDenied(true)
            setLoading(false)
            alert('Access denied: You are not authorized as a company admin. Please contact your super admin.')
            router.push('/login/company')
            return
          }

          // Verify admin status
          const adminStatus = await isCompanyAdmin(userEmail, company.id)
          if (!adminStatus) {
            setAccessDenied(true)
            setLoading(false)
            alert('Access denied: You are not authorized as a company admin.')
            router.push('/login/company')
            return
          }

          // Set company ID and load data
          setCompanyId(company.id)
          // Update tab-specific storage
          setAuthData('company', {
            userEmail,
            companyId: company.id
          })
          // Also update localStorage for backward compatibility
          localStorage.setItem('companyId', company.id)
          
          // Fetch full company details for name and colors
          const companyDetails = await getCompanyById(company.id)
          if (companyDetails) {
            setCompanyName(companyDetails.name || company.name || 'Company')
            setCompanyPrimaryColor(companyDetails.primaryColor || company.primaryColor || '#f76b1c')
            setCompanySecondaryColor(companyDetails.secondaryColor || companyDetails.primaryColor || company.primaryColor || '#f76b1c')
          } else {
            setCompanyName(company.name || 'Company')
            setCompanyPrimaryColor(company.primaryColor || '#f76b1c')
            setCompanySecondaryColor(company.secondaryColor || company.primaryColor || '#f76b1c')
          }
          
          // Get admin's name
          try {
            const adminEmployee = await getEmployeeByEmail(userEmail)
            if (adminEmployee) {
              const firstName = adminEmployee.firstName || ''
              const lastName = adminEmployee.lastName || ''
              setAdminName(firstName && lastName ? `${firstName} ${lastName}` : firstName || lastName || 'Admin')
            }
          } catch (error) {
            console.error('Error fetching admin name:', error)
            setAdminName('Admin')
          }
          
          // Filter employees by company - only show employees linked to this company
          // CRITICAL: Dashboard must use FULL employee list for accurate counts
          // Do NOT apply any limits here - Employee Management uses the same function and shows all employees
          const filtered = await getEmployeesByCompany(company.id)
          console.log(`[Company Dashboard] Loaded ${filtered?.length || 0} employees for company ${company.id}`)
          if (filtered && filtered.length > 0) {
            console.log(`[Company Dashboard] First employee sample:`, {
              id: filtered[0].id,
              employeeId: filtered[0].employeeId,
              status: filtered[0].status
            })
          }
          // Defensive check: Warn if we get suspiciously few employees (might indicate a limit issue)
          if (filtered && filtered.length > 0 && filtered.length <= 10) {
            console.warn(`[Company Dashboard] ⚠️ Only ${filtered.length} employees loaded. This might indicate a limit issue. Expected more employees for company ${company.id}.`)
          }
          setCompanyEmployees(filtered || [])
          // Filter orders by company
          const orders = await getOrdersByCompany(company.id)
          console.log('Company Dashboard - Orders loaded:', orders.length, orders)
          if (orders.length > 0) {
            console.log('First order sample:', orders[0])
            console.log('First order total:', orders[0].total)
            console.log('First order items:', orders[0].items)
          }
          setCompanyOrders(orders)
          // Get pending approval count
          const pendingCount = await getPendingApprovalCount(company.id)
          setPendingApprovalCount(pendingCount)
          // Get pending approvals for tooltip
          const pending = await getPendingApprovals(company.id)
          setPendingApprovals(pending)
          // Get pending return request count
          const returnCount = await getPendingReturnRequestCount(company.id)
          setPendingReturnCount(returnCount)
          // Get new feedback count
          const feedbackCount = await getNewFeedbackCount(company.id)
          setNewFeedbackCount(feedbackCount)
          // Get branch/location count (Locations and Branches are the same)
          const locations = await getLocationsByCompany(company.id)
          setBranchCount(locations.length)
          // Get vendor count and product stats
          const products = await getProductsByCompany(company.id)
          const uniqueVendors = new Set<string>()
          let totalVendorProducts = 0
          products.forEach((product: any) => {
            if (product.vendors && Array.isArray(product.vendors)) {
              product.vendors.forEach((vendor: any) => {
                if (vendor.id) {
                  uniqueVendors.add(vendor.id)
                  totalVendorProducts++
                }
              })
            }
          })
          setVendorCount(uniqueVendors.size)
          setVendorProductCount(totalVendorProducts)
        } catch (error) {
          console.error('Error loading company data:', error)
          setAccessDenied(true)
          alert('Error verifying access. Please try logging in again.')
          router.push('/login/company')
        } finally {
          setLoading(false)
        }
      }
      
      verifyAccess()
    }
  }, [router])
  
  // CRITICAL: Calculate active employees from FULL array (not sliced/limited)
  // Dashboard metrics must reflect ALL employees, not just displayed subset
  // The table display uses .slice(0, 10) for UI only, but counts must reflect all employees
  const activeEmployees = companyEmployees.filter(e => e.status === 'active').length
  const totalEmployees = companyEmployees.length
  
  // Defensive logging to verify count calculation
  if (companyId) {
    console.log(`[Company Dashboard] Employee count calculation:`, {
      totalEmployees,
      activeEmployees,
      companyEmployeesArrayLength: companyEmployees.length,
      companyId
    })
    // Warn if we have suspiciously few employees (might indicate a limit issue)
    if (totalEmployees > 0 && totalEmployees <= 10) {
      console.warn(`[Company Dashboard] ⚠️ Only ${totalEmployees} employees in state. This might indicate a data loading issue.`)
    }
  }
  
  const totalOrders = companyOrders.length
  // Calculate total spent - always calculate from items to ensure accuracy
  const totalSpent = companyOrders.reduce((sum, order) => {
    // Always calculate from items if available (more reliable)
    if (order.items && Array.isArray(order.items) && order.items.length > 0) {
      const calculatedTotal = order.items.reduce((itemSum: number, item: any) => {
        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0
        const itemTotal = price * quantity
        return itemSum + itemTotal
      }, 0)
      if (calculatedTotal > 0) {
        return sum + calculatedTotal
      }
    }
    // Fallback to order.total if items calculation fails
    if (order.total !== undefined && order.total !== null && typeof order.total === 'number' && !isNaN(order.total) && order.total > 0) {
      return sum + order.total
    }
    console.warn(`Order ${order.id}: Could not calculate total - total=${order.total}, items=${order.items?.length || 0}`)
    return sum
  }, 0)
  
  console.log('Total spent calculated:', totalSpent, 'from', companyOrders.length, 'orders')
  const pendingOrders = companyOrders.filter(o => o.status === 'pending' || o.status === 'confirmed').length

  // CRITICAL: Dashboard stats use FULL employee count (not limited to displayed subset)
  // The table display uses .slice(0, 10) for UI only, but counts must reflect all employees
  const stats = [
    { name: 'Active Employees', value: activeEmployees, icon: Users, color: 'orange' },
    { name: 'Total Orders', value: totalOrders, icon: ShoppingCart, color: 'orange' },
    { name: 'Total Spent', value: `₹${totalSpent.toFixed(2)}`, icon: IndianRupee, color: 'orange' },
    { name: 'Pending Approvals', value: pendingApprovalCount, icon: CheckCircle, color: 'orange' },
    { name: 'Return Requests', value: pendingReturnCount, icon: RefreshCw, color: 'orange' },
    { name: 'New Feedback', value: newFeedbackCount, icon: MessageSquare, color: 'orange' },
    { name: 'Branches', value: branchCount, icon: Building2, color: 'orange' },
    { name: 'Vendors', value: `${vendorCount} (${vendorProductCount} products)`, icon: Store, color: 'orange' },
  ]

  if (loading) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600">Verifying access...</p>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  if (accessDenied) {
    return (
      <DashboardLayout actorType="company">
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center bg-red-50 border border-red-200 rounded-lg p-8 max-w-md">
            <h2 className="text-2xl font-bold text-red-900 mb-4">Access Denied</h2>
            <p className="text-red-700 mb-4">
              You are not authorized to access the company portal. Only assigned company administrators can log in.
            </p>
            <button
              onClick={() => router.push('/login/company')}
              style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
              className="text-white px-6 py-2 rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              Back to Login
            </button>
          </div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout actorType="company">
      <div>
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 via-[#f76b1c] to-slate-900 bg-clip-text text-transparent mb-2" style={{ 
            backgroundImage: `linear-gradient(to right, #1e293b, ${companyPrimaryColor}, #1e293b)`,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent'
          }}>
            {companyName ? `${companyName} Dashboard` : 'Company Dashboard'}
          </h1>
          <p className="text-slate-600">
            {adminName ? `Welcome back, ${adminName}!` : 'Welcome back!'} Here's what's happening with your company.
          </p>
        </div>
        
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          {stats.map((stat) => {
            const Icon = stat.icon
            // Use company colors for stat cards
            const primaryColor = companyPrimaryColor || '#f76b1c'
            const colorClasses = {
              bg: `bg-[${primaryColor}20]`,
              text: `text-[${primaryColor}]`
            }
            
            // Determine if card is clickable and get link
            let isClickable = false
            let linkHref = ''
            if (stat.name === 'Active Employees' && activeEmployees > 0) {
              isClickable = true
              linkHref = '/dashboard/company/employees'
            } else if (stat.name === 'Total Orders' && totalOrders > 0) {
              isClickable = true
              linkHref = '/dashboard/company/orders'
            } else if (stat.name === 'Total Spent' && totalSpent > 0) {
              isClickable = true
              linkHref = '/dashboard/company/reports'
            } else if (stat.name === 'Pending Approvals' && pendingApprovalCount > 0) {
              isClickable = true
              linkHref = '/dashboard/company/approvals'
            } else if (stat.name === 'Return Requests' && pendingReturnCount > 0) {
              isClickable = true
              linkHref = '/dashboard/company/returns'
            } else if (stat.name === 'New Feedback' && newFeedbackCount > 0) {
              isClickable = true
              linkHref = '/dashboard/company/feedback'
            } else if (stat.name === 'Branches' && branchCount > 0) {
              isClickable = true
              linkHref = '/dashboard/company/locations'
            } else if (stat.name === 'Vendors' && vendorCount > 0) {
              isClickable = true
              linkHref = '/dashboard/company/vendor-stock'
            }
            
            // Get unique employees from pending approvals
            const getUniqueEmployees = () => {
              const employeeMap = new Map()
              pendingApprovals.forEach((order: any) => {
                if (order.employeeId) {
                  const empId = order.employeeId.id || order.employeeId
                  if (!employeeMap.has(empId)) {
                    employeeMap.set(empId, {
                      name: order.employeeName || 
                            (order.employeeId?.firstName && order.employeeId?.lastName 
                              ? `${order.employeeId.firstName} ${order.employeeId.lastName}` 
                              : 'Unknown'),
                      email: order.employeeId?.email || 'N/A',
                      employeeId: order.employeeId?.employeeId || 'N/A',
                      orderCount: 0
                    })
                  }
                  employeeMap.get(empId).orderCount++
                }
              })
              return Array.from(employeeMap.values())
            }
            
            // Get active employees list
            const getActiveEmployeesList = () => {
              return companyEmployees
                .filter(e => e.status === 'active')
                .slice(0, 10)
                .map(emp => ({
                  name: `${emp.firstName} ${emp.lastName}`,
                  employeeId: emp.employeeId || 'N/A',
                  email: emp.email || 'N/A',
                  designation: emp.designation || 'N/A'
                }))
            }
            
            // Get recent orders
            const getRecentOrders = () => {
              return companyOrders
                .slice(0, 10)
                .map(order => ({
                  id: order.id,
                  employeeName: order.employeeName || 'Unknown',
                  total: order.items && Array.isArray(order.items) && order.items.length > 0
                    ? order.items.reduce((sum: number, item: any) => {
                        const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
                        const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0
                        return sum + (price * quantity)
                      }, 0)
                    : (order.total || 0),
                  status: order.status || 'Unknown',
                  date: order.orderDate ? new Date(order.orderDate).toLocaleDateString() : 'N/A'
                }))
            }
            
            // Get spending breakdown
            const getSpendingBreakdown = () => {
              const statusBreakdown = companyOrders.reduce((acc: any, order: any) => {
                const orderTotal = order.items && Array.isArray(order.items) && order.items.length > 0
                  ? order.items.reduce((sum: number, item: any) => {
                      const price = typeof item.price === 'number' ? item.price : parseFloat(item.price) || 0
                      const quantity = typeof item.quantity === 'number' ? item.quantity : parseInt(item.quantity) || 0
                      return sum + (price * quantity)
                    }, 0)
                  : (order.total || 0)
                
                const status = order.status || 'Unknown'
                if (!acc[status]) {
                  acc[status] = { count: 0, total: 0 }
                }
                acc[status].count++
                acc[status].total += orderTotal
                return acc
              }, {})
              
              return Object.entries(statusBreakdown).map(([status, data]: [string, any]) => ({
                status,
                count: data.count,
                total: data.total
              }))
            }
            
            const StatCard = (
              <div 
                className={`glass rounded-2xl shadow-modern-lg p-4 border border-slate-200/50 ${isClickable ? 'cursor-pointer hover-lift' : ''} transition-smooth`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-500 text-[10px] font-medium mb-1 truncate">{stat.name}</p>
                    <p className="text-xl font-bold bg-gradient-to-r from-slate-900 to-slate-700 bg-clip-text text-transparent leading-tight break-words">{stat.value}</p>
                  </div>
                  <div 
                    className="p-2.5 rounded-lg shadow-modern flex-shrink-0 ml-2"
                    style={{ 
                      backgroundColor: companyPrimaryColor ? `${companyPrimaryColor}20` : 'rgba(247, 107, 28, 0.2)'
                    }}
                  >
                    <Icon 
                      className="h-4 w-4" 
                      style={{ color: companyPrimaryColor || '#f76b1c' }}
                    />
                  </div>
                </div>
              </div>
            )
            
            // Render tooltip based on stat type
            const renderTooltip = () => {
              if (showTooltip !== stat.name) return null
              
              if (stat.name === 'Pending Approvals' && pendingApprovals.length > 0) {
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Pending Approvals - Employee Details
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {getUniqueEmployees().map((emp: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">{emp.name}</div>
                          <div className="text-gray-300">ID: {emp.employeeId}</div>
                          <div className="text-gray-300">Email: {emp.email}</div>
                          <div className="text-gray-400 mt-1">
                            {emp.orderCount} order{emp.orderCount > 1 ? 's' : ''} pending
                          </div>
                          {idx < getUniqueEmployees().length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Active Employees' && activeEmployees > 0) {
                const employees = getActiveEmployeesList()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Active Employees ({activeEmployees} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {employees.map((emp: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">{emp.name}</div>
                          <div className="text-gray-300">ID: {emp.employeeId}</div>
                          <div className="text-gray-300">Email: {emp.email}</div>
                          <div className="text-gray-300">Designation: {emp.designation}</div>
                          {idx < employees.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {activeEmployees > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{activeEmployees - 10} more employees
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Total Orders' && totalOrders > 0) {
                const orders = getRecentOrders()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Recent Orders ({totalOrders} total)
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orders.map((order: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="font-semibold text-white mb-1">Order #{order.id}</div>
                          <div className="text-gray-300">Employee: {order.employeeName}</div>
                          <div className="text-gray-300">Amount: ₹{order.total.toFixed(2)}</div>
                          <div className="text-gray-300">Status: {order.status}</div>
                          <div className="text-gray-400">Date: {order.date}</div>
                          {idx < orders.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      {totalOrders > 10 && (
                        <div className="text-gray-400 text-xs mt-2 pt-2 border-t border-gray-700">
                          +{totalOrders - 10} more orders
                        </div>
                      )}
                    </div>
                  </div>
                )
              }
              
              if (stat.name === 'Total Spent' && totalSpent > 0) {
                const breakdown = getSpendingBreakdown()
                return (
                  <div className="absolute z-50 left-0 top-full mt-2 w-80 bg-gray-900 text-white rounded-lg shadow-2xl p-4 pointer-events-none">
                    <div className="text-sm font-semibold mb-3 pb-2 border-b border-gray-700">
                      Spending Breakdown
                    </div>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {breakdown.map((item: any, idx: number) => (
                        <div key={idx} className="text-xs">
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-semibold text-white">{item.status}</span>
                            <span className="text-gray-300">₹{item.total.toFixed(2)}</span>
                          </div>
                          <div className="text-gray-400">{item.count} order{item.count > 1 ? 's' : ''}</div>
                          {idx < breakdown.length - 1 && (
                            <div className="border-t border-gray-700 mt-2 pt-2"></div>
                          )}
                        </div>
                      ))}
                      <div className="border-t border-gray-700 mt-3 pt-3">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-white">Total</span>
                          <span className="font-bold text-white text-sm">₹{totalSpent.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              }
              
              return null
            }
            
            if (isClickable) {
              return (
                <div 
                  key={stat.name} 
                  className="relative"
                  onMouseEnter={() => setShowTooltip(stat.name)}
                  onMouseLeave={() => setShowTooltip(null)}
                >
                  <Link href={linkHref} className="block">
                    {StatCard}
                  </Link>
                  {renderTooltip()}
                </div>
              )
            }
            
            return (
              <div key={stat.name}>
                {StatCard}
              </div>
            )
          })}
        </div>

        {/* Quick Actions */}
        <div className="grid md:grid-cols-2 gap-6 mb-8">
          <div className="glass rounded-2xl shadow-modern-lg p-6 border border-slate-200/50">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button 
                style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                className="w-full text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity hover-lift shadow-md"
              >
                Upload Employee Data
              </button>
              <Link
                href="/dashboard/company/batch-upload"
                style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                className="w-full text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity hover-lift text-center block shadow-md"
              >
                Place Bulk Order
              </Link>
              <button 
                style={{ backgroundColor: companyPrimaryColor || '#f76b1c' }}
                className="w-full text-white py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity hover-lift shadow-md"
              >
                Generate Report
              </button>
            </div>
          </div>

          <div className="glass rounded-2xl shadow-modern-lg p-6 border border-slate-200/50">
            <h2 className="text-xl font-bold text-slate-900 mb-4">Recent Activity</h2>
            <div className="space-y-3">
              {companyOrders.slice(0, 3).map((order) => (
                <div key={order.id} className="flex items-center justify-between p-3 bg-slate-50/50 rounded-xl border border-slate-100 hover:bg-slate-100/50 transition-smooth">
                  <div>
                    <p className="font-semibold text-slate-900">{order.employeeName || 'N/A'}</p>
                    <p className="text-sm text-slate-600">Order #{order.id}</p>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    order.status === 'confirmed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                  }`}>
                    {order.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Employee Overview */}
        <div className="glass rounded-2xl shadow-modern-lg p-6 border border-slate-200/50">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Employee Overview</h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Employee ID</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Name</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Designation</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Branch</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Location</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Email</th>
                  <th className="text-left py-3 px-4 text-gray-700 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {companyEmployees.slice(0, 10).map((employee) => {
                  // Company Admin can see all employee information unmasked
                  return (
                    <tr key={employee.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <span 
                          className="font-mono text-sm font-semibold"
                          style={{ color: companyPrimaryColor || '#f76b1c' }}
                        >
                          {employee.employeeId || 'N/A'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-900 font-medium">{employee.firstName} {employee.lastName}</td>
                      <td className="py-3 px-4 text-gray-600">{employee.designation}</td>
                      <td className="py-3 px-4 text-gray-600">
                        {getBranchName(employee)}
                      </td>
                      <td className="py-3 px-4 text-gray-600">{employee.location}</td>
                      <td className="py-3 px-4 text-gray-600">{employee.email}</td>
                      <td className="py-3 px-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          employee.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {employee.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {/* Show indicator if more employees exist beyond displayed 10 */}
            {companyEmployees.length > 10 && (
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 text-center text-sm text-gray-600">
                Showing 10 of {companyEmployees.length} employees. 
                <Link href="/dashboard/company/employees" className="ml-2 text-blue-600 hover:underline font-semibold">
                  View all employees →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

