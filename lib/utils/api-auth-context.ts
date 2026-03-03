import { auth } from '@/lib/auth'

export interface AuthContext {
  userId: string
  email: string
  role: string
  companyId?: string
  vendorId?: string
  employeeId?: string
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const session = await auth()
  if (!session?.user) return null
  return {
    userId: session.user.id!,
    email: session.user.email!,
    role: session.user.role!,
    companyId: session.user.companyId,
    vendorId: session.user.vendorId,
    employeeId: session.user.employeeId,
  }
}

export function requireCompanyAdmin(ctx: AuthContext): string {
  if (
    !ctx.companyId ||
    !['company_admin', 'location_admin', 'branch_admin', 'super_admin'].includes(ctx.role)
  ) {
    throw new Error('FORBIDDEN')
  }
  return ctx.companyId
}

export function requireVendor(ctx: AuthContext): string {
  if (!ctx.vendorId || ctx.role !== 'vendor') {
    throw new Error('FORBIDDEN')
  }
  return ctx.vendorId
}

export function requireEmployee(ctx: AuthContext): string {
  if (!ctx.employeeId) {
    throw new Error('FORBIDDEN')
  }
  return ctx.employeeId
}

export function requireSuperAdmin(ctx: AuthContext): void {
  if (ctx.role !== 'super_admin') {
    throw new Error('FORBIDDEN')
  }
}
