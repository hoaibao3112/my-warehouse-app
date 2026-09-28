/**
 * Warehouse Transfer Status Utilities
 * Provides mapping and helpers for transfer status workflow
 */

import { transfer_status } from "@/lib/generated/prisma"

export type TransferStatus = transfer_status

// Status workflow mapping
export const TRANSFER_STATUS = {
  CHO_DUYET: 'CHO_DUYET' as transfer_status,                    // Waiting for manager approval
  DA_DUYET: 'DA_DUYET' as transfer_status,                       // Manager approved, waiting for main warehouse
  DA_XUAT_KHO: 'DA_XUAT_KHO' as transfer_status,                 // Exported from warehouse (Kho Con nhập số lượng)
  CHO_ADMIN_XAC_NHAN: 'CHO_ADMIN_XAC_NHAN' as transfer_status,   // Waiting for admin confirmation (shortage detected)
  HOAN_THANH: 'HOAN_THANH' as transfer_status,                   // Completed (after Kho Con confirms)
  TU_CHOI: 'TU_CHOI' as transfer_status,                         // Rejected
  HUY_BO: 'HUY_BO' as transfer_status,                           // Cancelled
} as const

// Status display configuration for UI
export const STATUS_CONFIG: Record<transfer_status, { label: string; color: string }> = {
  PENDING: { label: "Chờ xử lý", color: "bg-yellow-100 text-yellow-800" },
  APPROVED: { label: "Được phê duyệt", color: "bg-green-100 text-green-800" },
  REJECTED: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  COMPLETED: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
  CHO_DUYET: { label: "Chờ quản lý duyệt", color: "bg-yellow-100 text-yellow-800" },
  DA_DUYET: { label: "Chờ Kho Tổng duyệt", color: "bg-orange-100 text-orange-800" },
  DA_XUAT_KHO: { label: "Đã xuất kho (Kho Con nhập số lượng)", color: "bg-cyan-100 text-cyan-800" },
  CHO_ADMIN_XAC_NHAN: { label: "Chờ Kho Tổng xác nhận (nhập thiếu)", color: "bg-purple-100 text-purple-800" },
  HOAN_THANH: { label: "Hoàn thành", color: "bg-green-100 text-green-800" },
  TU_CHOI: { label: "Từ chối", color: "bg-red-100 text-red-800" },
  HUY_BO: { label: "Hủy bỏ", color: "bg-gray-100 text-gray-800" },
}

// Status workflow transitions
export const STATUS_TRANSITIONS: Record<transfer_status, transfer_status[]> = {
  PENDING: ['APPROVED', 'REJECTED'],
  APPROVED: ['COMPLETED', 'REJECTED'],
  REJECTED: [],
  COMPLETED: [],
  CHO_DUYET: ['DA_DUYET', 'TU_CHOI', 'HUY_BO'],
  DA_DUYET: ['DA_XUAT_KHO', 'HUY_BO'],
  DA_XUAT_KHO: ['HOAN_THANH', 'CHO_ADMIN_XAC_NHAN'],   // Can complete or go to shortage
  CHO_ADMIN_XAC_NHAN: ['HOAN_THANH', 'HUY_BO'],         // Admin confirms shortage or cancels
  HOAN_THANH: [],
  TU_CHOI: [],
  HUY_BO: [],
}

/**
 * Check if a status transition is valid
 */
export function canTransitionTo(from: transfer_status, to: transfer_status): boolean {
  const allowedTransitions = STATUS_TRANSITIONS[from]
  return allowedTransitions.includes(to)
}

/**
 * Get the label for a status
 */
export function getStatusLabel(status: transfer_status): string {
  return STATUS_CONFIG[status]?.label || status
}

/**
 * Get the color class for a status
 */
export function getStatusColor(status: transfer_status): string {
  return STATUS_CONFIG[status]?.color || "bg-gray-100 text-gray-800"
}

/**
 * Check if status is terminal (cannot be changed)
 */
export function isTerminalStatus(status: transfer_status): boolean {
  return STATUS_TRANSITIONS[status].length === 0
}
