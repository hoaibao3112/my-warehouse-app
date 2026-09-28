/** @type {import('next').NextConfig} */
// Force restart
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  compiler: {
    // Keep error and warn logs in production, remove others (info, log, debug)
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
  // Performance optimizations for mobile
  experimental: {
    // instrumentationHook: true, // Disabled by user request
    optimizePackageImports: [
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-select',
      '@radix-ui/react-tabs',
      'recharts',
      'date-fns',
    ],
  },
  // Trust proxy headers for client IP detection
  // This is important for proper IP logging behind reverse proxies (Nginx, Cloudflare, etc.)
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ]
  },
  // Mobile build configuration
  // Note: output: 'export' is commented out because we're using server-side features
  // The mobile app will load from the deployed server URL
  // If you want to use static export for offline support, you'll need to:
  // 1. Convert all server components to client components
  // 2. Move API routes to external backend
  // 3. Uncomment the line below:
  // output: 'export',
  trailingSlash: false, // Disabled to prevent 404 on API routes
  output: "standalone",
}

// PWA configuration removed due to build incompatibility
export default nextConfig;
