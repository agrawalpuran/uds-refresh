'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Building2, Package, Users, ArrowRight, Shield, Truck, RefreshCw, Phone, Mail, CheckCircle, Settings } from 'lucide-react'

export default function Home() {
  const router = useRouter()

  const handlePortalClick = (path: string) => {
    console.log('Navigating to:', path)
    try {
      // Use startTransition for better error handling
      router.push(path)
    } catch (error) {
      console.error('Navigation error:', error)
      // Fallback to window.location if router fails
      try {
      window.location.href = path
      } catch (fallbackError) {
        console.error('Fallback navigation also failed:', fallbackError)
        // Last resort: use Link component behavior
        const link = document.createElement('a')
        link.href = path
        link.click()
      }
    }
  }
  return (
    <div className="min-h-screen bg-white relative overflow-hidden">
        {/* Animated Background Graphics - ServiceNow Style */}
        <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
          {/* Base gradient background - subtle, only in hero section area */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#032D42]/5 via-[#053d5a]/3 to-transparent"></div>
          
          {/* Infinity loop graphic - ServiceNow inspired - only in hero */}
          <div className="absolute top-0 left-0 right-0 h-[600px] opacity-[0.12]">
            <svg className="w-full h-full" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice">
              <defs>
                <linearGradient id="infinityGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.8 }} />
                  <stop offset="50%" style={{ stopColor: '#62D84E', stopOpacity: 1 }} />
                  <stop offset="100%" style={{ stopColor: '#3b82f6', stopOpacity: 0.8 }} />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="6" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
                <filter id="softGlow">
                  <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                  <feMerge>
                    <feMergeNode in="coloredBlur"/>
                    <feMergeNode in="SourceGraphic"/>
                  </feMerge>
                </filter>
              </defs>
              {/* Infinity symbol path - larger and more prominent */}
              <path
                d="M 250 400 Q 150 250, 250 150 Q 350 50, 600 150 Q 850 50, 950 150 Q 1050 250, 950 400 Q 1050 550, 950 650 Q 850 750, 600 650 Q 350 750, 250 650 Q 150 550, 250 400 Z"
                fill="none"
                stroke="url(#infinityGradient)"
                strokeWidth="4"
                filter="url(#glow)"
                className="animate-pulse"
                style={{ animationDuration: '4s' }}
              />
              {/* Nodes along the path - representing business functions */}
              <circle cx="250" cy="275" r="12" fill="#62D84E" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" />
              <circle cx="600" cy="150" r="12" fill="#3b82f6" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" style={{ animationDelay: '0.5s' }} />
              <circle cx="950" cy="275" r="12" fill="#62D84E" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" style={{ animationDelay: '1s' }} />
              <circle cx="950" cy="525" r="12" fill="#3b82f6" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" style={{ animationDelay: '1.5s' }} />
              <circle cx="600" cy="650" r="12" fill="#62D84E" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" style={{ animationDelay: '2s' }} />
              <circle cx="250" cy="525" r="12" fill="#3b82f6" opacity="0.7" filter="url(#softGlow)" className="animate-pulse" style={{ animationDelay: '2.5s' }} />
              
              {/* Center text area - subtle */}
              <text x="600" y="300" textAnchor="middle" className="fill-[#032D42]/10 text-2xl font-bold" fontSize="24">UDS</text>
            </svg>
          </div>
          
          {/* Floating geometric shapes - subtle glow effects in hero area */}
          <div className="absolute top-20 left-10 w-96 h-96 bg-blue-500 rounded-full opacity-[0.08] blur-3xl animate-pulse-slow"></div>
          <div className="absolute top-40 right-20 w-[400px] h-[400px] bg-green-500 rounded-full opacity-[0.08] blur-3xl animate-pulse-slow" style={{ animationDelay: '1.5s' }}></div>
          <div className="absolute top-1/2 left-1/4 w-80 h-80 bg-blue-400 rounded-full opacity-[0.06] blur-2xl animate-pulse-slow" style={{ animationDelay: '3s' }}></div>
          <div className="absolute top-1/3 right-1/4 w-64 h-64 bg-green-400 rounded-full opacity-[0.06] blur-2xl animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
          
          {/* Subtle grid pattern - only in hero */}
          <div className="absolute top-0 left-0 right-0 h-[600px] opacity-[0.04]" style={{
            backgroundImage: 'linear-gradient(rgba(3, 45, 66, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(3, 45, 66, 0.1) 1px, transparent 1px)',
            backgroundSize: '50px 50px'
          }}></div>
        </div>

      {/* Header - ServiceNow Infinite Blue Theme */}
      <header className="bg-[#032D42]/95 backdrop-blur-sm border-b border-[#021d28] sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm">
                <Package className="h-6 w-6 text-[#032D42]" />
              </div>
              <h1 className="text-2xl font-semibold text-white">Uniform Distribution System</h1>
            </div>
            <nav className="flex items-center space-x-6">
              <Link href="/login" className="text-white hover:text-blue-100 px-4 py-2 text-sm font-medium transition-colors">
                Login
              </Link>
              <Link href="/login/company" className="bg-white text-[#032D42] px-6 py-2 rounded-md text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm">
                Get Started
              </Link>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero Section - ServiceNow Style with Background Graphics */}
      <section className="relative py-20 bg-gradient-to-b from-white via-white to-[#f8f9fa] overflow-hidden">
        {/* Hero Background Graphics */}
        <div className="absolute inset-0 -z-0 overflow-hidden pointer-events-none">
          {/* Dark teal gradient for hero section */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#032D42]/10 via-[#053d5a]/8 to-transparent"></div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-5xl font-bold text-[#032D42] mb-6 leading-tight">
              Professional Uniform Distribution
              <br />
              <span className="text-[#032D42]">Management System</span>
            </h2>
            <p className="text-xl text-neutral-600 max-w-3xl mx-auto mb-8">
              Streamline your uniform distribution with our comprehensive B2B2C platform.
              Manage inventory, orders, and employees all in one place.
            </p>
            <div className="flex justify-center space-x-4">
              <Link href="/login/company" className="btn-primary px-8 py-3 text-base font-semibold">
                Get Started
              </Link>
              <Link href="/login" className="btn-secondary px-8 py-3 text-base font-semibold border-[#032D42] text-[#032D42] hover:bg-blue-50">
                Learn More
              </Link>
            </div>
          </div>

          {/* Key Features Grid */}
          <div className="grid md:grid-cols-4 gap-6 mt-16">
            <div className="enterprise-card p-6 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Shield className="h-8 w-8 text-[#032D42]" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">Built for Scale</h3>
              <p className="text-sm text-neutral-600">Enterprise-grade solution for large organizations</p>
            </div>
            <div className="enterprise-card p-6 text-center">
              <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(98, 216, 78, 0.1)' }}>
                <CheckCircle className="h-8 w-8 text-[#62D84E]" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">Keeps Track & Order</h3>
              <p className="text-sm text-neutral-600">Real-time inventory and order management</p>
            </div>
            <div className="enterprise-card p-6 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Users className="h-8 w-8 text-[#032D42]" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">Engineered for Efficiency</h3>
              <p className="text-sm text-neutral-600">Streamlined workflows for better productivity</p>
            </div>
            <div className="enterprise-card p-6 text-center">
              <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Package className="h-8 w-8 text-[#032D42]" />
              </div>
              <h3 className="font-semibold text-neutral-900 mb-2">Proven Quality</h3>
              <p className="text-sm text-neutral-600">Trusted by leading organizations worldwide</p>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Indicators */}
      <section className="bg-neutral-50 py-8 border-y border-neutral-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="flex flex-col items-center">
              <Truck className="h-6 w-6 text-[#032D42] mb-2" />
              <p className="text-sm font-medium text-neutral-900">Shipping Within 2-3 Days</p>
            </div>
            <div className="flex flex-col items-center">
              <RefreshCw className="h-6 w-6 text-[#032D42] mb-2" />
              <p className="text-sm font-medium text-neutral-900">15 Days Return Policy</p>
            </div>
            <div className="flex flex-col items-center">
              <Phone className="h-6 w-6 text-[#032D42] mb-2" />
              <p className="text-sm font-medium text-neutral-900">24/7 Customer Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* Portal Selection Section */}
      <section className="py-20 bg-white relative z-10 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h3 className="text-3xl font-bold text-[#032D42] mb-4">Choose Your Portal</h3>
            <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
              Access the right tools for your role in the uniform distribution ecosystem
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Vendor Card */}
            <div 
              onClick={() => handlePortalClick('/login/vendor')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlePortalClick('/login/vendor')
                }
              }}
              role="button"
              tabIndex={0}
              className="group enterprise-card p-8 hover:border-[#032D42] transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#032D42]"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-lg mb-6 transition-colors" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Package className="h-8 w-8 text-[#032D42]" />
              </div>
              <h4 className="text-xl font-semibold text-neutral-900 mb-3">Vendor Portal</h4>
              <p className="text-neutral-600 mb-6 leading-relaxed">
                Manage inventory, fulfill orders, and track shipments. Perfect for manufacturers and suppliers.
              </p>
              <div className="flex items-center text-[#032D42] font-medium">
                Access Portal <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Company Card */}
            <div 
              onClick={() => handlePortalClick('/login/company')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlePortalClick('/login/company')
                }
              }}
              role="button"
              tabIndex={0}
              className="group enterprise-card p-8 hover:border-[#032D42] transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#032D42]"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-lg mb-6 transition-colors" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Building2 className="h-8 w-8 text-[#032D42]" />
              </div>
              <h4 className="text-xl font-semibold text-neutral-900 mb-3">Company Portal</h4>
              <p className="text-neutral-600 mb-6 leading-relaxed">
                Manage employees, place bulk orders, track budgets, and generate comprehensive reports.
              </p>
              <div className="flex items-center text-[#032D42] font-medium">
                Access Portal <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Consumer Card */}
            <div 
              onClick={() => handlePortalClick('/login/consumer')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlePortalClick('/login/consumer')
                }
              }}
              role="button"
              tabIndex={0}
              className="group enterprise-card p-8 hover:border-[#032D42] transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#032D42]"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-lg mb-6 transition-colors" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Users className="h-8 w-8 text-[#032D42]" />
              </div>
              <h4 className="text-xl font-semibold text-neutral-900 mb-3">Employee Portal</h4>
              <p className="text-neutral-600 mb-6 leading-relaxed">
                Browse catalog, place orders, track your uniform requests, and manage your preferences.
              </p>
              <div className="flex items-center text-[#032D42] font-medium">
                Access Portal <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>

            {/* Super Admin Card */}
            <div 
              onClick={() => handlePortalClick('/login/superadmin')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handlePortalClick('/login/superadmin')
                }
              }}
              role="button"
              tabIndex={0}
              className="group enterprise-card p-8 hover:border-[#032D42] transition-all duration-300 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#032D42]"
            >
              <div className="flex items-center justify-center w-16 h-16 rounded-lg mb-6 transition-colors" style={{ backgroundColor: 'rgba(3, 45, 66, 0.1)' }}>
                <Shield className="h-8 w-8 text-[#032D42]" />
              </div>
              <h4 className="text-xl font-semibold text-neutral-900 mb-3">Super Admin Portal</h4>
              <p className="text-neutral-600 mb-6 leading-relaxed">
                Manage products, vendors, companies, and employee relationships. Full system administration.
              </p>
              <div className="flex items-center text-[#032D42] font-medium">
                Access Portal <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-[#f8f9fa] relative z-10">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(3, 45, 66, 0.15) 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }}></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 relative z-10">
            <h3 className="text-3xl font-bold text-[#032D42] mb-4">Key Features</h3>
            <p className="text-lg text-neutral-600">Everything you need for efficient uniform management</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            <div className="enterprise-card p-6">
              <div className="text-3xl mb-4">📦</div>
              <h4 className="font-semibold text-neutral-900 mb-2">Multi-Vendor Support</h4>
              <p className="text-sm text-neutral-600 leading-relaxed">Manage multiple vendors and suppliers seamlessly</p>
            </div>
            <div className="enterprise-card p-6">
              <div className="text-3xl mb-4">👥</div>
              <h4 className="font-semibold text-neutral-900 mb-2">Employee Management</h4>
              <p className="text-sm text-neutral-600 leading-relaxed">Bulk upload and manage employee data efficiently</p>
            </div>
            <div className="enterprise-card p-6">
              <div className="text-3xl mb-4">📊</div>
              <h4 className="font-semibold text-neutral-900 mb-2">Advanced Reporting</h4>
              <p className="text-sm text-neutral-600 leading-relaxed">Track usage, budgets, and ordering activity</p>
            </div>
            <div className="enterprise-card p-6">
              <div className="text-3xl mb-4">🔐</div>
              <h4 className="font-semibold text-neutral-900 mb-2">Secure OTP Login</h4>
              <p className="text-sm text-neutral-600 leading-relaxed">Email or phone-based authentication</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#032D42] text-neutral-300 py-12 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                  <Package className="h-6 w-6 text-[#032D42]" />
                </div>
                <h5 className="text-xl font-semibold text-white">UDS System</h5>
              </div>
              <p className="text-sm text-neutral-400 leading-relaxed">
                Professional uniform distribution management system for modern organizations.
              </p>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-4">Company</h5>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition-colors">About Us</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Contact</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Blog</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-4">Support</h5>
              <ul className="space-y-2 text-sm">
                <li><Link href="#" className="hover:text-white transition-colors">Shipping Policy</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Returns & Exchanges</Link></li>
                <li><Link href="#" className="hover:text-white transition-colors">Terms & Conditions</Link></li>
              </ul>
            </div>
            <div>
              <h5 className="text-white font-semibold mb-4">Contact</h5>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center space-x-2">
                  <Phone className="h-4 w-4" />
                  <span>+1 (555) 123-4567</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Mail className="h-4 w-4" />
                  <span>support@uniformhub.com</span>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-[#021d28] pt-8 text-center text-sm text-neutral-400">
            <p>&copy; 2024 Uniform Distribution System. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
