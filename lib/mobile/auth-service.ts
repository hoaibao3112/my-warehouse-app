/**
 * Mobile Auth Service
 * Handle authentication using Capacitor Preferences (secure storage)
 * Replaces cookie-based auth for mobile apps
 */

import { Preferences } from '@capacitor/preferences';
import { isNativePlatform } from './platform';
import type { User } from '@/lib/types';

const AUTH_TOKEN_KEY = 'auth_token';
const USER_DATA_KEY = 'user_data';
const REFRESH_TOKEN_KEY = 'refresh_token';

// Token expiry: 7 days
const TOKEN_EXPIRY_DAYS = 7;

interface StoredAuthData {
  token: string;
  expiresAt: number;
}

/**
 * Check if secure storage is available
 */
export function isSecureStorageAvailable(): boolean {
  return isNativePlatform();
}

/**
 * Save auth token to secure storage with expiry
 */
export async function saveAuthToken(token: string): Promise<void> {
  const expiresAt = Date.now() + (TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
  const data: StoredAuthData = { token, expiresAt };

  if (!isSecureStorageAvailable()) {
    // Fallback: Store in both localStorage and sessionStorage for redundancy
    const dataStr = JSON.stringify(data);
    try {
      localStorage.setItem(AUTH_TOKEN_KEY, dataStr);
      sessionStorage.setItem(AUTH_TOKEN_KEY, dataStr); // Backup in session
      console.log('[AUTH] Token saved to localStorage + sessionStorage with expiry');
    } catch (error) {
      console.error('[AUTH] Error saving to storage:', error);
      // Try sessionStorage only if localStorage fails
      sessionStorage.setItem(AUTH_TOKEN_KEY, dataStr);
    }
    return;
  }

  try {
    await Preferences.set({
      key: AUTH_TOKEN_KEY,
      value: JSON.stringify(data)
    });
    console.log('Auth token saved to secure storage with expiry');
  } catch (error) {
    console.error('Error saving auth token:', error);
    throw error;
  }
}

/**
 * Get auth token from secure storage and validate expiry
 */
export async function getAuthToken(): Promise<string | null> {
  if (!isSecureStorageAvailable()) {
    // Try both storages for web
    const sources = [
      () => localStorage.getItem(AUTH_TOKEN_KEY),
      () => sessionStorage.getItem(AUTH_TOKEN_KEY)
    ];

    for (const getItem of sources) {
      try {
        const stored = getItem();
        if (!stored) continue;

        // Try to parse as StoredAuthData (new format)
        try {
          const data: StoredAuthData = JSON.parse(stored);

          // Check expiry
          if (data.expiresAt && Date.now() > data.expiresAt) {
            console.log('[AUTH] Token expired, clearing storage');
            await removeAuthToken();
            return null;
          }

          return data.token;
        } catch {
          // Old format: plain token string (backward compatibility)
          return stored;
        }
      } catch (error) {
        console.error('[AUTH] Error reading from storage:', error);
      }
    }

    return null;
  }

  try {
    const { value } = await Preferences.get({ key: AUTH_TOKEN_KEY });
    if (!value) return null;

    // Try to parse as StoredAuthData
    try {
      const data: StoredAuthData = JSON.parse(value);

      // Check expiry
      if (data.expiresAt && Date.now() > data.expiresAt) {
        console.log('Token expired, clearing storage');
        await removeAuthToken();
        return null;
      }

      return data.token;
    } catch {
      // Old format: plain token string
      return value;
    }
  } catch (error) {
    console.error('Error getting auth token:', error);
    return null;
  }
}

/**
 * Remove auth token from secure storage
 */
export async function removeAuthToken(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    // Clear from both storages
    try {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      console.log('[AUTH] Token removed from localStorage + sessionStorage');
    } catch (error) {
      console.error('[AUTH] Error removing from storage:', error);
    }
    return;
  }

  try {
    await Preferences.remove({ key: AUTH_TOKEN_KEY });
    console.log('Auth token removed from secure storage');
  } catch (error) {
    console.error('Error removing auth token:', error);
  }
}

/**
 * Save user data to secure storage
 */
export async function saveUserData(user: User): Promise<void> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
    return;
  }

  try {
    await Preferences.set({
      key: USER_DATA_KEY,
      value: JSON.stringify(user)
    });
    console.log('User data saved to secure storage');
  } catch (error) {
    console.error('Error saving user data:', error);
    throw error;
  }
}

/**
 * Get user data from secure storage
 */
export async function getUserData(): Promise<User | null> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    const data = localStorage.getItem(USER_DATA_KEY);
    return data ? JSON.parse(data) : null;
  }

  try {
    const { value } = await Preferences.get({ key: USER_DATA_KEY });
    return value ? JSON.parse(value) : null;
  } catch (error) {
    console.error('Error getting user data:', error);
    return null;
  }
}

/**
 * Remove user data from secure storage
 */
