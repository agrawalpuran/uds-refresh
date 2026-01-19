// Mock data for the application

export interface Uniform {
  id: string
  name: string
  category: 'shirt' | 'pant' | 'shoe' | 'jacket' | 'accessory'
  gender: 'male' | 'female' | 'unisex'
  sizes: string[]
  price: number
  image: string
  sku: string
  vendorId: string // Changed from vendor string to vendorId
  stock: number
  // Many-to-many relationships
  companyIds: string[] // Products can be associated with multiple companies
}

export interface Vendor {
  id: string
  name: string
  email: string
  phone: string
  logo: string
  website: string
  // Branding configuration
  primaryColor: string
  secondaryColor: string
  accentColor: string
  theme: 'light' | 'dark' | 'custom'
}

export interface Company {
  id: string
  name: string
  logo: string
  website: string
  primaryColor: string
  showPrices: boolean
  adminId?: string | {
    id: string
    employeeId: string
    firstName: string
    lastName: string
    email: string
  }
}

// Relationship tables for many-to-many
export interface ProductCompany {
  productId: string
  companyId: string
}

export interface ProductVendor {
  productId: string
  vendorId: string
}

export interface VendorCompany {
  vendorId: string
  companyId: string
}

export interface Employee {
  id: string
  employeeId: string
  firstName: string
  lastName: string
  designation: string
  gender: 'male' | 'female'
  location: string
  email: string
  mobile: string
  shirtSize: string
  pantSize: string
  shoeSize: string
  address: string
  companyId: string
  companyName: string
  eligibility: {
    shirt: number
    pant: number
    shoe: number
    jacket: number
  }
  dispatchPreference: 'direct' | 'central' | 'regional'
  status: 'active' | 'inactive'
  period: string
  dateOfJoining?: Date | string
}

export interface Order {
  id: string
  employeeId: string
  employeeName: string
  items: Array<{
    uniformId: string
    uniformName: string
    size: string
    quantity: number
    price: number
  }>
  total: number
  status: 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled'
  orderDate: string
  dispatchLocation: string
  companyId: string
  deliveryAddress: string
  estimatedDeliveryTime: string
}

export interface Location {
  id: string
  name: string
  address: string
  type: 'central' | 'regional'
  companyId: string
}

export const mockVendors: Vendor[] = [
  {
    id: 'VEND-001',
    name: 'UniformPro Inc',
    email: 'contact@uniformpro.com',
    phone: '+1-555-0101',
    logo: 'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=200',
    website: 'https://uniformpro.com',
    primaryColor: '#2563eb',
    secondaryColor: '#1e40af',
    accentColor: '#3b82f6',
    theme: 'light'
  },
  {
    id: 'VEND-002',
    name: 'Footwear Plus',
    email: 'info@footwearplus.com',
    phone: '+1-555-0102',
    logo: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=200',
    website: 'https://footwearplus.com',
    primaryColor: '#059669',
    secondaryColor: '#047857',
    accentColor: '#10b981',
    theme: 'light'
  },
  {
    id: 'VEND-003',
    name: 'Elite Uniforms',
    email: 'sales@eliteuniforms.com',
    phone: '+1-555-0103',
    logo: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=200',
    website: 'https://eliteuniforms.com',
    primaryColor: '#7c3aed',
    secondaryColor: '#6d28d9',
    accentColor: '#8b5cf6',
    theme: 'light'
  }
]

export const mockCompanies: Company[] = [
  {
    id: 'COMP-INDIGO',
    name: 'ICICI Bank',
    logo: 'https://www.icicibank.com/assets/images/icici-logo.svg',
    website: 'https://www.icicibank.com',
    primaryColor: '#f76b1c',
    showPrices: false,
  },
  {
    id: 'COMP-AKASA',
    name: 'Akasa Air',
    logo: 'https://www.akasaair.com/images/akasa-logo.svg',
    website: 'https://www.akasaair.com',
    primaryColor: '#FF6B35',
    showPrices: false,
  },
  {
    id: 'COMP-AIRINDIA',
    name: 'Air India',
    logo: 'https://www.airindia.com/images/air-india-logo.svg',
    website: 'https://www.airindia.com',
    primaryColor: '#FF0000',
    showPrices: false,
  }
]

