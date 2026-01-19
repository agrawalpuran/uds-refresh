# WhatsApp Uniform Ordering Add-On

This module provides a WhatsApp-based conversational interface for the Uniform Distribution System (UDS), allowing employees to place and track uniform orders via WhatsApp.

## Architecture

The WhatsApp add-on is built as a modular extension to the existing UDS system:

- **No Duplication**: All business logic (eligibility, products, orders) is reused from existing UDS services
- **State Machine**: Conversation flows are managed through a state machine stored in MongoDB
- **Webhook-Based**: Receives messages via HTTP webhook endpoint

## Components

### 1. Models
- `lib/models/WhatsAppSession.ts`: MongoDB model for storing conversation state per user

### 2. Core Logic
- `lib/whatsapp/state-handler.ts`: Main state machine handler that processes messages and manages conversation flows
- `lib/whatsapp/utils.ts`: Message formatting utilities for WhatsApp responses

### 3. API Endpoint
- `app/api/whatsapp/webhook/route.ts`: Webhook endpoint that receives incoming WhatsApp messages

### 4. Data Access
- `lib/db/data-access.ts`: Added `getEmployeeByPhone()` function for phone-based authentication

## Conversation States

The state machine supports the following states:

1. **MAIN_MENU**: Initial menu with options
2. **ORDER_SELECT_ITEM**: Selecting products from eligible items
3. **ORDER_SET_SIZE**: Selecting size for a product
4. **ORDER_SET_QTY**: Setting quantity for a product
5. **ORDER_REVIEW**: Reviewing cart before checkout
6. **ORDER_DELIVERY**: Selecting delivery option (office/home)
7. **ORDER_CONFIRM**: Confirming order placement
8. **VIEW_PAST_ORDERS**: Viewing order history
9. **CHECK_STATUS**: Checking status of a specific order
10. **HELP**: Help and support information

## Global Commands

Users can use these commands at any time:

- `MENU` or `MAIN MENU`: Return to main menu
- `STATUS`: Check all open orders
- `HELP`: Show help information

## Setup Instructions

### 1. Environment Variables

Add to your `.env.local`:

```env
# WhatsApp Webhook Verification Token (for providers that require it)
WHATSAPP_VERIFY_TOKEN=your_secure_verify_token_here
```

### 2. WhatsApp Provider Integration

The webhook endpoint is provider-agnostic but expects this payload format:

```json
{
  "from": "+919876543210",
  "message": "Hello",
  "messageId": "msg_123",
  "timestamp": 1234567890
}
```

**Common WhatsApp Providers:**

#### Option A: Twilio WhatsApp API
- Configure Twilio webhook to point to: `https://your-domain.com/api/whatsapp/webhook`
- Twilio sends messages in format: `{ "From": "+919876543210", "Body": "Hello" }`
- Adapt the webhook route to map Twilio fields to expected format

#### Option B: Meta (Facebook) WhatsApp Business API
- Configure webhook in Meta Business Manager
- Webhook URL: `https://your-domain.com/api/whatsapp/webhook`
- Verification token: Set `WHATSAPP_VERIFY_TOKEN` in environment
- Meta sends messages in format: `{ "entry": [{ "changes": [{ "value": { "messages": [...] } }] }] }`
- You'll need to adapt the webhook route to parse Meta's format

#### Option C: Custom WhatsApp Gateway
- Point your gateway's webhook to: `https://your-domain.com/api/whatsapp/webhook`
- Ensure it sends messages in the expected format

### 3. Database

The `WhatsAppSession` model will be automatically created when first used. No migration needed.

### 4. Testing

You can test the webhook locally using curl:

```bash
curl -X POST http://localhost:3001/api/whatsapp/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "from": "+919876543210",
    "message": "MENU",
    "messageId": "test_123"
  }'
```

## User Flow

### Authentication
1. User sends first message from their registered phone number
2. System looks up employee by phone number
3. If found, user is authenticated and can proceed
4. If not found, user sees authentication failure message

### Placing an Order
1. User selects "Place New Order" (option 1)
2. System fetches eligible products based on:
   - Employee's company
   - Remaining eligibility (quota)
   - Gender compatibility
3. User selects a product by number
4. User selects size from available sizes
5. User enters quantity (1-10)
6. Product added to cart, user can add more or review
7. User reviews cart and selects delivery option:
   - Office Pickup (free)
   - Home Delivery (requires address)
8. User confirms order
9. System validates eligibility and creates order via existing `createOrder()` service
10. User receives order confirmation with order ID

### Viewing Orders
1. User selects "View Past Orders" (option 2)
2. System fetches all orders for the employee
3. User can select an order number to view details

### Checking Status
1. User selects "Check Order Status" (option 3)
2. System shows list of open orders
3. User can select an order to see detailed status

## Integration with Existing Services

The WhatsApp module reuses these existing UDS services:

- `getEmployeeByPhone()`: Authenticate user by phone number
- `getEmployeeById()`: Get employee details
- `getProductsByCompany()`: Get eligible products
- `getEmployeeEligibilityFromDesignation()`: Get eligibility rules
- `getConsumedEligibility()`: Get consumed quota
- `validateEmployeeEligibility()`: Validate order before creation
- `createOrder()`: Create order (same as web interface)
- `getOrdersByEmployee()`: Get order history

**No business logic is duplicated.** All eligibility rules, quotas, and order processing flow through the same services used by the web interface.

## Security Considerations

1. **Phone Number Validation**: Phone numbers are normalized and validated
2. **Employee Authentication**: Only registered employees can place orders
3. **Eligibility Enforcement**: All eligibility rules are enforced server-side
4. **Webhook Verification**: Supports provider-specific webhook verification (e.g., Meta's verify_token)

## Error Handling

- Invalid input prompts user to try again
- Eligibility errors show specific error messages
- Authentication failures guide user to contact HR
- All errors include option to return to main menu

## Future Enhancements

Potential additions:
- Order status push notifications (when order status changes)
- Multi-language support
- Image support for product catalog
- Interactive buttons/lists (if provider supports)
- Order cancellation via WhatsApp
- Feedback submission via WhatsApp

## Troubleshooting

### Messages not being received
- Check webhook URL is correctly configured in your WhatsApp provider
- Verify webhook endpoint is accessible (not blocked by firewall)
- Check server logs for incoming webhook requests

### Authentication failing
- Ensure employee phone numbers are correctly stored in database
- Phone numbers must match exactly (including country code)
- Check encryption/decryption of phone numbers in Employee model

### Orders not being created
- Check eligibility validation logs
- Verify employee has remaining quota
- Ensure products are linked to employee's company
- Check order creation service logs

## Support

For issues or questions:
1. Check server logs: `[WhatsApp Webhook]` and `[WhatsApp]` prefixes
2. Review conversation state in `WhatsAppSession` collection
3. Verify employee data and eligibility in database

