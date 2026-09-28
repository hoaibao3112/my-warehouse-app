// User and Authentication Types
export type UserRole = "ADMIN" | "WAREHOUSE_MANAGER" | "STAFF" | "ATTENDANCE_STAFF" | "MANAGER" | "WAREHOUSE_STAFF" | "GENERAL_MANAGER" | "HR" | "AdminKhoTong" | "QuanLyKhoCon"
export type LoginMode = "full" | "reports"

export interface UserWarehouseAssignment {
  id: string
  userId: string
  warehouseId: string
  isPrimary: boolean
  assignedAt: Date
  assignedBy?: string
}

export interface User {
  id: string
  email: string | null
  fullName: string
  role: UserRole
  loginMode?: LoginMode
  warehouseId?: string  // Keep for backward compatibility
  warehouseIds?: string[]  // For GENERAL_MANAGER - array of managed warehouses
  isActive: boolean
  permissions?: string[] // Array of permission IDs (e.g., ['sales', 'inventory_check'])
  createdAt: Date
  updatedAt: Date
}

export interface AuthSession {
  user: User
  token: string
  expiresAt: Date
}

// Warehouse Types
export type WarehouseType = "MAIN" | "STORE"

export interface Warehouse {
  id: string
  code: string
  name: string
  type: WarehouseType
  location?: string
  managerId?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

// Product Types
export interface ProductUnit {
  id: string
  code: string
  name: string
  description?: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface Product {
  id: string
  code: string
  name: string
  description?: string
  unitId: string
  unitPrice?: number
  reorderLevel: number
  createdAt: Date
  updatedAt: Date
}

// Stock Types
export interface WarehouseStock {
  id: string
  warehouseId: string
  productId: string
  quantity: number
  lastCountedAt?: Date
  createdAt: Date
  updatedAt: Date
}

// Transaction Types
export type TransactionType = "IMPORT" | "EXPORT" | "TRANSFER_OUT" | "TRANSFER_IN" | "LOSS" | "ADJUSTMENT"

export interface StockTransaction {
  id: string
  warehouseId: string
  productId: string
  transactionType: TransactionType
  quantity: number
  referenceId?: string
  referenceType?: string
  notes?: string
  createdBy: string
  createdAt: Date
}

// Purchase Order Types
export type PurchaseOrderStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "RECEIVED" | "CANCELLED"

export interface PurchaseOrderItem {
  id: string
  purchaseOrderId: string
  productId: string
  quantity: number
  unitPrice: number
  lineTotal: number
  createdAt: Date
}

export interface PurchaseOrder {
  id: string
  poNumber: string
  warehouseId: string
  supplierName?: string
  status: PurchaseOrderStatus
  totalAmount?: number
  createdBy: string
  approvedBy?: string
  receivedAt?: Date
  items?: PurchaseOrderItem[]
  createdAt: Date
  updatedAt: Date
}

// Stock Transfer Request Types (Kho Con yêu cầu từ Kho Tổng)
export type StockTransferStatus =
  | "CHO_DUYET"           // Chờ Kho Tổng duyệt
  | "DA_DUYET"            // Đã duyệt, chờ xuất kho
  | "DA_XUAT_KHO"         // Đã xuất kho, chờ ký
  | "KHO_TONG_DA_KY"      // Kho Tổng đã ký, chờ Kho Con ký
  | "HOAN_THANH"          // Đã ký đủ 2 bên, hoàn thành
  | "TU_CHOI"             // Từ chối
  | "HUY_BO"              // Hủy bỏ

export interface StockTransferRequestDetail {
  id: string
  requestId: string
  productId: string
  requestedQuantity: number
  approvedQuantity: number
  createdAt: Date
  updatedAt: Date
}

export interface StockTransferRequest {
  id: string
  requestNumber: string
  fromWarehouseId: string
  toWarehouseId: string
  status: StockTransferStatus
  requestedBy: string
  approvedBy?: string

  // Electronic signatures
  mainWarehouseSignature?: string  // Signature data from Kho Tổng
  mainSignedAt?: Date
  mainSignedBy?: string

  storeWarehouseSignature?: string // Signature data from Kho Con
  storeSignedAt?: Date
  storeSignedBy?: string

  // Timeline
  exportedAt?: Date
  completedAt?: Date
  rejectionReason?: string

  details?: StockTransferRequestDetail[]
  createdAt: Date
  updatedAt: Date
}

// Legacy Warehouse Transfer Types (kept for backward compatibility)
export type TransferStatus = "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED"

export interface WarehouseTransferItem {
  id: string
  transferId: string
  productId: string
  quantity: number
  receivedQuantity: number
  createdAt: Date
}

export interface WarehouseTransfer {
  id: string
  transferNumber: string
  fromWarehouseId: string
  toWarehouseId: string
  status: TransferStatus
  requestedBy: string
  approvedBy?: string
  completedAt?: Date
  rejectionReason?: string
  items?: WarehouseTransferItem[]
  createdAt: Date
  updatedAt: Date
}

// Inventory Loss Report Types
export interface InventoryLossReport {
  id: string
  reportNumber: string
  warehouseId: string
  productId: string
  quantityLost: number
  reason?: string
  reportedBy: string
  approvedBy?: string
  createdAt: Date
  updatedAt: Date
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}