// Product-Company relationships (many-to-many)
export const mockProductCompanies: ProductCompany[] = [
  // UniformPro products for Indigo
  { productId: '1', companyId: 'COMP-INDIGO' },
  { productId: '2', companyId: 'COMP-INDIGO' },
  { productId: '3', companyId: 'COMP-INDIGO' },
  { productId: '4', companyId: 'COMP-INDIGO' },
  { productId: '7', companyId: 'COMP-INDIGO' },
  { productId: '8', companyId: 'COMP-INDIGO' },
  // UniformPro products for Akasa
  { productId: '1', companyId: 'COMP-AKASA' },
  { productId: '2', companyId: 'COMP-AKASA' },
  { productId: '3', companyId: 'COMP-AKASA' },
  { productId: '4', companyId: 'COMP-AKASA' },
  // Footwear Plus products for Indigo
  { productId: '5', companyId: 'COMP-INDIGO' },
  { productId: '6', companyId: 'COMP-INDIGO' },
  // Footwear Plus products for Akasa
  { productId: '5', companyId: 'COMP-AKASA' },
  { productId: '6', companyId: 'COMP-AKASA' },
  // Footwear Plus products for Air India
  { productId: '5', companyId: 'COMP-AIRINDIA' },
  { productId: '6', companyId: 'COMP-AIRINDIA' }
]

// Product-Vendor relationships (many-to-many)
export const mockProductVendors: ProductVendor[] = [
  // UniformPro products
  { productId: '1', vendorId: 'VEND-001' },
  { productId: '2', vendorId: 'VEND-001' },
  { productId: '3', vendorId: 'VEND-001' },
  { productId: '4', vendorId: 'VEND-001' },
  { productId: '7', vendorId: 'VEND-001' },
  { productId: '8', vendorId: 'VEND-001' },
  // Footwear Plus products
  { productId: '5', vendorId: 'VEND-002' },
  { productId: '6', vendorId: 'VEND-002' }
]

// Vendor-Company relationships (many-to-many)
export const mockVendorCompanies: VendorCompany[] = [
  // UniformPro supplies to Indigo and Akasa
  { vendorId: 'VEND-001', companyId: 'COMP-INDIGO' },
  { vendorId: 'VEND-001', companyId: 'COMP-AKASA' },
  // Footwear Plus supplies to Indigo, Akasa, and Air India
  { vendorId: 'VEND-002', companyId: 'COMP-INDIGO' },
  { vendorId: 'VEND-002', companyId: 'COMP-AKASA' },
  { vendorId: 'VEND-002', companyId: 'COMP-AIRINDIA' }
]

