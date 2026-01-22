# Uniform Distribution Management System

A comprehensive B2B2C web application for managing uniform distribution, inventory, and employee ordering.

## Features

### Three Actor Types

1. **Vendor Portal**
   - Inventory management with SKU tracking
   - Order fulfillment and tracking
   - Sales reports and analytics
   - Low stock alerts

2. **Company Portal**
   - Employee management with bulk upload
   - Catalog/SKU management
   - Order management (individual and bulk)
   - Location management (central and regional offices)
   - Comprehensive reporting (weekly, monthly, quarterly)
   - Budget tracking and usage monitoring

3. **Employee/Consumer Portal**
   - Self-service uniform ordering
   - Catalog browsing with filtering
   - Order tracking
   - Profile management

### Key Features

- **Multi-vendor and multi-customer support**
- **OTP-based authentication** (email or phone number)
- **Separate login interfaces** for each actor type
- **Batch employee upload** via CSV
- **SKU/Catalog management** with images (male/female uniforms)
- **Multiple location support** for regional dispatches
- **Email notifications** for order confirmations
- **Advanced reporting** with custom time periods
- **Budget and quota tracking**

## Technology Stack

- **Next.js 14** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first CSS framework
- **Lucide React** - Icon library
- **Recharts** - Chart library (ready for integration)

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Navigate to the project directory:
```bash
cd uniform-distribution-system
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
uniform-distribution-system/
├── app/
│   ├── dashboard/
│   │   ├── vendor/        # Vendor portal pages
│   │   ├── company/       # Company portal pages
│   │   └── consumer/      # Employee portal pages
│   ├── login/            # Authentication pages
│   ├── layout.tsx        # Root layout
│   ├── page.tsx          # Home page
│   └── globals.css        # Global styles
├── components/           # Reusable components
│   ├── DashboardLayout.tsx
│   └── OTPVerification.tsx
├── lib/
│   └── data.ts           # Mock data
└── public/               # Static assets
```

## Demo Credentials

For OTP verification, use: **123456**

## Features by Actor

### Vendor
- Dashboard with inventory overview
- Inventory management (add, edit, view products)
- Order fulfillment
- Sales reports

### Company
- Dashboard with employee and order overview
- Employee management (add, edit, bulk upload)
- Catalog/SKU management
- Order management (view, track, place bulk orders)
- Location management
- Batch employee upload (CSV)
- Reports and analytics

### Employee/Consumer
- Dashboard with order overview
- Catalog browsing and ordering
- Order tracking
- Profile management

## Employee Data Format

The batch upload CSV should include:
- First Name
- Last Name
- Designation
- Gender (Male/Female)
- Location
- Email
- Mobile
- Shirt Size
- Pant Size
- Shoe Size
- Address
- Dispatch Preference (direct/central/regional)
- Status (active/inactive)

## Future Enhancements

- Backend API integration
- Real email/SMS OTP service
- Payment gateway integration
- Advanced chart visualizations
- Real-time notifications
- Mobile responsive optimizations
- Multi-language support

## License

This project is created for demonstration purposes.













