import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin, isGeneralManager, isHR, isAttendanceStaff, canAccessWarehouse } from "@/lib/auth"

// GET /api/shifts/assignments/calendar - Get weekly calendar data
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || (!isWarehouseManager(user) && !isAdmin(user) && !isGeneralManager(user) && !isHR(user) && !isAttendanceStaff(user))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Manager or HR access required" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get("startDate")
    const endDate = searchParams.get("endDate")
    const warehouseId = searchParams.get("warehouseId") || user.warehouseId

    if (!startDate || !endDate) {
      return NextResponse.json(
        { success: false, error: "startDate and endDate are required" },
        { status: 400 }
      )
    }

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "Warehouse ID is required" },
        { status: 400 }
      )
    }

    // Check warehouse access - use canAccessWarehouse for proper GENERAL_MANAGER support
    if (!canAccessWarehouse(user, warehouseId)) {
      return NextResponse.json(
        { success: false, error: "You can only view warehouses you have access to" },
        { status: 403 }
      )
    }

    // Fetch warehouse type to enforce specific restrictions
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
      select: { type: true, name: true }
    })

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "Warehouse not found" },
        { status: 404 }
      )
    }

    // HR SECURITY RESTRICTION:
    // HR accounts should NOT see attendance data for Franchise (PARTNER) or Main (MAIN) warehouses.
    // They are typically responsible for Store warehouses/office staff only, or have restricted scope.
    if (isHR(user)) {
      if (warehouse.type === "PARTNER" || warehouse.type === "MAIN") {
        return NextResponse.json(
          { success: false, error: "Unauthorized - HR cannot view attendance for Partner or Main warehouses" },
          { status: 403 }
        )
      }
    }

    // Get all active work shifts
    const shiftsData = await prisma.work_shifts.findMany({
      where: {
        is_active: true,
      },
      orderBy: {
        start_time: "asc",
      },
    })

    // Serialize Time fields to strings (HH:MM:SS format)
    const shifts = shiftsData.map((shift) => ({
      ...shift,
      start_time: shift.start_time instanceof Date
        ? shift.start_time.toISOString().substr(11, 8)
        : shift.start_time,
      end_time: shift.end_time instanceof Date
        ? shift.end_time.toISOString().substr(11, 8)
        : shift.end_time,
    }))

    // Get all warehouse users (include managers and potential other roles that might check in)
    let users = await prisma.users.findMany({
      where: {
        warehouse_id: warehouseId,
        // is_active: true, // Removed to show inactive users who have assignments/sessions
        // Broaden the role filter to include managers and generic staff
        role: {
          // STRICT FILTER: Only show warehouse and attendance staff. 
          // Exclude generic 'STAFF' (often Sales/Office) and Managers (unless they have assignments).
          in: ["WAREHOUSE_STAFF", "ATTENDANCE_STAFF"],
        },
      },
      select: {
        id: true,
        full_name: true,
        email: true,
        role: true,
        employment_type: true,
        work_status: true,
      },
      orderBy: {
        full_name: "asc",
      },
    })

    // Get all assignments for the date range
    const assignmentsData = await prisma.shift_assignments.findMany({
      where: {
        warehouse_id: warehouseId,
        assigned_date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        work_shifts: true,
        users_assigned: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true,
            employment_type: true,
            work_status: true,
          },
        },
      },
    })

    // Serialize Time fields in work_shifts within assignments
    const assignments = assignmentsData.map((assignment) => ({
      ...assignment,
      id: assignment.id, // FORCE ID to be present
      work_shifts: assignment.work_shifts
        ? {
          ...assignment.work_shifts,
          start_time: assignment.work_shifts.start_time instanceof Date
            ? assignment.work_shifts.start_time.toISOString().substr(11, 8)
            : assignment.work_shifts.start_time,
          end_time: assignment.work_shifts.end_time instanceof Date
            ? assignment.work_shifts.end_time.toISOString().substr(11, 8)
            : assignment.work_shifts.end_time,
        }
        : null,
    }))

    // Collect all relevant user IDs first to ensure we get their sessions even if recorded elsewhere
    const userIds = users.map(u => u.id)
    if (assignmentsData.length > 0) {
      assignmentsData.forEach(a => userIds.push(a.user_id))
    }
    const uniqueUserIds = Array.from(new Set(userIds))

    // Get all attendance sessions for the date range
    // MATCHING LOGIC: Find sessions recorded at this warehouse OR sessions by users OF this warehouse (assigned here)
    // This ensures that if a user assigned here checks in somewhere else (validly), we still see it.
    const attendanceSessions = await prisma.attendance_sessions.findMany({
      where: {
        AND: [
          {
            session_date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            }
          },
          {
            OR: [
              { warehouse_id: warehouseId },
              { user_id: { in: uniqueUserIds } }
            ]
          }
        ]
      },
      select: {
        id: true,
        user_id: true,
        session_date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        work_shift_id: true,
        shift_assignment_id: true,
        notes: true,
        actual_duration: true,
        // Include user info to populate missing users later
        users_attendance_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true,
            employment_type: true,
            work_status: true,
          }
        }
      },
      orderBy: { check_in_time: 'desc' }
    })

    // Get legacy shift_sessions for the date range
    const legacySessions = await prisma.shift_sessions.findMany({
      where: {
        AND: [
          {
            session_date: {
              gte: new Date(startDate),
              lte: new Date(endDate),
            }
          },
          {
            OR: [
              { warehouse_id: warehouseId },
              { user_id: { in: uniqueUserIds } }
            ]
          }
        ]
      },
      select: {
        id: true,
        user_id: true,
        session_date: true,
        check_in_time: true,
        check_out_time: true,
        status: true,
        work_shift_id: true,
        shift_assignment_id: true, // CRITICAL: Include this to properly link session to assignment
        notes: true,
        actual_duration: true,
        users_shift_sessions_user_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true,
            role: true,
            employment_type: true,
            work_status: true,
          }
        }
      },
    })

    // Merge sessions: Legacy < New (AttendanceSessions override Legacy if exist for same user/date AND same assignment/shift)
    // CRITICAL FIX: Use assignment_id in key to support multiple shifts per day
    const sessionMap = new Map()

    // Add legacy sessions first
    legacySessions.forEach(session => {
      // Use a composite key of user_id + date + assignment_id (if exists) or work_shift_id
      const dateKey = session.session_date instanceof Date
        ? session.session_date.toISOString().split('T')[0]
        : new Date(session.session_date).toISOString().split('T')[0]

      // If no assignment ID or shift ID, fallback to date (risk of overwrite but best effort for legacy)
      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'legacy'
      const key = `${session.user_id}_${dateKey}_${uniqueId}`

      // Remap legacy session user object to match the structure expected by the frontend/additionalUsersMap
      const mappedSession = {
        ...session,
        users_attendance_sessions_user_idTousers: session.users_shift_sessions_user_idTousers
      }

      sessionMap.set(key, mappedSession)
    })

    // Override with new attendance sessions
    attendanceSessions.forEach(session => {
      const dateKey = session.session_date instanceof Date
        ? session.session_date.toISOString().split('T')[0]
        : new Date(session.session_date).toISOString().split('T')[0]

      const uniqueId = session.shift_assignment_id || session.work_shift_id || 'new'
      // If we have a truly unique ID (assignment_id), use it. 
      // This ensures 2 assignments on same day (different IDs) get stored as separate entries.
      const key = `${session.user_id}_${dateKey}_${uniqueId}`

      // Only overwrite if existing is not checked-in OR new one is checked-in
      // (Priority to sessions with check-in time)
      const existing = sessionMap.get(key)
      if (!existing || session.check_in_time || !existing.check_in_time) {
        sessionMap.set(key, session)
      }
    })

    const sessions = Array.from(sessionMap.values())

    // Collect all user IDs from sources: initial users list, assignments, and sessions
    const existingUserIds = new Set(users.map(u => u.id))
    const additionalUsersMap = new Map()

    // Add users from assignments who are not in the list
    assignmentsData.forEach(assignment => {
      if (assignment.users_assigned && !existingUserIds.has(assignment.users_assigned.id)) {
        additionalUsersMap.set(assignment.users_assigned.id, assignment.users_assigned)
      }
    })

    // Add users from sessions who are not in the list
    sessions.forEach((session: any) => {
      if (session.users_attendance_sessions_user_idTousers && !existingUserIds.has(session.users_attendance_sessions_user_idTousers.id)) {
        additionalUsersMap.set(session.users_attendance_sessions_user_idTousers.id, session.users_attendance_sessions_user_idTousers)
      }
    })

    // Determine final list of users
    // If there are additional users, merge them
    if (additionalUsersMap.size > 0) {
      const additionalUsers = Array.from(additionalUsersMap.values())
        .filter((u: any) => ["WAREHOUSE_STAFF", "ATTENDANCE_STAFF"].includes(u.role)) // STRICT FILTER for additional users too
        .map((u: any) => ({
          id: u.id,
          full_name: u.full_name,
          email: u.email,
          role: u.role,
          employment_type: u.employment_type,
          work_status: u.work_status
        }))
      users = [...users, ...additionalUsers].sort((a, b) => a.full_name.localeCompare(b.full_name))
    }

    // Get pending/rejected registration requests for the date range
    const pendingRequestsData = await prisma.shift_registration_requests.findMany({
      where: {
        warehouse_id: warehouseId,
        requested_date: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
        status: { in: ["PENDING", "REJECTED"] },
      },
      include: {
        work_shifts: true,
        users_requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
    })

    // Serialize pending requests
    const pendingRequests = pendingRequestsData.map((req) => ({
      ...req,
      work_shifts: req.work_shifts
        ? {
          ...req.work_shifts,
          start_time: req.work_shifts.start_time instanceof Date
            ? req.work_shifts.start_time.toISOString().substr(11, 8)
            : req.work_shifts.start_time,
          end_time: req.work_shifts.end_time instanceof Date
            ? req.work_shifts.end_time.toISOString().substr(11, 8)
            : req.work_shifts.end_time,
        }
        : null,
    }))

    return NextResponse.json({
      success: true,
      data: {
        shifts,
        users,
        assignments,
        sessions,
        pendingRequests,
      },
    })
  } catch (error) {
    console.error("Error fetching calendar data:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
