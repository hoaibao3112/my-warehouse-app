'use client';

/**
 * BottomNavigation Component
 * Mobile bottom navigation bar
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LucideIcon } from 'lucide-react';

export interface BottomNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

interface BottomNavigationProps {
  items: BottomNavItem[];
}

export function BottomNavigation({ items }: BottomNavigationProps) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="mobile-bottom-nav md:hidden">
      {items.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`mobile-bottom-nav-item ${active ? 'active' : ''}`}
          >
            <div className="relative">
              <Icon className="w-6 h-6" />
              {item.badge && item.badge > 0 && (
                <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </div>
            <span className="text-xs mt-1">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
