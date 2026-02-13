# UDS API List

**Total: 114 API endpoints** (Next.js App Router `route.ts` under `/app/api`)

All endpoints are prefixed with `/api`. Dynamic segments use `[param]` (e.g. `[companyId]`, `[orderId]`).

| # | Endpoint | Category |
|---|----------|----------|
| 1 | `/api/admin/company/[companyId]/notifications` | Admin – Company notifications |
| 2 | `/api/admin/company/[companyId]/notifications/events/[eventCode]` | Admin – Notification events by code |
| 3 | `/api/admin/migrate-product-feedback-vendorids` | Admin – Migration |
| 4 | `/api/admin/migrate-productvendors-productids` | Admin – Migration |
| 5 | `/api/admin/migrate-relationships` | Admin – Migration |
| 6 | `/api/admin/notifications/events` | Admin – Notification events |
| 7 | `/api/admin/notifications/events/[eventId]` | Admin – Single event |
| 8 | `/api/admin/notifications/logs` | Admin – Notification logs |
| 9 | `/api/admin/notifications/logs/[logId]` | Admin – Single log |
| 10 | `/api/admin/notifications/queue` | Admin – Notification queue |
| 11 | `/api/admin/notifications/queue/process` | Admin – Process queue |
| 12 | `/api/admin/notifications/templates` | Admin – Notification templates |
| 13 | `/api/admin/notifications/templates/[templateId]` | Admin – Single template |
| 14 | `/api/admin/update-pr-po-statuses` | Admin – PR/PO status update |
| 15 | `/api/analytics/size-distribution` | Analytics – Size distribution |
| 16 | `/api/approvals/counts` | Approvals – Counts |
| 17 | `/api/branches` | Master – Branches |
| 18 | `/api/branches/[branchId]/employees` | Master – Branch employees |
| 19 | `/api/categories` | Master – Categories |
| 20 | `/api/companies` | Master – Companies |
| 21 | `/api/companies/[companyId]/branches` | Company – Branches |
| 22 | `/api/companies/[companyId]/shipping-providers` | Company – Shipping providers |
| 23 | `/api/companies/[companyId]/vendors` | Company – Vendors |
| 24 | `/api/company/grns/acknowledge` | Company – GRN acknowledge |
| 25 | `/api/company/inventory/vendor-wise` | Company – Vendor-wise inventory |
| 26 | `/api/company/invoices` | Company – Invoices |
| 27 | `/api/company/invoices/approve` | Company – Approve invoice |
| 28 | `/api/debug/logs` | Debug – Logs |
| 29 | `/api/debug/vendor-products` | Debug – Vendor products |
| 30 | `/api/designation-eligibility` | Master – Designation eligibility |
| 31 | `/api/designation-subcategory-eligibilities` | Master – Designation subcategory eligibility |
| 32 | `/api/designation-subcategory-eligibilities/refresh` | Master – Refresh eligibility |
| 33 | `/api/designations` | Master – Designations |
| 34 | `/api/employees` | Master – Employees |
| 35 | `/api/employees/[employeeId]/eligibility` | Employee – Eligibility |
| 36 | `/api/feedback` | Feedback |
| 37 | `/api/feedback/mark-viewed` | Feedback – Mark viewed |
| 38 | `/api/grn` | GRN – Single |
| 39 | `/api/grns` | GRN – List/CUD |
| 40 | `/api/grns/approve` | GRN – Approve |
| 41 | `/api/indents` | Indents |
| 42 | `/api/invoices` | Invoices |
| 43 | `/api/locations` | Master – Locations |
| 44 | `/api/locations/admin` | Locations – Admin |
| 45 | `/api/locations/bulk` | Locations – Bulk |
| 46 | `/api/orders` | Orders |
| 47 | `/api/orders/bulk` | Orders – Bulk create |
| 48 | `/api/orders/bulk-excel` | Orders – Bulk Excel upload |
| 49 | `/api/orders/bulk-template` | Orders – Bulk template download |
| 50 | `/api/orders/site-bulk-excel` | Orders – Site bulk Excel |
| 51 | `/api/orders/site-bulk-template` | Orders – Site bulk template |
| 52 | `/api/payments` | Payments |
| 53 | `/api/product-subcategory-mappings` | Master – Product–subcategory mappings |
| 54 | `/api/products` | Products |
| 55 | `/api/products/size-charts` | Products – Size charts list |
| 56 | `/api/products/[productId]/size-chart` | Products – Single size chart |
| 57 | `/api/prs/manual-shipment` | PR – Manual shipment |
| 58 | `/api/prs/shipment` | PR – Shipment |
| 59 | `/api/purchase-orders` | Purchase orders |
| 60 | `/api/relationships` | Master – Relationships |
| 61 | `/api/returns/company` | Returns – Company list |
| 62 | `/api/returns/my` | Returns – My returns |
| 63 | `/api/returns/request` | Returns – Create request |
| 64 | `/api/returns/[id]/approve` | Returns – Approve |
| 65 | `/api/shipment/provider-couriers` | Shipment – Provider couriers |
| 66 | `/api/shipment/serviceability` | Shipment – Serviceability |
| 67 | `/api/shipment/shipping-context` | Shipment – Shipping context |
| 68 | `/api/shipments/diagnose` | Shipments – Diagnose |
| 69 | `/api/shipments/query` | Shipments – Query |
| 70 | `/api/shipments/sync` | Shipments – Sync status |
| 71 | `/api/shipments/[shipmentId]/fetch-awb` | Shipments – Fetch AWB |
| 72 | `/api/shipments/[shipmentId]/pickup` | Shipments – Pickup |
| 73 | `/api/shipments/[shipmentId]/pickup/reschedule` | Shipments – Reschedule pickup |
| 74 | `/api/shipments/[shipmentId]/pickup/schedule` | Shipments – Schedule pickup |
| 75 | `/api/shipments/[shipmentId]/status` | Shipments – Status |
| 76 | `/api/shipping/estimate` | Shipping – Estimate |
| 77 | `/api/shipping/packages` | Shipping – Packages |
| 78 | `/api/shipping/packages/[packageId]` | Shipping – Single package |
| 79 | `/api/subcategories` | Master – Subcategories |
| 80 | `/api/suborders` | Suborders |
| 81 | `/api/super-admin/categories` | Super Admin – Categories |
| 82 | `/api/superadmin/create-test-orders` | Super Admin – Test orders |
| 83 | `/api/superadmin/feature-config` | Super Admin – Feature config |
| 84 | `/api/superadmin/manual-courier-providers` | Super Admin – Manual courier providers |
| 85 | `/api/superadmin/manual-courier-providers/[courierRefId]` | Super Admin – Single courier provider |
| 86 | `/api/superadmin/provider-test` | Super Admin – Provider test |
| 87 | `/api/superadmin/shipping-config` | Super Admin – Shipping config |
| 88 | `/api/superadmin/shipping-providers` | Super Admin – Shipping providers |
| 89 | `/api/superadmin/shipping-providers/[providerId]/couriers` | Super Admin – Provider couriers |
| 90 | `/api/superadmin/shipping-providers/[providerId]/couriers/sync` | Super Admin – Sync couriers |
| 91 | `/api/superadmin/shipping-providers/[providerId]/test-connection` | Super Admin – Test connection |
| 92 | `/api/superadmin/vendor-shipping-routing` | Super Admin – Vendor shipping routing |
| 93 | `/api/superadmin/vendor-shipping-routing/[routingId]` | Super Admin – Single routing |
| 94 | `/api/superadmin/vendor-warehouses` | Super Admin – Vendor warehouses |
| 95 | `/api/superadmin/vendor-warehouses/[warehouseRefId]` | Super Admin – Single warehouse |
| 96 | `/api/test/shipway` | Test – Shipway |
| 97 | `/api/test-encryption` | Test – Encryption |
| 98 | `/api/user/profile` | User – Profile |
| 99 | `/api/vendor/grns` | Vendor – GRNs |
| 100 | `/api/vendor/invoices` | Vendor – Invoices |
| 101 | `/api/vendor/orders/awaiting-pickup` | Vendor – Orders awaiting pickup |
| 102 | `/api/vendor/orders/[orderId]` | Vendor – Single order |
| 103 | `/api/vendor/warehouses` | Vendor – Warehouses |
| 104 | `/api/vendor/warehouses/[warehouseRefId]` | Vendor – Single warehouse |
| 105 | `/api/vendor-inventory` | Vendor – Inventory |
| 106 | `/api/vendors` | Master – Vendors |
| 107 | `/api/vendors/reports` | Vendors – Reports |
| 108 | `/api/vendors/[vendorId]/companies` | Vendors – Companies |
| 109 | `/api/vendors/[vendorId]/products` | Vendors – Products |
| 110 | `/api/whatsapp/webhook` | WhatsApp – Webhook |
| 111 | `/api/workflow/actions` | Workflow – Actions |
| 112 | `/api/workflow/approve` | Workflow – Approve |
| 113 | `/api/workflow/reject` | Workflow – Reject |
| 114 | `/api/workflow/ui-rules` | Workflow – UI rules |

