import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from '@/components/providers'
import { ErrorBoundary } from '@/components/error-boundary'
import { OfflineProvider } from '@/contexts/offline-context'
import { NetworkBanner } from '@/components/offline/network-banner'

// Preload fonts with display: swap for faster LCP
const geist = Geist({
  subsets: ["latin"],
  display: 'swap', // Hiển thị text ngay với fallback font
  preload: true,
  variable: '--font-geist'
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  display: 'swap',
  preload: true,
  variable: '--font-geist-mono'
});

export const metadata: Metadata = {
  title: 'Express Cafe - Quản lý kho hàng',
  description: 'Hệ thống quản lý kho hàng cho Express Cafe',
  generator: 'Next.js',
  icons: {
    icon: '/favicon.ico',
  },
  manifest: '/manifest.json',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover', // Important for safe area insets
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`}>
      <head>
        {/* Preconnect to API for faster auth check */}
        <link rel="preconnect" href="https://pos.expresscafe.com.vn" />
        <link rel="dns-prefetch" href="https://pos.expresscafe.com.vn" />
      </head>
      <body className={`font-sans antialiased`}>
        <ErrorBoundary>
          <OfflineProvider>
            <Providers>
              <NetworkBanner />
              {children}
            </Providers>
          </OfflineProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
