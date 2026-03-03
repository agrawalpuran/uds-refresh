import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { rateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit'

function getClientIp(req: any): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.ip ||
    'unknown'
  )
}

function getRateLimitTier(pathname: string, method: string) {
  if (pathname.startsWith('/api/auth') || pathname.startsWith('/login')) {
    return RATE_LIMITS.AUTH
  }
  if (pathname.startsWith('/api/admin') || pathname.startsWith('/api/superadmin')) {
    return RATE_LIMITS.ADMIN
  }
  if (method !== 'GET' && method !== 'HEAD' && method !== 'OPTIONS') {
    return RATE_LIMITS.WRITE
  }
  return RATE_LIMITS.READ
}

export default auth((req) => {
  const { pathname } = req.nextUrl
  const method = req.method

  // --- Rate limiting (applied to all API routes) ---
  if (pathname.startsWith('/api/')) {
    const ip = getClientIp(req)
    const tier = getRateLimitTier(pathname, method)
    const tierKey = pathname.startsWith('/api/auth') ? 'auth'
      : pathname.startsWith('/api/admin') || pathname.startsWith('/api/superadmin') ? 'admin'
      : method !== 'GET' ? 'write' : 'read'
    const key = `${ip}:${tierKey}`
    const result = rateLimit(key, tier.limit, tier.windowMs)

    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil(result.resetMs / 1000)),
            'X-RateLimit-Limit': String(tier.limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }
  }

  // --- Auth checks ---
  const isLoggedIn = !!req.auth

  const publicPaths = ['/login', '/api/auth', '/api/whatsapp/webhook', '/api/shipments/sync', '/api/admin/notifications/queue/process']
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/') && !isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (pathname.startsWith('/dashboard') && !isLoggedIn) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
}
