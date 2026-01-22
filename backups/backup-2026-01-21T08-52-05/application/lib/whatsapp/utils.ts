/**
 * WhatsApp Message Formatting Utilities
 * Helper functions for formatting messages sent via WhatsApp
 */

export function formatMainMenu(): string {
  return `👕 *Uniform Distribution System*

Welcome! How can I help you today?

*1.* Place New Order
*2.* View Past Orders
*3.* Check Order Status
*4.* Help

Reply with the number (1-4) or type:
• *MENU* - Return to main menu
• *STATUS* - Check open orders
• *HELP* - Get support information`
}

export function formatEligibleProducts(products: any[], remainingEligibility: {
  shirt: number
  pant: number
  shoe: number
  jacket: number
}): string {
  if (!products || products.length === 0) {
    return `❌ *No eligible products available*

You don't have any eligible uniform items at this time. Please contact HR for assistance.

Type *MENU* to return to the main menu.`
  }

  let message = `📦 *Available Products*\n\n`
  
  // Group by category
  const byCategory: Record<string, any[]> = {}
  products.forEach((product) => {
    const category = product.category || 'other'
    if (!byCategory[category]) {
      byCategory[category] = []
    }
    byCategory[category].push(product)
  })

  // Format by category
  const categoryNames: Record<string, string> = {
    shirt: '👔 Shirts',
    pant: '👖 Pants',
    shoe: '👟 Shoes',
    jacket: '🧥 Jackets',
  }

  Object.keys(byCategory).forEach((category) => {
    const categoryLabel = categoryNames[category] || category.toUpperCase()
    const remaining = remainingEligibility[category as keyof typeof remainingEligibility] || 0
    
    message += `*${categoryLabel}* (Remaining: ${remaining})\n`
    
    byCategory[category].forEach((product, index) => {
      message += `${index + 1}. ${product.name} - ₹${product.price}\n`
    })
    message += `\n`
  })

  message += `\nReply with the product number to select, or type *MENU* to go back.`

  return message
}

export function formatProductDetails(product: any, availableSizes: string[]): string {
  return `📦 *${product.name}*

💰 Price: ₹${product.price}
📏 Available Sizes: ${availableSizes.join(', ')}

Select a size by typing the size (e.g., "M", "L", "XL"), or type *BACK* to go back.`
}

export function formatCartReview(cart: Array<{
  uniformName: string
  size: string
  quantity: number
  price: number
}>, total: number): string {
  if (!cart || cart.length === 0) {
    return `🛒 *Your cart is empty*

Type *MENU* to start shopping.`
  }

  let message = `🛒 *Order Review*\n\n`
  
  cart.forEach((item, index) => {
    const itemTotal = item.price * item.quantity
    message += `${index + 1}. ${item.uniformName}\n`
    message += `   Size: ${item.size} | Qty: ${item.quantity} | ₹${itemTotal}\n\n`
  })

  message += `*Total: ₹${total}*\n\n`
  message += `Choose delivery option:\n`
  message += `*1.* Office Pickup (Free)\n`
  message += `*2.* Home Delivery\n\n`
  message += `Reply with 1 or 2, or type *EDIT* to modify cart.`

  return message
}

export function formatOrderConfirmation(order: any): string {
  const orderId = order.id || order._id
  const status = order.status || 'Awaiting approval'
  const total = order.total || 0
  const itemCount = order.items?.length || 0

  let message = `✅ *Order Confirmed!*\n\n`
  message += `📋 Order ID: ${orderId}\n`
  message += `📊 Status: ${status}\n`
  message += `📦 Items: ${itemCount}\n`
  message += `💰 Total: ₹${total}\n\n`

  if (order.items && order.items.length > 0) {
    message += `*Items:*\n`
    order.items.forEach((item: any, index: number) => {
      message += `${index + 1}. ${item.uniformName || item.name} - ${item.size} x ${item.quantity}\n`
    })
    message += `\n`
  }

  message += `You will receive updates on your order status.\n\n`
  message += `Type *MENU* to return to main menu.`

  return message
}

