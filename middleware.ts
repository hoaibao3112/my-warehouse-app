import { type NextRequest, NextResponse } from "next/server"
import { isVerifiedCapacitorApp } from "./lib/capacitor-auth"

// Helper to properly delete auth cookie
function deleteAuthCookie(response: NextResponse) {
  response.cookies.set("auth-token", "", {
    path: "/",
    expires: new Date(0),
    maxAge: 0,
  })
  return response
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip middleware for API routes - this is critical to prevent redirect loops
  if (pathname.startsWith('/api/') || pathname.startsWith('/api')) {
    return NextResponse.next()
  }

  // Skip middleware for static files and assets
  if (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon.ico') ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline.html' ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|css|js)$/)
  ) {
    return NextResponse.next()
  }

  // SECURITY: Handle Capacitor mobile app authentication with cryptographic verification
  const authHeader = request.headers.get('authorization')
  const authTokenCookie = request.cookies.get('auth-token')?.value

  // Check if this is a verified Capacitor app with cryptographically signed token
  const capacitorCheck = isVerifiedCapacitorApp(request)

  if (capacitorCheck.verified) {
    // VERIFIED Capacitor app with valid signed token - allow access
    console.log('[Middleware] ✅ Verified Capacitor app with valid signature, bypassing middleware')
    return NextResponse.next()
  }

  if (capacitorCheck.isFirstTime) {
    // First-time Capacitor app without token yet - allow initial load to get signed token
    // This is necessary to prevent deadlock where app needs to call /api/capacitor/init
    console.log('[Middleware] ⏳ First-time Capacitor app, allowing initial load to obtain signed token')
    return NextResponse.next()
  }

  // For API calls with Bearer token (non-Capacitor mobile or programmatic access)
  if (authHeader?.startsWith('Bearer ')) {
    console.log('[Middleware] Bearer token detected, allowing API-level auth verification')
    return NextResponse.next()
  }

  // Get token from cookie (for web)
  const token = authTokenCookie

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/debug', '/privacy-policy']
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname === `${route}/`)

  // Home page is special - it handles its own redirect logic
  const isHomePage = pathname === '/' || pathname === ''

  // For public routes: allow access, but if user has valid token on /login, redirect them
  if (isPublicRoute) {
    // If user is on login page and has a valid token, redirect to appropriate page
    if (pathname === '/login' || pathname === '/login/') {
      if (token) {
        try {
          // Decode URL-encoded token if needed
          let decodedToken = token
          try {
            if (token.includes('%')) {
              decodedToken = decodeURIComponent(token)
            }
          } catch (e) {
            // Token is not URL-encoded, use as-is
          }

          const parts = decodedToken.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(
              atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
            )

            // Check if token is not expired
            if (!payload.exp || Date.now() < payload.exp * 1000) {
              const userRole = payload.role

              // Redirect logged-in users away from login page
              if (userRole === "ADMIN" || userRole === "AdminKhoTong" ||
                userRole === "MANAGER" || userRole === "WAREHOUSE_STAFF") {
                return NextResponse.redirect(new URL("/admin", request.url))
              } else if (userRole === "WAREHOUSE_MANAGER" || userRole === "QuanLyKhoCon" ||
                userRole === "STAFF" || userRole === "GENERAL_MANAGER") {
                return NextResponse.redirect(new URL("/store", request.url))
              } else if (userRole === "ATTENDANCE_STAFF") {
                return NextResponse.redirect(new URL("/attendance", request.url))
              } else if (userRole === "HR") {
                return NextResponse.redirect(new URL("/hr", request.url))
              }
            } else {
              // Token expired, clear it properly
              const response = NextResponse.next()
              return deleteAuthCookie(response)
            }
          } else {
            // Invalid token format, clear it properly
            const response = NextResponse.next()
            return deleteAuthCookie(response)
          }
        } catch (error) {
          // Invalid token, allow access to login page
          // Clear invalid token properly
          const response = NextResponse.next()
          return deleteAuthCookie(response)
        }
      }
    }
    return NextResponse.next()
  }

  // Home page - let it handle its own redirect logic via client-side
  if (isHomePage) {
    return NextResponse.next()
  }

  // Protected routes - require authentication (for web only)
  // Mobile handles auth client-side with Bearer tokens
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  // Decode URL-encoded token if needed (cookies can be URL-encoded)
  let decodedToken = token
  try {
    if (token.includes('%')) {
      decodedToken = decodeURIComponent(token)
    }
  } catch (e) {
    // Token is not URL-encoded, use as-is
  }

  // Decode JWT token to get role for routing (no signature verification)
  // Full JWT verification happens in API routes
  let userRole: string | null = null
  try {
    const parts = decodedToken.split('.')
    if (parts.length !== 3) {
      // Invalid token format, clear and redirect to login
      const response = NextResponse.redirect(new URL("/login", request.url))
      return deleteAuthCookie(response)
    }

    // Decode payload (base64url)
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))
    )

    userRole = payload.role

    // Check if token is expired
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      const response = NextResponse.redirect(new URL("/login", request.url))
      return deleteAuthCookie(response)
    }
  } catch (error) {
    // Invalid token format, clear and redirect to login
    const response = NextResponse.redirect(new URL("/login", request.url))
    return deleteAuthCookie(response)
  }

  // If no role found, clear token and redirect to login
  if (!userRole) {
    const response = NextResponse.redirect(new URL("/login", request.url))
    return deleteAuthCookie(response)
  }

  // Determine user type based on role (support both old and new role names)
  const isAdmin = userRole === "ADMIN" || userRole === "AdminKhoTong"
  const isManager = userRole === "MANAGER" // Main warehouse managers
  const isWarehouseStaff = userRole === "WAREHOUSE_STAFF" // Main warehouse staff
  const isWarehouseManager = userRole === "WAREHOUSE_MANAGER" || userRole === "QuanLyKhoCon"
  const isStaff = userRole === "STAFF"
  const isAttendanceStaff = userRole === "ATTENDANCE_STAFF"
  const isGeneralManager = userRole === "GENERAL_MANAGER" // NEW: Multi-warehouse manager
  const isHR = userRole === "HR" // NEW: HR role

  // Users who can access admin routes
  const canAccessAdmin = isAdmin || isManager || isWarehouseStaff
  // Users who can access store routes - STAFF only (not ATTENDANCE_STAFF)
  const canAccessStore = isWarehouseManager || isStaff || isGeneralManager
  // Users who can access attendance routes - ATTENDANCE_STAFF only
  const canAccessAttendance = isAttendanceStaff
  // Users who can access HR routes
  const canAccessHR = isHR

  // Enforce role-based route access
  const isAdminRoute = pathname.startsWith("/admin")
  const isStoreRoute = pathname.startsWith("/store")
  const isAttendanceRoute = pathname.startsWith("/attendance")
  const isHRRoute = pathname.startsWith("/hr") // NEW

  // HR routes: only HR role can access (NEW - check first)
  if (isHRRoute && !canAccessHR) {
    // Redirect based on user's actual role
    if (canAccessAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url))
    } else if (canAccessStore) {
      return NextResponse.redirect(new URL("/store", request.url))
    } else {
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("auth-token")
      return response
    }
  }

  // Admin routes: only ADMIN, MANAGER, and WAREHOUSE_STAFF can access
  if (isAdminRoute && !canAccessAdmin) {
    // Redirect to store if user can access store, otherwise to HR or login
    if (canAccessStore) {
      return NextResponse.redirect(new URL("/store", request.url))
    } else if (canAccessHR) {
      return NextResponse.redirect(new URL("/hr", request.url))
    } else {
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("auth-token")
      return response
    }
  }

  // Store routes: only WAREHOUSE_MANAGER, STAFF, and GENERAL_MANAGER can access (NOT ATTENDANCE_STAFF)
  if (isStoreRoute && !canAccessStore) {
    // Redirect based on user's actual role
    if (canAccessAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url))
    } else if (canAccessAttendance) {
      return NextResponse.redirect(new URL("/attendance", request.url))
    } else if (canAccessHR) {
      return NextResponse.redirect(new URL("/hr", request.url))
    } else {
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("auth-token")
      return response
    }
  }

  // Attendance routes: only ATTENDANCE_STAFF can access
  if (isAttendanceRoute && !canAccessAttendance) {
    // Redirect based on user's actual role
    if (canAccessStore) {
      return NextResponse.redirect(new URL("/store", request.url))
    } else if (canAccessAdmin) {
      return NextResponse.redirect(new URL("/admin", request.url))
    } else if (canAccessHR) {
      return NextResponse.redirect(new URL("/hr", request.url))
    } else {
      const response = NextResponse.redirect(new URL("/login", request.url))
      response.cookies.delete("auth-token")
      return response
    }
  }

  // ENFORCE loginMode restrictions
  const loginMode = request.cookies.get('login-mode')?.value as string | undefined

  if (loginMode === 'reports') {
    // Only allow access to dashboard and specific report routes
    const allowedReportRoutes = [
      '/admin',
      '/store',
      '/admin/reports',
      '/store/reports',
      '/admin/vouchers',
      '/admin/hr',
    ]

    const isAllowed = allowedReportRoutes.some(route =>
      pathname === route || pathname === `${route}/` || pathname.startsWith(`${route}/`)
    )

    if (!isAllowed) {
      // Redirect to appropriate dashboard if trying to access restricted areas
      const redirectUrl = isAdminRoute ? '/admin' : '/store'
      return NextResponse.redirect(new URL(redirectUrl, request.url))
    }
  }

  return NextResponse.next()
}

// Middleware configuration
// Force Node.js runtime to support crypto module
export const config = {
  runtime: 'nodejs',
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) - MUST be excluded to prevent redirect loops
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (images, etc)
     */
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.jpeg|.*\\.gif|.*\\.svg|.*\\.webp).*)',
  ],
}
