/**
 * Mobile API Client
 * Wrapper for fetch that automatically adds auth headers for Capacitor apps
 */

import { getAuthToken } from './auth-service';
import { isNativePlatform } from './platform';

/**
 * Get default headers for mobile API requests
 */
async function getMobileHeaders(additionalHeaders?: HeadersInit): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Add Capacitor User-Agent to bypass middleware redirects
  if (isNativePlatform()) {
    headers['User-Agent'] = 'Capacitor';

    // Add Bearer token if available
    const token = await getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Merge with additional headers
  if (additionalHeaders) {
    if (additionalHeaders instanceof Headers) {
      additionalHeaders.forEach((value, key) => {
        headers[key] = value;
      });
    } else if (Array.isArray(additionalHeaders)) {
      additionalHeaders.forEach(([key, value]) => {
        headers[key] = value;
      });
    } else {
      Object.assign(headers, additionalHeaders);
    }
  }

  return headers;
}

/**
 * Fetch wrapper for mobile apps with automatic auth headers
 */
export async function mobileFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const isMobile = isNativePlatform();

  // For mobile: add auth headers and omit credentials (no cookies)
  if (isMobile) {
    const headers = await getMobileHeaders(options?.headers) as Record<string, string>;

    // If body is FormData, let the browser set Content-Type with boundary
    // We must NOT enforce 'application/json' or any other Content-Type
    if (options?.body instanceof FormData) {
      delete headers['Content-Type'];
    }

    // Debug logging for auth issues
    const hasAuth = headers['Authorization'];
    console.log('[mobileFetch] Mobile request:', url, '| Has token:', !!hasAuth);

    return fetch(url, {
      ...options,
      headers,
      credentials: 'omit', // Mobile doesn't use cookies
    });
  }

  // For web: use normal fetch with credentials
  // Also add Bearer token if available (hybrid mode - supports both cookie and Bearer)
  const token = await getAuthToken();
  const webHeaders: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };

  if (token) {
    webHeaders['Authorization'] = `Bearer ${token}`;
    console.log('[mobileFetch] Web/hybrid request with Bearer token:', url);
  }

  return fetch(url, {
    ...options,
    headers: webHeaders,
    credentials: options?.credentials || 'include',
  });
}

/**
 * GET request
 */
export async function get<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await mobileFetch(url, {
    ...options,
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * POST request
 */
export async function post<T = any>(
  url: string,
  data?: any,
  options?: RequestInit
): Promise<T> {
  const response = await mobileFetch(url, {
    ...options,
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * PUT request
 */
export async function put<T = any>(
  url: string,
  data?: any,
  options?: RequestInit
): Promise<T> {
  const response = await mobileFetch(url, {
    ...options,
    method: 'PUT',
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * DELETE request
 */
export async function del<T = any>(url: string, options?: RequestInit): Promise<T> {
  const response = await mobileFetch(url, {
    ...options,
    method: 'DELETE',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

/**
 * PATCH request
 */
export async function patch<T = any>(
  url: string,
  data?: any,
  options?: RequestInit
): Promise<T> {
  const response = await mobileFetch(url, {
    ...options,
    method: 'PATCH',
    body: data ? JSON.stringify(data) : undefined,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}

// Export as default for convenience
export default {
  fetch: mobileFetch,
  get,
  post,
  put,
  delete: del,
  patch,
};
