'use client';

/**
 * PullToRefresh Component
 * Implements pull-to-refresh gesture for mobile
 */

import { useRef, useState, useEffect, ReactNode } from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  threshold?: number; // Pull distance to trigger refresh (default 80px)
}

export function PullToRefresh({
  onRefresh,
  children,
  disabled = false,
  threshold = 80
}: PullToRefreshProps) {
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const startYRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || disabled) return;

    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      // Only start if scrolled to top
      if (container.scrollTop === 0) {
        touchStartY = e.touches[0].clientY;
        startYRef.current = touchStartY;
        isDraggingRef.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current || isRefreshing) return;

      const touchY = e.touches[0].clientY;
      const diff = touchY - startYRef.current;

      // Only pull down
      if (diff > 0 && container.scrollTop === 0) {
        // Add resistance
        const distance = Math.min(diff * 0.5, threshold + 40);
        setPullDistance(distance);
        setIsPulling(distance > threshold);

        // Prevent default scroll
        if (distance > 10) {
          e.preventDefault();
        }
      }
    };

    const handleTouchEnd = async () => {
      if (!isDraggingRef.current) return;

      isDraggingRef.current = false;

      if (pullDistance > threshold && !isRefreshing) {
        setIsRefreshing(true);
        setIsPulling(false);

        try {
          await onRefresh();
        } catch (error) {
          console.error('Refresh failed:', error);
        } finally {
          setIsRefreshing(false);
          setPullDistance(0);
        }
      } else {
        setPullDistance(0);
        setIsPulling(false);
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd);

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [disabled, isRefreshing, pullDistance, threshold, onRefresh]);

  const indicatorOpacity = Math.min(pullDistance / threshold, 1);
  const indicatorRotation = (pullDistance / threshold) * 360;

  return (
    <div
      ref={containerRef}
      className="pull-to-refresh relative overflow-y-auto h-full"
      style={{ touchAction: 'pan-y' }}
    >
      {/* Pull indicator */}
      <div
        className="pull-to-refresh-indicator"
        style={{
          transform: `translateY(${Math.min(pullDistance, threshold)}px)`,
          opacity: indicatorOpacity
        }}
      >
        <div className="flex flex-col items-center">
          <RefreshCw
            className={`w-6 h-6 ${isRefreshing ? 'animate-spin' : ''}`}
            style={{
              transform: isRefreshing ? 'none' : `rotate(${indicatorRotation}deg)`,
              transition: isRefreshing ? 'none' : 'transform 0.2s'
            }}
          />
          <span className="text-xs mt-2 text-gray-500">
            {isRefreshing
              ? 'Đang tải...'
              : isPulling
              ? 'Thả để làm mới'
              : 'Kéo xuống để làm mới'}
          </span>
        </div>
      </div>

      {/* Content */}
      <div
        style={{
          transform: `translateY(${isRefreshing ? 60 : Math.min(pullDistance * 0.3, 30)}px)`,
          transition: isRefreshing || pullDistance === 0 ? 'transform 0.3s ease' : 'none'
        }}
      >
        {children}
      </div>
    </div>
  );
}
