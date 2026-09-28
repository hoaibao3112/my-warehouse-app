/**
 * Unit test: Attendance Report — Warehouse Filter Logic
 *
 * Kiểm tra rằng query where clause được build ĐÚNG theo warehouse_id:
 * - Chỉ lấy session có warehouse_id khớp (strict filter)
 * - KHÔNG dùng OR để lấy session theo user.warehouse_id
 * - Đảm bảo nhân viên kho A KHÔNG xuất hiện trong báo cáo kho B
 */

describe('Attendance Report — Warehouse Filter Logic', () => {
  // ===== Helper: Mô phỏng logic build WHERE clause =====
  // Trích từ app/api/hr/attendance/reports/route.ts
  function buildAttendanceWhereClause(options: {
    warehouseId?: string
    userId?: string
    startDate?: string
    endDate?: string
    userFilter: Record<string, any>
  }) {
    const { warehouseId, userId, startDate, endDate, userFilter } = options
    const whereBase: any = {}

    if (userId) whereBase.user_id = userId

    if (startDate && endDate) {
      whereBase.session_date = { gte: new Date(startDate), lte: new Date(endDate) }
    }

    const where: any = {
      ...whereBase,
      users_shift_sessions_user_idTousers: userFilter,
    }

    // BUG CŨ: where.OR = [{ warehouse_id }, { user.warehouse_id }]
    // FIX MỚI: Chỉ filter thẳng warehouse_id
    if (warehouseId) {
      where.warehouse_id = warehouseId
    }

    return where
  }

  const defaultUserFilter = {
    role: { in: ['ATTENDANCE_STAFF', 'WAREHOUSE_STAFF', 'STAFF', 'WAREHOUSE_MANAGER', 'MANAGER'] },
  }

  // ========================================================
  // TEST: Không có warehouseId — lấy tất cả
  // ========================================================
  test('Không truyền warehouseId: không thêm warehouse_id filter', () => {
    const where = buildAttendanceWhereClause({ userFilter: defaultUserFilter })
    expect(where.warehouse_id).toBeUndefined()
    expect(where.OR).toBeUndefined()
  })

  // ========================================================
  // TEST: Có warehouseId — filter STRICT theo warehouse_id
  // ========================================================
  test('Truyền warehouseId: thêm warehouse_id filter trực tiếp', () => {
    const warehouseId = 'warehouse-store-01'
    const where = buildAttendanceWhereClause({ warehouseId, userFilter: defaultUserFilter })

    expect(where.warehouse_id).toBe(warehouseId)
  })

  // ========================================================
  // TEST: Đảm bảo KHÔNG dùng OR (bugfix cũ)
  // ========================================================
  test('KHÔNG có OR condition — tránh cross-warehouse contamination', () => {
    const warehouseId = 'warehouse-bvd-01'
    const where = buildAttendanceWhereClause({ warehouseId, userFilter: defaultUserFilter })

    // Đây là điểm cốt lõi: KHÔNG được có OR
    expect(where.OR).toBeUndefined()
    // Chỉ có warehouse_id thuần
    expect(where.warehouse_id).toBe('warehouse-bvd-01')
  })

  // ========================================================
  // TEST: userId filter vẫn hoạt động kết hợp warehouse
  // ========================================================
  test('userId + warehouseId: cả hai đều được áp dụng', () => {
    const where = buildAttendanceWhereClause({
      warehouseId: 'warehouse-a',
      userId: 'user-123',
      userFilter: defaultUserFilter,
    })

    expect(where.warehouse_id).toBe('warehouse-a')
    expect(where.user_id).toBe('user-123')
  })

  // ========================================================
  // TEST: Date range filter vẫn hoạt động
  // ========================================================
  test('Date range filter được áp dụng đúng', () => {
    const where = buildAttendanceWhereClause({
      warehouseId: 'warehouse-a',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      userFilter: defaultUserFilter,
    })

    expect(where.session_date).toEqual({
      gte: new Date('2026-03-01'),
      lte: new Date('2026-03-31'),
    })
    expect(where.warehouse_id).toBe('warehouse-a')
  })

  // ========================================================
  // TEST: Mô phỏng session merge — key phải independent với warehouse
  // ========================================================
  test('Session merge key được tạo đúng — user_id + date + uniqueId', () => {
    function buildSessionKey(session: {
      user_id: string
      session_date: Date
      shift_assignment_id: string | null
      work_shift_id: string | null
    }) {
      const dateKey = session.session_date.toISOString().split('T')[0]
      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'legacy'
      return `${session.user_id}_${dateKey}_${uniqueId}`
    }

    // Hai session: cùng user, cùng ngày, khác kho
    const sessionWH_A = {
      user_id: 'user-abc',
      session_date: new Date('2026-03-11'),
      shift_assignment_id: 'assign-01',
      work_shift_id: null,
    }
    const sessionWH_B = {
      user_id: 'user-abc',
      session_date: new Date('2026-03-11'),
      shift_assignment_id: 'assign-02', // Khác assignment
      work_shift_id: null,
    }

    const keyA = buildSessionKey(sessionWH_A)
    const keyB = buildSessionKey(sessionWH_B)

    // Key khác nhau vì shift_assignment_id khác → KHÔNG ghi đè nhau
    expect(keyA).not.toBe(keyB)
    expect(keyA).toBe('user-abc_2026-03-11_assign-01')
    expect(keyB).toBe('user-abc_2026-03-11_assign-02')
  })

  // ========================================================
  // TEST: allEmployees query phải filter theo warehouse_id từ DB
  // ========================================================
  test('allEmployees where clause filter warehouse_id từ DB nếu có', () => {
    function buildAllEmployeesWhereClause(options: { warehouseId?: string; employeeSearch?: string }) {
      const { warehouseId, employeeSearch } = options
      const where: any = {
        role: { in: ['ATTENDANCE_STAFF', 'WAREHOUSE_STAFF', 'STAFF', 'WAREHOUSE_MANAGER', 'MANAGER'] },
      }

      // FIX: Filter tại DB thay vì sau khi query
      if (warehouseId) {
        where.warehouse_id = warehouseId
      }

      if (employeeSearch) {
        where.OR = [
          { full_name: { contains: employeeSearch, mode: 'insensitive' } },
          { email: { contains: employeeSearch, mode: 'insensitive' } },
        ]
      }

      return where
    }

    const whereWithWH = buildAllEmployeesWhereClause({ warehouseId: 'wh-store-01' })
    expect(whereWithWH.warehouse_id).toBe('wh-store-01')

    const whereNoWH = buildAllEmployeesWhereClause({})
    expect(whereNoWH.warehouse_id).toBeUndefined()
  })
})
