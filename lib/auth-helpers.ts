/**
 * Auth Helper Functions (Client-safe)
 * These functions can be used in both server and client components
 * No Node.js dependencies (bcrypt, jsonwebtoken)
 */

import type { User, UserRole } from "./types"

// Role-based access control
export const hasRole = (user: User, requiredRole: UserRole): boolean => {
  return user.role === requiredRole
}

export const isAdmin = (user: User | null): boolean => {
  if (!user) return false
  // Support both new and old role names for backward compatibility
  return user.role === "ADMIN"
}

export const isWarehouseManager = (user: User | null): boolean => {
  if (!user) return false
  // Support both new and old role names for backward compatibility
  return user.role === "WAREHOUSE_MANAGER"
}

export const isStaff = (user: User | null): boolean => {
  if (!user) return false
  return user.role === "STAFF"
}

// NEW: Check if user is ATTENDANCE_STAFF
export const isAttendanceStaff = (user: User | null): boolean => {
  if (!user) return false
  return user.role === "ATTENDANCE_STAFF"
}

// NEW: Check if user is GENERAL_MANAGER
export const isGeneralManager = (user: User | null): boolean => {
  if (!user) return false
  return user.role === "GENERAL_MANAGER"
}

// NEW: Check if user is HR
export const isHR = (user: User | null): boolean => {
  if (!user) return false
  return user.role === "HR"
}

// For backward compatibility
export const isStoreManager = (user: User | null): boolean => {
  return isWarehouseManager(user)
}

// Check if GENERAL_MANAGER can approve on behalf of WAREHOUSE_MANAGER
// This requires the special permission "can_approve_on_behalf_wm"
export const canApproveOnBehalfOfWarehouseManager = (user: User | null): boolean => {
  if (!user) return false
  // Only GENERAL_MANAGER can have this permission
  if (!isGeneralManager(user)) return false
  // Check if user has the special permission
  return hasPermission(user, 'can_approve_on_behalf_wm')
}

export const canAccessWarehouse = (user: User | null, warehouseId: string): boolean => {
  if (!user) return false

  // Admin can access all warehouses (including MAIN)
  if (isAdmin(user)) return true

  // HR can access all warehouses
  if (isHR(user)) return true

  // GENERAL_MANAGER can access any of their assigned warehouses (auto-assigned STORE warehouses)
  // Note: GENERAL_MANAGER cannot access MAIN warehouses (checked at API/login level)
  if (isGeneralManager(user)) {
    return user.warehouseIds?.includes(warehouseId) ?? false
  }

  // WAREHOUSE_MANAGER can access multiple warehouses via assignments
  if (isWarehouseManager(user)) {
    // Check multi-warehouse assignment first
    if (user.warehouseIds && user.warehouseIds.length > 0) {
      return user.warehouseIds.includes(warehouseId)
    }
    // Fallback to single warehouse assignment (backward compatibility)
    return user.warehouseId === warehouseId
  }

  // MANAGER (Main warehouse) can access their assigned warehouse
  if (user.role === "MANAGER") {
    return user.warehouseId === warehouseId
  }

  // WAREHOUSE_STAFF (Main warehouse) can access their assigned warehouse
  if (user.role === "WAREHOUSE_STAFF") {
    return user.warehouseId === warehouseId
  }

  // STAFF can access their assigned warehouse
  if (isStaff(user)) {
    return user.warehouseId === warehouseId
  }

  return false
}

