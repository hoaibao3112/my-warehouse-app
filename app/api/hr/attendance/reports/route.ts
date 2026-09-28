import { type NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isHR, isAdmin } from "@/lib/auth"
import ExcelJS from 'exceljs'
import { startOfMonth, endOfMonth, eachDayOfInterval, format as formatDate } from 'date-fns'
import { vi } from 'date-fns/locale'
import { parseShiftTime, createShiftDateTime, isAfter, isBefore } from "@/lib/server-time"

/**
 * @swagger
 * /api/hr/attendance/reports:
 *   get:
 *     summary: Get Attendance Reports
 *     description: Generate attendance reports for HR (JSON or Excel).
 *     tags: [HR - Reports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: employeeSearch
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, xlsx]
 *       - in: query
 *         name: layout
 *         schema:
 *           type: string
 *           enum: [vertical, horizontal]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report data or file
 *       403:
 *         description: Forbidden
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    // Only HR or Admin can access this endpoint
    if (!user || (!isHR(user) && !isAdmin(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const userId = searchParams.get("userId")
    const employeeSearch = searchParams.get("employeeSearch")
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const format = searchParams.get("format") || 'json' // 'json' or 'xlsx'
    const layout = searchParams.get("layout") || 'vertical' // 'vertical' or 'horizontal'
    const status = searchParams.get("status")
    const sheetType = searchParams.get("sheetType") // 'shift_schedule', 'total_hours', 'late_early', 'swap_replace', 'proxy_checkin', 'leave'

    // Build where clause
    // Build where clause
    const whereBase: any = {}

    // User filter (Role & Search)
    const userFilter: any = {
      role: { in: ['ATTENDANCE_STAFF', 'WAREHOUSE_STAFF', 'STAFF', 'WAREHOUSE_MANAGER', 'MANAGER'] },
      // TRƯỜNG HỢP NHÂN VIÊN ĐÃ NGHỈ VIỆC: Vẫn hiện tên trong báo cáo để xem dữ liệu lịch sử
      // work_status: 'ACTIVE' <- Loại bỏ để hiện cả nhân viên đã nghỉ
    }

    // Do NOT filter users by warehouse_id in the userFilter used for sessions/assignments queries.
    // We want to see sessions that HAPPENED at warehouseId, regardless of where the user primarily belongs.
    // warehouseId filtering is already applied to sessions and assignments themselves.

    if (employeeSearch) {
      userFilter.OR = [
        { full_name: { contains: employeeSearch, mode: 'insensitive' } },
        { email: { contains: employeeSearch, mode: 'insensitive' } }
      ]
    }

    if (userId) {
      whereBase.user_id = userId
    }

    // Date filter
    if (startDate && endDate) {
      whereBase.session_date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } else if (startDate) {
      whereBase.session_date = {
        gte: new Date(startDate)
      }
    } else if (endDate) {
      whereBase.session_date = {
        lte: new Date(endDate)
      }
    }

    // Status filter
    const isAbsentFilter = status === 'ABSENT'
    if (status && !isAbsentFilter) {
      whereBase.status = status
    }

    // --- CONSTRUCT LEGACY WHERE ---
    // QUAN TRỌNG: Chỉ filter theo session.warehouse_id (kho mà ca làm việc thực sự diễn ra).
    // KHÔNG dùng OR với user.warehouse_id vì sẽ khiến session của nhân viên kho A
    // hiện trong báo cáo kho B khi nhân viên được phân ca ở cả hai kho.
    const where: any = {
      ...whereBase,
      users_shift_sessions_user_idTousers: userFilter
    }

    if (warehouseId) {
      // FIX: Include sessions that occurred at this warehouse OR were assigned to this warehouse
      where.OR = [
        { warehouse_id: warehouseId },
        { shift_assignment: { warehouse_id: warehouseId } }
      ]
    }

    // --- CONSTRUCT NEW WHERE ---
    const newWhere: any = {
      ...whereBase,
      users_attendance_sessions_user_idTousers: userFilter
    }

    if (warehouseId) {
      // FIX: Include sessions that occurred at this warehouse OR were assigned to this warehouse
      newWhere.OR = [
        { warehouse_id: warehouseId },
        { shift_assignments: { warehouse_id: warehouseId } }
      ]
    }

    // Fetch shift sessions with full details (LEGACY)
    const legacySessions = await prisma.shift_sessions.findMany({
      where,
      include: {
        users_shift_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true
          }
        },
        work_shifts: {
          select: {
            id: true,
            shift_code: true,
            shift_name: true,
            start_time: true,
            end_time: true
          }
        },
        // Include modified_by user for proxy check-in detection
        users_shift_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true
          }
        }
      },
      orderBy: { check_in_time: 'desc' }
    })

    // Fetch attendance sessions (NEW)
    // Note: newWhere is already constructed above specifically for attendance_sessions
    const newSessions = await prisma.attendance_sessions.findMany({
      where: newWhere,
      include: {
        users_attendance_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true
          }
        },
        work_shifts: {
          select: {
            id: true,
            shift_code: true,
            shift_name: true,
            start_time: true,
            end_time: true
          }
        },
        users_attendance_sessions_modified_byTousers: {
          select: {
            id: true,
            full_name: true
          }
        }
      },
      orderBy: { check_in_time: 'desc' }
    })

    // Merge sessions: Legacy < New
    const sessionMap = new Map()

    // Process Legacy
    legacySessions.forEach(session => {
      const dateKey = session.session_date instanceof Date
        ? session.session_date.toISOString().split('T')[0]
        : new Date(session.session_date).toISOString().split('T')[0]

      // Unique key: user + date + (assignment or shift or 'legacy')
      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'legacy'
      const key = `${session.user_id}_${dateKey}_${uniqueId}`

      sessionMap.set(key, session)
    })

    // Process New (Override Legacy, Map keys to match legacy format for report logic)
    newSessions.forEach(session => {
      const dateKey = session.session_date instanceof Date
        ? session.session_date.toISOString().split('T')[0]
        : new Date(session.session_date).toISOString().split('T')[0]

      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'new'
      const key = `${session.user_id}_${dateKey}_${uniqueId}`

      // Map NEW relation names to OLD relation names expected by report generation properties
      const mappedSession = {
        ...session,
        users_shift_sessions_user_idTousers: session.users_attendance_sessions_user_idTousers,
        users_shift_sessions_modified_byTousers: session.users_attendance_sessions_modified_byTousers
      }

      sessionMap.set(key, mappedSession)
    })

    const sessions = Array.from(sessionMap.values()).sort((a: any, b: any) => {
      // Sort descenting by check_in_time (matching original sort)
      return new Date(b.check_in_time).getTime() - new Date(a.check_in_time).getTime()
    })

    // Fetch approved swap requests for the date range
    const swapDateWhere: any = {}
    if (startDate && endDate) {
      swapDateWhere.requester_date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } else if (startDate) {
      swapDateWhere.requester_date = { gte: new Date(startDate) }
    } else if (endDate) {
      swapDateWhere.requester_date = { lte: new Date(endDate) }
    }

    const swapRequests = await prisma.shift_swap_requests.findMany({
      where: {
        // User requested to ONLY show 'completed' (APPROVED) swaps in the report
        status: 'APPROVED',
        ...swapDateWhere
      },
      include: {
        users_requester: { select: { id: true, full_name: true } },
        users_target: { select: { id: true, full_name: true } },
        work_shifts: { select: { shift_name: true, shift_code: true } },
        target_work_shifts: { select: { shift_name: true, shift_code: true } },
        users_approver: { select: { full_name: true } }
      },
      orderBy: { created_at: 'desc' }
    })

    // Helper for VN date key (Moved up for shared usage)
    const vnDateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' })
    const getVNDateKey = (d: Date | string) => vnDateFormatter.format(new Date(d))

    // Build swap lookup maps
    const swapByUserDate = new Map<string, any>() // Only APPROVED for attendance calc
    const allSwapRequestsMap = new Map<string, any[]>() // ALL for reporting

    swapRequests.forEach(swap => {
      const dateKey = getVNDateKey(swap.requester_date) // Use VN date key consistency
      const dateStr = swap.requester_date.toISOString().split('T')[0] // Keep for legacy if needed (or replace with dateKey)

      const requesterShiftCode = swap.work_shifts?.shift_code || swap.work_shifts?.shift_name || '?'
      const targetShiftCode = swap.target_work_shifts?.shift_code || swap.target_work_shifts?.shift_name || '?'

      const requesterKey = `${swap.requester_user_id}_${dateKey}`
      const targetKey = swap.target_user_id ? `${swap.target_user_id}_${dateKey}` : null

      const swapInfoRequester = {
        swapType: swap.swap_type,
        swapWith: swap.users_target?.full_name || 'Không xác định',
        originalAssignee: swap.users_requester?.full_name,
        direction: 'gave_away', // Nhường ca
        requesterShiftCode,
        targetShiftCode,
        status: swap.status
      }

      const swapInfoTarget = {
        swapType: swap.swap_type,
        swapWith: swap.users_requester?.full_name || 'Không xác định',
        originalAssignee: swap.users_requester?.full_name,
        direction: 'took_over', // Nhận ca
        requesterShiftCode,
        targetShiftCode,
        status: swap.status
      }

      // Populate ALL swaps map (Arrays to handle multiple)
      if (!allSwapRequestsMap.has(requesterKey)) allSwapRequestsMap.set(requesterKey, [])
      allSwapRequestsMap.get(requesterKey)!.push(swapInfoRequester)

      if (swap.target_user_id && targetKey) {
        if (!allSwapRequestsMap.has(targetKey)) allSwapRequestsMap.set(targetKey, [])
        allSwapRequestsMap.get(targetKey)!.push(swapInfoTarget)
      }

      // Populate APPROVED swaps map (Single entry - only active swap matters for attendance)
      // IMPORTANT: Only APPROVED swaps affect attendance/scheduling
      if (swap.status === 'APPROVED') {
        // Original requester's record - they gave away the shift
        // Note: swapByUserDate currently uses UTC dateStr as key in session loop. 
        // Need to ensure session loop uses consistent key. 
        // Current session loop uses: session.session_date?.toISOString().split('T')[0]
        // So we MUST keep dateStr here for attendance logic compatibility unless we change session loop too.

        swapByUserDate.set(`${swap.requester_user_id}_${dateStr}`, swapInfoRequester)

        // Target user's record - they took the shift
        if (swap.target_user_id) {
          swapByUserDate.set(`${swap.target_user_id}_${dateStr}`, swapInfoTarget)
        }
      }
    })

    // Fetch leave requests for the date range
    const leaveDateWhere: any = {}
    if (startDate && endDate) {
      leaveDateWhere.leave_date = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      }
    } else if (startDate) {
      leaveDateWhere.leave_date = { gte: new Date(startDate) }
    } else if (endDate) {
      leaveDateWhere.leave_date = { lte: new Date(endDate) }
    }

    const leaveRequests = await prisma.leave_requests.findMany({
      where: {
        ...leaveDateWhere,
        ...(warehouseId ? { warehouse_id: warehouseId } : {})
      },
      include: {
        users_requester: { select: { id: true, full_name: true } },
        users_approver: { select: { full_name: true } },
        work_shifts: { select: { shift_name: true, shift_code: true } },
        warehouses: { select: { name: true } }
      },
      orderBy: { leave_date: 'asc' }
    })

    // Build leave lookup map (userId_dateKey -> leaveInfo)
    const leaveByUserDate = new Map<string, any>()
    leaveRequests.forEach(leave => {
      const dateKey = getVNDateKey(leave.leave_date)
      const key = `${leave.user_id}_${dateKey}`
      leaveByUserDate.set(key, {
        status: leave.status,
        reason: leave.reason,
        approver: leave.users_approver?.full_name,
        shift: leave.work_shifts?.shift_code || leave.work_shifts?.shift_name || 'Cả ngày'
      })
    })


    // Transform data to readable format
    const transformedSessions: any[] = sessions.map(session => {
      const checkInTime = session.check_in_time ? new Date(session.check_in_time) : null
      const checkOutTime = session.check_out_time ? new Date(session.check_out_time) : null

      // Calculate duration in hours using INTERSECTION logic
      // Only count hours that fall within the shift window
      let durationHours: string | null = null
      if (checkInTime && checkOutTime) {
        if (session.work_shifts && session.session_date) {
          const sessionDate = new Date(session.session_date)
          const { hours: startH, minutes: startM } = parseShiftTime(session.work_shifts.start_time)
          const { hours: endH, minutes: endM } = parseShiftTime(session.work_shifts.end_time)

          // Construct shift start/end for this session's date efficiently using server-time helper
          const shiftStart = createShiftDateTime(sessionDate, startH, startM)
          let shiftEnd = createShiftDateTime(sessionDate, endH, endM)

          // Handle overnight shift (end time is on the next day)
          if (isBefore(shiftEnd, shiftStart) || shiftEnd.getTime() === shiftStart.getTime()) {
            shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000)
          }

          // Calculate intersection: effectiveStart = max(checkIn, shiftStart), effectiveEnd = min(checkOut, shiftEnd)
          const effectiveStart = checkInTime > shiftStart ? checkInTime : shiftStart
          const effectiveEnd = checkOutTime < shiftEnd ? checkOutTime : shiftEnd

          // Duration is only positive if there's actual overlap
          const durationMs = effectiveEnd.getTime() - effectiveStart.getTime()
          durationHours = durationMs > 0 ? (durationMs / (1000 * 60 * 60)).toFixed(2) : "0.00"

        } else {
          // No shift assigned, use raw duration
          const durationMs = checkOutTime.getTime() - checkInTime.getTime()
          durationHours = (durationMs / (1000 * 60 * 60)).toFixed(2)
        }
      }

      // Extract late minutes from notes
      const lateMatch = session.notes?.match(/Đi muộn (\d+) phút/)
      const lateMinutes = lateMatch ? parseInt(lateMatch[1]) : 0

      // Extract early leave minutes from notes
      const earlyMatch = session.notes?.match(/Về sớm (\d+) phút/)
      const earlyMinutes = earlyMatch ? parseInt(earlyMatch[1]) : 0

      // Check for proxy check-in (modified_by is different from user_id)
      const isProxyCheckIn = session.modified_by && session.modified_by !== session.user_id
      const proxyBy = isProxyCheckIn
        ? session.users_shift_sessions_modified_byTousers?.full_name || 'Quản lý'
        : null

      // Check for swap info
      const dateStr = session.session_date?.toISOString().split('T')[0]
      const swapKey = `${session.user_id}_${dateStr}`
      const swapInfo = swapByUserDate.get(swapKey) || null

      // CRITICAL FIX: Calculate late/early if not already set in DB
      // This handles sessions created by managers or old sessions without these flags
      let isLate = session.is_late_checkin || false
      let isEarly = session.is_early_checkout || false

      // Recalculate late/early based on actual check times and shift times to override potentially buggy DB flags
      if (session.work_shifts && session.session_date) {
        const sessionDate = new Date(session.session_date)
        const { hours: startH, minutes: startM } = parseShiftTime(session.work_shifts.start_time)
        const { hours: endH, minutes: endM } = parseShiftTime(session.work_shifts.end_time)

        const shiftStart = createShiftDateTime(sessionDate, startH, startM)
        let shiftEnd = createShiftDateTime(sessionDate, endH, endM)

        // Handle overnight shift
        if (isBefore(shiftEnd, shiftStart) || shiftEnd.getTime() === shiftStart.getTime()) {
          shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000)
        }

        if (checkInTime) {
          isLate = isAfter(checkInTime, shiftStart)
        }
        
        if (checkOutTime) {
          isEarly = isBefore(checkOutTime, shiftEnd)
        }
      }

      return {
        id: session.id,
        sessionDate: session.session_date,
        checkInTime: checkInTime,
        checkOutTime: checkOutTime,
        duration: durationHours,
        status: session.status,
        isLateCheckin: isLate,
        isEarlyCheckout: isEarly,
        user: {
          id: session.users_shift_sessions_user_idTousers.id,
          fullName: session.users_shift_sessions_user_idTousers.full_name,
          email: session.users_shift_sessions_user_idTousers.email,
          role: session.users_shift_sessions_user_idTousers.role
        },
        warehouse: {
          id: session.warehouses.id,
          code: session.warehouses.code,
          name: session.warehouses.name,
          type: session.warehouses.type
        },
        workShift: session.work_shifts ? {
          id: session.work_shifts.id,
          code: session.work_shifts.shift_code,
          name: session.work_shifts.shift_name,
          startTime: session.work_shifts.start_time,
          endTime: session.work_shifts.end_time,
          // Add snake_case for lib/shift-status logic compatibility
          start_time: session.work_shifts.start_time,
          end_time: session.work_shifts.end_time
        } : null,
        notes: session.notes,
        // New fields
        lateMinutes,
        earlyMinutes,
        proxyBy,
        swapInfo,
        // Original fields
        check_in_ip: session.check_in_ip,
        check_out_ip: session.check_out_ip,
        check_in_location: session.check_in_location,
        check_out_location: session.check_out_location,
        check_in_device_info: session.check_in_device_info,
        check_out_device_info: session.check_out_device_info
      }
    })

    // Fetch ABSENT employees - those with approved shift_assignments but no sessions
    // Only for past dates (can't be absent for future shifts)
    const today = new Date()
    today.setHours(23, 59, 59, 999)

    const absentWhere: any = {
      assigned_date: {
        lt: today // Only past dates
      },
      users_assigned: {
        role: { in: ['ATTENDANCE_STAFF', 'WAREHOUSE_STAFF', 'STAFF', 'WAREHOUSE_MANAGER', 'MANAGER'] }
      }
    }

    if (warehouseId) {
      absentWhere.warehouse_id = warehouseId
    }

    if (startDate) {
      absentWhere.assigned_date = {
        ...absentWhere.assigned_date,
        gte: new Date(startDate)
      }
    }

    if (endDate) {
      absentWhere.assigned_date = {
        ...absentWhere.assigned_date,
        lte: new Date(endDate)
      }
    }

    // Get all user+date combinations that have sessions
    const sessionUserDates = new Set(
      sessions.map(s => `${s.user_id}_${s.session_date?.toISOString().split('T')[0]}`)
    )

    // Fetch approved assignments
    const assignments = await prisma.shift_assignments.findMany({
      where: absentWhere,
      include: {
        users_assigned: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true
          }
        },
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true
          }
        },
        work_shifts: {
          select: {
            id: true,
            shift_code: true,
            shift_name: true,
            start_time: true,
            end_time: true
          }
        }
      }
    })

    // Filter to only those without sessions (truly absent)
    const absentAssignments = assignments.filter(a => {
      const dateKey = a.assigned_date?.toISOString().split('T')[0]
      return !sessionUserDates.has(`${a.user_id}_${dateKey}`)
    })

    // Apply employee search filter if provided
    let filteredAbsentAssignments = absentAssignments
    if (employeeSearch) {
      const searchLower = employeeSearch.toLowerCase()
      filteredAbsentAssignments = absentAssignments.filter(a =>
        a.users_assigned?.full_name?.toLowerCase().includes(searchLower) ||
        a.users_assigned?.email?.toLowerCase().includes(searchLower)
      )
    }

    // Add absent records to results
    const absentRecords = filteredAbsentAssignments.map(assignment => ({
      id: assignment.id,
      sessionDate: assignment.assigned_date,
      checkInTime: null,
      checkOutTime: null,
      duration: null,
      status: 'ABSENT',
      user: {
        id: assignment.users_assigned?.id || '',
        fullName: assignment.users_assigned?.full_name || '',
        email: assignment.users_assigned?.email || '',
        role: assignment.users_assigned?.role || ''
      },
      warehouse: {
        id: assignment.warehouses?.id || '',
        code: assignment.warehouses?.code || '',
        name: assignment.warehouses?.name || '',
        type: assignment.warehouses?.type || ''
      },
      workShift: assignment.work_shifts ? {
        id: assignment.work_shifts.id,
        code: assignment.work_shifts.shift_code,
        name: assignment.work_shifts.shift_name,
        startTime: assignment.work_shifts.start_time,
        endTime: assignment.work_shifts.end_time,
        // Add snake_case for lib/shift-status logic compatibility
        start_time: assignment.work_shifts.start_time,
        end_time: assignment.work_shifts.end_time
      } : null,
      notes: 'Vắng mặt - không check-in',
      check_in_ip: null,
      check_out_ip: null,
      check_in_location: null,
      check_out_location: null,
      check_in_device_info: null,
      check_out_device_info: null
    }))

    // Combine and filter based on status
    let allRecords = [...transformedSessions, ...absentRecords]

    // If filtering by ABSENT, only show absent records
    if (isAbsentFilter) {
      allRecords = absentRecords
    } else if (status) {
      // For other status filters, exclude absent records (already filtered in session query)
      allRecords = transformedSessions
    }

    // Fetch ALL ATTENDANCE_STAFF employees to ensure everyone is included
    // ONLY add NO_RECORD employees when not filtering by a specific status (or when status is 'all' or 'NO_RECORD')
    const shouldIncludeNoRecordEmployees = !status || status === 'NO_RECORD'

    if (shouldIncludeNoRecordEmployees) {
      const allEmployeesWhere: any = {
        role: { in: ['ATTENDANCE_STAFF', 'WAREHOUSE_STAFF', 'STAFF', 'WAREHOUSE_MANAGER', 'MANAGER'] }
      }

      // Filter nhân viên theo kho ngay từ DB, không filter sau để tránh sót
      if (warehouseId) {
        allEmployeesWhere.warehouse_id = warehouseId
      }

      if (employeeSearch) {
        allEmployeesWhere.OR = [
          { full_name: { contains: employeeSearch, mode: 'insensitive' } },
          { email: { contains: employeeSearch, mode: 'insensitive' } }
        ]
      }

      const allEmployees = await prisma.users.findMany({
        where: allEmployeesWhere,
        select: {
          id: true,
          full_name: true,
          email: true,
          role: true,
          warehouses_users_warehouse_idTowarehouses: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true
            }
          }
        }
      })

      // Get unique user IDs that already have records
      const existingUserIds = new Set(allRecords.map(r => r.user.id))

      // Add placeholder records for employees without any attendance history
      const employeesWithoutRecords = allEmployees.filter(emp => !existingUserIds.has(emp.id))

      employeesWithoutRecords.forEach(emp => {
        // Add a placeholder record to show them in the list
        allRecords.push({
          id: `placeholder-${emp.id}`,
          sessionDate: null,
          checkInTime: null,
          checkOutTime: null,
          duration: null,
          status: 'NO_RECORD',
          user: {
            id: emp.id,
            fullName: emp.full_name || '',
            email: emp.email || '',
            role: emp.role || ''
          },
          warehouse: emp.warehouses_users_warehouse_idTowarehouses || {
            id: '',
            code: '',
            name: 'Chưa phân kho',
            type: ''
          },
          workShift: null,
          notes: 'Chưa có lịch sử chấm công',
          check_in_ip: null,
          check_out_ip: null,
          check_in_location: null,
          check_out_location: null,
          check_in_device_info: null,
          check_out_device_info: null
        })
      })
    }

    // If filtering by NO_RECORD specifically, only show those records
    if (status === 'NO_RECORD') {
      allRecords = allRecords.filter(r => r.status === 'NO_RECORD')
    }

    // Sort by date descending (nulls last), then by employee name
    allRecords.sort((a, b) => {
      const dateA = a.sessionDate ? new Date(a.sessionDate).getTime() : 0
      const dateB = b.sessionDate ? new Date(b.sessionDate).getTime() : 0

      if (dateB !== dateA) {
        return dateB - dateA
      }

      // If dates are equal (or both null), sort by name
      return (a.user.fullName || '').localeCompare(b.user.fullName || '')
    })

    // If format is xlsx, generate Excel file with multiple sheets
    if (format === 'xlsx') {
      // REQUIRE date range for Excel export
      if (!startDate || !endDate) {
        return NextResponse.json(
          { success: false, error: 'Vui lòng chọn khoảng thời gian (ngày bắt đầu và ngày kết thúc) trước khi xuất báo cáo.' },
          { status: 400 }
        )
      }

      const workbook = new ExcelJS.Workbook()

      // Styling Helpers
      const borderStyle = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' }
      } as any
      const headerFont = { bold: true, name: 'Times New Roman', size: 11 }
      const normalFont = { name: 'Times New Roman', size: 10 }
      const titleFont = { bold: true, name: 'Times New Roman', size: 14 }

      // Date range for title
      const dateRangeStr = startDate && endDate
        ? `Từ ${formatDate(new Date(startDate), 'dd/MM/yyyy')} đến ${formatDate(new Date(endDate), 'dd/MM/yyyy')}`
        : startDate
          ? `Từ ${formatDate(new Date(startDate), 'dd/MM/yyyy')}`
          : endDate
            ? `Đến ${formatDate(new Date(endDate), 'dd/MM/yyyy')}`
            : 'Tất cả thời gian'

      // Helper to add title rows to sheet
      const addTitleToSheet = (ws: ExcelJS.Worksheet, title: string) => {
        const titleRow = ws.addRow([title])
        titleRow.font = titleFont
        titleRow.height = 25
        ws.mergeCells(1, 1, 1, 8)

        const dateRow = ws.addRow([`Khoảng thời gian: ${dateRangeStr}`])
        dateRow.font = normalFont
        ws.mergeCells(2, 1, 2, 8)

        ws.addRow([]) // Empty row
      }

      // ========== SHARED SETUP FOR ALL SHEETS ==========
      // Get date range for matrix
      const dateStart = new Date(startDate)
      const dateEnd = new Date(endDate)
      const allDates = eachDayOfInterval({ start: dateStart, end: dateEnd })

      // Fixed columns count
      const FIXED_COLS = 3 // STT, Nhân viên, Kho
      const SUMMARY_COLS = 2 // Tổng ngày, Tổng giờ
      const summaryStartCol = FIXED_COLS + allDates.length + 1

      // Day names for header
      const dayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

      // Group records by user (shared by all sheets)
      const userDataMap = new Map<string, Map<string, any[]>>()
      allRecords.forEach(r => {
        const userKey = `${r.user.id}_${r.warehouse.id}`
        if (!userDataMap.has(userKey)) {
          userDataMap.set(userKey, new Map())
          // Store info in a special key, but value is still array for consistency or just object?
          // Let's keep _info as special property or specific key
          userDataMap.get(userKey)!.set('_info', [{
            id: r.user.id,
            fullName: r.user.fullName,
            warehouse: r.warehouse.name
          }])
        }

        let dateKey = null
        if (r.sessionDate) {
          dateKey = getVNDateKey(r.sessionDate)
        } else if (r.status === 'ABSENT' && r.sessionDate) {
          // For absent records
          dateKey = getVNDateKey(r.sessionDate)
        }

        if (dateKey) {
          const userMap = userDataMap.get(userKey)!
          if (!userMap.has(dateKey)) {
            userMap.set(dateKey, [])
          }
          userMap.get(dateKey)!.push(r)
        }
      })

      // Shared STT counter for all sheets
      let stt = 1

      // ========== SHEET 1: CA LÀM (SHIFT SCHEDULE) ==========
      if (!sheetType || sheetType === 'shift_schedule') {
        const shiftSheet = workbook.addWorksheet('Ca làm')

        // Title rows for Shift Sheet
        const shiftTitleRow = shiftSheet.addRow(['BÁO CÁO CA LÀM VIỆC'])
        shiftTitleRow.font = titleFont
        shiftTitleRow.height = 25
        shiftSheet.mergeCells(1, 1, 1, FIXED_COLS + allDates.length)

        const shiftDateRangeRow = shiftSheet.addRow([`Khoảng thời gian: ${dateRangeStr}`])
        shiftDateRangeRow.font = normalFont
        shiftSheet.mergeCells(2, 1, 2, FIXED_COLS + allDates.length)

        shiftSheet.addRow([]) // Empty row

        // Header Row 1: Fixed cols + Dates (dd/MM)
        const shiftHeaderRow1Values: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => {
          shiftHeaderRow1Values.push(formatDate(date, 'dd/MM'))
        })
        const shiftHeaderRow1 = shiftSheet.addRow(shiftHeaderRow1Values)
        shiftHeaderRow1.font = headerFont
        shiftHeaderRow1.height = 20

        // Header Row 2: Day names
        const shiftHeaderRow2Values: any[] = ['', '', '']
        allDates.forEach(date => {
          shiftHeaderRow2Values.push(dayNames[date.getDay()])
        })
        const shiftHeaderRow2 = shiftSheet.addRow(shiftHeaderRow2Values)
        shiftHeaderRow2.font = { ...headerFont, size: 9 }

        // Merge fixed column headers vertically
        shiftSheet.mergeCells(4, 1, 5, 1) // STT
        shiftSheet.mergeCells(4, 2, 5, 2) // Nhân viên
        shiftSheet.mergeCells(4, 3, 5, 3) // Kho

          // Style headers
          ;[shiftHeaderRow1, shiftHeaderRow2].forEach(row => {
            row.eachCell((cell, colNumber) => {
              cell.border = borderStyle
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              // Highlight weekend
              if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
                const dateIdx = colNumber - FIXED_COLS - 1
                const date = allDates[dateIdx]
                if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
                }
              }
            })
          })

        // Data rows for Shift Sheet
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const rowValues: any[] = [stt++, info.fullName, info.warehouse]

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            const records = userData.get(dateKey) || []

            if (records.length > 0) {
              // Join shift codes or names
              const shifts = records
                .map((r: any) => r.workShift?.code || r.workShift?.name || ((r.status === 'ABSENT' && !r.checkInTime) ? 'Vắng' : '-'))
                .filter(Boolean)
                .join('\n')
              rowValues.push(shifts)
            } else {
              rowValues.push('')
            }
          })

          const dataRow = shiftSheet.addRow(rowValues)
          dataRow.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

            // Highlight weekend columns
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }
          })
          // Left align name columns
          dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths for Shift Sheet
        shiftSheet.getColumn(1).width = 5
        shiftSheet.getColumn(2).width = 22
        shiftSheet.getColumn(3).width = 15
        for (let i = 1; i <= allDates.length; i++) {
          shiftSheet.getColumn(FIXED_COLS + i).width = 12
        }
      }

      // ========== SHEET 2: TỔNG GIỜ LÀM (SIMPLE FORMAT) ==========
      if (!sheetType || sheetType === 'total_hours') {
        const summarySheet = workbook.addWorksheet('Tổng giờ làm')

        // Title rows
        const titleRow = summarySheet.addRow(['BÁO CÁO TỔNG GIỜ LÀM'])
        titleRow.font = titleFont
        titleRow.height = 25
        summarySheet.mergeCells(1, 1, 1, FIXED_COLS + allDates.length + SUMMARY_COLS)

        const dateRangeRow = summarySheet.addRow([`Khoảng thời gian: ${dateRangeStr}`])
        dateRangeRow.font = normalFont
        summarySheet.mergeCells(2, 1, 2, FIXED_COLS + allDates.length + SUMMARY_COLS)

        summarySheet.addRow([]) // Empty row

        // Header Row 1: Fixed cols + Dates (dd/MM) + Summary cols
        const headerRow1Values: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => {
          headerRow1Values.push(formatDate(date, 'dd/MM'))
        })
        headerRow1Values.push('Tổng ngày', 'Tổng giờ')
        const headerRow1 = summarySheet.addRow(headerRow1Values)
        headerRow1.font = headerFont
        headerRow1.height = 20

        // Header Row 2: Empty for fixed + Day of week (already have dayNames) + Empty for summary
        const headerRow2Values: any[] = ['', '', '']
        allDates.forEach(date => {
          const dayOfWeek = date.getDay()
          headerRow2Values.push(dayNames[dayOfWeek])
        })
        headerRow2Values.push('', '')
        const headerRow2 = summarySheet.addRow(headerRow2Values)
        headerRow2.font = { ...headerFont, size: 9 }

        // Merge fixed column headers vertically (rows 4-5)
        summarySheet.mergeCells(4, 1, 5, 1) // STT
        summarySheet.mergeCells(4, 2, 5, 2) // Nhân viên
        summarySheet.mergeCells(4, 3, 5, 3) // Kho
        // Merge summary column headers vertically (summaryStartCol defined above)
        summarySheet.mergeCells(4, summaryStartCol, 5, summaryStartCol)     // Tổng ngày
        summarySheet.mergeCells(4, summaryStartCol + 1, 5, summaryStartCol + 1) // Tổng giờ

          // Style header rows + highlight weekends
          ;[headerRow1, headerRow2].forEach((row, rowIdx) => {
            row.eachCell((cell, colNumber) => {
              cell.border = borderStyle
              cell.alignment = { horizontal: 'center', vertical: 'middle' }

              // Highlight weekend columns (Sat/Sun) with yellow
              if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
                const dateIdx = colNumber - FIXED_COLS - 1
                const date = allDates[dateIdx]
                if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } } // Yellow
                }
              }
            })
          })

        // Data rows for Summary Sheet
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const rowValues: any[] = [stt++, info.fullName, info.warehouse]

          let totalDays = 0
          let totalHours = 0

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            const records = userData.get(dateKey) || []
            let dayTotalHours = 0

            records.forEach((r: any) => {
              if (r.status !== 'ABSENT' || r.checkInTime) {
                const h = parseFloat(r.duration || '0')
                dayTotalHours += h
              }
            })

            if (dayTotalHours > 0) {
              // Format as HH:MM
              const wholeHours = Math.floor(dayTotalHours)
              const minutes = Math.round((dayTotalHours - wholeHours) * 60)
              rowValues.push(`${wholeHours}:${minutes.toString().padStart(2, '0')}`)

              // Count as 1 work day regardless of how many shifts
              totalDays++
              totalHours += dayTotalHours
            } else {
              rowValues.push('')
            }
          })

          rowValues.push(totalDays > 0 ? totalDays : '')

          if (totalHours > 0) {
            const totalWholeHours = Math.floor(totalHours)
            const totalMinutes = Math.round((totalHours - totalWholeHours) * 60)
            rowValues.push(`${totalWholeHours}:${totalMinutes.toString().padStart(2, '0')}`)
          } else {
            rowValues.push('')
          }

          const dataRow = summarySheet.addRow(rowValues)
          dataRow.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle' }

            // Highlight weekend columns
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }
          })
          // Left align name columns
          dataRow.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          dataRow.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths
        summarySheet.getColumn(1).width = 5   // STT
        summarySheet.getColumn(2).width = 22  // Tên
        summarySheet.getColumn(3).width = 15  // Kho
        for (let i = 1; i <= allDates.length; i++) {
          summarySheet.getColumn(FIXED_COLS + i).width = 8  // Date columns
        }
        summarySheet.getColumn(summaryStartCol).width = 10      // Tổng ngày
        summarySheet.getColumn(summaryStartCol + 1).width = 10  // Tổng giờ
      }

      // ========== SHEET 3: ĐI MUỘN / VỀ SỚM (MATRIX LAYOUT) ==========
      if (!sheetType || sheetType === 'late_early') {
        const lateEarlySheet = workbook.addWorksheet('Đi muộn - Về sớm')
        addTitleToSheet(lateEarlySheet, 'BÁO CÁO ĐI MUỘN / VỀ SỚM')

        // Header Row 1: Fixed cols + Dates (dd/MM) + Summary cols (4 columns now)
        const leHeaderRow1Values: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => {
          leHeaderRow1Values.push(formatDate(date, 'dd/MM'))
        })
        leHeaderRow1Values.push('Lần trễ', 'Phút trễ', 'Lần về sớm', 'Phút về sớm')
        const leHeaderRow1 = lateEarlySheet.addRow(leHeaderRow1Values)
        leHeaderRow1.font = headerFont
        leHeaderRow1.height = 20

        // Header Row 2: Day Names
        const leHeaderRow2Values: any[] = ['', '', '']
        allDates.forEach(date => {
          leHeaderRow2Values.push(dayNames[date.getDay()])
        })
        leHeaderRow2Values.push('', '', '', '')
        const leHeaderRow2 = lateEarlySheet.addRow(leHeaderRow2Values)
        leHeaderRow2.font = { ...headerFont, size: 9 }

        // Merge headers
        lateEarlySheet.mergeCells(4, 1, 5, 1) // STT
        lateEarlySheet.mergeCells(4, 2, 5, 2) // Nhân viên
        lateEarlySheet.mergeCells(4, 3, 5, 3) // Kho
        // Summary columns (4 columns)
        const leSummaryStartCol = FIXED_COLS + allDates.length + 1
        lateEarlySheet.mergeCells(4, leSummaryStartCol, 5, leSummaryStartCol)         // Lần trễ
        lateEarlySheet.mergeCells(4, leSummaryStartCol + 1, 5, leSummaryStartCol + 1) // Phút trễ
        lateEarlySheet.mergeCells(4, leSummaryStartCol + 2, 5, leSummaryStartCol + 2) // Lần sớm
        lateEarlySheet.mergeCells(4, leSummaryStartCol + 3, 5, leSummaryStartCol + 3) // Phút sớm

          // Style headers
          ;[leHeaderRow1, leHeaderRow2].forEach(row => {
            row.eachCell((cell, colNumber) => {
              cell.border = borderStyle
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              // Highlight weekend
              if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
                const dateIdx = colNumber - FIXED_COLS - 1
                const date = allDates[dateIdx]
                if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
                }
              }
            })
          })

        // Data Rows for Late/Early
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const rowValues: any[] = [stt++, info.fullName, info.warehouse]

          let lateCount = 0
          let lateMinutesTotal = 0
          let earlyCount = 0
          let earlyMinutesTotal = 0

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            const records = userData.get(dateKey) || []
            let cellValue = ''
            const cellParts: string[] = []

            records.forEach((record: any) => {
              const shiftCode = record.workShift?.code || ''
              const parts: string[] = []
              if (record.lateMinutes > 0) {
                parts.push(`Trễ ${record.lateMinutes}p`)
                lateCount++
                lateMinutesTotal += record.lateMinutes
              }
              if (record.earlyMinutes > 0) {
                parts.push(`Về sớm ${record.earlyMinutes}p`)
                earlyCount++
                earlyMinutesTotal += record.earlyMinutes
              }
              if (parts.length > 0) {
                cellParts.push(shiftCode ? `${shiftCode}: ${parts.join(', ')}` : parts.join(', '))
              }
            })

            if (cellParts.length > 0) {
              cellValue = cellParts.join('\n')
            }
            rowValues.push(cellValue)
          })

          // 4 summary columns: late count, late minutes, early count, early minutes
          rowValues.push(lateCount > 0 ? lateCount : '')
          rowValues.push(lateMinutesTotal > 0 ? lateMinutesTotal : '')
          rowValues.push(earlyCount > 0 ? earlyCount : '')
          rowValues.push(earlyMinutesTotal > 0 ? earlyMinutesTotal : '')

          const row = lateEarlySheet.addRow(rowValues)
          row.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
            // Highlight weekend
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }
            // Highlight Late/Early cells
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length && cell.value) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFCCCC' } } // Light Red
            }
          })
          // Left align name
          row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths for Late/Early
        lateEarlySheet.getColumn(1).width = 5
        lateEarlySheet.getColumn(2).width = 22
        lateEarlySheet.getColumn(3).width = 15
        for (let i = 1; i <= allDates.length; i++) {
          lateEarlySheet.getColumn(FIXED_COLS + i).width = 15
        }
        lateEarlySheet.getColumn(leSummaryStartCol).width = 8      // Lần trễ
        lateEarlySheet.getColumn(leSummaryStartCol + 1).width = 8  // Phút trễ
        lateEarlySheet.getColumn(leSummaryStartCol + 2).width = 10  // Lần về sớm
        lateEarlySheet.getColumn(leSummaryStartCol + 3).width = 10  // Phút về sớm
      }

      // ========== SHEET 4: CHI TIẾT ĐỔI CA / LÀM THAY (MATRIX LAYOUT) ==========
      if (!sheetType || sheetType === 'swap_replace') {
        const swapSheet = workbook.addWorksheet('Đổi ca - Làm thay')
        addTitleToSheet(swapSheet, 'BÁO CÁO ĐỔI CA / LÀM THAY')

        // Header Row 1
        const swHeaderRow1Values: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => swHeaderRow1Values.push(formatDate(date, 'dd/MM')))
        swHeaderRow1Values.push('Tổng lần')
        const swHeaderRow1 = swapSheet.addRow(swHeaderRow1Values)
        swHeaderRow1.font = headerFont
        swHeaderRow1.height = 20

        // Header Row 2
        const swHeaderRow2Values: any[] = ['', '', '']
        allDates.forEach(date => swHeaderRow2Values.push(dayNames[date.getDay()]))
        swHeaderRow2Values.push('')
        const swHeaderRow2 = swapSheet.addRow(swHeaderRow2Values)
        swHeaderRow2.font = { ...headerFont, size: 9 }

        // Merge headers
        swapSheet.mergeCells(4, 1, 5, 1)
        swapSheet.mergeCells(4, 2, 5, 2)
        swapSheet.mergeCells(4, 3, 5, 3)
        swapSheet.mergeCells(4, summaryStartCol, 5, summaryStartCol) // Tổng lần

          // Style headers
          ;[swHeaderRow1, swHeaderRow2].forEach(row => {
            row.eachCell((cell, colNumber) => {
              cell.border = borderStyle
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
                const dateIdx = colNumber - FIXED_COLS - 1
                const date = allDates[dateIdx]
                if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
                }
              }
            })
          })

        // Data Rows for Swap
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const rowValues: any[] = [stt++, info.fullName, info.warehouse]

          let totalCount = 0

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            // const records = userData.get(dateKey) || []

            // Construct map key: userId_dateKey (e.g. "uuid_2025-01-01")
            // Note: userData keys are "userId_warehouseId"
            // Better approach: When creating userDataMap, store ID in _info
            const uId = info.id
            const mapKey = `${uId}_${dateKey}`

            const swaps = allSwapRequestsMap.get(mapKey)
            let cellValue = ''

            if (swaps && swaps.length > 0) {
              totalCount += swaps.length
              const lines: string[] = []

              swaps.forEach((swap: any) => {
                const { swapType, direction, swapWith, requesterShiftCode, targetShiftCode, status } = swap

                // Add status indicator if not approved
                const statusSuffix = status !== 'APPROVED' ? ` (${status})` : ''

                if (swapType === 'REPLACE') {
                  if (direction === 'gave_away') {
                    lines.push(`Nhờ thay [${requesterShiftCode}] -> ${swapWith}${statusSuffix}`)
                  } else {
                    lines.push(`Làm thay [${requesterShiftCode}] <- ${swapWith}${statusSuffix}`)
                  }
                } else {
                  if (direction === 'gave_away') {
                    lines.push(`Nhường [${requesterShiftCode}] -> ${swapWith}\nNhận [${targetShiftCode}]${statusSuffix}`)
                  } else {
                    lines.push(`Nhận [${requesterShiftCode}] <- ${swapWith}\nNhường [${targetShiftCode}]${statusSuffix}`)
                  }
                }
              })
              cellValue = lines.join('\n---\n')
            }
            rowValues.push(cellValue)
          })

          rowValues.push(totalCount > 0 ? totalCount : '')

          const row = swapSheet.addRow(rowValues)
          row.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }

            // Color Swap/Replace Cells
            if (cell.value && typeof cell.value === 'string') {
              if (cell.value.startsWith('Nhường') || cell.value.startsWith('Nhờ')) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFEB99' } } // Light Orange
              } else if (cell.value.startsWith('Nhận') || cell.value.startsWith('Làm')) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFFCC' } } // Light Green
              }
            }
          })
          row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths for Swap
        swapSheet.getColumn(1).width = 5
        swapSheet.getColumn(2).width = 22
        swapSheet.getColumn(3).width = 15
        for (let i = 1; i <= allDates.length; i++) {
          swapSheet.getColumn(FIXED_COLS + i).width = 15 // Wider for swap details
        }
        swapSheet.getColumn(summaryStartCol).width = 10
      }

      // ========== SHEET 5: CHẤM CÔNG HỘ (MATRIX LAYOUT) ==========
      if (!sheetType || sheetType === 'proxy_checkin') {
        const proxySheet = workbook.addWorksheet('Chấm công hộ')
        addTitleToSheet(proxySheet, 'BÁO CÁO CHẤM CÔNG HỘ')

        // Header Row 1
        const prHeaderRow1Values: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => prHeaderRow1Values.push(formatDate(date, 'dd/MM')))
        prHeaderRow1Values.push('Tổng lần')
        const prHeaderRow1 = proxySheet.addRow(prHeaderRow1Values)
        prHeaderRow1.font = headerFont
        prHeaderRow1.height = 20

        // Header Row 2
        const prHeaderRow2Values: any[] = ['', '', '']
        allDates.forEach(date => prHeaderRow2Values.push(dayNames[date.getDay()]))
        prHeaderRow2Values.push('')
        const prHeaderRow2 = proxySheet.addRow(prHeaderRow2Values)
        prHeaderRow2.font = { ...headerFont, size: 9 }

        // Merge headers
        proxySheet.mergeCells(4, 1, 5, 1) // STT
        proxySheet.mergeCells(4, 2, 5, 2) // Nhân viên
        proxySheet.mergeCells(4, 3, 5, 3) // Kho

        // summaryStartCol defined above
        proxySheet.mergeCells(4, summaryStartCol, 5, summaryStartCol)

          // Style headers
          ;[prHeaderRow1, prHeaderRow2].forEach(row => {
            row.eachCell((cell, colNumber) => {
              cell.border = borderStyle
              cell.alignment = { horizontal: 'center', vertical: 'middle' }
              if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
                const dateIdx = colNumber - FIXED_COLS - 1
                const date = allDates[dateIdx]
                if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
                }
              }
            })
          })

        // Data Rows for Proxy
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const rowValues: any[] = [stt++, info.fullName, info.warehouse]

          let totalCount = 0

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            const records = userData.get(dateKey) || []
            let cellValue = ''
            const proxyNames: string[] = []

            records.forEach((record: any) => {
              if (record && record.proxyBy) {
                proxyNames.push(record.proxyBy)
                totalCount++
              }
            })

            if (proxyNames.length > 0) {
              cellValue = [...new Set(proxyNames)].join(', ')
            }
            rowValues.push(cellValue)
          })

          rowValues.push(totalCount > 0 ? totalCount : '')

          const row = proxySheet.addRow(rowValues)
          row.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }

            // Highlight Proxy Cells
            if (cell.value) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6FA' } } // Lavender
            }
          })
          row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths for Proxy
        proxySheet.getColumn(1).width = 5
        proxySheet.getColumn(2).width = 22
        proxySheet.getColumn(3).width = 15
        for (let i = 1; i <= allDates.length; i++) {
          proxySheet.getColumn(FIXED_COLS + i).width = 15
        }
        proxySheet.getColumn(summaryStartCol).width = 10
      }

      // ========== SHEET 6: NGHỈ PHÉP (LEAVE REQUESTS) - Matrix Layout ==========
      if (!sheetType || sheetType === 'leave') {
        const leaveSheet = workbook.addWorksheet('Nghỉ phép')
        addTitleToSheet(leaveSheet, 'BÁO CÁO NGHỈ PHÉP')

        // Header row with dates (same as other sheets)
        const leaveHeaderValues: any[] = ['STT', 'Nhân viên', 'Kho']
        allDates.forEach(date => {
          const dayOfWeek = formatDate(date, 'EEE', { locale: vi })
          const dayNum = formatDate(date, 'dd')
          leaveHeaderValues.push(`${dayOfWeek}\n${dayNum}`)
        })
        leaveHeaderValues.push('Tổng')

        const leaveHeaderRow = leaveSheet.addRow(leaveHeaderValues)
        leaveHeaderRow.font = headerFont
        leaveHeaderRow.height = 35
        leaveHeaderRow.eachCell((cell, colNumber) => {
          cell.border = borderStyle
          cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }

          // Highlight weekends
          if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
            const dateIdx = colNumber - FIXED_COLS - 1
            const date = allDates[dateIdx]
            if (date && (date.getDay() === 0 || date.getDay() === 6)) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
            }
          }
        })

        // Build approved leave map by user
        const approvedLeaveByUser = new Map<string, Map<string, boolean>>()
        leaveRequests
          .filter(leave => leave.status === 'APPROVED')
          .forEach(leave => {
            const userId = leave.user_id
            const dateKey = getVNDateKey(leave.leave_date)

            if (!approvedLeaveByUser.has(userId)) {
              approvedLeaveByUser.set(userId, new Map())
            }
            approvedLeaveByUser.get(userId)!.set(dateKey, true)
          })

        // Data Rows - use same userDataMap as other sheets
        stt = 1
        userDataMap.forEach(userData => {
          const info = userData.get('_info')![0]
          const userId = info.id
          const userLeaves = approvedLeaveByUser.get(userId)

          // Skip users with no approved leaves
          if (!userLeaves || userLeaves.size === 0) return

          const rowValues: any[] = [stt++, info.fullName, info.warehouse]
          let totalLeaves = 0

          allDates.forEach(date => {
            const dateKey = getVNDateKey(date)
            if (userLeaves.has(dateKey)) {
              rowValues.push('Nghỉ phép')
              totalLeaves++
            } else {
              rowValues.push('')
            }
          })

          rowValues.push(totalLeaves > 0 ? totalLeaves : '')

          const row = leaveSheet.addRow(rowValues)
          row.eachCell((cell, colNumber) => {
            cell.border = borderStyle
            cell.font = normalFont
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }

            // Highlight weekends
            if (colNumber > FIXED_COLS && colNumber <= FIXED_COLS + allDates.length) {
              const dateIdx = colNumber - FIXED_COLS - 1
              const date = allDates[dateIdx]
              if (date && (date.getDay() === 0 || date.getDay() === 6)) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
              }
            }

            // Highlight leave cells
            if (cell.value === 'Nghỉ phép') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF90EE90' } } // Light green
              cell.font = { ...normalFont, bold: true }
            }
          })
          row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
          row.getCell(3).alignment = { horizontal: 'left', vertical: 'middle' }
        })

        // Column widths for Leave
        leaveSheet.getColumn(1).width = 5
        leaveSheet.getColumn(2).width = 22
        leaveSheet.getColumn(3).width = 15
        for (let i = 1; i <= allDates.length; i++) {
          leaveSheet.getColumn(FIXED_COLS + i).width = 10
        }
        leaveSheet.getColumn(FIXED_COLS + allDates.length + 1).width = 8
      }

      // ========== GENERATE BUFFER ==========
      const buffer = await workbook.xlsx.writeBuffer()
      const dateFileName = startDate && endDate
        ? `${formatDate(new Date(startDate), 'ddMMyyyy')}-${formatDate(new Date(endDate), 'ddMMyyyy')}`
        : new Date().toISOString().split('T')[0]

      // Get report type name for filename
      const reportTypeNames: Record<string, string> = {
        'shift_schedule': 'ca-lam',
        'total_hours': 'tong-gio',
        'late_early': 'di-muon-ve-som',
        'swap_replace': 'doi-ca',
        'proxy_checkin': 'cham-ho',
        'leave': 'nghi-phep'
      }
      const reportTypeSuffix = sheetType ? `-${reportTypeNames[sheetType] || 'bao-cao'}` : ''
      const fileName = `bao-cao-cham-cong${reportTypeSuffix}-${dateFileName}.xlsx`

      return new Response(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${fileName}"`
        }
      })
    }

    // Return JSON format
    return NextResponse.json({
      success: true,
      data: allRecords,
      total: allRecords.length,
      filters: {
        warehouseId,
        userId,
        startDate,
        endDate,
        status
      }
    })
  } catch (error: any) {
    console.error('[API HR attendance reports GET] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}