export const mockUniforms: Uniform[] = [
  {
    id: '1',
    name: 'Formal Shirt - Male',
    category: 'shirt',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 25.99,
    image: 'https://images.unsplash.com/photo-1603252109303-2751441dd157?w=400&h=400&fit=crop',
    sku: 'SHIRT-M-001',
    vendorId: 'VEND-001',
    stock: 150,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '2',
    name: 'Formal Shirt - Female',
    category: 'shirt',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 24.99,
    image: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?w=400',
    sku: 'SHIRT-F-001',
    vendorId: 'VEND-001',
    stock: 120,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '3',
    name: 'Formal Trousers - Male',
    category: 'pant',
    gender: 'male',
    sizes: ['28', '30', '32', '34', '36', '38'],
    price: 35.99,
    image: 'https://images.unsplash.com/photo-1473966968600-fa801b869a1a?w=400',
    sku: 'PANT-M-001',
    vendorId: 'VEND-001',
    stock: 200,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '4',
    name: 'Formal Trousers - Female',
    category: 'pant',
    gender: 'female',
    sizes: ['26', '28', '30', '32', '34'],
    price: 34.99,
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=400',
    sku: 'PANT-F-001',
    vendorId: 'VEND-001',
    stock: 180,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA']
  },
  {
    id: '5',
    name: 'Leather Dress Shoes - Male',
    category: 'shoe',
    gender: 'male',
    sizes: ['7', '8', '9', '10', '11', '12'],
    price: 79.99,
    image: 'https://images.unsplash.com/photo-1549298916-b41d501d3772?w=400',
    sku: 'SHOE-M-001',
    vendorId: 'VEND-002',
    stock: 100,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA', 'COMP-AIRINDIA']
  },
  {
    id: '6',
    name: 'Formal Heels - Female',
    category: 'shoe',
    gender: 'female',
    sizes: ['5', '6', '7', '8', '9'],
    price: 69.99,
    image: 'https://images.unsplash.com/photo-1543163521-1bf539c55dd2?w=400',
    sku: 'SHOE-F-001',
    vendorId: 'VEND-002',
    stock: 90,
    companyIds: ['COMP-INDIGO', 'COMP-AKASA', 'COMP-AIRINDIA']
  },
  {
    id: '7',
    name: 'Blazer - Male',
    category: 'jacket',
    gender: 'male',
    sizes: ['S', 'M', 'L', 'XL', 'XXL'],
    price: 89.99,
    image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=400',
    sku: 'JACKET-M-001',
    vendorId: 'VEND-001',
    stock: 80,
    companyIds: ['COMP-INDIGO']
  },
  {
    id: '8',
    name: 'Blazer - Female',
    category: 'jacket',
    gender: 'female',
    sizes: ['XS', 'S', 'M', 'L', 'XL'],
    price: 84.99,
    image: 'https://images.unsplash.com/photo-1591047139829-91fce775fc99?w=400',
    sku: 'JACKET-F-001',
    vendorId: 'VEND-001',
    stock: 75,
    companyIds: ['COMP-INDIGO']
  }
]