export async function removeUserData(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    localStorage.removeItem(USER_DATA_KEY);
    return;
  }

  try {
    await Preferences.remove({ key: USER_DATA_KEY });
    console.log('User data removed from secure storage');
  } catch (error) {
    console.error('Error removing user data:', error);
  }
}

/**
 * Save refresh token to secure storage
 */
export async function saveRefreshToken(token: string): Promise<void> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
    return;
  }

  try {
    await Preferences.set({
      key: REFRESH_TOKEN_KEY,
      value: token
    });
    console.log('Refresh token saved to secure storage');
  } catch (error) {
    console.error('Error saving refresh token:', error);
    throw error;
  }
}

/**
 * Get refresh token from secure storage
 */
export async function getRefreshToken(): Promise<string | null> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  }

  try {
    const { value } = await Preferences.get({ key: REFRESH_TOKEN_KEY });
    return value;
  } catch (error) {
    console.error('Error getting refresh token:', error);
    return null;
  }
}

/**
 * Remove refresh token from secure storage
 */
export async function removeRefreshToken(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    // Fallback to localStorage for web
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return;
  }

  try {
    await Preferences.remove({ key: REFRESH_TOKEN_KEY });
    console.log('Refresh token removed from secure storage');
  } catch (error) {
    console.error('Error removing refresh token:', error);
  }
}

/**
 * Login - Save token and user data
 */
export async function login(token: string, user: User, refreshToken?: string): Promise<void> {
  try {
    await saveAuthToken(token);
    await saveUserData(user);

    if (refreshToken) {
      await saveRefreshToken(refreshToken);
    }

    console.log('Login successful - data saved to secure storage');
  } catch (error) {
    console.error('Error during login:', error);
    throw error;
  }
}

/**
 * Logout - Clear all auth data
 */
export async function logout(): Promise<void> {
  try {
    await removeAuthToken();
    await removeUserData();
    await removeRefreshToken();

    console.log('Logout successful - all auth data cleared');
  } catch (error) {
    console.error('Error during logout:', error);
  }
}

/**
 * Check if user is logged in
 */
export async function isLoggedIn(): Promise<boolean> {
  const token = await getAuthToken();
  return !!token;
}

/**
 * Get current user
 */
export async function getCurrentUser(): Promise<User | null> {
  return getUserData();
}

/**
 * Update user data (e.g., after profile update)
 */
export async function updateUserData(updates: Partial<User>): Promise<void> {
  const currentUser = await getUserData();

  if (!currentUser) {
    throw new Error('No user data found');
  }

  const updatedUser = { ...currentUser, ...updates };
  await saveUserData(updatedUser);
}

/**
 * Clear all auth data (for debugging/reset)
 */
export async function clearAllAuthData(): Promise<void> {
  if (!isSecureStorageAvailable()) {
    localStorage.clear();
    return;
  }

  try {
    await Preferences.clear();
    console.log('All auth data cleared');
  } catch (error) {
    console.error('Error clearing auth data:', error);
  }
}

/**
 * Get all stored keys (for debugging)
 */
export async function getStoredKeys(): Promise<string[]> {
  if (!isSecureStorageAvailable()) {
    return Object.keys(localStorage);
  }

  try {
    const { keys } = await Preferences.keys();
    return keys;
  } catch (error) {
    console.error('Error getting stored keys:', error);
    return [];
  }
}

/**
 * Add authorization header to fetch requests
 */
export async function getFetchHeaders(additionalHeaders?: Record<string, string>): Promise<HeadersInit> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...additionalHeaders
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return headers;
}

/**
 * Fetch wrapper with automatic auth header
 */
export async function authenticatedFetch(
  url: string,
  options?: RequestInit
): Promise<Response> {
  const headers = await getFetchHeaders(options?.headers as Record<string, string>);

  return fetch(url, {
    ...options,
    headers
  });
}

/**
 * Refresh auth token
 */
export async function refreshAuthToken(): Promise<boolean> {
  try {
    const refreshToken = await getRefreshToken();

    if (!refreshToken) {
      console.log('No refresh token available');
      return false;
    }

    // Call refresh endpoint
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refreshToken })
    });

    if (!response.ok) {
      console.error('Token refresh failed');
      return false;
    }

    const { token, user, refreshToken: newRefreshToken } = await response.json();

    // Save new tokens
    await saveAuthToken(token);
    await saveUserData(user);

    if (newRefreshToken) {
      await saveRefreshToken(newRefreshToken);
    }

    console.log('Token refreshed successfully');
    return true;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return false;
  }
}

/**
 * Check token expiry and refresh if needed
 */
export async function ensureValidToken(): Promise<boolean> {
  const token = await getAuthToken();

  if (!token) {
    return false;
  }

  // TODO: Check token expiry (decode JWT)
  // For now, assume token is valid
  // In production, decode JWT and check exp claim

  return true;
}
