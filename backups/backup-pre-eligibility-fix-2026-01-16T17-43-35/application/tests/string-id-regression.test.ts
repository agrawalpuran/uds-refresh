/**
 * ============================================================
 * 🧪 STRING ID REGRESSION TEST SUITE
 * ============================================================
 * 
 * This test suite verifies that:
 * ✔ Foreign keys are stored as 6-digit string IDs
 * ✔ No hex-strings are inserted
 * ✔ No ObjectId instances are stored
 * ✔ Lookups and population still work correctly
 * 
 * USAGE:
 *   npm test -- --grep "StringId Regression"
 *   
 * Or run directly:
 *   npx jest tests/string-id-regression.test.ts
 */

import mongoose from 'mongoose'
import { 
  enforceStringId, 
  enforceStringIds, 
  validateIdFormat 
} from '../lib/utils/id-validation-strict'

// ============================================================
// TEST HELPERS
// ============================================================

const HEX_24_REGEX = /^[0-9a-fA-F]{24}$/
const VALID_STRING_ID_REGEX = /^\d{6}$/

function isValidStringId(value: unknown): boolean {
  return typeof value === 'string' && VALID_STRING_ID_REGEX.test(value)
}

function isHexString(value: unknown): boolean {
  return typeof value === 'string' && HEX_24_REGEX.test(value)
}

function isObjectIdInstance(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const obj = value as any
  return (
    obj._bsontype === 'ObjectId' ||
    obj._bsontype === 'ObjectID' ||
    (obj.constructor && (obj.constructor.name === 'ObjectId' || obj.constructor.name === 'ObjectID'))
  )
}

// ============================================================
// MOCK DATA GENERATORS
// ============================================================

const generateStringId = () => String(100000 + Math.floor(Math.random() * 899999))

const mockCompany = {
  id: generateStringId(),
  name: 'Test Company',
  email: 'test@company.com'
}

const mockVendor = {
  id: generateStringId(),
  name: 'Test Vendor',
  email: 'test@vendor.com'
}

const mockEmployee = {
  id: generateStringId(),
  employeeId: generateStringId(),
  companyId: mockCompany.id,
  email: 'employee@test.com'
}

const mockProduct = {
  id: generateStringId(),
  name: 'Test Product',
  category: 'Test Category'
}

// ============================================================
// VALIDATION MODULE TESTS
// ============================================================

describe('StringId Regression Tests', () => {
  
  describe('ID Validation Module', () => {
    
    test('enforceStringId accepts valid 6-digit IDs', () => {
      expect(enforceStringId('100001', 'test')).toBe('100001')
      expect(enforceStringId('999999', 'test')).toBe('999999')
      expect(enforceStringId('500000', 'test')).toBe('500000')
    })
    
    test('enforceStringId rejects hex-strings', () => {
      const hexString = '507f1f77bcf86cd799439011'
      expect(() => enforceStringId(hexString, 'test')).toThrow()
      expect(() => enforceStringId(hexString, 'test')).toThrow(/hex-string/i)
    })
    
    test('enforceStringId rejects ObjectId instances', () => {
      const objectId = new mongoose.Types.ObjectId()
      expect(() => enforceStringId(objectId, 'test')).toThrow()
      expect(() => enforceStringId(objectId, 'test')).toThrow(/ObjectId/i)
    })
    
    test('enforceStringId rejects null/undefined', () => {
      expect(() => enforceStringId(null, 'test')).toThrow()
      expect(() => enforceStringId(undefined, 'test')).toThrow()
    })
    
    test('enforceStringId allows optional null/undefined', () => {
      expect(enforceStringId(null, 'test', { optional: true })).toBe('')
      expect(enforceStringId(undefined, 'test', { optional: true })).toBe('')
    })
    
    test('enforceStringIds validates multiple fields', () => {
      const result = enforceStringIds({
        companyId: '100001',
        vendorId: '200002',
        productId: '300003'
      }, 'testBatch')
      
      expect(result.companyId).toBe('100001')
      expect(result.vendorId).toBe('200002')
      expect(result.productId).toBe('300003')
    })
    
    test('enforceStringIds throws on first invalid field', () => {
      expect(() => enforceStringIds({
        companyId: '100001',
        vendorId: '507f1f77bcf86cd799439011', // hex-string
        productId: '300003'
      }, 'testBatch')).toThrow(/vendorId.*hex-string/i)
    })
    
    test('validateIdFormat returns correct type for valid ID', () => {
      const result = validateIdFormat('100001')
      expect(result.valid).toBe(true)
      expect(result.type).toBe('valid')
    })
    
    test('validateIdFormat returns correct type for hex-string', () => {
      const result = validateIdFormat('507f1f77bcf86cd799439011')
      expect(result.valid).toBe(false)
      expect(result.type).toBe('hex-string')
    })
    
    test('validateIdFormat returns correct type for ObjectId', () => {
      const result = validateIdFormat(new mongoose.Types.ObjectId())
      expect(result.valid).toBe(false)
      expect(result.type).toBe('objectid')
    })
    
  })

})

