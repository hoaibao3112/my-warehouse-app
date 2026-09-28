'use client';

/**
 * MobileLayout Component
 * Wrapper for mobile-optimized pages
 */

import { ReactNode } from 'react';
import { BottomNavigation, BottomNavItem } from './bottom-navigation';
import { Home, Package, FileText, Settings, ShoppingCart } from 'lucide-react';
import { isNativePlatform } from '@/lib/mobile/platform';

interface MobileLayoutProps {
  children: ReactNode;
  showBottomNav?: boolean;
  title?: string;
}

const defaultNavItems: BottomNavItem[] = [
  {
    href: '/',
    label: 'Trang chủ',
    icon: Home
  },
  {
    href: '/store/sales',
    label: 'Bán hàng',
    icon: ShoppingCart
  },
  {
    href: '/store/stock-transfer-requests',
    label: 'Chuyển kho',
    icon: Package
  },
  {
    href: '/store/invoices',
    label: 'Hóa đơn',
    icon: FileText
  },
  {
    href: '/admin/settings',
    label: 'Cài đặt',
    icon: Settings
  }
];

export function MobileLayout({
  children,
  showBottomNav = true,
  title
}: MobileLayoutProps) {
  const isMobile = isNativePlatform();

  return (
    <div className="flex flex-col h-screen">
      {/* Header - optional */}
      {title && (
        <header className="mobile-safe-top bg-white border-b border-gray-200 px-4 py-3 md:hidden">
          <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
        </header>
      )}

      {/* Main content */}
      <main
        className={`flex-1 overflow-y-auto ${
          showBottomNav && isMobile ? 'pb-20' : ''
        }`}
      >
        {children}
      </main>

      {/* Bottom navigation */}
      {showBottomNav && isMobile && (
        <BottomNavigation items={defaultNavItems} />
      )}
    </div>
  );
}
