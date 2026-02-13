# UDS Feature List (for Pricing)

A structured list of Uniform Distribution System (UDS) features at a level suitable for pricing discussions—not high-level only, but not implementation-deep. Use this to compare with competitors, define tiers, or communicate value to buyers.

---

## 1. Company Portal

### 1.1 Employee Management
- **Employee upload (CSV)** – Batch import employees with fields: name, designation, gender, location, email, mobile, sizes (shirt/pant/shoe), address, dispatch preference, status.
- **Employee list** – View, search, and manage employees; active/inactive status; link to designation and location.
- **Designation-based access** – Employees see catalog and eligibility based on designation and gender.

### 1.2 Orders
- **Order history** – List all company orders with filters (vendor, branch/location, status, date range); view order details and line items.
- **Order approvals** – Site admin (location) and/or company admin approval workflow; approve/reject with optional comments.
- **Bulk order upload** – Upload orders in bulk (e.g. CSV) for multiple employees or locations.
- **Return requests** – View and process return requests; approve/reject; track return reasons and status.
- **Vendor stock** – View vendor stock/availability (read-only) to plan orders.

### 1.3 GRN & Invoicing
- **GRN (Goods Receipt Note)** – Create/acknowledge GRNs linked to orders or POs; approve GRNs (company admin); status flow (Created → Acknowledged → Approved).
- **Invoices** – View and approve invoices; link to orders/POs; approval workflow; badge counts for pending approvals.

### 1.4 Catalogue & Eligibility
- **Product catalogue** – View products (by vendor/company); edit company-side pricing per product/subcategory; link products to subcategories.
- **Product–subcategory associations** – Map products to subcategories (e.g. “Formal Shirt – Male”) for eligibility and reporting.
- **Subcategory management** – Define and manage subcategories (under categories); used for eligibility rules.
- **Designation product eligibility** – Set per-designation (and gender) eligibility: quantity and cycle (months) per subcategory; drives what employees can order and how much.

### 1.5 Configuration
- **Company settings** – Branding (logo, colors), flags: show prices, allow personal payments, allow personal address delivery, enable employee ordering, location admin view feedback, eligibility consumption reset, PR/PO workflow, approval requirements, multi-PR/PO.
- **Branches / locations** – Manage branches and locations; used for dispatch, approvals, and reporting.

### 1.6 Reports & Analytics
- **Reports dashboard** – KPIs (orders, spend, approvals); spend trend over time; vendor spend (donut); order funnel (pending → approved → fulfilled); vendor delivery performance; spend by branch (stacked hub vs direct); top products by consumption; employee consumption (top spenders, inactive); key insights (e.g. vendor concentration); feedback health; returns summary.
- **Time range filters** – Last 7 days, 30 days, quarter, YTD, 12 months, all time.
- **Export** – Download report data (e.g. CSV).
- **Size analytics** – Size distribution and analytics (separate reports sub-section).

---

## 2. Vendor Portal

### 2.1 Order Management
- **Orders** – List orders (all/awaiting fulfillment); view order details; mark as dispatched/delivered; track status.
- **Awaiting pickup** – Orders ready for pickup or handover to logistics.
- **Replacement orders** – View and fulfill replacement/redo orders.
- **GRN & Invoice** – Create/acknowledge GRNs; submit or link invoices; track GRN/invoice status.
- **Feedback** – View product/order feedback from company/employees; ratings and comments.

### 2.2 Catalog & Inventory
- **Catalog** – Manage product catalog (SKU, name, category, images, pricing); link to subcategories.
- **Inventory** – Stock/SKU tracking; low-stock awareness; inventory levels per product/warehouse.
- **Warehouses** – Manage warehouse/location details used for fulfillment and shipping.

### 2.3 Reports
- **Vendor reports** – Sales/spend analytics; order volume; delivery performance; time-based filters; export.

---

## 3. Employee / Consumer Portal

