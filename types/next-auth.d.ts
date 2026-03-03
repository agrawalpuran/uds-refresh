import 'next-auth'
import 'next-auth/jwt'

declare module 'next-auth' {
  interface User {
    role?: string
    companyId?: string
    vendorId?: string
    employeeId?: string
  }

  interface Session {
    user: {
      id?: string
      email?: string | null
      name?: string | null
      image?: string | null
      role?: string
      companyId?: string
      vendorId?: string
      employeeId?: string
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: string
    companyId?: string
    vendorId?: string
    employeeId?: string
  }
}