// Check if user can manage other users in a warehouse
export const canManageWarehouseUsers = (user: User | null, targetWarehouseId: string): boolean => {
  if (!user) return false
  // Admin and HR can manage users in any warehouse
  if (isAdmin(user) || isHR(user)) return true
  // GENERAL_MANAGER can manage users in their assigned warehouses (STORE only)
  if (isGeneralManager(user)) {
    return user.warehouseIds?.includes(targetWarehouseId) ?? false
  }
  // WAREHOUSE_MANAGER can manage users in their assigned warehouses
  if (isWarehouseManager(user)) {
    // Check multi-warehouse assignment first
    if (user.warehouseIds && user.warehouseIds.length > 0) {
      return user.warehouseIds.includes(targetWarehouseId)
    }
    // Fallback to single warehouse
    return user.warehouseId === targetWarehouseId
  }
  // MANAGER can manage their own warehouse (Main warehouse)
  if (user.role === "MANAGER" && user.warehouseId === targetWarehouseId) return true
  // WAREHOUSE_STAFF cannot manage users
  if (user.role === "WAREHOUSE_STAFF") return false
  return false
}

// Permission-based access control
export const hasPermission = (user: User | null, permissionId: string): boolean => {
  if (!user) {
    // console.log('[hasPermission] User is null/undefined')
    return false
  }

  // Admin has all permissions by default
  if (isAdmin(user)) {
    // console.log('[hasPermission] User is admin, allowing all permissions')
    return true
  }

  // HR has permissions related to employees and attendance only
  if (isHR(user)) {
    const hrPermissions = [
      'view_users', 'manage_users',
      'view_attendance', 'manage_attendance', 'edit_attendance',
      'view_shifts', 'manage_shifts',
      'view_leave_requests', 'manage_leave_requests',
      'view_shift_swaps', 'approve_shift_swaps',
      'view_reports', 'export_reports'
    ]
    const hasIt = hrPermissions.includes(permissionId)
    // console.log('[hasPermission] User is HR, checking permission:', permissionId, hasIt)
    return hasIt
  }

  // GENERAL_MANAGER has same permissions as WAREHOUSE_MANAGER
  if (isGeneralManager(user)) {
    // console.log('[hasPermission] User is general manager, allowing permission:', permissionId)
    return true
  }

  // ATTENDANCE_STAFF has only attendance-related permissions
  if (isAttendanceStaff(user)) {
    const attendancePermissions = ['view_own_shifts', 'checkin', 'checkout']
    const hasIt = attendancePermissions.includes(permissionId)
    // console.log('[hasPermission] User is attendance staff, checking permission:', permissionId, hasIt)
    return hasIt
  }

  // Warehouse Manager has all permissions by default
  if (isWarehouseManager(user)) {
    // console.log('[hasPermission] User is warehouse manager, allowing permission:', permissionId)
    return true
  }

  // MANAGER, WAREHOUSE_STAFF, and STAFF users need explicit permission
  if (user.role === "MANAGER" || user.role === "WAREHOUSE_STAFF" || isStaff(user)) {
    // console.log('[hasPermission] Checking permission', permissionId, 'for MANAGER/WAREHOUSE_STAFF/STAFF user')
    // Continue to check explicit permissions below
  } else {
    // console.log('[hasPermission] User is not MANAGER/WAREHOUSE_STAFF/STAFF/ADMIN/WAREHOUSE_MANAGER/GENERAL_MANAGER/HR (role:', user.role, '), denying permission')
    return false
  }

  // Ensure permissions is an array
  let perms = user.permissions
  // console.log('[hasPermission] Checking permission', permissionId, 'for STAFF user. Raw perms:', perms, 'Type:', typeof perms)

  if (!perms) {
    // console.log('[hasPermission] Permissions is null/undefined/falsy')
    return false
  }

  if (typeof perms === 'string') {
    // console.log('[hasPermission] Permissions is a string, parsing JSON:', perms)
    try {
      perms = JSON.parse(perms)
      // console.log('[hasPermission] Parsed successfully:', perms)
    } catch (e) {
      // console.log('[hasPermission] JSON parse failed:', e)
      return false
    }
  }

  if (!Array.isArray(perms)) {
    // console.log('[hasPermission] Permissions is not an array after parsing. Type:', typeof perms, 'Value:', perms)
    return false
  }

  const hasIt = perms.includes(permissionId)
  // console.log('[hasPermission] Permissions array:', perms, 'Contains', permissionId, '?', hasIt)
  return hasIt
}
