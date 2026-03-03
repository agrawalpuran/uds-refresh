/**
 * In-memory sliding-window rate limiter.
 * Edge-runtime compatible (no Node.js APIs).
 *
 * Each serverless instance keeps its own window, so this provides
 * per-instance protection. For distributed limiting, swap the
 * backing store to Redis/Upstash.
 */

interface RateLimitEntry {
  tokens: number
  lastRefill: number
}

const store = new Map<string, RateLimitEntry>()

const CLEANUP_INTERVAL = 60_000
let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  const cutoff = now - windowMs * 2
  for (const [key, entry] of store) {
    if (entry.lastRefill < cutoff) store.delete(key)
  }
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetMs: number
}

/**
 * Token-bucket rate limiter.
 * @param key    Unique key (e.g. IP + route prefix)
 * @param limit  Max requests per window
 * @param windowMs  Window duration in milliseconds
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  cleanup(windowMs)

  let entry = store.get(key)
  if (!entry) {
    entry = { tokens: limit - 1, lastRefill: now }
    store.set(key, entry)
    return { allowed: true, remaining: limit - 1, resetMs: windowMs }
  }

  const elapsed = now - entry.lastRefill
  const refillRate = limit / windowMs
  const refilled = Math.min(limit, entry.tokens + elapsed * refillRate)
  entry.lastRefill = now

  if (refilled < 1) {
    entry.tokens = refilled
    const waitMs = Math.ceil((1 - refilled) / refillRate)
    return { allowed: false, remaining: 0, resetMs: waitMs }
  }

  entry.tokens = refilled - 1
  return { allowed: true, remaining: Math.floor(entry.tokens), resetMs: windowMs }
}

/** Pre-configured tiers */
export const RATE_LIMITS = {
  /** Auth endpoints (login, OTP) — strict to prevent brute-force */
  AUTH: { limit: 10, windowMs: 60_000 },
  /** Write/mutation endpoints (POST, PUT, PATCH, DELETE) */
  WRITE: { limit: 30, windowMs: 60_000 },
  /** Read endpoints (GET) */
  READ: { limit: 120, windowMs: 60_000 },
  /** Admin/superadmin endpoints */
  ADMIN: { limit: 60, windowMs: 60_000 },
} as const