// Helper functions for filtering
export function getProductsByCompany(companyId: string): Uniform[] {
  if (!companyId) {
    console.warn('getProductsByCompany: No companyId provided')
    return []
  }
  
  // Get relationships from localStorage (updated by super admin) or use mock data
  // IMPORTANT: Only use localStorage if it exists, otherwise use mock data
  // Don't mix them - use one or the other
  let productCompaniesData: ProductCompany[] = []
  let vendorCompaniesData: VendorCompany[] = []
  let productVendorsData: ProductVendor[] = []
  let usingLocalStorage = false
  
  if (typeof window !== 'undefined') {
    try {
      const storedPC = localStorage.getItem('productCompanies')
      const storedVC = localStorage.getItem('vendorCompanies')
      const storedPV = localStorage.getItem('productVendors')
      
      // Check if localStorage has been initialized with actual data (not just empty arrays)
      // We only use localStorage if it has actual relationship data
      let hasActualData = false
      let parsedPC: ProductCompany[] | null = null
      let parsedVC: VendorCompany[] | null = null
      let parsedPV: ProductVendor[] | null = null
      
      if (storedPC) {
        try {
          parsedPC = JSON.parse(storedPC)
          if (Array.isArray(parsedPC) && parsedPC.length > 0) {
            productCompaniesData = parsedPC
            hasActualData = true
            console.log('Using localStorage productCompanies:', parsedPC.length, 'relationships')
          }
        } catch (e) {
          console.warn('Error parsing productCompanies from localStorage:', e)
        }
      }
      
      if (storedVC) {
        try {
          parsedVC = JSON.parse(storedVC)
          if (Array.isArray(parsedVC) && parsedVC.length > 0) {
            vendorCompaniesData = parsedVC
            hasActualData = true
            console.log('Using localStorage vendorCompanies:', parsedVC.length, 'relationships')
          }
        } catch (e) {
          console.warn('Error parsing vendorCompanies from localStorage:', e)
        }
      }
      
      if (storedPV) {
        try {
          parsedPV = JSON.parse(storedPV)
          if (Array.isArray(parsedPV) && parsedPV.length > 0) {
            productVendorsData = parsedPV
            hasActualData = true
            console.log('Using localStorage productVendors:', parsedPV.length, 'relationships')
          }
        } catch (e) {
          console.warn('Error parsing productVendors from localStorage:', e)
        }
      }
      
      if (!hasActualData) {
        // No actual data in localStorage - use mock data
        usingLocalStorage = false
        console.log('getProductsByCompany: No actual localStorage data found, using mock data')
        productCompaniesData = [...mockProductCompanies]
        vendorCompaniesData = [...mockVendorCompanies]
        productVendorsData = [...mockProductVendors]
      } else {
        usingLocalStorage = true
        console.log('getProductsByCompany: Using localStorage data (has actual relationships)')
        // For missing or empty keys, use empty arrays (don't mix with mock data)
        if (!parsedPC || parsedPC.length === 0) {
          productCompaniesData = []
        }
        if (!parsedVC || parsedVC.length === 0) {
          vendorCompaniesData = []
        }
        if (!parsedPV || parsedPV.length === 0) {
          productVendorsData = []
        }
      }
    } catch (e) {
      console.warn('Error reading from localStorage, using mock data:', e)
      productCompaniesData = [...mockProductCompanies]
      vendorCompaniesData = [...mockVendorCompanies]
      productVendorsData = [...mockProductVendors]
    }
  } else {
    // Server-side: use mock data
    productCompaniesData = [...mockProductCompanies]
    vendorCompaniesData = [...mockVendorCompanies]
    productVendorsData = [...mockProductVendors]
  }
  
  // Method 1: Get products directly linked to company via ProductCompany relationship table
  const productIdsFromDirectLinks = productCompaniesData
    .filter(pc => pc.companyId === companyId)
    .map(pc => pc.productId)
  
  // Method 2: Get products from vendors that are linked to this company
  // Step 1: Find vendors linked to this company
  const vendorIdsLinkedToCompany = vendorCompaniesData
    .filter(vc => vc.companyId === companyId)
    .map(vc => vc.vendorId)
  
  // Step 2: Find products from those vendors
  const productIdsFromVendorLinks = productVendorsData
    .filter(pv => vendorIdsLinkedToCompany.includes(pv.vendorId))
    .map(pv => pv.productId)
  
  // Combine both methods and get unique product IDs
  const allProductIds = Array.from(new Set([...productIdsFromDirectLinks, ...productIdsFromVendorLinks]))
  
  // Debug logging
  console.log('getProductsByCompany Debug:', {
    companyId,
    usingLocalStorage,
    productIdsFromDirectLinks,
    vendorIdsLinkedToCompany,
    productIdsFromVendorLinks,
    allProductIds,
    totalProducts: mockUniforms.length,
    productCompaniesCount: productCompaniesData.length,
    vendorCompaniesCount: vendorCompaniesData.length,
    productVendorsCount: productVendorsData.length,
    availableProductIds: mockUniforms.map(p => p.id),
    productCompaniesForThisCompany: productCompaniesData.filter(pc => pc.companyId === companyId),
    allProductCompaniesData: productCompaniesData,
    allVendorCompaniesData: vendorCompaniesData,
    allProductVendorsData: productVendorsData
  })
  
  // Return products that match any of the product IDs
  // CRITICAL: Only return products whose IDs are in allProductIds
  // If allProductIds is empty, return empty array (don't show all products)
  const products = allProductIds.length > 0 
    ? mockUniforms.filter(product => allProductIds.includes(product.id))
    : []
  
  console.log('getProductsByCompany Result:', {
    allProductIdsCount: allProductIds.length,
    productsCount: products.length,
    products: products.map(p => p.name),
    productIds: products.map(p => p.id)
  })
  
  if (products.length === 0) {
    if (allProductIds.length === 0) {
      console.error('ERROR: No product IDs found for company:', companyId)
      console.log('Available companies in relationships:', Array.from(new Set(productCompaniesData.map(pc => pc.companyId))))
      console.log('Available companies in vendor relationships:', Array.from(new Set(vendorCompaniesData.map(vc => vc.companyId))))
    } else {
      console.error('WARNING: Product IDs found but no products matched:', {
        allProductIds,
        availableIds: mockUniforms.map(p => p.id),
        mismatch: allProductIds.filter(id => !mockUniforms.some(p => p.id === id))
      })
    }
  }
  
  return products
}

