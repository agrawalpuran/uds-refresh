'use client'

import { SessionProvider, useSession } from 'next-auth/react'
import { ReactNode, useEffect } from 'react'
import { setAuthData } from '@/lib/utils/auth-storage'

function SessionSync() {
  const { data: session, status } = useSession()

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.email) return

    const { email, role, companyId, vendorId } = session.user

    if (role === 'vendor' && vendorId) {
      setAuthData('vendor', { userEmail: email!, vendorId })
      sessionStorage.setItem('currentActorType', 'vendor')
    } else if (
      role &&
      ['company_admin', 'location_admin', 'branch_admin'].includes(role)
    ) {
      setAuthData('company', { userEmail: email!, companyId })
      sessionStorage.setItem('currentActorType', 'company')
    } else if (role === 'super_admin') {
      setAuthData('superadmin', { userEmail: email! })
      sessionStorage.setItem('currentActorType', 'superadmin')
    } else {
      setAuthData('consumer', { userEmail: email! })
      sessionStorage.setItem('currentActorType', 'consumer')
    }
  }, [session, status])

  return null
}

export default function SessionWrapper({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <SessionSync />
      {children}
    </SessionProvider>
  )
}
