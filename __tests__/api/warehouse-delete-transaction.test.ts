/**
 * Unit test: Warehouse DELETE — Prisma Transaction Logic (mock)
 *
 * Kiểm tra logic xóa kho với Prisma được mock:
 * - Đúng thứ tự xóa (bảng con trước, kho cuối)
 * - Chỉ xóa theo warehouse_id (không xóa nhầm kho khác)
 * - WAREHOUSE_MANAGER bị xóa, role khác được unlink
 * - Kho được xóa cuối cùng trong transaction
 */

// Mock prisma: không kết nối DB thật
const mockTx = {
  warehouse_stock: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  warehouse_stock_realtime: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  inventory_checks: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  inventory_adjustments: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  inventory_imports: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  external_sales_exports: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  production_transactions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  reports: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  salary_advance_requests: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  sales_invoices: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  sales_sessions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  attendance_sessions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  shift_sessions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  shift_assignments: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  leave_requests: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  shift_swap_requests: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  shift_registration_requests: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  work_shifts: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  warehouse_category_permissions: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
  users: {
    findMany: jest.fn(),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
  warehouses: { delete: jest.fn().mockResolvedValue({}) },
}

// Hàm xóa kho — trích từ DELETE handler (logic thuần, không import Next.js)
async function executeWarehouseDelete(tx: typeof mockTx, warehouseId: string) {
  await tx.warehouse_stock.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.warehouse_stock_realtime.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.inventory_checks.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.inventory_adjustments.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.inventory_imports.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.external_sales_exports.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.production_transactions.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.reports.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.salary_advance_requests.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.sales_invoices.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.sales_sessions.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.attendance_sessions.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.shift_sessions.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.shift_assignments.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.leave_requests.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.shift_swap_requests.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.shift_registration_requests.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.work_shifts.deleteMany({ where: { warehouse_id: warehouseId } })
  await tx.warehouse_category_permissions.deleteMany({ where: { warehouse_id: warehouseId } })

  const warehouseUsers = await tx.users.findMany({ where: { warehouse_id: warehouseId }, select: { id: true, role: true } } as any)

  const warehouseManagerIds = (warehouseUsers as any[]).filter(u => u.role === 'WAREHOUSE_MANAGER').map(u => u.id)
  const otherUserIds = (warehouseUsers as any[]).filter(u => u.role !== 'WAREHOUSE_MANAGER').map(u => u.id)

  if (warehouseManagerIds.length > 0) {
    await tx.users.deleteMany({ where: { id: { in: warehouseManagerIds } } } as any)
  }
  if (otherUserIds.length > 0) {
    await tx.users.updateMany({ where: { id: { in: otherUserIds } }, data: { warehouse_id: null } } as any)
  }

  await tx.warehouses.delete({ where: { id: warehouseId } } as any)
}

describe('Warehouse DELETE — Transaction Logic (mock)', () => {
  const WAREHOUSE_ID = 'wh-to-delete-abc'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ========================================================
  // TEST: Kho/warehouses.delete được gọi CUỐI CÙNG
  // ========================================================
  test('warehouses.delete được gọi sau tất cả deleteMany', async () => {
    mockTx.users.findMany.mockResolvedValue([])

    const callOrder: string[] = []

    // Track thứ tự gọi
    ;(mockTx.warehouse_stock.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('warehouse_stock'); return { count: 0 } })
    ;(mockTx.attendance_sessions.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('attendance_sessions'); return { count: 0 } })
    ;(mockTx.work_shifts.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('work_shifts'); return { count: 0 } })
    ;(mockTx.warehouses.delete as jest.Mock).mockImplementation(async () => { callOrder.push('warehouses_delete') })

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(callOrder.indexOf('warehouses_delete')).toBeGreaterThan(callOrder.indexOf('warehouse_stock'))
    expect(callOrder.indexOf('warehouses_delete')).toBeGreaterThan(callOrder.indexOf('attendance_sessions'))
    expect(callOrder.indexOf('warehouses_delete')).toBeGreaterThan(callOrder.indexOf('work_shifts'))
    expect(callOrder[callOrder.length - 1]).toBe('warehouses_delete')
  })

  // ========================================================
  // TEST: Tất cả deleteMany đều dùng đúng warehouse_id
  // ========================================================
  test('Tất cả deleteMany nhận đúng warehouse_id', async () => {
    mockTx.users.findMany.mockResolvedValue([])

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    const tables = [
      'warehouse_stock', 'warehouse_stock_realtime', 'inventory_checks',
      'inventory_adjustments', 'inventory_imports', 'external_sales_exports',
      'production_transactions', 'reports', 'salary_advance_requests',
      'sales_invoices', 'sales_sessions', 'attendance_sessions',
      'shift_sessions', 'shift_assignments', 'leave_requests',
      'shift_swap_requests', 'shift_registration_requests', 'work_shifts',
      'warehouse_category_permissions',
    ] as const

    for (const table of tables) {
      expect(mockTx[table].deleteMany).toHaveBeenCalledWith({ where: { warehouse_id: WAREHOUSE_ID } })
    }
  })

  // ========================================================
  // TEST: WAREHOUSE_MANAGER bị xóa
  // ========================================================
  test('WAREHOUSE_MANAGER bị xóa bằng deleteMany', async () => {
    mockTx.users.findMany.mockResolvedValue([
      { id: 'mgr-01', role: 'WAREHOUSE_MANAGER' },
      { id: 'mgr-02', role: 'WAREHOUSE_MANAGER' },
    ])

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(mockTx.users.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['mgr-01', 'mgr-02'] } },
    })
    // updateMany KHÔNG được gọi vì không có user khác
    expect(mockTx.users.updateMany).not.toHaveBeenCalled()
  })

  // ========================================================
  // TEST: Role khác được unlink (không bị xóa)
  // ========================================================
  test('User STAFF được unlink warehouse_id, tài khoản không bị xóa', async () => {
    mockTx.users.findMany.mockResolvedValue([
      { id: 'staff-01', role: 'WAREHOUSE_STAFF' },
      { id: 'staff-02', role: 'ATTENDANCE_STAFF' },
    ])

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(mockTx.users.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['staff-01', 'staff-02'] } },
      data: { warehouse_id: null },
    })
    // deleteMany KHÔNG được gọi cho users vì không có WAREHOUSE_MANAGER
    expect(mockTx.users.deleteMany).not.toHaveBeenCalled()
  })

  // ========================================================
  // TEST: Kho không có user — không gọi deleteMany/updateMany users
  // ========================================================
  test('Kho không có user: không gọi users.deleteMany hoặc updateMany', async () => {
    mockTx.users.findMany.mockResolvedValue([])

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(mockTx.users.deleteMany).not.toHaveBeenCalled()
    expect(mockTx.users.updateMany).not.toHaveBeenCalled()
  })

  // ========================================================
  // TEST: Kết hợp — có cả manager lẫn staff
  // ========================================================
  test('Kho có cả manager + staff: manager xóa, staff unlink', async () => {
    mockTx.users.findMany.mockResolvedValue([
      { id: 'mgr-01', role: 'WAREHOUSE_MANAGER' },
      { id: 'staff-01', role: 'WAREHOUSE_STAFF' },
      { id: 'staff-02', role: 'STAFF' },
    ])

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(mockTx.users.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['mgr-01'] } },
    })
    expect(mockTx.users.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['staff-01', 'staff-02'] } },
      data: { warehouse_id: null },
    })
  })

  // ========================================================
  // TEST: attendance_sessions xóa trước work_shifts
  // ========================================================
  test('attendance_sessions và shift_sessions xóa trước work_shifts', async () => {
    mockTx.users.findMany.mockResolvedValue([])

    const callOrder: string[] = []
    ;(mockTx.attendance_sessions.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('attendance_sessions'); return { count: 0 } })
    ;(mockTx.shift_sessions.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('shift_sessions'); return { count: 0 } })
    ;(mockTx.shift_assignments.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('shift_assignments'); return { count: 0 } })
    ;(mockTx.work_shifts.deleteMany as jest.Mock).mockImplementation(async () => { callOrder.push('work_shifts'); return { count: 0 } })

    await executeWarehouseDelete(mockTx, WAREHOUSE_ID)

    expect(callOrder.indexOf('attendance_sessions')).toBeLessThan(callOrder.indexOf('work_shifts'))
    expect(callOrder.indexOf('shift_sessions')).toBeLessThan(callOrder.indexOf('work_shifts'))
    expect(callOrder.indexOf('shift_assignments')).toBeLessThan(callOrder.indexOf('work_shifts'))
  })
})
