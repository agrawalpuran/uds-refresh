'use client'

import { ReactNode, useState, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  LayoutDashboard, Package, Users, FileText, BarChart3, 
  Settings, LogOut, MapPin, ShoppingCart, Upload, Shield, Warehouse, MessageSquare, Menu, X, RefreshCw, Layers, Tag, Link2, ChevronDown, ChevronRight, Truck, Plus, Mail
} from 'lucide-react'
import { mockEmployees, mockCompanies, getVendorById, getCompanyById, getEmployeeByEmail } from '@/lib/data'
import { getCompanyById as getCompanyByIdAPI, getBranchByAdminEmail, getCompanyByAdminEmail, getLocationByAdminEmail, getEmployeeByEmail as getEmployeeByEmailAPI, getVendorById as getVendorByIdAPI } from '@/lib/data-mongodb'
import Image from 'next/image'

interface DashboardLayoutProps {
  children: ReactNode
  actorType: 'vendor' | 'company' | 'consumer' | 'superadmin'
}

export default function DashboardLayout({ children, actorType }: DashboardLayoutProps) {
  const pathname = usePathname()
  const [currentCompany, setCurrentCompany] = useState<any>(null)
  const [currentVendor, setCurrentVendor] = useState<any>(null)
  const [currentEmployee, setCurrentEmployee] = useState<any>(null)
  const [isBranchAdmin, setIsBranchAdmin] = useState<boolean>(false)
  const [isLocationAdmin, setIsLocationAdmin] = useState<boolean>(false)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState<boolean>(false)
  const [canLocationAdminViewFeedback, setCanLocationAdminViewFeedback] = useState<boolean>(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false)
  const [approvalCounts, setApprovalCounts] = useState<{
    pendingOrderApprovals?: number
    pendingReturnRequests?: number
    pendingOrders?: number
    pendingReplacementOrders?: number
    newFeedbackCount?: number
    newInvoiceCount?: number
    newGRNCount?: number
    approvedGRNCount?: number
    approvedInvoiceCount?: number
  }>({})
  const [currentLocation, setCurrentLocation] = useState<any>(null)
  const [visitedMenuItems, setVisitedMenuItems] = useState<Set<string>>(new Set())
  
  // Load visited menu items from sessionStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const stored = sessionStorage.getItem(`visitedMenuItems_${actorType}`)
    if (stored) {
      try {
        const visited = JSON.parse(stored)
        setVisitedMenuItems(new Set(visited))
      } catch (e) {
        console.warn('Error loading visited menu items:', e)
      }
    }
  }, [actorType])
  
  // Mark current pathname as visited when it changes
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return
    
    setVisitedMenuItems(prev => {
      const newSet = new Set(prev)
      newSet.add(pathname)
      // Save to sessionStorage
      sessionStorage.setItem(`visitedMenuItems_${actorType}`, JSON.stringify(Array.from(newSet)))
      return newSet
    })
  }, [pathname, actorType])
  
  // CRITICAL: Initialize expandedCategories as a Set that persists across renders
  // This ensures menu state is maintained during navigation
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  // Memoize categories to prevent unnecessary recalculations
  const getMenuCategories = (): MenuCategory[] => {
    if (actorType === 'vendor') {
      return vendorMenuCategories
    } else if (actorType === 'company' && isCompanyAdmin) {
      return companyAdminMenuCategories
    }
    return []
  }
  const [testOrdersEnabled, setTestOrdersEnabled] = useState<boolean>(true) // Default: enabled

  useEffect(() => {
    // Use tab-specific authentication storage
    const loadAuthData = async () => {
      const { getUserEmail, getCompanyId, getVendorId } = await import('@/lib/utils/auth-storage')
      
      if (actorType === 'consumer') {
        // Get current employee from tab-specific storage
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage (no localStorage fallback)
        const userEmail = getUserEmail('consumer')
        if (userEmail) {
          // Check if user is Location Admin and get employee
          Promise.all([
            getLocationByAdminEmail(userEmail),
            getEmployeeByEmailAPI(userEmail)
          ]).then(async ([location, employee]) => {
            setIsLocationAdmin(!!location)
            
            if (employee) {
              // API should already return decrypted data for authorized users
              // No need to decrypt client-side
              setCurrentEmployee(employee)
              // Get company for employee
              const companyId = typeof employee.companyId === 'object' && employee.companyId?.id 
                ? employee.companyId.id 
                : employee.companyId
              if (companyId) {
                getCompanyByIdAPI(companyId)
                  .then(company => {
                    if (company) {
                      setCurrentCompany(company)
                      // Check if Location Admin can view feedback
                      if (location && company.allowLocationAdminViewFeedback) {
                        setCanLocationAdminViewFeedback(true)
                        console.log('[DashboardLayout] Consumer: Location Admin can view feedback - setting enabled')
                      } else {
                        setCanLocationAdminViewFeedback(false)
                      }
                    } else {
                      const mockCompany = getCompanyById(companyId)
                      setCurrentCompany(mockCompany || null)
                      setCanLocationAdminViewFeedback(false)
                    }
                  })
                  .catch(() => {
                    const mockCompany = getCompanyById(companyId)
                    setCurrentCompany(mockCompany || null)
                    setCanLocationAdminViewFeedback(false)
                  })
              }
            } else {
              // Fallback to mock data
              const mockEmployee = getEmployeeByEmail(userEmail) || mockEmployees[0] || null
              setCurrentEmployee(mockEmployee)
              if (mockEmployee?.companyId) {
                const company = getCompanyById(mockEmployee.companyId)
                setCurrentCompany(company || null)
              }
              setCanLocationAdminViewFeedback(false)
            }
          })
          .catch(() => {
            // Fallback to mock data on error
            const mockEmployee = getEmployeeByEmail(userEmail) || mockEmployees[0] || null
            setCurrentEmployee(mockEmployee)
            if (mockEmployee?.companyId) {
              const company = getCompanyById(mockEmployee.companyId)
              setCurrentCompany(company || null)
            }
            setCanLocationAdminViewFeedback(false)
          })
        } else {
          // No email, use mock data
          const mockEmployee = mockEmployees[0] || null
          setCurrentEmployee(mockEmployee)
          if (mockEmployee?.companyId) {
            const company = getCompanyById(mockEmployee.companyId)
            setCurrentCompany(company || null)
          }
          setCanLocationAdminViewFeedback(false)
        }
      } else if (actorType === 'company') {
        // Get company from tab-specific storage
        const companyId = getCompanyId() || (typeof window !== 'undefined' ? localStorage.getItem('companyId') : null)
        // CRITICAL SECURITY FIX: Use only tab-specific auth storage (no localStorage fallback)
        const userEmail = getUserEmail('company')
        
        // Check if user is Branch Admin, Location Admin, or Company Admin
        if (userEmail) {
          Promise.all([
            getBranchByAdminEmail(userEmail),
            getLocationByAdminEmail(userEmail),
            getCompanyByAdminEmail(userEmail)
          ]).then(([branch, location, company]) => {
            setIsBranchAdmin(!!branch)
            setIsLocationAdmin(!!location)
            setIsCompanyAdmin(!!company)
            setCurrentLocation(location) // Store location for approval counts
            
            // If Branch Admin, use branch's company; if Location Admin, use location's company; otherwise use companyId
            const targetCompanyId = branch?.companyId?.id || branch?.companyId || location?.companyId?.id || location?.companyId || companyId || company?.id
            
            if (targetCompanyId) {
              // Fetch company from API to get latest branding
              getCompanyByIdAPI(targetCompanyId)
                .then(companyData => {
                  if (companyData) {
                    setCurrentCompany(companyData)
                  } else {
                    // Fallback to mock data
                    const mockCompany = getCompanyById(targetCompanyId)
                    setCurrentCompany(mockCompany || mockCompanies[0] || null)
                  }
                })
                .catch(() => {
                  // Fallback to mock data on error
                  const mockCompany = getCompanyById(targetCompanyId)
                  setCurrentCompany(mockCompany || mockCompanies[0] || null)
                })
            } else {
              setCurrentCompany(mockCompanies[0] || null)
            }
          }).catch(() => {
            // On error, fall back to companyId-based lookup
            if (companyId) {
              getCompanyByIdAPI(companyId)
                .then(company => {
                  if (company) {
                    setCurrentCompany(company)
                  } else {
                    const mockCompany = getCompanyById(companyId)
                    setCurrentCompany(mockCompany || mockCompanies[0] || null)
                  }
                })
                .catch(() => {
                  const mockCompany = getCompanyById(companyId)
                  setCurrentCompany(mockCompany || mockCompanies[0] || null)
                })
            } else {
              setCurrentCompany(mockCompanies[0] || null)
            }
          })
        } else if (companyId) {
          // Fetch company from API to get latest branding
          getCompanyByIdAPI(companyId)
            .then(company => {
              if (company) {
                setCurrentCompany(company)
              } else {
                // Fallback to mock data
                const mockCompany = getCompanyById(companyId)
                setCurrentCompany(mockCompany || mockCompanies[0] || null)
              }
            })
            .catch(() => {
              // Fallback to mock data on error
              const mockCompany = getCompanyById(companyId)
              setCurrentCompany(mockCompany || mockCompanies[0] || null)
            })
        } else {
          setCurrentCompany(mockCompanies[0] || null)
        }
      } else if (actorType === 'vendor') {
        // Get vendor from tab-specific storage
        const vendorId = getVendorId() || (typeof window !== 'undefined' ? localStorage.getItem('vendorId') : null)
        if (vendorId) {
          // Try to fetch vendor from API first
          getVendorByIdAPI(vendorId)
            .then(vendor => {
              if (vendor) {
                setCurrentVendor(vendor)
              } else {
                // Fallback to mock data
                const mockVendor = getVendorById(vendorId)
                setCurrentVendor(mockVendor || null)
              }
            })
            .catch(() => {
              // Fallback to mock data on error
              const mockVendor = getVendorById(vendorId)
              setCurrentVendor(mockVendor || null)
            })
        } else {
          // Fallback: try default vendor ID
          getVendorByIdAPI('VEND-001')
            .then(vendor => {
              if (vendor) {
                setCurrentVendor(vendor)
              } else {
                const mockVendor = getVendorById('VEND-001')
                setCurrentVendor(mockVendor || null)
              }
            })
            .catch(() => {
              const mockVendor = getVendorById('VEND-001')
              setCurrentVendor(mockVendor || null)
            })
        }
      }
    }
    
    loadAuthData()
  }, [actorType])

  // Fetch approval counts when company/vendor/location is loaded
  useEffect(() => {
    // Only run in browser environment
    if (typeof window === 'undefined') return

    const fetchApprovalCounts = async () => {
      try {
        // Only fetch if we have the required data
        if (actorType === 'company' && currentCompany?.id) {
          if (isLocationAdmin && currentLocation?.id) {
            // For location admin, get order approvals for their location
            try {
              const response = await fetch(`/api/approvals/counts?locationId=${encodeURIComponent(currentLocation.id)}&role=location`)
              if (response.ok) {
                const counts = await response.json()
                setApprovalCounts(counts)
              } else {
                // Silently fail for non-OK responses to avoid console errors
                console.warn('Failed to fetch approval counts for location admin:', response.status)
              }
            } catch (fetchError) {
              // Silently handle fetch errors (network issues, etc.)
              console.warn('Error fetching approval counts for location admin:', fetchError)
            }
          } else if (isCompanyAdmin && currentCompany?.id) {
            // For company admin, get both order approvals and return requests
            try {
              const response = await fetch(`/api/approvals/counts?companyId=${encodeURIComponent(currentCompany.id)}&role=company`)
              if (response.ok) {
                const counts = await response.json()
                setApprovalCounts(counts)
              } else {
                // Silently fail for non-OK responses to avoid console errors
                console.warn('Failed to fetch approval counts for company admin:', response.status)
              }
            } catch (fetchError) {
              // Silently handle fetch errors (network issues, etc.)
              console.warn('Error fetching approval counts for company admin:', fetchError)
            }
          }
        } else if (actorType === 'vendor' && currentVendor?.id) {
          // For vendor, get pending orders and replacement orders
          try {
            const response = await fetch(`/api/approvals/counts?vendorId=${encodeURIComponent(currentVendor.id)}&role=vendor`)
            if (response.ok) {
              const counts = await response.json()
              setApprovalCounts(counts)
            } else {
              // Silently fail for non-OK responses to avoid console errors
              console.warn('Failed to fetch approval counts for vendor:', response.status)
            }
          } catch (fetchError) {
            // Silently handle fetch errors (network issues, etc.)
            console.warn('Error fetching approval counts for vendor:', fetchError)
          }
        }
      } catch (error) {
        // Silently handle any unexpected errors
        console.warn('Error in fetchApprovalCounts:', error)
      }
    }

    // Only fetch if we have the required conditions
    const shouldFetch = 
      (actorType === 'company' && currentCompany?.id && (
        (isLocationAdmin && currentLocation?.id) || 
        isCompanyAdmin
      )) ||
      (actorType === 'vendor' && currentVendor?.id)

    if (shouldFetch) {
      fetchApprovalCounts()
      
      // Refresh counts when pathname changes (user navigates) or every 30 seconds
      const interval = setInterval(fetchApprovalCounts, 30000) // Refresh every 30 seconds
      
      // Listen for custom event to refresh badge counts immediately (e.g., after marking feedback as viewed)
      const handleRefreshBadgeCounts = () => {
        fetchApprovalCounts()
      }
      window.addEventListener('refreshBadgeCounts', handleRefreshBadgeCounts)
      
      return () => {
        clearInterval(interval)
        window.removeEventListener('refreshBadgeCounts', handleRefreshBadgeCounts)
      }
    }
  }, [actorType, currentCompany?.id, currentVendor?.id, currentLocation?.id, isLocationAdmin, isCompanyAdmin, pathname])

  // Vendor menu with hierarchical structure
  const vendorMenuCategories: MenuCategory[] = [
    {
      name: 'Order Management',
      icon: ShoppingCart,
      items: [
        { name: 'Orders', href: '/dashboard/vendor/orders', icon: ShoppingCart },
        { name: 'Awaiting Pickup', href: '/dashboard/vendor/orders/awaiting-pickup', icon: Truck },
        { name: 'Replacement Orders', href: '/dashboard/vendor/replacement-orders', icon: RefreshCw },
        { name: 'GRN & Invoice', href: '/dashboard/vendor/grns', icon: FileText },
        { name: 'Feedback', href: '/dashboard/vendor/feedback', icon: MessageSquare },
      ]
    }
  ]

  // Base vendor menu items (flat items)
  const baseVendorMenuItems: MenuItem[] = [
    { name: 'Dashboard', href: '/dashboard/vendor', icon: LayoutDashboard },
    { name: 'Catalog', href: '/dashboard/vendor/catalog', icon: Package },
    { name: 'Inventory', href: '/dashboard/vendor/inventory', icon: Package },
    { name: 'Warehouses', href: '/dashboard/vendor/warehouses', icon: Warehouse },
    { name: 'Reports', href: '/dashboard/vendor/reports', icon: BarChart3 },
  ]

  // Combined vendor menu: base items + categories
  const vendorMenu: (MenuItem | MenuCategory)[] = [
    ...baseVendorMenuItems,
    ...vendorMenuCategories,
  ]

  // Base company menu items (available to all company users) - flat items
  const baseCompanyMenuItems: MenuItem[] = [
    { name: 'Dashboard', href: '/dashboard/company', icon: LayoutDashboard },
  ]

  // Hierarchical menu categories for Company Admin
  const companyAdminMenuCategories: MenuCategory[] = [
    {
      name: 'Employee Management',
      icon: Users,
      items: [
        { name: 'Employee Upload', href: '/dashboard/company/employee-upload', icon: Upload },
        { name: 'Employee List', href: '/dashboard/company/employees', icon: Users },
      ]
    },
    {
      name: 'Orders',
      icon: ShoppingCart,
      items: [
        { name: 'Bulk Order Upload', href: '/dashboard/company/batch-upload', icon: Upload },
        { name: 'Order History', href: '/dashboard/company/orders', icon: ShoppingCart },
        { name: 'Return Requests', href: '/dashboard/company/returns', icon: RefreshCw },
        { name: 'Approvals', href: '/dashboard/company/approvals', icon: FileText },
        { name: 'GRN', href: '/dashboard/company/grns', icon: FileText },
        { name: 'Invoices', href: '/dashboard/company/invoices', icon: FileText },
        { name: 'Feedback', href: '/dashboard/company/feedback', icon: MessageSquare },
      ]
    },
    {
      name: 'Catalogue & Eligibility',
      icon: Package,
      items: [
        { name: 'Product Catalogue', href: '/dashboard/company/catalog', icon: Package },
        { name: 'Product–Subcategory Associations', href: '/dashboard/company/product-subcategories', icon: Link2 },
        { name: 'Subcategory Management', href: '/dashboard/company/subcategories', icon: Layers },
        { name: 'Designation Product Eligibility', href: '/dashboard/company/designation-eligibility', icon: Shield },
      ]
    },
    {
      name: 'Configuration',
      icon: Settings,
      items: [
        { name: 'Settings', href: '/dashboard/company/settings', icon: Settings },
      ]
    },
  ]

  // Additional flat menu items for Company Admin
  const companyAdminFlatMenu: MenuItem[] = [
    { name: 'Branches', href: '/dashboard/company/locations', icon: MapPin },
    { name: 'Vendor Stock', href: '/dashboard/company/vendor-stock', icon: Warehouse },
    { name: 'Reports', href: '/dashboard/company/reports', icon: BarChart3 },
  ]

  // Toggle category expansion
  // IMPORTANT: Only toggles when the parent menu button is clicked directly
  // Sub-menu item clicks should NOT trigger this (they use Link navigation)
  // CRITICAL: Never collapse a category that has an active sub-item
  const toggleCategory = (categoryName: string, event?: React.MouseEvent) => {
    // Prevent event propagation to avoid conflicts with sub-menu clicks
    if (event) {
      event.preventDefault()
      event.stopPropagation()
    }
    
    // Find the category to check if it has an active item
    const allCategories = getMenuCategories()
    const category = allCategories.find(cat => cat.name === categoryName)
    const hasActiveItem = category?.items.some(item => pathname === item.href) || false
    
    // CRITICAL: If category has an active item, NEVER allow collapsing
    // This is the key fix - prevent collapse when any sub-item is active
    if (hasActiveItem) {
      // Don't collapse - category must stay open when it has an active item
      // Even if user clicks the parent button, keep it open
      return
    }
    
    // Only toggle if category doesn't have an active item
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      if (newSet.has(categoryName)) {
        newSet.delete(categoryName)
      } else {
        newSet.add(categoryName)
      }
      return newSet
    })
  }

  // Build company menu: base items + hierarchical categories (if admin) + flat admin items
  const getCompanyMenu = () => {
    if (actorType !== 'company') return []
    
    const menu: (MenuItem | MenuCategory)[] = [...baseCompanyMenuItems]
    
    if (isCompanyAdmin) {
      // Add hierarchical categories
      menu.push(...companyAdminMenuCategories)
      // Add flat admin items
      menu.push(...companyAdminFlatMenu)
    } else {
      // For non-admin company users, add flat menu items
      menu.push(
        { name: 'Employees', href: '/dashboard/company/employees', icon: Users },
        { name: 'Catalog', href: '/dashboard/company/catalog', icon: Package },
        { name: 'Orders', href: '/dashboard/company/orders', icon: ShoppingCart },
        { name: 'Feedback', href: '/dashboard/company/feedback', icon: MessageSquare },
        { name: 'Return Requests', href: '/dashboard/company/returns', icon: RefreshCw },
      )
    }
    
    return menu
  }

  // Auto-expand category if current pathname matches any item in it
  // This ensures categories stay expanded when navigating between sub-menu items
  // CRITICAL: Use useLayoutEffect for synchronous updates before paint
  // This prevents visual collapse during navigation
  useLayoutEffect(() => {
    const allCategories = getMenuCategories()
    
    // Auto-expand categories that contain the current route
    // This ensures that when navigating between sub-menu items, the parent stays open
    // CRITICAL: Use functional update to ensure we don't lose existing expanded categories
    setExpandedCategories(prev => {
      const newSet = new Set(prev)
      let hasChanges = false
      
      // Normalize pathname for comparison
      const normalizedPathname = pathname.replace(/\/$/, '')
      
      allCategories.forEach(category => {
        const hasActiveItem = category.items.some(item => {
          const normalizedHref = item.href.replace(/\/$/, '')
          return normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + '/')
        })
        if (hasActiveItem) {
          // Always add category to expanded set if it has an active item
          // This is critical - ensures category stays open during navigation
          if (!newSet.has(category.name)) {
            newSet.add(category.name)
            hasChanges = true
          }
        }
        // Note: We don't remove categories here - they stay expanded until manually toggled
        // This prevents collapsing when navigating between sub-items
      })
      
      // Only return new set if there were changes (prevents unnecessary re-renders)
      return hasChanges ? newSet : prev
    })
  }, [pathname, actorType, isCompanyAdmin])

  // Site Admin (Location Admin) bulk upload menu item (for Employee Portal only)
  const siteAdminBulkUploadMenu = [
    { name: 'Site Bulk Orders', href: '/dashboard/consumer/site-bulk-orders', icon: Upload },
  ]

  // Base consumer menu items
  const baseConsumerMenu = [
    { name: 'Dashboard', href: '/dashboard/consumer', icon: LayoutDashboard },
    { name: 'Catalog', href: '/dashboard/consumer/catalog', icon: Package },
    { name: 'My Orders', href: '/dashboard/consumer/orders', icon: ShoppingCart },
    { name: 'Profile', href: '/dashboard/consumer/profile', icon: Settings },
  ]
  
  // Consumer menu with optional items for Location Admins
  const consumerMenu = [
    ...baseConsumerMenu,
    // Add PR Approvals for Location Admins (Site Admins)
    ...(isLocationAdmin ? [
      { name: 'PR Approvals', href: '/dashboard/consumer/approvals', icon: Shield }
    ] : []),
    // Add Site Bulk Orders for Location Admins (Site Admins)
    ...(isLocationAdmin ? siteAdminBulkUploadMenu : []),
    // Add Feedback for Location Admins when setting is enabled
    ...(isLocationAdmin && canLocationAdminViewFeedback ? [
      { name: 'Feedback', href: '/dashboard/consumer/feedback', icon: MessageSquare }
    ] : [])
  ]

  // Load feature flag for Super Admin menu
  useEffect(() => {
    if (actorType === 'superadmin') {
      const loadFeatureFlag = async () => {
        try {
          const response = await fetch('/api/superadmin/feature-config')
          if (response.ok) {
            const config = await response.json()
            setTestOrdersEnabled(config.testOrdersEnabled === true)
          }
        } catch (error) {
          console.error('Error loading feature flag:', error)
          // Default to true (feature enabled by default)
          setTestOrdersEnabled(true)
        }
      }
      loadFeatureFlag()
    }
  }, [actorType])

  // Build Super Admin menu conditionally based on feature flag
  const superAdminMenu = [
    { name: 'Dashboard', href: '/dashboard/superadmin', icon: LayoutDashboard },
    { name: 'Workflow Configuration', href: '/dashboard/superadmin/workflow-config', icon: Settings },
    { name: 'Categories', href: '/dashboard/superadmin/categories', icon: Tag },
    { name: 'Logistics & Shipping', href: '/dashboard/superadmin/logistics', icon: Truck },
    { name: 'Notifications', href: '/dashboard/superadmin/notifications', icon: Mail },
    // Only show "Create Test Order" menu item if feature is enabled
    ...(testOrdersEnabled ? [{ name: 'Create Test Order', href: '/dashboard/superadmin/create-test-order', icon: Plus }] : []),
  ]

  const menu = actorType === 'vendor' ? vendorMenu 
    : actorType === 'company' ? getCompanyMenu()
    : actorType === 'superadmin' ? superAdminMenu
    : consumerMenu

  const getActorName = () => {
    if (actorType === 'vendor') return 'Vendor Portal'
    if (actorType === 'company') return 'Company Portal'
    if (actorType === 'superadmin') return 'Super Admin Portal'
    return 'Employee Portal'
  }

  const getActorColor = () => {
    if (actorType === 'vendor') {
      return currentVendor?.primaryColor || '#2563eb'
    }
    if (actorType === 'company') {
      return currentCompany?.primaryColor || '#f76b1c'
    }
    return 'green'
  }

  const getHeaderColor = () => {
    if (actorType === 'vendor') {
      return currentVendor?.primaryColor || '#2563eb'
    }
    if (actorType === 'company') {
      return currentCompany?.primaryColor || '#f76b1c'
    }
    if (actorType === 'superadmin') return 'bg-red-600'
    return 'bg-[#f76b1c]'
  }
  
  const getHeaderStyle = () => {
    // Use ServiceNow Infinite Blue as default
    const servicenowBlue = '#032D42'
    
    if (actorType === 'vendor' && currentVendor) {
      return {
        backgroundColor: currentVendor.primaryColor || servicenowBlue,
        color: 'white'
      }
    }
    if (actorType === 'company' && currentCompany) {
      return {
        backgroundColor: currentCompany.primaryColor || servicenowBlue,
        color: 'white'
      }
    }
    if (actorType === 'superadmin') {
      return {
        backgroundColor: servicenowBlue,
        color: 'white'
      }
    }
    return {
      backgroundColor: servicenowBlue,
      color: 'white'
    }
  }

  const getActiveLinkClasses = () => {
    if (actorType === 'vendor') {
      const primaryColor = currentVendor?.primaryColor || '#2563eb'
      return `font-semibold`
    }
    if (actorType === 'company') {
      // Use dynamic color classes based on company's secondary color
      return 'font-semibold'
    }
    if (actorType === 'superadmin') return 'bg-red-50 text-red-700 font-semibold'
    return 'bg-orange-50 text-orange-700 font-semibold'
  }
  
  const getActiveLinkStyle = (isActive: boolean) => {
    if (actorType === 'vendor' && currentVendor && isActive) {
      return {
        backgroundColor: `${currentVendor.accentColor}20`,
        color: currentVendor.primaryColor
      }
    }
    if (actorType === 'company' && currentCompany && isActive) {
      const secondaryColor = currentCompany.secondaryColor || currentCompany.primaryColor || '#f76b1c'
      return {
        backgroundColor: `${secondaryColor}20`,
        color: currentCompany.primaryColor || '#f76b1c'
      }

    }
    return {}
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-lg border border-neutral-200"
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? (
          <X className="h-6 w-6 text-gray-700" />
        ) : (
          <Menu className="h-6 w-6 text-gray-700" />
        )}
      </button>

      {/* Mobile Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 w-64 bg-white border-r border-neutral-200 z-40 shadow-sm transform transition-transform duration-300 ease-in-out ${
        mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        <div className={`${(actorType === 'consumer' && currentEmployee) || (actorType === 'vendor' && currentVendor) ? 'h-20' : 'h-16'} flex items-center justify-between px-6 border-b border-neutral-200 relative`} style={getHeaderStyle()}>
          {/* Close button for mobile */}
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden absolute right-4 p-1 text-white hover:bg-white/20 rounded"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          {actorType === 'vendor' && currentVendor ? (
            <div className="flex flex-col justify-center w-full">
              <h2 className="text-white font-semibold text-base">{getActorName()}</h2>
              <p className="text-white text-xs opacity-90 mt-0.5 font-medium">
                {currentVendor.name || currentVendor.id || 'Vendor'}
              </p>
            </div>
          ) : actorType === 'vendor' ? (
            <div className="flex flex-col justify-center w-full">
              <h2 className="text-white font-semibold text-base">{getActorName()}</h2>
              <p className="text-white text-xs opacity-90 mt-0.5 font-medium">Loading...</p>
            </div>
          ) : currentCompany && (actorType === 'consumer' || actorType === 'company') ? (
            <div className="flex items-center space-x-3">
              <div className="relative w-10 h-10 bg-white rounded-lg flex items-center justify-center overflow-hidden shadow-modern">
                {currentCompany.name === 'ICICI Bank' ? (
                  // Custom ICICI Bank logo - Orange theme
                  <svg width="32" height="32" viewBox="0 0 32 32" className="rounded">
                    <rect width="32" height="32" rx="4" fill="#f76b1c"/>
                    <text x="16" y="22" fontSize="10" fontWeight="bold" fill="white" textAnchor="middle" fontFamily="Arial, sans-serif">ICICI</text>
                  </svg>
                ) : currentCompany.logo ? (
                  <Image
                    src={currentCompany.logo}
                    alt={currentCompany.name}
                    width={40}
                    height={40}
                    className="object-contain p-1"
                  />
                ) : (
                  <span className="text-xs font-bold" style={{ color: currentCompany.primaryColor || '#f76b1c' }}>
                    {currentCompany.name.charAt(0)}
                  </span>
                )}
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm leading-tight">{currentCompany.name}</h2>
                <p className="text-white text-xs opacity-80 mt-0.5">{getActorName()}</p>
                {actorType === 'consumer' && currentEmployee && (
                  <p className="text-white text-xs opacity-90 mt-1 font-medium">
                    {(() => {
                      // Get name - should already be decrypted from decryptEmployeeData above
                      const firstName = currentEmployee.firstName || ''
                      const lastName = currentEmployee.lastName || ''
                      
                      if (firstName && lastName) {
                        return `${firstName} ${lastName}`
                      }
                      return currentEmployee.name || currentEmployee.employeeId || 'Employee'
                    })()}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-white font-semibold text-base">{getActorName()}</h2>
              {actorType === 'consumer' && currentEmployee && (
                <p className="text-white text-xs opacity-90 mt-1 font-medium">
                  {(() => {
                    // Get name - should already be decrypted from decryptEmployeeData above
                    const firstName = currentEmployee.firstName || ''
                    const lastName = currentEmployee.lastName || ''
                    
                    if (firstName && lastName) {
                      return `${firstName} ${lastName}`
                    }
                    return currentEmployee.name || currentEmployee.employeeId || 'Employee'
                  })()}
                </p>
              )}
            </div>
          )}
        </div>
        <nav className="mt-6 px-3">
          {menu.map((item) => {
            const primaryColor = actorType === 'company' && currentCompany 
              ? currentCompany.primaryColor || '#032D42'
              : actorType === 'vendor' && currentVendor
              ? currentVendor.primaryColor || '#032D42'
              : '#032D42' /* ServiceNow Infinite Blue */

            // Check if item is a category (has items property)
            if ('items' in item && Array.isArray(item.items)) {
              const category = item as MenuCategory
              // Normalize pathname and href for comparison (remove trailing slashes)
              const normalizedPathname = pathname.replace(/\/$/, '')
              const hasActiveItem = category.items.some(subItem => {
                const normalizedHref = subItem.href.replace(/\/$/, '')
                return normalizedPathname === normalizedHref || normalizedPathname.startsWith(normalizedHref + '/')
              })
              
              // CRITICAL: Always keep category expanded if it has an active item
              // This is the PRIMARY check - if any sub-item is active, category MUST be expanded
              // Also keep it expanded if it's manually expanded
              // This ensures sub-menus never collapse when navigating between sub-items
              // Priority: hasActiveItem first (always expanded if active), then manual expansion
              // NOTE: isExpanded calculation is independent of state when hasActiveItem is true
              // This prevents any collapse during navigation, even if state hasn't updated yet
              const isExpanded = hasActiveItem || expandedCategories.has(category.name)
              const CategoryIcon = category.icon

              // Calculate total badge count for this category (excluding visited items)
              let categoryBadgeCount = 0
              category.items.forEach((subItem) => {
                // Skip if this item has been visited
                if (visitedMenuItems.has(subItem.href)) {
                  return
                }
                
                if (subItem.name === 'Return Requests' || subItem.href === '/dashboard/company/returns') {
                  categoryBadgeCount += approvalCounts.pendingReturnRequests || 0
                } else if (subItem.name === 'Feedback' || subItem.href === '/dashboard/company/feedback' || subItem.href === '/dashboard/vendor/feedback') {
                  categoryBadgeCount += approvalCounts.newFeedbackCount || 0
                } else if (subItem.name === 'Approvals' || subItem.href === '/dashboard/company/approvals') {
                  categoryBadgeCount += approvalCounts.pendingOrderApprovals || 0
                } else if (subItem.name === 'Invoices' || subItem.href === '/dashboard/company/invoices') {
                  categoryBadgeCount += approvalCounts.newInvoiceCount || 0
                } else if (subItem.name === 'Orders' && actorType === 'vendor' && subItem.href === '/dashboard/vendor/orders') {
                  categoryBadgeCount += approvalCounts.pendingOrders || 0
                } else if (subItem.name === 'Replacement Orders' && actorType === 'vendor' && subItem.href === '/dashboard/vendor/replacement-orders') {
                  categoryBadgeCount += approvalCounts.pendingReplacementOrders || 0
                } else if ((subItem.name === 'GRN & Invoice' || subItem.href === '/dashboard/vendor/grns') && actorType === 'vendor') {
                  // Badge for GRN/Invoice: new GRN + approved GRN + approved invoices
                  categoryBadgeCount += (approvalCounts.newGRNCount || 0) + (approvalCounts.approvedGRNCount || 0) + (approvalCounts.approvedInvoiceCount || 0)
                }
              })

              return (
                <div key={category.name} className="mb-1">
                  <button
                    onClick={(e) => toggleCategory(category.name, e)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md transition-all duration-200 ${
                      hasActiveItem
                        ? 'bg-neutral-100 text-neutral-900 font-medium'
                        : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                    }`}
                    style={hasActiveItem ? {
                      backgroundColor: `${primaryColor}15`,
                      color: primaryColor,
                    } : {}}
                  >
                    <div className="flex items-center space-x-3">
                      <CategoryIcon 
                        className="h-5 w-5 flex-shrink-0" 
                        style={hasActiveItem ? { color: primaryColor } : {}}
                      />
                      <span className="text-sm font-medium">{category.name}</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      {categoryBadgeCount > 0 && (
                        <span className="bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-2 flex items-center justify-center">
                          {categoryBadgeCount > 99 ? '99+' : categoryBadgeCount}
                        </span>
                      )}
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="ml-4 mt-1 space-y-1">
                      {category.items.map((subItem) => {
                        const SubIcon = subItem.icon
                        const isSubActive = pathname === subItem.href
                        
                        // Badge count for sub-items
                        let badgeCount = 0
                        if (subItem.name === 'Return Requests' || subItem.href === '/dashboard/company/returns') {
                          badgeCount = approvalCounts.pendingReturnRequests || 0
                        } else if (subItem.name === 'Feedback' || subItem.href === '/dashboard/company/feedback' || subItem.href === '/dashboard/vendor/feedback') {
                          badgeCount = approvalCounts.newFeedbackCount || 0
                        } else if (subItem.name === 'Approvals' || subItem.href === '/dashboard/company/approvals') {
                          badgeCount = approvalCounts.pendingOrderApprovals || 0
                        } else if (subItem.name === 'Invoices' || subItem.href === '/dashboard/company/invoices') {
                          badgeCount = approvalCounts.newInvoiceCount || 0
                        } else if (subItem.name === 'Orders' && actorType === 'vendor' && subItem.href === '/dashboard/vendor/orders') {
                          badgeCount = approvalCounts.pendingOrders || 0
                        } else if (subItem.name === 'Replacement Orders' && actorType === 'vendor' && subItem.href === '/dashboard/vendor/replacement-orders') {
                          badgeCount = approvalCounts.pendingReplacementOrders || 0
                        } else if ((subItem.name === 'GRN & Invoice' || subItem.href === '/dashboard/vendor/grns') && actorType === 'vendor') {
                          // Badge for GRN/Invoice: new GRN + approved GRN + approved invoices
                          badgeCount = (approvalCounts.newGRNCount || 0) + (approvalCounts.approvedGRNCount || 0) + (approvalCounts.approvedInvoiceCount || 0)
                        }
                        
                        // Hide badge if this menu item has been visited
                        if (visitedMenuItems.has(subItem.href)) {
                          badgeCount = 0
                        }
                        
                        return (
                          <Link
                            key={subItem.name}
                            href={subItem.href}
                            onClick={(e) => {
                              // CRITICAL: Prevent any event bubbling that might trigger parent collapse
                              e.stopPropagation()
                              
                              // CRITICAL: Ensure parent category stays expanded when sub-item is clicked
                              // This must happen before navigation to prevent collapse
                              setExpandedCategories(prev => {
                                // Use functional update to ensure we have the latest state
                                const newSet = new Set(prev)
                                newSet.add(category.name)
                                return newSet
                              })
                              
                              // Close mobile menu
                              setMobileMenuOpen(false)
                              
                              // Let Link handle navigation normally - don't prevent default
                              // The useLayoutEffect will ensure category stays expanded after navigation
                            }}
                            className={`flex items-center space-x-3 px-3 py-2 rounded-md transition-all duration-200 ${
                              isSubActive
                                ? 'bg-neutral-100 text-neutral-900 font-medium'
                                : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                            }`}
                            style={isSubActive ? {
                              backgroundColor: `${primaryColor}15`,
                              color: primaryColor,
                              borderLeft: `3px solid ${primaryColor}`
                            } : {}}
                          >
                            <SubIcon 
                              className="h-4 w-4 flex-shrink-0" 
                              style={isSubActive ? { color: primaryColor } : {}}
                            />
                            <span className="text-sm font-medium flex-1">{subItem.name}</span>
                            {badgeCount > 0 && (
                              <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-2 flex items-center justify-center">
                                {badgeCount > 99 ? '99+' : badgeCount}
                              </span>
                            )}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            // Regular menu item
            const menuItem = item as MenuItem
            const Icon = menuItem.icon
            const isActive = pathname === menuItem.href
            const linkStyle = getActiveLinkStyle(isActive)
            
            return (
              <Link
                key={menuItem.name}
                href={menuItem.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center space-x-3 px-3 py-2.5 rounded-md mb-1 transition-all duration-200 ${
                  isActive
                    ? 'bg-neutral-100 text-neutral-900 font-medium'
                    : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900'
                }`}
                style={isActive ? {
                  backgroundColor: `${primaryColor}15`,
                  color: primaryColor,
                  borderLeft: `3px solid ${primaryColor}`
                } : linkStyle}
              >
                <Icon 
                  className="h-5 w-5 flex-shrink-0" 
                  style={isActive ? { color: primaryColor } : {}}
                />
                <span className="text-sm font-medium flex-1">{menuItem.name}</span>
                {/* Approval Badge */}
                {(() => {
                  // Hide badge if this menu item has been visited
                  if (visitedMenuItems.has(menuItem.href)) {
                    return null
                  }
                  
                  let badgeCount = 0
                  if (menuItem.name === 'Approvals' || menuItem.href === '/dashboard/company/approvals') {
                    badgeCount = approvalCounts.pendingOrderApprovals || 0
                  } else if (menuItem.name === 'Return Requests' || menuItem.href === '/dashboard/company/returns') {
                    badgeCount = approvalCounts.pendingReturnRequests || 0
                  } else if (menuItem.name === 'Feedback' || menuItem.href === '/dashboard/company/feedback') {
                    badgeCount = approvalCounts.newFeedbackCount || 0
                  } else if (menuItem.name === 'Orders' && actorType === 'vendor' && menuItem.href === '/dashboard/vendor/orders') {
                    badgeCount = approvalCounts.pendingOrders || 0
                  } else if (menuItem.name === 'Replacement Orders' && actorType === 'vendor' && menuItem.href === '/dashboard/vendor/replacement-orders') {
                    badgeCount = approvalCounts.pendingReplacementOrders || 0
                  } else if (menuItem.name === 'Orders' && actorType === 'company' && menuItem.href === '/dashboard/company/orders' && isLocationAdmin) {
                    badgeCount = approvalCounts.pendingOrderApprovals || 0
                  }
                  
                  return badgeCount > 0 ? (
                    <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-2 flex items-center justify-center">
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  ) : null
                })()}
              </Link>
            )
          })}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-neutral-200 p-3">
          <Link
            href="/"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center space-x-3 px-3 py-2.5 rounded-md text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-all duration-200"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span className="text-sm font-medium">Logout</span>
          </Link>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64">
        <div className="p-4 sm:p-6 lg:p-8 min-h-screen bg-[#f8f9fa]">
          {children}
        </div>
      </div>
    </div>
  )
}


