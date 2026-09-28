/**
 * Edge-compatible Capacitor auth helpers
 * These functions can run in Edge Runtime (no Node.js crypto)
 */

/**
 * Simple check if request is from Capacitor app
 * Does NOT verify signature - only checks for cookie/user-agent
 * Use this in middleware or Edge Runtime
 */
export function isCapacitorRequest(request: Request): boolean {
  const cookieHeader = request.headers.get('cookie') || ''
  const userAgent = request.headers.get('user-agent') || ''
  
  // Has capacitor-app cookie OR Capacitor user-agent
  return cookieHeader.includes('capacitor-app=') || userAgent.includes('Capacitor')
}

/**
 * Get Capacitor token from request
 * Returns null if no token found
 */
export function getCapacitorToken(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.match(/capacitor-app=([^;]+)/)
  
  if (!match) return null
  
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}
