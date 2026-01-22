# Email Notification System - Setup Guide

## Overview

This document describes how to set up email notifications for the UDS application.
Phase 1 provides simple, synchronous email notifications triggered by order status changes.

## Admin UI

Access the notification admin UI at: `/dashboard/superadmin/notifications`

**Features:**
- **Templates Tab**: View, edit, enable/disable email templates
- **Logs Tab**: View notification history with filtering

**Access Control:**
- Super Admin only (via superadmin login)

## Environment Variables

Add these to your `.env` or `.env.local` file:

```bash
# =============================================================================
# EMAIL NOTIFICATION SETTINGS
# =============================================================================

# Master switch to enable/disable email notifications
ENABLE_EMAIL_NOTIFICATIONS=true

# SMTP Server Configuration (Gmail)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password

# From address configuration
SMTP_FROM_NAME=UDS Notifications
SMTP_FROM_EMAIL=your-email@gmail.com
```

## Gmail SMTP Setup

### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Enable "2-Step Verification"

### Step 2: Generate App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select app: "Mail"
3. Select device: "Other (Custom name)" → Enter "UDS Notifications"
4. Click "Generate"
5. Copy the 16-character password (no spaces)
6. Use this as `SMTP_PASS` in your `.env` file

### Step 3: Test Connection

Run the seeding script to verify templates are created:

```bash
npx ts-node scripts/seed-notification-templates.ts
```

## Notification Events

The following events trigger email notifications:

| Event Code | Description | Recipient |
|------------|-------------|-----------|
| `ORDER_STATUS_CHANGED` | When order status changes (e.g., Dispatched) | Employee |
| `PO_GENERATED` | When a Purchase Order is generated | Employee |
| `ORDER_MARKED_DELIVERED` | When order is marked as delivered | Employee |

## How It Works

1. **Order Status Update**: When `updateOrderStatus()` is called in `lib/db/data-access.ts`
2. **Check Feature Flag**: If `ENABLE_EMAIL_NOTIFICATIONS=true`
3. **Fetch Employee**: Get employee email from the order
4. **Send Notification**: Call `NotificationService.sendNotification()`
5. **Log Result**: Write success/failure to `NotificationLog` collection

## File Structure

```
lib/
├── services/
│   ├── EmailProvider.ts      # Gmail SMTP wrapper (nodemailer)
│   └── NotificationService.ts # Main notification orchestrator
├── models/
│   ├── NotificationEvent.ts    # Event definitions
│   ├── NotificationTemplate.ts # Email templates
│   └── NotificationLog.ts      # Audit log
scripts/
└── seed-notification-templates.ts # Seed initial templates
```

## Database Collections

### NotificationEvent
Master list of events that can trigger notifications.

### NotificationTemplate
Email templates with placeholders like `{{employeeName}}`, `{{orderId}}`, etc.

### NotificationLog
Audit log of all sent/failed notifications.

## Template Placeholders

Available placeholders for templates:

| Placeholder | Description |
|-------------|-------------|
| `{{employeeName}}` | Employee's full name |
| `{{employeeEmail}}` | Employee's email |
| `{{orderId}}` | Order ID |
| `{{orderStatus}}` | New order status |
| `{{previousStatus}}` | Previous order status |
| `{{prNumber}}` | PR number |
| `{{poNumber}}` | PO number |
| `{{vendorName}}` | Vendor name |
| `{{companyName}}` | Company name |
| `{{awbNumber}}` | AWB/tracking number |
| `{{shipmentDate}}` | Shipment date |
| `{{deliveryDate}}` | Delivery date |

## Robustness Features

### Idempotency (Duplicate Prevention)

The system prevents duplicate notifications for the same event:

- Before sending, checks NotificationLog for recent successful sends
- If same `eventCode + orderId + status + email` was sent in last 5 minutes → skip
- Skipped notifications are logged with status `REJECTED` and reason `DUPLICATE_SKIPPED`

**Check for skipped duplicates:**
```javascript
db.notificationlogs.find({ 
  'providerResponse.reason': 'DUPLICATE_SKIPPED' 
}).sort({ createdAt: -1 }).limit(10)
```

### Context Validation

The system warns about missing template placeholders:

- Extracts all `{{placeholder}}` from templates
- Compares against provided context data
- Logs warnings for missing values (but still sends email)
- Unreplaced placeholders appear as-is in the email

### Correlation ID

Every notification has a unique correlation ID for tracing:

- Format: `NOTIF-{timestamp}-{random}`
- Appears in all log messages
- Stored in `providerResponse.correlationId` in NotificationLog

**Trace a specific notification:**
```javascript
db.notificationlogs.find({ 
  'providerResponse.correlationId': 'NOTIF-ABC123-XYZ' 
})
```

### Error Classification

SMTP errors are classified into categories:

| Error Code | Description | Hint |
|------------|-------------|------|
| `AUTH_FAILED` | Authentication error | Check App Password |
| `CONNECTION_FAILED` | Cannot connect to SMTP | Check host/port/network |
| `TIMEOUT` | SMTP server timeout | Check network |
| `RATE_LIMITED` | Too many emails | Wait and retry |
| `INVALID_RECIPIENT` | Bad email address | Verify recipient |
| `REJECTED` | Server rejected email | Check error details |
| `UNKNOWN` | Unclassified error | Check logs |

## Troubleshooting

### Notifications Not Sending

1. Check `ENABLE_EMAIL_NOTIFICATIONS=true` in env
2. Verify SMTP credentials are correct
3. Check Gmail App Password (not regular password)
4. Look for `[NotificationService]` and `[EmailProvider]` logs in console
5. Check the correlationId in logs for full trace

### Invalid Credentials Error (AUTH_FAILED)

- Ensure you're using an App Password, not your Gmail password
- App Password should be 16 characters without spaces
- Check that 2FA is enabled on your Google account

### Connection Errors (CONNECTION_FAILED)

- Verify `SMTP_HOST=smtp.gmail.com` and `SMTP_PORT=587`
- Check if firewall allows outbound SMTP (port 587)
- Test network connectivity to smtp.gmail.com

### Duplicate Notifications

If notifications are being skipped as duplicates:
- This is expected behavior for same order+status within 5 minutes
- Check `providerResponse.previousLogId` for the original notification

### Template Not Found

Run the seeding script:
```bash
npx ts-node scripts/seed-notification-templates.ts
```

### Check Notification Logs

**All failed notifications:**
```javascript
db.notificationlogs.find({ status: 'FAILED' }).sort({ createdAt: -1 }).limit(10)
```

**Notifications for a specific order:**
```javascript
db.notificationlogs.find({ subject: /ORD-123/ }).sort({ createdAt: -1 })
```

**Recent successful sends:**
```javascript
db.notificationlogs.find({ status: 'SENT' }).sort({ sentAt: -1 }).limit(20)
```

**Skipped duplicates:**
```javascript
db.notificationlogs.find({ 'providerResponse.reason': 'DUPLICATE_SKIPPED' })
```

## Phase 1 Limitations

- **No Retries**: Failed emails are logged but not retried
- **Synchronous**: Emails are sent immediately (no queue workers)
- **No Batching**: Each status change sends one email
- **Employee Only**: Only notifies the employee who placed the order
- **English Only**: Templates are in English only
- **5-Minute Dedup Window**: Same notification within 5 minutes is skipped

## Future Enhancements (Phase 2+)

- Async queue processing with workers
- Retry logic for failed emails
- Vendor notifications
- Admin notifications
- Multiple language support
- SMS/WhatsApp notifications
- Email tracking (opens/clicks)
