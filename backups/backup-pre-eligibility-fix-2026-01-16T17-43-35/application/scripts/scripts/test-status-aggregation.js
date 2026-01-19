/**
 * Test script for status aggregation logic
 * Tests the calculateAggregatedOrderStatus function with various scenarios
 */

// Simulate the calculateAggregatedOrderStatus function
function calculateAggregatedOrderStatus(splitOrders) {
  if (!splitOrders || splitOrders.length === 0) {
    return 'Awaiting approval'
  }
  
  // For single-vendor orders, return the status as-is (no aggregation needed)
  if (splitOrders.length === 1) {
    return splitOrders[0].status || 'Awaiting approval'
  }
  
  // Count orders by status
  const statusCounts = {
    'Awaiting approval': 0,
    'Awaiting fulfilment': 0,
    'Dispatched': 0,
    'Delivered': 0
  }
  
  splitOrders.forEach((order) => {
    const status = order.status || 'Awaiting approval'
    if (status in statusCounts) {
      statusCounts[status]++
    }
  })
  
  const totalOrders = splitOrders.length
  
  // STEP 1: DELIVERY STATUS (highest priority - check delivery first)
  const deliveredCount = statusCounts['Delivered']
  if (deliveredCount > 0) {
    if (deliveredCount === totalOrders) {
      // All orders delivered
      return 'Delivered'
    } else {
      // Some delivered, some not
      return 'Partially Delivered'
    }
  }
  
  // STEP 2: DISPATCH STATUS (check dispatch if not all delivered)
  const dispatchedCount = statusCounts['Dispatched']
  const awaitingFulfilmentCount = statusCounts['Awaiting fulfilment']
  const awaitingApprovalCount = statusCounts['Awaiting approval']
  
  // If any orders are still awaiting approval, return that status
  if (awaitingApprovalCount > 0) {
    return 'Awaiting approval'
  }
  
  // All remaining orders are either "Awaiting fulfilment" or "Dispatched"
  if (dispatchedCount === 0) {
    // None dispatched - all are in "Awaiting fulfilment"
    // This means we're "Awaiting Dispatch"
    return 'Awaiting Dispatch'
  } else if (dispatchedCount === totalOrders) {
    // All dispatched (but not delivered)
    // This means we're "Awaiting Delivery"
    return 'Awaiting Delivery'
  } else {
    // Some dispatched, some still in "Awaiting fulfilment"
    return 'Partially Dispatched'
  }
}

// Test cases
const testCases = [
  {
    name: 'Single vendor - Awaiting approval',
    orders: [{ status: 'Awaiting approval' }],
    expected: 'Awaiting approval'
  },
  {
    name: 'Single vendor - Dispatched',
    orders: [{ status: 'Dispatched' }],
    expected: 'Dispatched'
  },
  {
    name: 'Multi-vendor - All awaiting approval',
    orders: [
      { status: 'Awaiting approval' },
      { status: 'Awaiting approval' }
    ],
    expected: 'Awaiting approval'
  },
  {
    name: 'Multi-vendor - All awaiting fulfilment',
    orders: [
      { status: 'Awaiting fulfilment' },
      { status: 'Awaiting fulfilment' }
    ],
    expected: 'Awaiting Dispatch'
  },
  {
    name: 'Multi-vendor - None dispatched (all in fulfilment)',
    orders: [
      { status: 'Awaiting fulfilment' },
      { status: 'Awaiting fulfilment' },
      { status: 'Awaiting fulfilment' }
    ],
    expected: 'Awaiting Dispatch'
  },
  {
    name: 'Multi-vendor - Partially Dispatched (some dispatched, some in fulfilment)',
    orders: [
      { status: 'Dispatched' },
      { status: 'Awaiting fulfilment' }
    ],
    expected: 'Partially Dispatched'
  },
  {
    name: 'Multi-vendor - All Dispatched',
    orders: [
      { status: 'Dispatched' },
      { status: 'Dispatched' }
    ],
    expected: 'Awaiting Delivery'
  },
  {
    name: 'Multi-vendor - Partially Delivered (some delivered, some dispatched)',
    orders: [
      { status: 'Delivered' },
      { status: 'Dispatched' }
    ],
    expected: 'Partially Delivered'
  },
  {
    name: 'Multi-vendor - All Delivered',
    orders: [
      { status: 'Delivered' },
      { status: 'Delivered' }
    ],
    expected: 'Delivered'
  },
  {
    name: 'Multi-vendor - Complex: Some delivered, some dispatched, some in fulfilment',
    orders: [
      { status: 'Delivered' },
      { status: 'Dispatched' },
      { status: 'Awaiting fulfilment' }
    ],
    expected: 'Partially Delivered'
  },
  {
    name: 'Multi-vendor - Mixed approval and fulfilment',
    orders: [
      { status: 'Awaiting approval' },
      { status: 'Awaiting fulfilment' }
    ],
    expected: 'Awaiting approval'
  }
]

console.log('🧪 Testing Status Aggregation Logic\n')
console.log('='.repeat(80))

let passed = 0
let failed = 0

testCases.forEach((testCase, index) => {
  const result = calculateAggregatedOrderStatus(testCase.orders)
  const success = result === testCase.expected
  
  if (success) {
    passed++
    console.log(`✅ Test ${index + 1}: ${testCase.name}`)
    console.log(`   Expected: ${testCase.expected}, Got: ${result}`)
  } else {
    failed++
    console.log(`❌ Test ${index + 1}: ${testCase.name}`)
    console.log(`   Expected: ${testCase.expected}, Got: ${result}`)
    console.log(`   Orders: ${JSON.stringify(testCase.orders.map(o => o.status))}`)
  }
  console.log('')
})

console.log('='.repeat(80))
console.log(`\n📊 Results: ${passed} passed, ${failed} failed`)
console.log(`\n${failed === 0 ? '✅ All tests passed!' : '❌ Some tests failed'}`)

