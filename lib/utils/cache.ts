/**
 * Generic in-memory TTL cache.
 *
 * - Entries expire after `ttlMs` milliseconds.
 * - When `maxSize` is reached, the oldest entry is evicted.
 * - Expired entries are lazily pruned on `get()`.
 *
 * Follows the same Map + timestamp pattern used in
 * CompanyNotificationConfigService but generalised for reuse.
 */

interface CacheEntry<T> {
  value: T
  timestamp: number
}

interface TTLCacheOptions {
  ttlMs: number
  maxSize: number
}

export class TTLCache<T> {
  private readonly cache = new Map<string, CacheEntry<T>>()
  private readonly ttlMs: number
  private readonly maxSize: number

  constructor(opts: TTLCacheOptions) {
    this.ttlMs = opts.ttlMs
    this.maxSize = opts.maxSize
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key)
    if (!entry) return undefined

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return undefined
    }

    return entry.value
  }

  set(key: string, value: T): void {
    // Evict oldest entry when at capacity (and the key is new)
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) this.cache.delete(oldestKey)
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /** Delete all entries whose key starts with `prefix`. */
  deleteByPrefix(prefix: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