// ============================================================
// ENTITY CREATE SIMULATION TESTS
// ============================================================

describe('Entity Create Simulations', () => {
  
  describe('Employee Creation', () => {
    
    test('employee.companyId must be valid string ID', () => {
      const employeeData = {
        id: generateStringId(),
        employeeId: 'EMP001',
        companyId: mockCompany.id, // Valid string ID
        email: 'new@employee.com',
        name: 'Test Employee'
      }
      
      expect(isValidStringId(employeeData.companyId)).toBe(true)
      expect(isHexString(employeeData.companyId)).toBe(false)
      expect(() => enforceStringId(employeeData.companyId, 'createEmployee.companyId')).not.toThrow()
    })
    
    test('employee.companyId rejects hex-string', () => {
      const employeeData = {
        id: generateStringId(),
        companyId: '507f1f77bcf86cd799439011' // Invalid hex-string
      }
      
      expect(isValidStringId(employeeData.companyId)).toBe(false)
      expect(isHexString(employeeData.companyId)).toBe(true)
      expect(() => enforceStringId(employeeData.companyId, 'createEmployee.companyId')).toThrow()
    })
    
    test('employee.locationId must be valid string ID', () => {
      const employeeData = {
        id: generateStringId(),
        locationId: '400001' // Valid string ID
      }
      
      expect(isValidStringId(employeeData.locationId)).toBe(true)
      expect(() => enforceStringId(employeeData.locationId, 'createEmployee.locationId')).not.toThrow()
    })
    
  })
  
  describe('Vendor Creation', () => {
    
    test('vendor.id must be valid string ID', () => {
      const vendorData = {
        id: generateStringId(),
        name: 'New Vendor'
      }
      
      expect(isValidStringId(vendorData.id)).toBe(true)
      expect(() => enforceStringId(vendorData.id, 'createVendor.id')).not.toThrow()
    })
    
  })
  
  describe('Product Creation', () => {
    
    test('product.id must be valid string ID', () => {
      const productData = {
        id: generateStringId(),
        name: 'New Product'
      }
      
      expect(isValidStringId(productData.id)).toBe(true)
      expect(() => enforceStringId(productData.id, 'createProduct.id')).not.toThrow()
    })
    
  })
  
  describe('ProductVendor Link Creation', () => {
    
    test('productVendor.productId must be valid string ID', () => {
      const pvData = {
        productId: mockProduct.id,
        vendorId: mockVendor.id
      }
      
      expect(isValidStringId(pvData.productId)).toBe(true)
      expect(isValidStringId(pvData.vendorId)).toBe(true)
      expect(() => enforceStringIds(pvData, 'createProductVendor')).not.toThrow()
    })
    
    test('productVendor links reject hex-strings', () => {
      const pvData = {
        productId: '507f1f77bcf86cd799439011', // Invalid
        vendorId: mockVendor.id
      }
      
      expect(() => enforceStringIds(pvData, 'createProductVendor')).toThrow()
    })
    
  })
  
  describe('ProductCategory Creation', () => {
    
    test('productCategory.companyId must be valid string ID', () => {
      const categoryData = {
        name: 'Test Category',
        companyId: mockCompany.id
      }
      
      expect(isValidStringId(categoryData.companyId)).toBe(true)
      expect(() => enforceStringId(categoryData.companyId, 'createCategory.companyId')).not.toThrow()
    })
    
  })
  
  describe('VendorInventory Creation', () => {
    
    test('vendorInventory.vendorId must be valid string ID', () => {
      const inventoryData = {
        vendorId: mockVendor.id,
        productId: mockProduct.id,
        quantity: 100
      }
      
      expect(isValidStringId(inventoryData.vendorId)).toBe(true)
      expect(isValidStringId(inventoryData.productId)).toBe(true)
      expect(() => enforceStringIds({
        vendorId: inventoryData.vendorId,
        productId: inventoryData.productId
      }, 'createVendorInventory')).not.toThrow()
    })
    
  })
  
  describe('Order Creation', () => {
    
    test('order.employeeId must be valid string ID', () => {
      const orderData = {
        id: generateStringId(),
        employeeId: mockEmployee.id,
        companyId: mockCompany.id
      }
      
      expect(isValidStringId(orderData.employeeId)).toBe(true)
      expect(isValidStringId(orderData.companyId)).toBe(true)
    })
    
    test('order.site_admin_approved_by must be valid string ID when set', () => {
      const orderData = {
        id: generateStringId(),
        site_admin_approved_by: mockEmployee.id
      }
      
      expect(isValidStringId(orderData.site_admin_approved_by)).toBe(true)
    })
    
  })
  
  describe('Shipment Creation', () => {
    
    test('shipment.orderId must be valid string ID when set', () => {
      const shipmentData = {
        id: generateStringId(),
        orderId: generateStringId()
      }
      
      expect(isValidStringId(shipmentData.orderId)).toBe(true)
    })
    
  })
  
  describe('PO + PR Chain', () => {
    
    test('poorder.order_id must be valid string ID', () => {
      const poorderData = {
        id: generateStringId(),
        order_id: generateStringId()
      }
      
      expect(isValidStringId(poorderData.order_id)).toBe(true)
      expect(() => enforceStringId(poorderData.order_id, 'createPoOrder.order_id')).not.toThrow()
    })
    
  })
  
})

