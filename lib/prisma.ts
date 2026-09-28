/**
 * Prisma Client Singleton
 * Prevents multiple instances in development due to hot-reloading
 */

import { PrismaClient } from '@/lib/generated/prisma/client'

// Initialize memory monitoring in production
if (process.env.NODE_ENV === 'production' && typeof window === 'undefined') {
  import('./memory-monitor').then(({ startMemoryMonitoring }) => {
    startMemoryMonitoring()
  }).catch(err => {
    console.error('[PRISMA] Failed to start memory monitoring:', err)
  })
}

// Prevent multiple instances of Prisma Client in development
declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

export const prisma = global.prisma || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
})

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma
}

// Graceful shutdown
if (typeof window === 'undefined') {
  process.on('beforeExit', async () => {
    await prisma.$disconnect()
  })
}

/**
 * Helper functions for migrating from legacy lib/db to Prisma
 * These provide backward compatibility with the old query() and runTransaction() APIs
 */

/**
 * Execute raw SQL query with parameterized values
 * Compatible with legacy query() function from lib/db
 *
 * @param sql - SQL query with ? placeholders (will be converted to $1, $2, etc.)
 * @param params - Array of parameter values
 * @returns Array of result rows
 */
export async function query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  // Convert ? placeholders to $1, $2, etc. for Prisma, adding ::uuid cast for UUID parameters
  let idx = 0
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  const convertedSql = sql.replace(/\?/g, () => {
    const paramIdx = idx++
    const param = params[paramIdx]

    // If parameter is a UUID string, add ::uuid cast
    if (typeof param === 'string' && uuidRegex.test(param)) {
      return `$${paramIdx + 1}::uuid`
    }
    return `$${paramIdx + 1}`
  })

  // Normalize datetime('now') to CURRENT_TIMESTAMP for PostgreSQL
  const normalizedSql = convertedSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')

  // Use $queryRawUnsafe to execute the query
  const result = await prisma.$queryRawUnsafe<T[]>(normalizedSql, ...params)

  // Convert BigInt to string to avoid serialization errors
  const serializedResult = JSON.parse(JSON.stringify(result, (key, value) =>
    typeof value === 'bigint'
      ? value.toString()
      : value // return everything else unchanged
  ))

  return serializedResult
}

/**
 * Execute a transaction with multiple queries
 * Compatible with legacy runTransaction() function from lib/db
 *
 * @param fn - Transaction function that receives a tx object with query method
 * @param options - Optional transaction options (e.g., timeout in milliseconds)
 * @returns Result of the transaction function
 */
export async function runTransaction<T>(
  fn: (tx: { query: (sql: string, params?: any[]) => Promise<any> }) => Promise<T> | T,
  options?: { timeout?: number }
): Promise<T> {
  return await prisma.$transaction(async (prismaClient) => {
    // UUID regex for parameter detection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    // Create a transaction-aware query function
    const tx = {
      query: async (sql: string, params: any[] = []) => {
        // Convert ? placeholders to $1, $2, etc., adding ::uuid cast for UUID parameters
        let idx = 0
        const convertedSql = sql.replace(/\?/g, () => {
          const paramIdx = idx++
          const param = params[paramIdx]

          // If parameter is a UUID string, add ::uuid cast
          if (typeof param === 'string' && uuidRegex.test(param)) {
            return `$${paramIdx + 1}::uuid`
          }
          return `$${paramIdx + 1}`
        })

        // Normalize datetime('now') to CURRENT_TIMESTAMP
        const normalizedSql = convertedSql.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP')

        // Use the transaction client
        const result = await prismaClient.$queryRawUnsafe(normalizedSql, ...params)

        // Convert BigInt to string to avoid serialization errors
        const serializedResult = JSON.parse(JSON.stringify(result, (key, value) =>
          typeof value === 'bigint'
            ? value.toString()
            : value // return everything else unchanged
        ))

        return serializedResult
      }
    }

    return await fn(tx)
  }, {
    timeout: options?.timeout || 30000, // Default to 30000ms if not specified
  })
}

/**
 * Get current time in ISO format (compatible with legacy getVietnamTime)
 * Returns current Vietnam time (UTC+7) as ISO string
 */
export const getVietnamTime = (): string => {
  // Return current time as ISO string (UTC)
  // Frontend should handle timezone conversion (UTC+7 for Vietnam)
  return new Date().toISOString()
}
