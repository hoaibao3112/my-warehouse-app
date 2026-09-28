/**
 * Mobile Performance Utilities
 * Optimizations for faster app startup on mobile devices
 */

import { isNativePlatform } from './platform';

/**
 * Preload critical resources
 */
export function preloadCriticalResources(): void {
  if (typeof window === 'undefined') return;

  // Preload API endpoints that will be needed
  const apiEndpoints = [
    '/api/auth/me',
  ];

  apiEndpoints.forEach(url => {
    // Use link preconnect for API
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = url;
    document.head.appendChild(link);
  });
}

/**
 * Defer non-critical JavaScript execution
 */
export function deferNonCritical(callback: () => void, timeout: number = 2000): void {
  if (typeof window === 'undefined') return;

  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(callback, { timeout });
  } else {
    setTimeout(callback, timeout);
  }
}

/**
 * Prefetch routes that user is likely to navigate to
 */
export function prefetchLikelyRoutes(userRole?: string): void {
  if (typeof window === 'undefined') return;
  
  const routesToPrefetch: string[] = [];

  if (userRole === 'ADMIN' || userRole === 'AdminKhoTong') {
    routesToPrefetch.push('/admin/', '/admin/products/', '/admin/users/');
  } else if (userRole === 'WAREHOUSE_MANAGER' || userRole === 'QuanLyKhoCon' || userRole === 'STAFF') {
    routesToPrefetch.push('/store/', '/store/inventory/', '/store/sales/');
  }

  routesToPrefetch.forEach(route => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = route;
    document.head.appendChild(link);
  });
}

/**
 * Report performance metrics (for debugging)
 */
export function reportPerformanceMetrics(): void {
  if (typeof window === 'undefined' || !window.performance) return;

  deferNonCritical(() => {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    
    if (navigation) {
      console.log('[Performance] Metrics:', {
        // Time to first byte
        ttfb: Math.round(navigation.responseStart - navigation.requestStart),
        // DOM Content Loaded
        dcl: Math.round(navigation.domContentLoadedEventEnd - navigation.fetchStart),
        // Load event
        load: Math.round(navigation.loadEventEnd - navigation.fetchStart),
        // First Paint (if available)
        firstPaint: getFirstPaint(),
      });
    }
  }, 3000);
}

function getFirstPaint(): number | null {
  const paintEntries = performance.getEntriesByType('paint');
  const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
  return firstPaint ? Math.round(firstPaint.startTime) : null;
}

/**
 * Optimize images for mobile
 */
export function getOptimizedImageUrl(url: string, width: number = 400): string {
  // If using Next.js image optimization
  if (url.startsWith('/') && !url.startsWith('//')) {
    return `/_next/image?url=${encodeURIComponent(url)}&w=${width}&q=75`;
  }
  return url;
}

/**
 * Check if device has slow connection
 */
export function isSlowConnection(): boolean {
  if (typeof navigator === 'undefined') return false;
  
  const connection = (navigator as any).connection || 
                     (navigator as any).mozConnection || 
                     (navigator as any).webkitConnection;
  
  if (connection) {
    // Slow connections: slow-2g, 2g, 3g
    return ['slow-2g', '2g', '3g'].includes(connection.effectiveType);
  }
  
  return false;
}

/**
 * Reduce animations on slow devices
 */
export function shouldReduceAnimations(): boolean {
  if (typeof window === 'undefined') return false;

  // Check for prefers-reduced-motion
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return true;
  }

  // Check for slow connection
  if (isSlowConnection()) {
    return true;
  }

  // Check for low-end devices (rough heuristic)
  const memory = (navigator as any).deviceMemory;
  if (memory && memory < 4) {
    return true;
  }

  return false;
}
