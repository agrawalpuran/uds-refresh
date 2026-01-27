# UDS Notification Framework Guide

## Overview

The UDS Notification Framework provides email notifications to all stakeholders throughout the order lifecycle. This includes:

- **Employees** - Order status updates, PO generation, delivery confirmation
- **Vendors** - New orders, PO received, shipment reminders
- **Company Admins** - Approval requests, PO generation, delivery updates
- **Location Admins** - Approval requests, order status at their location

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Order Lifecycle                              │
├─────────────────────────────────────────────────────────────────────┤
│  Order Placed → Approved → PO Created → Dispatched → Delivered      │
└─────────────────────────────────────────────────────────────────────┘
         │            │            │            │           │
         ▼            ▼            ▼            ▼           ▼
    ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
    │ Notify  │ │ Notify  │ │ Notify  │ │ Notify  │ │ Notify  │
    │ Admins  │ │ Vendor  │ │ All     │ │ Employee│ │ All     │
    │         │ │ Employee│ │ Parties │ │         │ │ Parties │
    └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
```

## Configuration

### Environment Variables

Add these to your `.env.local`:

```bash
# Enable/disable email notifications
ENABLE_EMAIL_NOTIFICATIONS=true

# SMTP Configuration (Gmail example)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password

# From address configuration
SMTP_FROM_NAME=UDS Notifications
SMTP_FROM_EMAIL=your-email@gmail.com
```

### For Gmail Users

1. Enable 2-Factor Authentication on your Google account
2. Generate an App Password at: https://myaccount.google.com/apppasswords
3. Use the 16-character app password for `SMTP_PASS`

## Notification Events

### Employee Events
| Event Code | Description | Trigger Point |
|------------|-------------|---------------|
| `ORDER_STATUS_CHANGED` | Order status update | Any status change |
| `PO_GENERATED` | PO created for order | PO creation |
| `ORDER_MARKED_DELIVERED` | Order delivered | Delivery confirmation |

### Vendor Events
| Event Code | Description | Trigger Point |
|------------|-------------|---------------|
| `VENDOR_NEW_ORDER` | New order assigned | Order creation / approval |
| `VENDOR_PO_RECEIVED` | PO requires action | PO creation |
| `VENDOR_SHIPMENT_REMINDER` | Pending shipment reminder | Scheduled job (optional) |
| `VENDOR_ORDER_CANCELLED` | Order cancellation | Order cancellation |

### Company Admin Events
| Event Code | Description | Trigger Point |
|------------|-------------|---------------|
| `COMPANY_ADMIN_APPROVAL_REQUIRED` | Order needs approval | Order creation |
| `COMPANY_ADMIN_PO_GENERATED` | PO created | PO creation |
| `COMPANY_ADMIN_ORDER_DELIVERED` | Order delivered | Delivery confirmation |
| `COMPANY_ADMIN_DAILY_SUMMARY` | Daily order summary | Scheduled job (disabled by default) |

### Location Admin Events
| Event Code | Description | Trigger Point |
|------------|-------------|---------------|
| `LOCATION_ADMIN_APPROVAL_REQUIRED` | Order needs site approval | Order creation |
| `LOCATION_ADMIN_ORDER_STATUS` | Order status at location | Status change |
| `LOCATION_ADMIN_ORDER_DELIVERED` | Order delivered at location | Delivery confirmation |

## Managing Notifications (Super Admin UI)

Navigate to **Super Admin → Notifications** to:

1. **Events Tab** - View, enable/disable notification events
2. **Templates Tab** - Edit email templates with HTML and placeholders
3. **Logs Tab** - View sent notification history and errors

### Template Placeholders

Use `{{placeholder}}` syntax in templates:

| Placeholder | Description |
|-------------|-------------|
| `{{employeeName}}` | Recipient's name |
| `{{orderId}}` | Order ID |
| `{{orderStatus}}` | Current order status |
| `{{previousStatus}}` | Previous order status |
| `{{poNumber}}` | Purchase Order number |
| `{{vendorName}}` | Vendor name |
| `{{companyName}}` | Company name |
| `{{locationName}}` | Location name |
| `{{orderEmployeeName}}` | Employee who placed the order |

## Testing

### Test SMTP Configuration

```bash
npm run test-email [recipient-email]
```

This sends a test email to verify your SMTP settings.

### Test Notification Flow

1. Create a test order as an employee
2. Check admin email for approval notification
3. Approve the order - check employee and vendor emails
4. Create PO - check all parties
5. Mark delivered - check all parties

## Recipient Resolution

The framework automatically resolves recipient emails:

### Employee
- Looked up from `employees` collection by `employeeId`
- Decrypts email if encrypted

### Vendor
- Looked up from `vendors` collection by `vendorId`
- Uses vendor's email or contact email

### Company Admin
- Queries `companyAdmins` collection for the company
- Looks up associated employee emails
- Sends to ALL company admins

### Location Admin
- Checks `locationAdmins` collection
- Falls back to `locations.adminEmail`
- Based on employee's assigned location

## Code Integration Points

Notifications are triggered in `lib/db/data-access.ts`:

1. **`createOrder()`** - Notifies admins of new orders
2. **`approveOrder()`** - Notifies employee and vendor
3. **`approveOrderByParentId()`** - Notifies on bulk approval
4. **`updateOrderStatus()`** - Notifies on dispatch/delivery
5. **`createPurchaseOrderFromPRs()`** - Notifies all parties of PO

## Adding New Notification Events

1. **Add event to seed script** (`scripts/seed-notification-templates.ts`):
   ```typescript
   {
     eventId: '500xxx',
     eventCode: 'YOUR_EVENT_CODE',
     eventDescription: 'Description',
     defaultRecipientType: 'EMPLOYEE',
     isActive: true,
   }
   ```

2. **Add template**:
   ```typescript
   {
     templateId: '600xxx',
     eventId: '500xxx',
     templateName: 'Your Template Name',
     subjectTemplate: 'Subject with {{placeholders}}',
     bodyTemplate: '<html>...</html>',
     language: 'en',
     isActive: true,
   }
   ```

3. **Run seed script**:
   ```bash
   npm run seed-notifications
   ```

4. **Add trigger** in relevant function using:
   ```typescript
   import { sendNotification } from '../services/NotificationService'
   
   await sendNotification('YOUR_EVENT_CODE', {
     employeeEmail: recipient.email,
     employeeName: recipient.name,
     // ... other context
   })
   ```

## Service Functions

### NotificationService (`lib/services/NotificationService.ts`)

| Function | Description |
|----------|-------------|
| `sendNotification(eventCode, context)` | Core function - sends notification |
| `sendOrderStatusNotification()` | Employee order status change |
| `sendOrderDeliveredNotification()` | Employee delivery notification |
| `sendPOGeneratedNotification()` | Employee PO notification |
| `sendVendorNewOrderNotification()` | Vendor new order alert |
| `sendVendorPONotification()` | Vendor PO received alert |
| `sendCompanyAdminApprovalNotification()` | Admin approval request |
| `sendCompanyAdminPONotification()` | Admin PO notification |
| `sendCompanyAdminDeliveryNotification()` | Admin delivery notification |
| `sendLocationAdminApprovalNotification()` | Location admin approval request |
| `dispatchOrderNotifications()` | Batch dispatcher for order events |

### NotificationRecipientResolver (`lib/services/NotificationRecipientResolver.ts`)

| Function | Description |
|----------|-------------|
| `resolveEmployeeRecipient(employeeId)` | Get employee email |
| `resolveVendorRecipient(vendorId)` | Get vendor email |
| `resolveCompanyAdminRecipients(companyId)` | Get all company admin emails |
| `resolveLocationAdminRecipient(locationId)` | Get location admin email |
| `resolveRecipientsFromOrder(type, order)` | Auto-resolve from order data |

## Troubleshooting

### Notifications not sending?

1. Check `ENABLE_EMAIL_NOTIFICATIONS=true` in `.env.local`
2. Verify SMTP credentials with `npm run test-email`
3. Check server logs for `📧` emoji messages
4. Check NotificationLogs collection for errors

### Wrong recipient?

1. Verify employee/vendor has valid email in database
2. Check if email is encrypted (should be auto-decrypted)
3. Verify company/location admin mappings

### Template not found?

1. Run `npm run seed-notifications` to ensure templates exist
2. Check NotificationEvents collection has the event code
3. Verify template is active (`isActive: true`)

## Database Collections

- `notificationevents` - Master list of notification triggers
- `notificationtemplates` - Email templates with HTML content
- `notificationlogs` - Audit log of sent notifications
- `companynotificationconfigs` - Company-specific notification settings

---

## Company-Specific Configuration

Each company can have its own notification settings that override system defaults.

### Features

1. **Master Switch** - Enable/disable all notifications for a company
2. **Event-Specific Control** - Enable/disable specific events
3. **Custom Templates** - Override email subject and body per event
4. **Company Branding** - Custom brand name, color, and logo
5. **Quiet Hours** - No notifications during specified times
6. **Additional Recipients** - CC/BCC emails for all notifications

### API Endpoints

#### Get Company Notification Config
```
GET /api/admin/company/[companyId]/notifications
```

#### Update Company Config (master switch, branding)
```
PUT /api/admin/company/[companyId]/notifications
{
  "notificationsEnabled": true,
  "brandName": "Acme Corp",
  "brandColor": "#FF5722",
  "ccEmails": ["admin@company.com"],
  "quietHoursEnabled": true,
  "quietHoursStart": "22:00",
  "quietHoursEnd": "08:00"
}
```

#### Toggle Specific Event
```
PATCH /api/admin/company/[companyId]/notifications/events/[eventCode]
{
  "isEnabled": false
}
```

#### Set Custom Template for Event
```
PUT /api/admin/company/[companyId]/notifications/events/[eventCode]
{
  "isEnabled": true,
  "customSubject": "{{brandName}}: Your Order {{orderId}} Update",
  "customBody": "<html>...custom template...</html>"
}
```

#### Reset to System Defaults
```
DELETE /api/admin/company/[companyId]/notifications
```

### How It Works

1. **No Config** → System defaults apply (all events enabled)
2. **Config Exists** → Company settings override defaults
3. **Event Not in Config** → System default for that event (enabled)
4. **Event in Config** → Use company's setting

### Quiet Hours

When quiet hours are enabled:
- Notifications during quiet hours are skipped (not queued)
- Skipped notifications are logged as "skipped" (not failed)
- Useful for companies in different timezones

### Example: Disable PO Notifications for a Company

```typescript
// Via API
await fetch('/api/admin/company/100001/notifications/events/PO_GENERATED', {
  method: 'PATCH',
  body: JSON.stringify({ isEnabled: false })
})
```

### Example: Custom Template for Delivery Notifications

```typescript
await fetch('/api/admin/company/100001/notifications/events/ORDER_MARKED_DELIVERED', {
  method: 'PUT',
  body: JSON.stringify({
    isEnabled: true,
    customSubject: '🎉 {{brandName}}: Your uniform has arrived!',
    customBody: `
      <html>
        <body style="font-family: Arial;">
          <h1 style="color: {{brandColor}}">Delivery Confirmed!</h1>
          <p>Hi {{employeeName}},</p>
          <p>Your order {{orderId}} has been delivered.</p>
          <p>- The {{brandName}} Team</p>
        </body>
      </html>
    `
  })
})
```