---

## Summary by category

| Category | Count | Description |
|----------|-------|-------------|
| Admin (notifications, migrations) | 14 | Company notifications, templates, events, logs, queue, migrations |
| Analytics | 1 | Size distribution |
| Approvals | 1 | Approval counts |
| Company | 7 | Invoices, GRNs, inventory, shipping providers |
| Debug / Test | 4 | Logs, vendor products, Shipway test, encryption test |
| Master data | 18 | Companies, branches, locations, categories, subcategories, designations, employees, products, vendors, relationships, etc. |
| Orders & bulk | 7 | Orders CRUD, bulk, bulk Excel, templates |
| GRN / Indents / PO / Invoices | 8 | GRN, indents, purchase orders, invoices |
| Returns | 4 | Company returns, my returns, request, approve |
| Shipments & shipping | 18 | Shipments, pickup, AWB, packages, estimate, serviceability, sync, diagnose |
| Super Admin | 16 | Feature config, shipping config/providers, couriers, vendor routing, warehouses, test orders |
| Vendor | 10 | Vendor orders, GRNs, invoices, warehouses, inventory |
| Workflow | 4 | Approve, reject, actions, UI rules |
| User / Feedback / Payments | 5 | User profile, feedback, payments |
| WhatsApp | 1 | Webhook |

*Counts are approximate; some endpoints span categories.*
