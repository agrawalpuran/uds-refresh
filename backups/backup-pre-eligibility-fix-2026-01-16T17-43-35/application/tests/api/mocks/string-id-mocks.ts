/**
 * Mock Data Generator for String ID-based Testing
 * All mocks use string IDs (6-digit numeric strings) instead of ObjectIds
 */

export const mockCompany = {
  id: '100001',
  name: 'Test Company',
  email: 'test@company.com',
  phone: '1234567890',
  address: {
    line1: '123 Test St',
    city: 'Test City',
    state: 'Test State',
    pincode: '123456',
    country: 'India'
  },
  showPrices: true,
  allowPersonalPayments: false,
  allowPersonalAddressDelivery: false,
  enableEmployeeOrder: true,
  status: 'active'
}

export const mockEmployee = {
  id: '300001',
  employeeId: 'EMP001',
  email: 'employee@test.com',
  firstName: 'John',
  lastName: 'Doe',
  companyId: '100001',
  locationId: '400001',
  designation: 'Manager',
  gender: 'male',
  status: 'active',
  joiningDate: new Date('2020-01-01'),
  cycleStartDate: new Date('2024-01-01')
}

export const mockLocation = {
  id: '400001',
  name: 'Test Location',
  companyId: '100001',
  adminId: '300001',
  address: {
    line1: '456 Location St',
    city: 'Location City',
    state: 'Location State',
    pincode: '654321',
    country: 'India'
  },
  status: 'active'
}

export const mockVendor = {
  id: '100001',
  name: 'Test Vendor',
  email: 'vendor@test.com',
  phone: '9876543210',
  address: {
    line1: '789 Vendor St',
    city: 'Vendor City',
    state: 'Vendor State',
    pincode: '789012',
    country: 'India'
  },
  status: 'active'
}

export const mockProduct = {
  id: '200001',
  name: 'Test Product',
  sku: 'PROD-001',
  categoryId: '500001',
  price: 1000,
  gender: 'male',
  image: 'https://example.com/image.jpg',
  status: 'active',
  companyIds: ['100001']
}

export const mockOrder = {
  id: 'ORD-001',
  employeeId: '300001',
  companyId: '100001',
  locationId: '400001',
  items: [
    {
      uniformId: '200001',
      productId: '200001',
      uniformName: 'Test Product',
      size: 'M',
      quantity: 2,
      price: 1000
    }
  ],
  total: 2000,
  status: 'PENDING',
  createdAt: new Date()
}

export const mockPurchaseOrder = {
  id: 'PO-001',
  companyId: '100001',
  vendorId: '100001',
  client_po_number: 'CLIENT-PO-001',
  po_date: new Date(),
  po_status: 'CREATED',
  created_by_user_id: '300001'
}

export const mockCategory = {
  id: '500001',
  name: 'Shirt',
  companyId: '100001',
  renewalUnit: 'months',
  isSystemCategory: true,
  status: 'active'
}

export const mockSubcategory = {
  id: '600001',
  name: 'Formal Shirt',
  parentCategoryId: '500001',
  companyId: '100001',
  status: 'active'
}

export const mockProductSubcategoryMapping = {
  id: '700001',
  productId: '200001',
  subCategoryId: '600001',
  companyId: '100001',
  companySpecificPrice: 1200
}

export const mockDesignationSubcategoryEligibility = {
  id: '800001',
  designationId: 'Manager',
  subCategoryId: '600001',
  companyId: '100001',
  gender: 'male',
  quantity: 5,
  renewalFrequency: 6,
  renewalUnit: 'months',
  status: 'active'
}

export const mockVendorInventory = {
  id: '900001',
  vendorId: '100001',
  productId: '200001',
  sizeInventory: {
    'S': 10,
    'M': 20,
    'L': 15
  },
  totalStock: 45,
  lowInventoryThreshold: {
    'S': 5,
    'M': 10,
    'L': 5
  }
}

export const mockBranch = {
  id: '500001',
  name: 'Test Branch',
  companyId: '100001',
  adminId: '300001',
  address_line_1: '123 Branch St',
  city: 'Branch City',
  state: 'Branch State',
  pincode: '111111',
  country: 'India',
  status: 'active'
}

export const mockCompanyAdmin = {
  id: 'CA-001',
  companyId: '100001',
  employeeId: '300001',
  canApproveOrders: true
}

export const mockLocationAdmin = {
  id: 'LA-001',
  locationId: '400001',
  employeeId: '300001'
}

export const mockReturnRequest = {
  returnRequestId: 'RR-001',
  originalOrderId: 'ORD-001',
  originalOrderItemIndex: 0,
  productId: '200001',
  uniformId: '200001',
  uniformName: 'Test Product',
  employeeId: '300001',
  employeeIdNum: 'EMP001',
  companyId: '100001',
  requestedQty: 1,
  originalSize: 'M',
  requestedSize: 'L',
  reason: 'Size mismatch',
  status: 'PENDING'
}

// Helper to generate multiple mock objects
export function generateMockCompanies(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockCompany,
    id: String(100000 + i + 1).padStart(6, '0'),
    name: `Test Company ${i + 1}`
  }))
}

export function generateMockEmployees(count: number, companyId: string = '100001') {
  return Array.from({ length: count }, (_, i) => ({
    ...mockEmployee,
    id: String(300000 + i + 1).padStart(6, '0'),
    employeeId: `EMP${String(i + 1).padStart(3, '0')}`,
    companyId
  }))
}

export function generateMockProducts(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    ...mockProduct,
    id: String(200000 + i + 1).padStart(6, '0'),
    name: `Test Product ${i + 1}`,
    sku: `PROD-${String(i + 1).padStart(3, '0')}`
  }))
}
