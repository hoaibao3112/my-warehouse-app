import { NextRequest, NextResponse } from "next/server"

/**
 * GET /api/client-ip
 * 
 * Returns the client's public IP address.
 * This endpoint reads the IP from request headers set by the reverse proxy/load balancer.
 * 
 * Headers checked (in order of priority):
 * 1. CF-Connecting-IP (Cloudflare)
 * 2. X-Real-IP (Nginx, various proxies)
 * 3. X-Forwarded-For (standard proxy header, first IP in chain)
 * 4. X-Client-IP (Azure, some proxies)
 * 5. True-Client-IP (Akamai, Cloudflare Enterprise)
 */
export async function GET(request: NextRequest) {
  // Try various headers in order of reliability
  const cfConnectingIp = request.headers.get('cf-connecting-ip')
  const xRealIp = request.headers.get('x-real-ip')
  const xForwardedFor = request.headers.get('x-forwarded-for')
  const xClientIp = request.headers.get('x-client-ip')
  const trueClientIp = request.headers.get('true-client-ip')

  // x-forwarded-for can contain multiple IPs: "client, proxy1, proxy2"
  // The first one is the original client IP
  const forwardedIp = xForwardedFor?.split(',')[0]?.trim()

  // Priority: CF > True-Client > X-Real > X-Client > X-Forwarded-For
  const clientIp = cfConnectingIp || trueClientIp || xRealIp || xClientIp || forwardedIp || null

  // Debug logging (can be removed in production)
  if (process.env.NODE_ENV === 'development') {
    console.log('[Client IP Debug]', {
      cfConnectingIp,
      trueClientIp,
      xRealIp,
      xClientIp,
      xForwardedFor,
      resolved: clientIp
    })
  }

  return NextResponse.json({
    success: true,
    ip: clientIp,
    // Include debug info in development
    ...(process.env.NODE_ENV === 'development' && {
      debug: {
        headers: {
          'cf-connecting-ip': cfConnectingIp,
          'true-client-ip': trueClientIp,
          'x-real-ip': xRealIp,
          'x-client-ip': xClientIp,
          'x-forwarded-for': xForwardedFor,
        }
      }
    })
  })
}
