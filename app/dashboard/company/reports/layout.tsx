'use client'

import DashboardLayout from '@/components/DashboardLayout'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Ruler } from 'lucide-react'

export default function ReportsSectionLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const isReports = pathname === '/dashboard/company/reports' || pathname === '/dashboard/company/reports/'
  const isSizeAnalytics = pathname?.startsWith('/dashboard/company/reports/size-analytics')

  return (
    <DashboardLayout actorType="company">
      <div className="space-y-4">
        <div className="flex border-b border-gray-200 gap-1">
          <Link
            href="/dashboard/company/reports"
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isReports ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="h-4 w-4" />
            Reports
          </Link>
          <Link
            href="/dashboard/company/reports/size-analytics"
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
              isSizeAnalytics ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Ruler className="h-4 w-4" />
            Size Analytics
          </Link>
        </div>
        {children}
      </div>
    </DashboardLayout>
  )
}
