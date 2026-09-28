/**
 * Simple in-memory rate limiter cho API calls
 * Chặn các request quá nhanh đến cùng một endpoint
 * 
 * Tối ưu: dùng lazy cleanup thay vì setInterval liên tục
 * để tránh giữ process active trên serverless (Neon)
 */

interface RateLimitConfig {
  maxRequests: number // Số request tối đa trong timeWindow
  timeWindow: number // Thời gian (ms) để reset counter
}

interface RateLimitEntry {
  count: number
  resetTime: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

// Maximum entries to prevent memory leak
const MAX_RATE_LIMIT_ENTRIES = 10000

// Lazy cleanup: chỉ cleanup khi có request mới, không dùng setInterval
let lastCleanupTime = Date.now()
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000 // 5 phút

function lazyCleanup() {
  const now = Date.now()

  // Chỉ cleanup nếu đã quá 5 phút kể từ lần cleanup cuối
  if (now - lastCleanupTime < CLEANUP_INTERVAL_MS) return

  lastCleanupTime = now

  for (const [key, entry] of rateLimitMap.entries()) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key)
    }
  }
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 1,
  timeWindow: 500, // 500ms minimum giữa các requests
}

// Config cho các endpoint cụ thể (thứ tự quan trọng - pattern cụ thể trước)
const ENDPOINT_CONFIGS: Array<[string, RateLimitConfig]> = [
  // More specific patterns first!

  // Batch units - allow more requests vì nó đã tối ưu (thay thế nhiều request thành 1)
  ["/api/products/batch-units", { maxRequests: 10, timeWindow: 1000 }],

  // Product units - allow multiple requests during initialization
  // Vì khi edit form có nhiều items, cần fetch units cho từng item
  ["/api/products/.*/units", { maxRequests: 5, timeWindow: 1000 }],

  // Stock transfer operations - chỉ 1 request mỗi 1 giây
  ["/api/stock-transfer-requests/.*", { maxRequests: 1, timeWindow: 1000 }],
  ["/api/stock-transfer-requests", { maxRequests: 1, timeWindow: 1000 }],

  // Invoice operations - chỉ 1 request mỗi 500ms
  ["/api/sales/invoices/.*", { maxRequests: 1, timeWindow: 500 }],
  ["/api/sales/invoices", { maxRequests: 1, timeWindow: 500 }],

  // Inventory loss reports - chỉ 1 request mỗi 1 giây
  ["/api/inventory-loss-reports/.*", { maxRequests: 1, timeWindow: 1000 }],
  ["/api/inventory-loss-reports", { maxRequests: 1, timeWindow: 1000 }],

  // Generic product fetch (less specific than units endpoint)
  ["/api/products/.*", { maxRequests: 1, timeWindow: 500 }],
  ["/api/products", { maxRequests: 1, timeWindow: 500 }],

  // Transfers - chỉ 1 request mỗi 1 giây
  ["/api/transfers/.*", { maxRequests: 1, timeWindow: 1000 }],
  ["/api/transfers", { maxRequests: 1, timeWindow: 1000 }],
]

// Cache compiled regex patterns để tránh tạo lại mỗi request
const compiledPatterns = ENDPOINT_CONFIGS.map(([pattern, config]) => ({
  regex: new RegExp(`^${pattern}`),
  config,
}))

function getConfigForEndpoint(endpoint: string): RateLimitConfig {
  // Tìm config cho endpoint cụ thể (dùng pre-compiled regex)
  for (const { regex, config } of compiledPatterns) {
    if (regex.test(endpoint)) {
      return config
    }
  }
  return DEFAULT_CONFIG
}

export function checkRateLimit(endpoint: string): { allowed: boolean; retryAfter?: number } {
  // Lazy cleanup thay vì setInterval
  lazyCleanup()

  const config = getConfigForEndpoint(endpoint)
  const now = Date.now()

  // Prevent memory leak: if map is too large, remove expired entries
  if (rateLimitMap.size > MAX_RATE_LIMIT_ENTRIES) {
    const toDelete = Array.from(rateLimitMap.entries())
      .filter(([_, entry]) => now > entry.resetTime)
      .slice(0, Math.floor(MAX_RATE_LIMIT_ENTRIES * 0.1))
      .map(([key]) => key)

    toDelete.forEach(key => rateLimitMap.delete(key))
  }

  const entry = rateLimitMap.get(endpoint) || { count: 0, resetTime: now + config.timeWindow }

  if (now >= entry.resetTime) {
    // Reset window
    entry.count = 1
    entry.resetTime = now + config.timeWindow
    rateLimitMap.set(endpoint, entry)
    return { allowed: true }
  }

  if (entry.count < config.maxRequests) {
    entry.count++
    rateLimitMap.set(endpoint, entry)
    return { allowed: true }
  }

  const retryAfter = Math.ceil((entry.resetTime - now) / 1000)
  return { allowed: false, retryAfter }
}

/**
 * Wrapper cho fetch với rate limiting
 * Returns response (even for errors) - caller decides how to handle
 */
export async function fetchWithRateLimit(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const limit = checkRateLimit(url)

  if (!limit.allowed) {
    throw new Error(
      `Rate limit exceeded. Vui lòng chờ ${limit.retryAfter}s trước khi thử lại.`
    )
  }

  // Fetch and return response
  // Don't throw on HTTP errors - let caller handle via response.ok check
  // This prevents browser from logging red errors for expected failures (401, 403, 423, etc)
  return fetch(url, options)
}