### 3.1 Catalog & Ordering
- **Product catalog** – Browse products filtered by designation and gender; see only eligible products and quantities; per-subcategory eligibility (quantity + cycle); consumed vs remaining eligibility shown.
- **Size chart** – View size chart per product (image modal) when configured.
- **Cart and checkout** – Add to cart respecting eligibility; place order; choose delivery address and dispatch preference (e.g. hub vs direct).
- **Order tracking** – List my orders; view status (pending, approved, dispatched, delivered).

### 3.2 Profile & Admin (conditional)
- **Profile** – View/edit profile (e.g. sizes, address, contact).
- **PR approvals** (Location Admin) – Approve/reject purchase requisitions (when PR/PO workflow is on).
- **Site bulk orders** (Location Admin) – Create bulk orders for the location.
- **Feedback** (Location Admin, if enabled) – View feedback for their location.

---

## 4. Super Admin Portal

### 4.1 Platform Configuration
- **Workflow configuration** – Global or per-company workflow settings (e.g. approval steps, PR/PO).
- **Categories** – Manage product categories (e.g. Shirts, Pants, Shoes) used across companies/vendors.
- **Logistics & shipping** – Shipping provider configuration (e.g. ShipRocket); vendor–carrier routing; shipping estimates and labels.
- **Company notifications** – Configure notification preferences or templates per company.

### 4.2 Company & Product Setup
- **Company management** – Create/edit companies; set PR/PO workflow, approval rules, shipment request mode, branding.
- **Product media & size charts** – Upload product images; set size chart image URL per product; filter by company/vendor.
- **Create test order** – Create test orders for QA (feature can be toggled).

---

## 5. Cross-Cutting Features

### 5.1 Authentication & Access
- **OTP-based login** – Email or phone OTP per actor type (company, vendor, consumer, super admin).
- **Role-based access** – Company Admin, Branch Admin, Location Admin, Employee; Vendor users; Super Admin.
- **Separate login URLs** – Different entry points for company, vendor, consumer, super admin.

### 5.2 Workflow & Approvals
- **Configurable approval chain** – Site admin (location) and/or company admin for orders; optional PR → PO with company admin PO approval.
- **Multi-PR to single PO** – Group multiple approved PRs into one PO (when enabled).
- **GRN and invoice approval** – Company admin approves GRNs and invoices; badge counts in sidebar.

### 5.3 Notifications
- **Email notifications** – Order confirmation, approval/rejection, dispatch/delivery (as implemented).
- **WhatsApp webhook** – Optional WhatsApp integration for notifications.
- **In-app badges** – Pending approvals (orders, returns, GRN, invoices), new feedback.

### 5.4 Data & Integration
- **Multi-tenant** – Multiple companies and multiple vendors; company–vendor associations; company-specific catalog and eligibility.
- **MongoDB backend** – Persistent storage for orders, employees, products, GRNs, invoices, feedback, locations, designations.

---

## 6. Feature Count Summary (for Pricing)

| Area                    | Feature count (approx.) | Notes                                      |
|-------------------------|-------------------------|--------------------------------------------|
| Company – Employees     | 3                       | Upload, list, designation-based access    |
| Company – Orders        | 6                       | History, approvals, bulk, returns, stock  |
| Company – GRN/Invoices  | 2                       | GRN lifecycle, invoice approval            |
| Company – Catalog       | 4                       | Catalogue, subcategories, eligibility      |
| Company – Config        | 2                       | Settings, branches/locations               |
| Company – Reports       | 2                       | Main reports + size analytics               |
| Vendor – Orders         | 5                       | Orders, pickup, replacements, GRN, feedback|
| Vendor – Catalog/Stock  | 3                       | Catalog, inventory, warehouses             |
| Vendor – Reports        | 1                       | Vendor reports                             |
| Consumer                | 5                       | Catalog, eligibility, size chart, orders, profile + conditional admin |
| Super Admin             | 5                       | Workflow, categories, logistics, notifications, test order + company/product setup |
| Cross-cutting           | 4                       | Auth, roles, approvals, notifications      |

Use this list to define **pricing tiers** (e.g. Starter = Company + Consumer core; Growth = + Vendor + Reports; Enterprise = + Super Admin + full workflow), or to **price by module** (e.g. per portal, per report pack, per integration).