export function formatOrderList(orders: any[]): string {
  if (!orders || orders.length === 0) {
    return `📋 *No Past Orders*

You haven't placed any orders yet.

Type *MENU* to start shopping, or *1* to place a new order.`
  }

  let message = `📋 *Your Orders* (${orders.length})\n\n`

  orders.slice(0, 10).forEach((order, index) => {
    const orderId = order.id || 'N/A'
    const status = order.status || 'Unknown'
    const total = order.total || 0
    const date = order.orderDate 
      ? new Date(order.orderDate).toLocaleDateString('en-IN')
      : 'N/A'

    message += `${index + 1}. *Order ${orderId}*\n`
    message += `   Status: ${status}\n`
    message += `   Total: ₹${total}\n`
    message += `   Date: ${date}\n\n`
  })

  if (orders.length > 10) {
    message += `\n(Showing first 10 orders)\n`
  }

  message += `\nType an order number to check status, or *MENU* to go back.`

  return message
}

export function formatOrderStatus(order: any): string {
  if (!order) {
    return `❌ *Order Not Found*

The order you're looking for doesn't exist.

Type *MENU* to return to main menu.`
  }

  const orderId = order.id || 'N/A'
  const status = order.status || 'Unknown'
  const total = order.total || 0
  const date = order.orderDate 
    ? new Date(order.orderDate).toLocaleDateString('en-IN')
    : 'N/A'
  const deliveryAddress = order.deliveryAddress || 'Not specified'

  let message = `📋 *Order Status*\n\n`
  message += `Order ID: ${orderId}\n`
  message += `Status: *${status}*\n`
  message += `Total: ₹${total}\n`
  message += `Date: ${date}\n`
  message += `Delivery: ${deliveryAddress}\n\n`

  if (order.items && order.items.length > 0) {
    message += `*Items:*\n`
    order.items.forEach((item: any, index: number) => {
      message += `${index + 1}. ${item.uniformName || item.name} - ${item.size} x ${item.quantity}\n`
    })
    message += `\n`
  }

  // Status-specific messages
  const statusMessages: Record<string, string> = {
    'Awaiting approval': '⏳ Your order is pending approval from your manager.',
    'Awaiting fulfilment': '📦 Your order has been approved and is being processed.',
    'Dispatched': '🚚 Your order has been dispatched and is on its way!',
    'Delivered': '✅ Your order has been delivered.',
    'Cancelled': '❌ This order has been cancelled.',
  }

  if (statusMessages[status]) {
    message += `${statusMessages[status]}\n\n`
  }

  message += `Type *MENU* to return to main menu.`

  return message
}

export function formatHelp(): string {
  return `ℹ️ *Help & Support*

*Commands:*
• *MENU* - Return to main menu
• *STATUS* - Check all open orders
• *HELP* - Show this help message

*Support:*
For assistance with orders, eligibility, or technical issues, please contact your HR department.

*Order Process:*
1. Select eligible products
2. Choose size and quantity
3. Review your cart
4. Select delivery option
5. Confirm order

Type *MENU* to return to main menu.`
}

export function formatError(message: string): string {
  return `❌ *Error*

${message}

Type *MENU* to return to main menu, or *HELP* for assistance.`
}

export function formatAuthenticationPrompt(): string {
  return `🔐 *Authentication Required*

Please provide your employee ID to continue.

Reply with your 6-digit employee ID (e.g., "300001"), or type *HELP* for assistance.`
}

export function formatAuthenticationSuccess(employeeName: string): string {
  return `✅ *Welcome, ${employeeName}!*

You've been successfully authenticated.

${formatMainMenu()}`
}

export function formatAuthenticationFailure(): string {
  return `❌ *Authentication Failed*

We couldn't find an employee account linked to this phone number.

Please ensure:
• Your phone number is registered in the system
• You're using the correct phone number format

Type *HELP* for support, or contact HR for assistance.`
}