export function getProductsByVendor(vendorId: string): Uniform[] {
  return mockUniforms.filter(product => product.vendorId === vendorId)
}

export function getVendorById(vendorId: string): Vendor | undefined {
  return mockVendors.find(v => v.id === vendorId)
}

export function getCompanyById(companyId: string): Company | undefined {
  return mockCompanies.find(c => c.id === companyId)
}

export function getEmployeeByEmail(email: string): Employee | undefined {
  return mockEmployees.find(e => e.email === email)
}

export function getEmployeesByCompany(companyId: string): Employee[] {
  return mockEmployees.filter(emp => emp.companyId === companyId)
}

export function getOrdersByCompany(companyId: string): Order[] {
  return mockOrders.filter(order => order.companyId === companyId)
}

export const mockEmployees: Employee[] = [
  // Indigo Airlines Employees (10 users)
  {
    id: 'IND-001',
    employeeId: 'IND-002',
    firstName: 'Rajesh',
    lastName: 'Kumar',
    designation: 'Pilot',
    gender: 'male',
    location: 'Delhi Base',
    email: 'rajesh.kumar@icicibank.in',
    mobile: '+91-9876543210',
    shirtSize: 'L',
    pantSize: '34',
    shoeSize: '10',
    address: 'A-123, Sector 15, Noida, Uttar Pradesh 201301',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-002',
    employeeId: 'IND-002',
    
    firstName: 'Priya',
    lastName: 'Sharma',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Mumbai Base',
    email: 'priya.sharma@icicibank.in',
    mobile: '+91-9876543211',
    shirtSize: 'M',
    pantSize: '28',
    shoeSize: '7',
    address: 'B-456, Andheri West, Mumbai, Maharashtra 400053',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-003',
    employeeId: 'IND-002',
    
    firstName: 'Amit',
    lastName: 'Patel',
    designation: 'Co-Pilot',
    gender: 'male',
    location: 'Bangalore Base',
    email: 'amit.patel@icicibank.in',
    mobile: '+91-9876543212',
    shirtSize: 'XL',
    pantSize: '36',
    shoeSize: '11',
    address: 'C-789, Koramangala, Bangalore, Karnataka 560095',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-004',
    employeeId: 'IND-002',
    
    firstName: 'Sneha',
    lastName: 'Reddy',
    designation: 'Senior Flight Attendant',
    gender: 'female',
    location: 'Hyderabad Base',
    email: 'sneha.reddy@icicibank.in',
    mobile: '+91-9876543213',
    shirtSize: 'S',
    pantSize: '30',
    shoeSize: '6',
    address: 'D-321, Banjara Hills, Hyderabad, Telangana 500034',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-005',
    employeeId: 'IND-002',
    
    firstName: 'Vikram',
    lastName: 'Singh',
    designation: 'Pilot',
    gender: 'male',
    location: 'Delhi Base',
    email: 'vikram.singh@icicibank.in',
    mobile: '+91-9876543214',
    shirtSize: 'M',
    pantSize: '32',
    shoeSize: '9',
    address: 'E-654, Connaught Place, New Delhi 110001',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-006',
    employeeId: 'IND-002',
    
    firstName: 'Anjali',
    lastName: 'Mehta',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Mumbai Base',
    email: 'anjali.mehta@icicibank.in',
    mobile: '+91-9876543215',
    shirtSize: 'L',
    pantSize: '32',
    shoeSize: '8',
    address: 'F-987, Bandra East, Mumbai, Maharashtra 400051',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-007',
    employeeId: 'IND-002',
    
    firstName: 'Rohit',
    lastName: 'Gupta',
    designation: 'Ground Staff',
    gender: 'male',
    location: 'Delhi Base',
    email: 'rohit.gupta@icicibank.in',
    mobile: '+91-9876543216',
    shirtSize: 'XXL',
    pantSize: '38',
    shoeSize: '12',
    address: 'G-147, Dwarka Sector 12, New Delhi 110075',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 4, pant: 2, shoe: 1, jacket: 1 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-008',
    employeeId: 'IND-002',
    
    firstName: 'Kavita',
    lastName: 'Nair',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Bangalore Base',
    email: 'kavita.nair@icicibank.in',
    mobile: '+91-9876543217',
    shirtSize: 'XS',
    pantSize: '26',
    shoeSize: '5',
    address: 'H-258, Indiranagar, Bangalore, Karnataka 560038',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-009',
    employeeId: 'IND-002',
    
    firstName: 'Manish',
    lastName: 'Verma',
    designation: 'Co-Pilot',
    gender: 'male',
    location: 'Mumbai Base',
    email: 'manish.verma@icicibank.in',
    mobile: '+91-9876543218',
    shirtSize: 'L',
    pantSize: '34',
    shoeSize: '10',
    address: 'I-369, Powai, Mumbai, Maharashtra 400076',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'IND-010',
    employeeId: 'IND-002',
    
    firstName: 'Divya',
    lastName: 'Iyer',
    designation: 'Senior Flight Attendant',
    gender: 'female',
    location: 'Chennai Base',
    email: 'divya.iyer@icicibank.in',
    mobile: '+91-9876543219',
    shirtSize: 'M',
    pantSize: '28',
    shoeSize: '7',
    address: 'J-741, T Nagar, Chennai, Tamil Nadu 600017',
    companyId: 'COMP-INDIGO',
    companyName: 'ICICI Bank',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  // Akasa Air Employees (10 users)
  {
    id: 'AKA-001',
    employeeId: 'AKA-001',
    firstName: 'Arjun',
    lastName: 'Menon',
    designation: 'Pilot',
    gender: 'male',
    location: 'Mumbai Base',
    email: 'arjun.menon@akasaair.com',
    mobile: '+91-9876543220',
    shirtSize: 'XL',
    pantSize: '36',
    shoeSize: '11',
    address: 'K-852, Juhu, Mumbai, Maharashtra 400049',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-002',
    employeeId: 'IND-002',
    firstName: 'Meera',
    lastName: 'Krishnan',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Delhi Base',
    email: 'meera.krishnan@akasaair.com',
    mobile: '+91-9876543221',
    shirtSize: 'S',
    pantSize: '30',
    shoeSize: '6',
    address: 'L-963, Vasant Kunj, New Delhi 110070',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-003',
    employeeId: 'IND-002',
    firstName: 'Siddharth',
    lastName: 'Rao',
    designation: 'Co-Pilot',
    gender: 'male',
    location: 'Bangalore Base',
    email: 'siddharth.rao@akasaair.com',
    mobile: '+91-9876543222',
    shirtSize: 'L',
    pantSize: '34',
    shoeSize: '10',
    address: 'M-159, Whitefield, Bangalore, Karnataka 560066',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-004',
    employeeId: 'IND-002',
    firstName: 'Radhika',
    lastName: 'Pillai',
    designation: 'Senior Flight Attendant',
    gender: 'female',
    location: 'Mumbai Base',
    email: 'radhika.pillai@akasaair.com',
    mobile: '+91-9876543223',
    shirtSize: 'M',
    pantSize: '28',
    shoeSize: '7',
    address: 'N-357, Bandra West, Mumbai, Maharashtra 400050',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-005',
    employeeId: 'IND-002',
    firstName: 'Karan',
    lastName: 'Malhotra',
    designation: 'Pilot',
    gender: 'male',
    location: 'Delhi Base',
    email: 'karan.malhotra@akasaair.com',
    mobile: '+91-9876543224',
    shirtSize: 'M',
    pantSize: '32',
    shoeSize: '9',
    address: 'O-468, Gurgaon Sector 29, Haryana 122001',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-006',
    employeeId: 'IND-002',
    firstName: 'Isha',
    lastName: 'Bansal',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Bangalore Base',
    email: 'isha.bansal@akasaair.com',
    mobile: '+91-9876543225',
    shirtSize: 'L',
    pantSize: '32',
    shoeSize: '8',
    address: 'P-579, HSR Layout, Bangalore, Karnataka 560102',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-007',
    employeeId: 'IND-002',
    firstName: 'Aditya',
    lastName: 'Joshi',
    designation: 'Ground Staff',
    gender: 'male',
    location: 'Mumbai Base',
    email: 'aditya.joshi@akasaair.com',
    mobile: '+91-9876543226',
    shirtSize: 'XL',
    pantSize: '38',
    shoeSize: '12',
    address: 'Q-680, Kurla, Mumbai, Maharashtra 400070',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 4, pant: 2, shoe: 1, jacket: 1 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-008',
    employeeId: 'IND-002',
    firstName: 'Nisha',
    lastName: 'Desai',
    designation: 'Flight Attendant',
    gender: 'female',
    location: 'Delhi Base',
    email: 'nisha.desai@akasaair.com',
    mobile: '+91-9876543227',
    shirtSize: 'XS',
    pantSize: '26',
    shoeSize: '5',
    address: 'R-791, Saket, New Delhi 110017',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'central',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-009',
    employeeId: 'IND-002',
    firstName: 'Rahul',
    lastName: 'Nair',
    designation: 'Co-Pilot',
    gender: 'male',
    location: 'Bangalore Base',
    email: 'rahul.nair@akasaair.com',
    mobile: '+91-9876543228',
    shirtSize: 'L',
    pantSize: '34',
    shoeSize: '10',
    address: 'S-802, Electronic City, Bangalore, Karnataka 560100',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'regional',
    status: 'active',
    period: '2024-2025',
    dateOfJoining: new Date('2025-10-01T00:00:00.000Z')
  },
  {
    id: 'AKA-010',
    employeeId: 'IND-002',
    firstName: 'Shreya',
    lastName: 'Kapoor',
    designation: 'Senior Flight Attendant',
    gender: 'female',
    location: 'Mumbai Base',
    email: 'shreya.kapoor@akasaair.com',
    mobile: '+91-9876543229',
    shirtSize: 'M',
    pantSize: '28',
    shoeSize: '7',
    address: 'T-913, Worli, Mumbai, Maharashtra 400018',
    companyId: 'COMP-AKASA',
    companyName: 'Akasa Air',
    eligibility: { shirt: 6, pant: 4, shoe: 2, jacket: 2 },
    dispatchPreference: 'direct',
    status: 'active',
    period: '2024-2025'
  }
]

export const mockOrders: Order[] = [
  {
    id: 'ORD-001',
    employeeId: 'IND-001',
    employeeName: 'Rajesh Kumar',
    items: [
      { uniformId: '1', uniformName: 'Formal Shirt - Male', size: 'L', quantity: 2, price: 25.99 },
      { uniformId: '3', uniformName: 'Formal Trousers - Male', size: '34', quantity: 1, price: 35.99 }
    ],
    total: 87.97,
    status: 'confirmed',
    orderDate: '2024-11-01',
    dispatchLocation: 'Delhi Base',
    companyId: 'COMP-INDIGO',
    deliveryAddress: 'A-123, Sector 15, Noida, Uttar Pradesh 201301',
    estimatedDeliveryTime: '5-7 business days'
  }
]

export const mockLocations: Location[] = [
  {
    id: 'LOC-001',
    name: 'New York Central Office',
    address: '123 Business Ave, New York, NY 10001',
    type: 'central',
    companyId: 'COMP-001'
  },
  {
    id: 'LOC-002',
    name: 'San Francisco Regional Office',
    address: '456 Tech Blvd, San Francisco, CA 94102',
    type: 'regional',
    companyId: 'COMP-001'
  },
  {
    id: 'LOC-003',
    name: 'Chicago Regional Office',
    address: '789 Commerce St, Chicago, IL 60601',
    type: 'regional',
    companyId: 'COMP-001'
  }
]




