/**
 * Memory Monitor Utility
 * Tracks and logs memory usage to help detect memory leaks
 * Only runs in production environment
 */

// Memory threshold warnings (in MB)
const WARNING_THRESHOLD_MB = 1024 // 1GB
const CRITICAL_THRESHOLD_MB = 2048 // 2GB

// Check interval (5 minutes - giảm từ 1 phút để tiết kiệm compute trên serverless)
const CHECK_INTERVAL_MS = 5 * 60 * 1000

// Keep track of memory growth
let previousHeapUsed = 0
let consecutiveIncreases = 0

interface MemoryStats {
  rss: number // Resident Set Size (total memory)
  heapUsed: number // Heap memory used
  heapTotal: number // Heap memory allocated
  external: number // C++ objects bound to JS
  arrayBuffers: number // ArrayBuffer and SharedArrayBuffer
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function getMemoryStats(): MemoryStats {
  const usage = process.memoryUsage()
  return {
    rss: usage.rss,
    heapUsed: usage.heapUsed,
    heapTotal: usage.heapTotal,
    external: usage.external,
    arrayBuffers: usage.arrayBuffers || 0,
  }
}

function checkMemoryUsage() {
  const stats = getMemoryStats()
  const heapUsedMB = stats.heapUsed / 1024 / 1024

  // Log current memory usage
  console.log('[MEMORY_MONITOR]', {
    rss: formatBytes(stats.rss),
    heapUsed: formatBytes(stats.heapUsed),
    heapTotal: formatBytes(stats.heapTotal),
    external: formatBytes(stats.external),
    arrayBuffers: formatBytes(stats.arrayBuffers),
  })

  // Check for memory growth trend
  if (stats.heapUsed > previousHeapUsed) {
    consecutiveIncreases++
  } else {
    consecutiveIncreases = 0
  }

  // Warning: heap memory above threshold
  if (heapUsedMB > WARNING_THRESHOLD_MB) {
    console.warn(
      `⚠️ [MEMORY_MONITOR] Heap memory usage is high: ${formatBytes(stats.heapUsed)}`
    )
  }

  // Critical: heap memory above critical threshold
  if (heapUsedMB > CRITICAL_THRESHOLD_MB) {
    console.error(
      `🔴 [MEMORY_MONITOR] CRITICAL: Heap memory usage is very high: ${formatBytes(stats.heapUsed)}`
    )
    console.error('Consider restarting the application to prevent crashes')
  }

  // Detect potential memory leak (continuous growth over 10 minutes)
  if (consecutiveIncreases > 10) {
    console.warn(
      `⚠️ [MEMORY_MONITOR] Potential memory leak detected: Memory has been increasing for ${consecutiveIncreases} consecutive checks`
    )
    console.warn('Check for:')
    console.warn('  - Unbounded Map/Set collections')
    console.warn('  - Event listeners not being removed')
    console.warn('  - Large data structures not being garbage collected')

    // Force garbage collection if available (requires --expose-gc flag)
    if (global.gc) {
      console.log('[MEMORY_MONITOR] Running manual garbage collection...')
      global.gc()

      // Check memory after GC
      const afterGC = getMemoryStats()
      const freed = stats.heapUsed - afterGC.heapUsed
      console.log(
        `[MEMORY_MONITOR] GC freed ${formatBytes(freed)} (${((freed / stats.heapUsed) * 100).toFixed(2)}%)`
      )
    }
  }

  previousHeapUsed = stats.heapUsed
}

/**
 * Start monitoring memory usage
 * Call this once when your app starts
 */
export function startMemoryMonitoring() {
  // Only monitor in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('[MEMORY_MONITOR] Skipping in development mode')
    return
  }

  console.log('[MEMORY_MONITOR] Starting memory monitoring...')
  console.log(`[MEMORY_MONITOR] Warning threshold: ${WARNING_THRESHOLD_MB}MB`)
  console.log(`[MEMORY_MONITOR] Critical threshold: ${CRITICAL_THRESHOLD_MB}MB`)

  // Initial check
  checkMemoryUsage()

  // Periodic checks
  const interval = setInterval(checkMemoryUsage, CHECK_INTERVAL_MS)

  // Cleanup on process exit
  process.on('beforeExit', () => {
    clearInterval(interval)
    console.log('[MEMORY_MONITOR] Stopped monitoring')
  })

  return interval
}

/**
 * Get current memory usage (for manual checks)
 */
export function getMemoryUsage() {
  const stats = getMemoryStats()
  return {
    rss: formatBytes(stats.rss),
    heapUsed: formatBytes(stats.heapUsed),
    heapTotal: formatBytes(stats.heapTotal),
    external: formatBytes(stats.external),
    arrayBuffers: formatBytes(stats.arrayBuffers),
  }
}

/**
 * Force garbage collection if available
 * Requires --expose-gc flag
 */
export function forceGarbageCollection() {
  if (global.gc) {
    const before = getMemoryStats()
    global.gc()
    const after = getMemoryStats()
    const freed = before.heapUsed - after.heapUsed

    console.log('[MEMORY_MONITOR] Manual GC completed')
    console.log('Before:', formatBytes(before.heapUsed))
    console.log('After:', formatBytes(after.heapUsed))
    console.log('Freed:', formatBytes(freed))

    return {
      before: formatBytes(before.heapUsed),
      after: formatBytes(after.heapUsed),
      freed: formatBytes(freed),
    }
  } else {
    console.warn('[MEMORY_MONITOR] GC not available. Run with --expose-gc flag')
    return null
  }
}
