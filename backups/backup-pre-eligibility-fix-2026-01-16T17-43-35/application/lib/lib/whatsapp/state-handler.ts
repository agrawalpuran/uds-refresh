/**
 * WhatsApp State Machine Handler
 * Handles conversation state transitions and message processing
 */

import WhatsAppSession, { WhatsAppState } from '../models/WhatsAppSession'
import connectDB from '../db/mongodb'
import {
  getEmployeeByPhone,
  getEmployeeById,
  getProductsByCompany,
  getEmployeeEligibilityFromDesignation,
  getConsumedEligibility,
  validateEmployeeEligibility,
  createOrder,
  getOrdersByEmployee,
} from '../db/data-access'
import {
  formatMainMenu,
  formatEligibleProducts,
  formatProductDetails,
  formatCartReview,
  formatOrderConfirmation,
  formatOrderList,
  formatOrderStatus,
  formatHelp,
  formatError,
  formatAuthenticationPrompt,
  formatAuthenticationSuccess,
  formatAuthenticationFailure,
} from './utils'

export async function getOrCreateSession(whatsappNumber: string): Promise<any> {
  await connectDB()
  
  // Normalize phone number
  const normalizedPhone = normalizePhoneNumber(whatsappNumber)
  
  let session = await WhatsAppSession.findOne({ whatsappNumber: normalizedPhone })
  
  if (!session) {
    session = await WhatsAppSession.create({
      whatsappNumber: normalizedPhone,
      state: 'MAIN_MENU',
      cart: [],
      context: {},
    })
  }
  
  return session
}

export async function updateSessionState(
  whatsappNumber: string,
  updates: {
    state?: WhatsAppState
    employeeId?: string
    cart?: any[]
    context?: any
  }
): Promise<any> {
  await connectDB()
  
  const normalizedPhone = normalizePhoneNumber(whatsappNumber)
  
  const session = await WhatsAppSession.findOneAndUpdate(
    { whatsappNumber: normalizedPhone },
    {
      ...updates,
      lastActivity: new Date(),
    },
    { new: true }
  )
  
  return session
}

export async function processMessage(
  whatsappNumber: string,
  messageText: string
): Promise<string> {
  await connectDB()
  
  const session = await getOrCreateSession(whatsappNumber)
  const normalizedMessage = messageText.trim().toUpperCase()
  
  // Handle global commands
  if (normalizedMessage === 'MENU' || normalizedMessage === 'MAIN MENU') {
    await updateSessionState(whatsappNumber, {
      state: 'MAIN_MENU',
      cart: [],
      context: {},
    })
    return formatMainMenu()
  }
  
  if (normalizedMessage === 'HELP') {
    await updateSessionState(whatsappNumber, { state: 'HELP' })
    return formatHelp()
  }
  
  if (normalizedMessage === 'STATUS') {
    if (!session.employeeId) {
      return formatAuthenticationPrompt()
    }
    
    const employee = await getEmployeeById(session.employeeId)
    if (!employee) {
      return formatError('Employee not found. Please contact HR.')
    }
    
    const orders = await getOrdersByEmployee(session.employeeId)
    const openOrders = orders.filter(
      (o: any) => !['Delivered', 'Cancelled'].includes(o.status)
    )
    
    if (openOrders.length === 0) {
      return `📋 *No Open Orders*\n\nYou don't have any pending orders.\n\nType *MENU* to return to main menu.`
    }
    
    return formatOrderList(openOrders)
  }
  
  // Route to state-specific handlers
  switch (session.state) {
    case 'MAIN_MENU':
      return await handleMainMenu(session, normalizedMessage, whatsappNumber)
    
    case 'ORDER_SELECT_ITEM':
      return await handleOrderSelectItem(session, normalizedMessage, whatsappNumber)
    
    case 'ORDER_SET_SIZE':
      return await handleOrderSetSize(session, normalizedMessage, whatsappNumber)
    
    case 'ORDER_SET_QTY':
      return await handleOrderSetQty(session, normalizedMessage, whatsappNumber)
    
    case 'ORDER_REVIEW':
      return await handleOrderReview(session, normalizedMessage, whatsappNumber)
    
    case 'ORDER_DELIVERY':
      return await handleOrderDelivery(session, normalizedMessage, whatsappNumber)
    
    case 'VIEW_PAST_ORDERS':
      return await handleViewPastOrders(session, normalizedMessage, whatsappNumber)
    
    case 'CHECK_STATUS':
      return await handleCheckStatus(session, normalizedMessage, whatsappNumber)
    
    case 'HELP':
      return formatHelp()
    
    default:
      await updateSessionState(whatsappNumber, { state: 'MAIN_MENU' })
      return formatMainMenu()
  }
}

