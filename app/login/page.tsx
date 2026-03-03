'use client'

import Link from 'next/link'
import { Building2, Users, ShoppingCart, Shield } from 'lucide-react'

export default function LoginPage() {
  const portals = [
    {
      name: 'Employee Portal',
      description: 'Access your employee dashboard to browse catalog and place orders',
      href: '/login/consumer',
      icon: ShoppingCart,
      color: 'green',
      bgClass: 'bg-green-50 hover:bg-green-100',
      iconClass: 'text-green-600',
      borderClass: 'border-green-200',
    },
    {
      name: 'Company Portal',
      description: 'Manage your company, employees, and orders',
      href: '/login/company',
      icon: Building2,
      color: 'purple',
      bgClass: 'bg-purple-50 hover:bg-purple-100',
      iconClass: 'text-purple-600',
      borderClass: 'border-purple-200',
    },
    {
      name: 'Vendor Portal',
      description: 'Manage your products, orders, and inventory',
      href: '/login/vendor',
      icon: Users,
      color: 'blue',
      bgClass: 'bg-blue-50 hover:bg-blue-100',
      iconClass: 'text-blue-600',
      borderClass: 'border-blue-200',
    },
    {
      name: 'Super Admin',
      description: 'System administration and configuration',
      href: '/login/superadmin',
      icon: Shield,
      color: 'red',
      bgClass: 'bg-red-50 hover:bg-red-100',
      iconClass: 'text-red-600',
      borderClass: 'border-red-200',
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Welcome Back</h1>
            <p className="text-gray-600">Choose your portal to sign in</p>
          </div>

          <div className="space-y-3">
            {portals.map((portal) => {
              const Icon = portal.icon
              return (
                <Link
                  key={portal.name}
                  href={portal.href}
                  className={`flex items-center space-x-4 p-4 rounded-lg border ${portal.borderClass} ${portal.bgClass} transition-colors`}
                >
                  <div className={`flex-shrink-0 ${portal.iconClass}`}>
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{portal.name}</h3>
                    <p className="text-xs text-gray-500">{portal.description}</p>
                  </div>
                </Link>
              )
            })}
          </div>

          <div className="mt-6 text-center">
            <Link href="/" className="text-gray-600 hover:text-gray-900 text-sm">
              &larr; Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