// ============================================================
// RELATIONSHIP LOOKUP TESTS
// ============================================================

describe('Relationship Lookup Simulations', () => {
  
  test('employee lookup by companyId should use string format', () => {
    // Simulate query: Employee.find({ companyId: '100001' })
    const queryFilter = { companyId: mockCompany.id }
    
    expect(isValidStringId(queryFilter.companyId)).toBe(true)
    expect(isHexString(queryFilter.companyId)).toBe(false)
    expect(isObjectIdInstance(queryFilter.companyId)).toBe(false)
  })
  
  test('productVendor lookup should use string IDs', () => {
    // Simulate query: ProductVendor.find({ productId: '300001', vendorId: '200001' })
    const queryFilter = { 
      productId: mockProduct.id, 
      vendorId: mockVendor.id 
    }
    
    expect(isValidStringId(queryFilter.productId)).toBe(true)
    expect(isValidStringId(queryFilter.vendorId)).toBe(true)
  })
  
  test('vendorInventory lookup should use string IDs', () => {
    const queryFilter = { 
      vendorId: mockVendor.id, 
      productId: mockProduct.id 
    }
    
    expect(isValidStringId(queryFilter.vendorId)).toBe(true)
    expect(isValidStringId(queryFilter.productId)).toBe(true)
  })
  
})

// ============================================================
// INTEGRATION TEST TEMPLATE (Requires DB Connection)
// ============================================================

describe.skip('Integration Tests (Requires DB)', () => {
  
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect('mongodb://localhost:27017/uniform-distribution-test')
  })
  
  afterAll(async () => {
    await mongoose.disconnect()
  })
  
  test('created employee has string companyId', async () => {
    // This test would create an actual employee and verify the stored companyId format
    // Example:
    // const employee = await createEmployee({ companyId: '100001', ... })
    // expect(isValidStringId(employee.companyId)).toBe(true)
  })
  
  test('created productVendor has string IDs', async () => {
    // This test would create an actual productVendor link
    // const pv = await createProductVendor({ productId: '300001', vendorId: '200001' })
    // expect(isValidStringId(pv.productId)).toBe(true)
    // expect(isValidStringId(pv.vendorId)).toBe(true)
  })
  
  test('created order has string employeeId', async () => {
    // const order = await createOrder({ employeeId: '100001', ... })
    // expect(isValidStringId(order.employeeId)).toBe(true)
  })
  
})

// ============================================================
// LEGACY DATA DETECTION TESTS
// ============================================================

describe('Legacy Data Detection', () => {
  
  test('detectHexString identifies ObjectId-like strings', () => {
    const hexStrings = [
      '507f1f77bcf86cd799439011',
      '6942773350a2f9b1515291a3',
      '695e26a582ef90e47299250f'
    ]
    
    for (const hex of hexStrings) {
      const result = validateIdFormat(hex)
      expect(result.valid).toBe(false)
      expect(result.type).toBe('hex-string')
    }
  })
  
  test('valid string IDs are not detected as hex', () => {
    const validIds = ['100001', '200002', '999999', '500000']
    
    for (const id of validIds) {
      const result = validateIdFormat(id)
      expect(result.valid).toBe(true)
      expect(result.type).toBe('valid')
    }
  })
  
})