async function handleMainMenu(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  // Check if employee is authenticated
  if (!session.employeeId) {
    // Try to authenticate by phone number
    console.log(`[handleMainMenu] Attempting authentication for phone: ${whatsappNumber.substring(0, 8)}...`)
    const employee = await getEmployeeByPhone(whatsappNumber)
    
    if (!employee) {
      console.log(`[handleMainMenu] ❌ Authentication failed - employee not found for phone: ${whatsappNumber.substring(0, 8)}...`)
      return formatAuthenticationFailure()
    }
    
    console.log(`[handleMainMenu] ✅ Authentication successful - employee found: ${employee.employeeId || employee.id}`)
    
    // Authenticate and update session
    await updateSessionState(whatsappNumber, {
      employeeId: employee.employeeId || employee.id,
    })
    
    return formatAuthenticationSuccess(
      `${employee.firstName} ${employee.lastName}`
    )
  }
  
  // Handle menu options
  if (message === '1' || message.includes('ORDER') || message.includes('PLACE')) {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_SELECT_ITEM',
      cart: [],
      context: {},
    })
    return await loadEligibleProducts(whatsappNumber)
  }
  
  if (message === '2' || message.includes('PAST') || message.includes('HISTORY')) {
    await updateSessionState(whatsappNumber, { state: 'VIEW_PAST_ORDERS' })
    return await loadPastOrders(whatsappNumber)
  }
  
  if (message === '3' || message.includes('STATUS') || message.includes('CHECK')) {
    await updateSessionState(whatsappNumber, { state: 'CHECK_STATUS' })
    const orders = await getOrdersByEmployee(session.employeeId)
    const openOrders = orders.filter(
      (o: any) => !['Delivered', 'Cancelled'].includes(o.status)
    )
    return formatOrderList(openOrders)
  }
  
  if (message === '4' || message.includes('HELP')) {
    await updateSessionState(whatsappNumber, { state: 'HELP' })
    return formatHelp()
  }
  
  return formatMainMenu()
}

async function loadEligibleProducts(whatsappNumber: string): Promise<string> {
  const session = await getOrCreateSession(whatsappNumber)
  
  if (!session.employeeId) {
    return formatAuthenticationPrompt()
  }
  
  const employee = await getEmployeeById(session.employeeId)
  if (!employee || !employee.companyId) {
    return formatError('Employee or company information not found.')
  }
  
  // Get eligible products
  const products = await getProductsByCompany(employee.companyId)
  
  // Get eligibility (returns { shirt, pant, shoe, jacket, cycleDurations })
  const eligibilityData = await getEmployeeEligibilityFromDesignation(
    session.employeeId
  )
  const consumedEligibility = await getConsumedEligibility(session.employeeId)
  
  const remainingEligibility = {
    shirt: eligibilityData.shirt - consumedEligibility.shirt,
    pant: eligibilityData.pant - consumedEligibility.pant,
    shoe: eligibilityData.shoe - consumedEligibility.shoe,
    jacket: eligibilityData.jacket - consumedEligibility.jacket,
  }
  
  // Filter products by eligibility and gender
  const eligibleProducts = products.filter((product: any) => {
    const category = product.category
    if (category === 'shirt' || category === 'pant' || category === 'shoe' || category === 'jacket') {
      if (remainingEligibility[category] <= 0) {
        return false
      }
    }
    
    // Check gender compatibility
    if (product.gender && product.gender !== 'unisex') {
      if (product.gender !== employee.gender) {
        return false
      }
    }
    
    return true
  })
  
  if (eligibleProducts.length === 0) {
    return `❌ *No Eligible Products*

You don't have any remaining eligibility for uniform items at this time.

Type *MENU* to return to main menu.`
  }
  
  // Store eligible products in context
  await updateSessionState(whatsappNumber, {
    context: {
      eligibleProducts: eligibleProducts.map((p: any) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        sizes: p.sizes || [],
      })),
    },
  })
  
  return formatEligibleProducts(eligibleProducts, remainingEligibility)
}

async function handleOrderSelectItem(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK' || message === 'MENU') {
    await updateSessionState(whatsappNumber, {
      state: 'MAIN_MENU',
      cart: [],
      context: {},
    })
    return formatMainMenu()
  }
  
  const eligibleProducts = session.context?.eligibleProducts || []
  
  if (eligibleProducts.length === 0) {
    return await loadEligibleProducts(whatsappNumber)
  }
  
  // Parse product number
  const productNum = parseInt(message)
  if (isNaN(productNum) || productNum < 1 || productNum > eligibleProducts.length) {
    return `❌ Invalid selection. Please choose a number between 1 and ${eligibleProducts.length}.\n\n${formatEligibleProducts(eligibleProducts, { shirt: 0, pant: 0, shoe: 0, jacket: 0 })}`
  }
  
  const selectedProduct = eligibleProducts[productNum - 1]
  const availableSizes = selectedProduct.sizes || []
  
  if (availableSizes.length === 0) {
    return formatError('No sizes available for this product.')
  }
  
  // Store selected product in context
  await updateSessionState(whatsappNumber, {
    context: {
      ...session.context,
      currentProductId: selectedProduct.id,
      currentProductName: selectedProduct.name,
      currentCategory: selectedProduct.category,
      availableSizes: availableSizes,
    },
    state: 'ORDER_SET_SIZE',
  })
  
  return formatProductDetails(selectedProduct, availableSizes)
}

