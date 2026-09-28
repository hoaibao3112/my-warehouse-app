import { useEffect, useRef, useCallback } from 'react'

interface UseInfiniteScrollOptions {
  /**
   * Callback to load more items
   */
  onLoadMore: () => void
  /**
   * Whether there are more items to load
   */
  hasMore: boolean
  /**
   * Whether currently loading
   */
  isLoading: boolean
  /**
   * Threshold in pixels from bottom to trigger load
   * @default 100
   */
  threshold?: number
  /**
   * Root element for intersection observer
   * @default null (viewport)
   */
  root?: Element | null
}

/**
 * Hook for implementing infinite scroll with Intersection Observer API
 * Works on both mobile (Capacitor) and desktop
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  threshold = 100,
  root = null,
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries

      // Trigger load more when:
      // 1. Sentinel is visible
      // 2. Not currently loading
      // 3. Has more items to load
      if (entry.isIntersecting && !isLoading && hasMore) {
        console.log('[InfiniteScroll] Loading more items...')
        onLoadMore()
      }
    },
    [hasMore, isLoading, onLoadMore]
  )

  useEffect(() => {
    const sentinel = sentinelRef.current
    if (!sentinel) return

    // Create intersection observer
    observerRef.current = new IntersectionObserver(handleIntersection, {
      root,
      rootMargin: `${threshold}px`,
      threshold: 0.1,
    })

    // Observe the sentinel element
    observerRef.current.observe(sentinel)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [handleIntersection, root, threshold])

  return { sentinelRef }
}
