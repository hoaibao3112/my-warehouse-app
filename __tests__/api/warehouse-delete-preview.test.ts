/**
 * Unit test: Warehouse Delete Preview Logic
 *
 * Kiểm tra logic tổng hợp dữ liệu từ delete-preview endpoint:
 * - Phân loại user đúng (WAREHOUSE_MANAGER vs others)
 * - hasBlockingData được set đúng dựa trên purchaseOrders + transferRequests
 * - Preview object có đủ các trường cần thiết
 */

describe('Warehouse Delete Preview — Logic', () => {
  // ===== Helper: Mô phỏng logic tính preview =====
  // Trích từ app/api/warehouses/[id]/delete-preview/route.ts
  function buildDeletePreview(params: {
    warehouseId: string
    warehouseName: string
    warehouseCode: string
    warehouseType: string
    usersInWarehouse: Array<{ id: string; role: string }>
    counts: {
      warehouseStock: number
      warehouseStockRealtime: number
      attendanceSessions: number
      shiftSessions: number
      shiftAssignments: number
      workShifts: number
      leaveRequests: number
      shiftSwapRequests: number
      shiftRegistrationRequests: number
      inventoryChecks: number
      inventoryAdjustments: number
      inventoryImports: number
      productionTransactions: number
      salesInvoices: number
      salesSessions: number
      externalSalesExports: number
      reports: number
      salaryAdvanceRequests: number
      purchaseOrders: number
      transferFromCount: number
      transferToCount: number
    }
  }) {
    const { warehouseId, warehouseName, warehouseCode, warehouseType, usersInWarehouse, counts } = params

    const warehouseManagerCount = usersInWarehouse.filter(u => u.role === 'WAREHOUSE_MANAGER').length
    const otherUsersCount = usersInWarehouse.filter(u => u.role !== 'WAREHOUSE_MANAGER').length

    const blockingData = {
      purchaseOrders: counts.purchaseOrders,
      transferRequests: counts.transferFromCount + counts.transferToCount,
    }

    const hasBlockingData = blockingData.purchaseOrders > 0 || blockingData.transferRequests > 0

    return {
      warehouseId,
      warehouseName,
      warehouseCode,
      warehouseType,
      hasBlockingData,
      blockingData,
      willBeDeleted: {
        warehouseStock: counts.warehouseStock + counts.warehouseStockRealtime,
        inventoryChecks: counts.inventoryChecks,
        inventoryAdjustments: counts.inventoryAdjustments,
        inventoryImports: counts.inventoryImports,
        productionTransactions: counts.productionTransactions,
        attendanceSessions: counts.attendanceSessions,
        shiftSessions: counts.shiftSessions,
        shiftAssignments: counts.shiftAssignments,
        workShifts: counts.workShifts,
        leaveRequests: counts.leaveRequests,
        shiftSwapRequests: counts.shiftSwapRequests,
        shiftRegistrationRequests: counts.shiftRegistrationRequests,
        salesInvoices: counts.salesInvoices,
        salesSessions: counts.salesSessions,
        externalSalesExports: counts.externalSalesExports,
        reports: counts.reports,
        salaryAdvanceRequests: counts.salaryAdvanceRequests,
      },
      users: {
        willBeDeleted: warehouseManagerCount,
        willBeUnlinked: otherUsersCount,
      },
    }
  }

  const baseWarehouse = {
    warehouseId: 'wh-test-01',
    warehouseName: 'Kho Test',
    warehouseCode: 'TEST-01',
    warehouseType: 'STORE' as const,
  }

  const zeroCounts = {
    warehouseStock: 0, warehouseStockRealtime: 0,
    attendanceSessions: 0, shiftSessions: 0, shiftAssignments: 0,
    workShifts: 0, leaveRequests: 0, shiftSwapRequests: 0,
    shiftRegistrationRequests: 0, inventoryChecks: 0,
    inventoryAdjustments: 0, inventoryImports: 0,
    productionTransactions: 0, salesInvoices: 0, salesSessions: 0,
    externalSalesExports: 0, reports: 0, salaryAdvanceRequests: 0,
    purchaseOrders: 0, transferFromCount: 0, transferToCount: 0,
  }

  // ========================================================
  // TEST: Kho sạch — không có blocking data
  // ========================================================
  test('Kho không có dữ liệu: hasBlockingData = false, tất cả counts = 0', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: zeroCounts,
    })

    expect(preview.hasBlockingData).toBe(false)
    expect(preview.blockingData.purchaseOrders).toBe(0)
    expect(preview.blockingData.transferRequests).toBe(0)
    expect(preview.users.willBeDeleted).toBe(0)
    expect(preview.users.willBeUnlinked).toBe(0)
  })

  // ========================================================
  // TEST: Có purchase orders — chặn xóa
  // ========================================================
  test('Có purchase_orders: hasBlockingData = true', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: { ...zeroCounts, purchaseOrders: 3 },
    })

    expect(preview.hasBlockingData).toBe(true)
    expect(preview.blockingData.purchaseOrders).toBe(3)
    expect(preview.blockingData.transferRequests).toBe(0)
  })

  // ========================================================
  // TEST: Có transfer requests (from + to) — chặn xóa
  // ========================================================
  test('Có transfer requests from+to: tổng hợp đúng', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: { ...zeroCounts, transferFromCount: 2, transferToCount: 1 },
    })

    expect(preview.hasBlockingData).toBe(true)
    expect(preview.blockingData.transferRequests).toBe(3) // 2 + 1
  })

  // ========================================================
  // TEST: Phân loại user đúng
  // ========================================================
  test('WAREHOUSE_MANAGER bị xóa, role khác chỉ unlink', () => {
    const users = [
      { id: 'u1', role: 'WAREHOUSE_MANAGER' },
      { id: 'u2', role: 'WAREHOUSE_MANAGER' },
      { id: 'u3', role: 'WAREHOUSE_STAFF' },
      { id: 'u4', role: 'STAFF' },
      { id: 'u5', role: 'ATTENDANCE_STAFF' },
    ]

    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: users,
      counts: zeroCounts,
    })

    expect(preview.users.willBeDeleted).toBe(2)   // 2 WAREHOUSE_MANAGER
    expect(preview.users.willBeUnlinked).toBe(3)  // 3 role khác
  })

  // ========================================================
  // TEST: warehouseStock gộp stock + stock_realtime
  // ========================================================
  test('warehouseStock trong willBeDeleted = stock + stock_realtime', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: { ...zeroCounts, warehouseStock: 15, warehouseStockRealtime: 8 },
    })

    expect(preview.willBeDeleted.warehouseStock).toBe(23) // 15 + 8
  })

  // ========================================================
  // TEST: Dữ liệu chấm công được báo cáo đúng
  // ========================================================
  test('Dữ liệu chấm công được trả về đúng số lượng', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: {
        ...zeroCounts,
        attendanceSessions: 120,
        shiftSessions: 95,
        shiftAssignments: 60,
        workShifts: 4,
        leaveRequests: 12,
      },
    })

    expect(preview.willBeDeleted.attendanceSessions).toBe(120)
    expect(preview.willBeDeleted.shiftSessions).toBe(95)
    expect(preview.willBeDeleted.shiftAssignments).toBe(60)
    expect(preview.willBeDeleted.workShifts).toBe(4)
    expect(preview.willBeDeleted.leaveRequests).toBe(12)
  })

  // ========================================================
  // TEST: Preview object luôn có đủ các trường bắt buộc
  // ========================================================
  test('Preview object có đầy đủ cấu trúc bắt buộc', () => {
    const preview = buildDeletePreview({
      ...baseWarehouse,
      usersInWarehouse: [],
      counts: zeroCounts,
    })

    // Trường top-level
    expect(preview).toHaveProperty('warehouseId')
    expect(preview).toHaveProperty('warehouseName')
    expect(preview).toHaveProperty('warehouseCode')
    expect(preview).toHaveProperty('warehouseType')
    expect(preview).toHaveProperty('hasBlockingData')
    expect(preview).toHaveProperty('blockingData')
    expect(preview).toHaveProperty('willBeDeleted')
    expect(preview).toHaveProperty('users')

    // blockingData
    expect(preview.blockingData).toHaveProperty('purchaseOrders')
    expect(preview.blockingData).toHaveProperty('transferRequests')

    // users
    expect(preview.users).toHaveProperty('willBeDeleted')
    expect(preview.users).toHaveProperty('willBeUnlinked')

    // willBeDeleted — các nhóm chính
    expect(preview.willBeDeleted).toHaveProperty('warehouseStock')
    expect(preview.willBeDeleted).toHaveProperty('attendanceSessions')
    expect(preview.willBeDeleted).toHaveProperty('salesInvoices')
    expect(preview.willBeDeleted).toHaveProperty('inventoryChecks')
    expect(preview.willBeDeleted).toHaveProperty('productionTransactions')
  })
})