async function handleOrderSetSize(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK') {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_SELECT_ITEM',
      context: {
        ...session.context,
        currentProductId: undefined,
        currentProductName: undefined,
        availableSizes: undefined,
      },
    })
    return await loadEligibleProducts(whatsappNumber)
  }
  
  const availableSizes = session.context?.availableSizes || []
  const selectedSize = message.trim().toUpperCase()
  
  if (!availableSizes.includes(selectedSize)) {
    return `❌ Invalid size. Available sizes: ${availableSizes.join(', ')}\n\nPlease select a valid size, or type *BACK* to go back.`
  }
  
  // Store size and move to quantity selection
  await updateSessionState(whatsappNumber, {
    context: {
      ...session.context,
      selectedSize: selectedSize,
    },
    state: 'ORDER_SET_QTY',
  })
  
  return `📦 *${session.context.currentProductName}*\nSize: ${selectedSize}\n\nEnter quantity (1-10), or type *BACK* to change size.`
}

async function handleOrderSetQty(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK') {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_SET_SIZE',
      context: {
        ...session.context,
        selectedSize: undefined,
      },
    })
    const product = {
      id: session.context.currentProductId,
      name: session.context.currentProductName,
      price: session.context.eligibleProducts?.find(
        (p: any) => p.id === session.context.currentProductId
      )?.price || 0,
    }
    return formatProductDetails(product, session.context.availableSizes || [])
  }
  
  const quantity = parseInt(message)
  if (isNaN(quantity) || quantity < 1 || quantity > 10) {
    return `❌ Invalid quantity. Please enter a number between 1 and 10, or type *BACK* to go back.`
  }
  
  // Add to cart
  const product = session.context.eligibleProducts?.find(
    (p: any) => p.id === session.context.currentProductId
  )
  
  if (!product) {
    return formatError('Product not found. Please start over.')
  }
  
  const cart = session.cart || []
  cart.push({
    uniformId: product.id,
    uniformName: product.name,
    category: product.category,
    size: session.context.selectedSize,
    quantity: quantity,
    price: product.price,
  })
  
  // Calculate total
  const total = cart.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
  
  await updateSessionState(whatsappNumber, {
    cart: cart,
    state: 'ORDER_REVIEW',
    context: {},
  })
  
  return formatCartReview(cart, total)
}

async function handleOrderReview(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'EDIT' || message === 'BACK') {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_SELECT_ITEM',
      cart: [],
      context: {},
    })
    return await loadEligibleProducts(whatsappNumber)
  }
  
  if (message === '1' || message.includes('OFFICE')) {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_DELIVERY',
      context: {
        deliveryOption: 'office',
      },
    })
    return `✅ *Office Pickup Selected*\n\nYour order will be delivered to your office location.\n\nType *CONFIRM* to place the order, or *BACK* to change delivery option.`
  }
  
  if (message === '2' || message.includes('HOME')) {
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_DELIVERY',
      context: {
        deliveryOption: 'home',
      },
    })
    return `🏠 *Home Delivery Selected*\n\nPlease provide your delivery address, or type *CONFIRM* to use your registered address.`
  }
  
  const cart = session.cart || []
  const total = cart.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
  return formatCartReview(cart, total)
}

async function handleOrderDelivery(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK') {
    const cart = session.cart || []
    const total = cart.reduce((sum: number, item: any) => sum + item.price * item.quantity, 0)
    await updateSessionState(whatsappNumber, {
      state: 'ORDER_REVIEW',
    })
    return formatCartReview(cart, total)
  }
  
  if (message === 'CONFIRM' || message.includes('CONFIRM')) {
    return await confirmOrder(whatsappNumber)
  }
  
  // If home delivery and address provided
  if (session.context.deliveryOption === 'home' && message.length > 10) {
    await updateSessionState(whatsappNumber, {
      context: {
        ...session.context,
        personalAddress: message,
      },
    })
    return `✅ *Address Saved*\n\nDelivery Address: ${message}\n\nType *CONFIRM* to place the order, or *BACK* to change.`
  }
  
  return `Please type *CONFIRM* to place the order, or *BACK* to go back.`
}

async function confirmOrder(whatsappNumber: string): Promise<string> {
  const session = await getOrCreateSession(whatsappNumber)
  
  if (!session.employeeId) {
    return formatError('Employee not authenticated.')
  }
  
  const cart = session.cart || []
  if (cart.length === 0) {
    return formatError('Cart is empty.')
  }
  
  const employee = await getEmployeeById(session.employeeId)
  if (!employee) {
    return formatError('Employee not found.')
  }
  
  // Validate eligibility
  const validation = await validateEmployeeEligibility(
    session.employeeId,
    cart.map((item: any) => ({
      uniformId: item.uniformId,
      uniformName: item.uniformName,
      category: item.category,
      quantity: item.quantity,
    }))
  )
  
  if (!validation.valid) {
    let errorMsg = `❌ *Eligibility Error*\n\n`
    validation.errors.forEach((err: any) => {
      errorMsg += `• ${err.item}: ${err.error}\n`
    })
    errorMsg += `\nType *MENU* to return to main menu.`
    return errorMsg
  }
  
  // Prepare order data
  const deliveryOption = session.context?.deliveryOption || 'office'
  const usePersonalAddress = deliveryOption === 'home'
  const deliveryAddress = usePersonalAddress
    ? session.context?.personalAddress || employee.address || 'Not specified'
    : employee.locationId?.address || employee.location || 'Office location'
  
  try {
    const order = await createOrder({
      employeeId: session.employeeId,
      items: cart.map((item: any) => ({
        uniformId: item.uniformId,
        uniformName: item.uniformName,
        size: item.size,
        quantity: item.quantity,
        price: item.price,
      })),
      deliveryAddress: deliveryAddress,
      estimatedDeliveryTime: '7-10 business days',
      usePersonalAddress: usePersonalAddress,
    })
    
    // Clear cart and reset state
    await updateSessionState(whatsappNumber, {
      state: 'MAIN_MENU',
      cart: [],
      context: {},
    })
    
    return formatOrderConfirmation(order)
  } catch (error: any) {
    console.error('[WhatsApp] Order creation error:', error)
    return formatError(`Failed to create order: ${error.message || 'Unknown error'}`)
  }
}

async function loadPastOrders(whatsappNumber: string): Promise<string> {
  const session = await getOrCreateSession(whatsappNumber)
  
  if (!session.employeeId) {
    return formatAuthenticationPrompt()
  }
  
  const orders = await getOrdersByEmployee(session.employeeId)
  return formatOrderList(orders)
}

async function handleViewPastOrders(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK' || message === 'MENU') {
    await updateSessionState(whatsappNumber, { state: 'MAIN_MENU' })
    return formatMainMenu()
  }
  
  const orders = await getOrdersByEmployee(session.employeeId)
  const orderNum = parseInt(message)
  
  if (!isNaN(orderNum) && orderNum >= 1 && orderNum <= Math.min(orders.length, 10)) {
    const selectedOrder = orders[orderNum - 1]
    await updateSessionState(whatsappNumber, {
      state: 'CHECK_STATUS',
      context: {
        selectedOrderId: selectedOrder.id,
      },
    })
    return formatOrderStatus(selectedOrder)
  }
  
  return await loadPastOrders(whatsappNumber)
}

async function handleCheckStatus(
  session: any,
  message: string,
  whatsappNumber: string
): Promise<string> {
  if (message === 'BACK' || message === 'MENU') {
    await updateSessionState(whatsappNumber, { state: 'MAIN_MENU' })
    return formatMainMenu()
  }
  
  const orders = await getOrdersByEmployee(session.employeeId)
  const orderNum = parseInt(message)
  
  if (!isNaN(orderNum) && orderNum >= 1 && orderNum <= Math.min(orders.length, 10)) {
    const selectedOrder = orders[orderNum - 1]
    return formatOrderStatus(selectedOrder)
  }
  
  // Try to find by order ID
  const orderById = orders.find((o: any) => o.id === message || o.id?.includes(message))
  if (orderById) {
    return formatOrderStatus(orderById)
  }
  
  return `❌ Order not found. Please select a valid order number, or type *MENU* to go back.`
}

function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, '')
  
  // If doesn't start with +, assume it's Indian number and add +91
  if (!normalized.startsWith('+')) {
    // Remove leading 0 if present
    if (normalized.startsWith('0')) {
      normalized = normalized.substring(1)
    }
    // Add +91 if it's a 10-digit number
    if (normalized.length === 10) {
      normalized = '+91' + normalized
    } else if (normalized.length === 12 && normalized.startsWith('91')) {
      normalized = '+' + normalized
    }
  }
  
  return normalized
}

