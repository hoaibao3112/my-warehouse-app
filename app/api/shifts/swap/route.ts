import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin } from "@/lib/auth"
import { getVietnamToday, addDays } from "@/lib/server-time"

// POST /api/shifts/swap - Create shift swap request
// Flow: Requester selects their shift (date + work_shift) AND the target shift they want
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { requester_date, work_shift_id, target_date, target_work_shift_id, requester_reason, swap_type } = body

    // Debug log
    console.log('Swap request body:', { requester_date, work_shift_id, target_date, target_work_shift_id, swap_type })

    // Validate swap_type
    const validSwapType = swap_type === 'REPLACE' ? 'REPLACE' : 'SWAP'

    // Validate required fields based on swap type
    if (!requester_date || !work_shift_id) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn ca muốn đổi" },
        { status: 400 }
      )
    }

    // For SWAP type, need target shift
    if (validSwapType === 'SWAP') {
      if (!target_date || !target_work_shift_id || (typeof target_work_shift_id === 'string' && target_work_shift_id.trim() === '')) {
        return NextResponse.json(
          { success: false, error: "Vui lòng chọn ca muốn nhận" },
          { status: 400 }
        )
      }
    }

    // Validate reason is required
    if (!requester_reason || requester_reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập lý do đổi ca" },
        { status: 400 }
      )
    }

    // For REPLACE type, set target to same as source if not provided
    const finalTargetDate = validSwapType === 'REPLACE' ? requester_date : target_date
    const finalTargetWorkShiftId = validSwapType === 'REPLACE' ? work_shift_id : target_work_shift_id

    // Validate reason is required
    if (!requester_reason || requester_reason.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng nhập lý do đổi ca" },
        { status: 400 }
      )
    }

    // Validate dates are not in the past - use UTC-based dates for consistency
    const today = getVietnamToday()
    const tomorrow = addDays(today, 1)

    // Parse dates as UTC to match database Date type
    const requesterDate = new Date(requester_date + 'T00:00:00.000Z')

    // Must create request at least 1 day before the shift date
    // Example: Today is 25/12, can create request for shifts from 26/12 onwards
    if (requesterDate < tomorrow) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu đổi ca phải được tạo trước ít nhất 1 ngày. Bạn chỉ có thể tạo yêu cầu cho ca từ ngày " + tomorrow.toLocaleDateString('vi-VN') + " trở đi." },
        { status: 400 }
      )
    }

    // For SWAP type, validate target date and check same shift
    if (validSwapType === 'SWAP') {
      const targetDateParsed = new Date(finalTargetDate + 'T00:00:00.000Z')

      if (targetDateParsed < tomorrow) {
        return NextResponse.json(
          { success: false, error: "Không thể đổi qua ca ngày hôm nay hoặc ngày đã qua" },
          { status: 400 }
        )
      }

      // Cannot swap same shift on same date
      if (requester_date === finalTargetDate && work_shift_id === finalTargetWorkShiftId) {
        return NextResponse.json(
          { success: false, error: "Không thể đổi cùng một ca" },
          { status: 400 }
        )
      }
    }

    // Check if requester has an assignment on the given date with the given shift
    const requesterAssignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id: user.id,
        assigned_date: requesterDate,
        work_shift_id: work_shift_id,
      },
      include: {
        work_shifts: {
          select: {
            id: true,
            warehouse_id: true,
            shift_name: true,
          }
        }
      }
    })

    if (!requesterAssignment) {
      return NextResponse.json(
        { success: false, error: "Bạn không có ca làm việc này vào ngày đã chọn" },
        { status: 400 }
      )
    }

    // Get warehouse_id from the shift
    const warehouseId = requesterAssignment.work_shifts?.warehouse_id

    // Debug logging
    console.log('[Shift Swap POST] User:', user.id)
    console.log('[Shift Swap POST] Shift warehouse_id:', warehouseId)
    console.log('[Shift Swap POST] Swap type:', validSwapType)

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: "Không thể xác định kho cho ca làm việc này" },
        { status: 400 }
      )
    }

    // For SWAP type, verify target shift exists and is in the same warehouse
    if (validSwapType === 'SWAP') {
      const targetShift = await prisma.work_shifts.findFirst({
        where: {
          id: finalTargetWorkShiftId,
          warehouse_id: warehouseId,
          is_active: true,
        }
      })

      if (!targetShift) {
        return NextResponse.json(
          { success: false, error: "Ca muốn nhận không tồn tại hoặc không thuộc kho của bạn" },
          { status: 400 }
        )
      }
    }

    // Check if there's already a pending swap request for this assignment
    const existingSwap = await prisma.shift_swap_requests.findFirst({
      where: {
        requester_user_id: user.id,
        requester_date: requesterDate,
        work_shift_id: work_shift_id,
        status: "PENDING",
      },
    })

    if (existingSwap) {
      return NextResponse.json(
        { success: false, error: "Đã có yêu cầu đổi ca đang chờ xử lý cho ca này" },
        { status: 400 }
      )
    }

    // Create swap request with target info
    const swapRequest = await prisma.shift_swap_requests.create({
      data: {
        requester_user_id: user.id,
        requester_date: requesterDate,
        work_shift_id: work_shift_id,
        warehouse_id: warehouseId,
        // For REPLACE: target_date and target_work_shift_id are same as requester
        // For SWAP: they are different shifts on the same date
        target_date: validSwapType === 'REPLACE' ? requesterDate : new Date(finalTargetDate + 'T00:00:00.000Z'),
        target_work_shift_id: finalTargetWorkShiftId,
        swap_type: validSwapType,
        requester_reason: requester_reason.trim(),
        status: "PENDING",
        // For SWAP: target_user_id will be set when someone accepts
        // For REPLACE: target_user_id will be set when someone accepts to cover the shift
      },
      include: {
        users_requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        work_shifts: {
          select: {
            id: true,
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          }
        },
        target_work_shifts: {
          select: {
            id: true,
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          }
        },
        warehouses: {
          select: {
            id: true,
            name: true,
          }
        }
      },
    })

    return NextResponse.json({
      success: true,
      data: swapRequest,
      message: validSwapType === 'SWAP'
        ? "Yêu cầu đổi ca đã được tạo. Đang chờ đồng nghiệp chấp nhận."
        : "Yêu cầu làm thay ca đã được tạo. Đang chờ quản lý duyệt.",
    })
  } catch (error) {
    console.error("Error creating shift swap request:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Auto-expire and cleanup old pending swap requests
async function cleanupExpiredSwapRequests() {
  try {
    const today = getVietnamToday()

    // Auto-cancel pending requests where:
    // 1. The shift date has arrived (today or past) AND still no one accepted
    // 2. This means if shift is on 12/12, it gets cancelled on 12/12 00:00
    const expiredRequests = await prisma.shift_swap_requests.findMany({
      where: {
        status: "PENDING",
        requester_date: { lte: today }, // Less than or equal to today (shift date has arrived)
        target_user_id: null, // Not yet accepted by anyone
      },
      select: { id: true }
    })

    if (expiredRequests.length > 0) {
      // Update status to EXPIRED (auto-cancelled)
      await prisma.shift_swap_requests.updateMany({
        where: {
          id: { in: expiredRequests.map(r => r.id) }
        },
        data: {
          status: "CANCELLED",
          rejection_reason: "Tự động hủy - Đã đến ngày ca mà chưa có người nhận",
          updated_at: new Date(),
        }
      })
      console.log(`Auto-expired ${expiredRequests.length} swap requests (shift date arrived, no one accepted)`)
    }
  } catch (error) {
    console.error("Error cleaning up expired swap requests:", error)
  }
}

// GET /api/shifts/swap - Get swap requests
// type=sent: my sent requests
// type=available: all pending requests in my warehouse that I can accept
// type=all: all my related requests (both sent and where I'm the target)
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Cleanup expired requests on each fetch
    await cleanupExpiredSwapRequests()

    const { searchParams } = new URL(request.url)
    const status = searchParams.get("status") // PENDING, APPROVED, REJECTED, CANCELLED, EXPIRED
    const type = searchParams.get("type") // "sent", "available", "all"
    const swapType = searchParams.get("swapType") // "SWAP", "REPLACE"
    const warehouseId = searchParams.get("warehouseId") // For HR/Manager filtering
    const employeeSearch = searchParams.get("employeeSearch") // Search by employee name
    const startDate = searchParams.get("startDate") // Filter by date range
    const endDate = searchParams.get("endDate")

    // Get user's warehouse
    const userRecord = await prisma.users.findUnique({
      where: { id: user.id },
      select: { warehouse_id: true, role: true }
    })

    const isHRorManager = userRecord?.role === 'HR' || isWarehouseManager(user) || isAdmin(user)

    // Get user's EXPLICIT warehouse assignments
    // This is the correct way to handle visibility as requested "only users of that warehouse see that warehouse"
    const userAssignments = await prisma.user_warehouse_assignments.findMany({
      where: {
        user_id: user.id
      },
      select: {
        warehouse_id: true
      }
    })

    // Combine profile warehouse + assigned warehouses
    const userWarehouseIds = [
      userRecord?.warehouse_id,
      ...userAssignments.map(a => a.warehouse_id)
    ].filter((id): id is string => Boolean(id))

    // Remove duplicates
    const uniqueWarehouseIds = [...new Set(userWarehouseIds)]

    // Use these IDs for filtering
    const effectiveWarehouseIds = uniqueWarehouseIds

    // Debug logging
    console.log('[Shift Swap GET] ===== DEBUG START =====')
    console.log('[Shift Swap GET] User ID:', user.id)
    console.log('[Shift Swap GET] User Email:', user.email)
    console.log('[Shift Swap GET] Type:', type)
    console.log('[Shift Swap GET] User warehouse_id from profile:', userRecord?.warehouse_id)
    console.log('[Shift Swap GET] User warehouse IDs from assignments:', userWarehouseIds)
    console.log('[Shift Swap GET] Effective warehouse IDs:', effectiveWarehouseIds)
    console.log('[Shift Swap GET] Total assignments found:', userAssignments.length)

    let where: any = {}

    if (type === "sent") {
      // Requests I created
      where.requester_user_id = user.id
    } else if (type === "available") {
      // Pending requests in my warehouse(s) that I can potentially accept
      // (not my own requests, and not yet accepted by anyone)

      // SECURITY: If user has no warehouse, return empty result
      if (effectiveWarehouseIds.length === 0) {
        where.id = '00000000-0000-0000-0000-000000000000' // Force empty result with valid UUID
        console.log('[Shift Swap GET] No warehouse found for user, returning empty')
      } else {
        // SECURITY: Only show requests from user's warehouse(s)
        where = {
          warehouse_id: { in: effectiveWarehouseIds },
          requester_user_id: { not: user.id },
          status: "PENDING",
          target_user_id: null, // Not yet accepted by anyone
        }
        console.log('[Shift Swap GET] Available requests WHERE clause:', JSON.stringify(where, null, 2))
      }
    } else if (type === "all") {
      // HR/Manager can see all requests in their warehouse(s), regular users see only their own
      if (isHRorManager) {
        // HR/Manager: see all requests in their warehouse(s)
        if (warehouseId && warehouseId !== 'all') {
          // Specific warehouse selected
          where.warehouse_id = warehouseId
        } else if (isAdmin(user) || userRecord?.role === 'HR') {
          // ADMIN and Global HR can see all warehouses
          // No warehouse filter
        } else {
          // Warehouse Managers/Lead can only see requests from their warehouse(s)
          // SECURITY: Only see their own warehouse's requests
          if (effectiveWarehouseIds.length > 0) {
            where.warehouse_id = { in: effectiveWarehouseIds }
          } else {
            // No warehouse found, return empty
            where.id = '00000000-0000-0000-0000-000000000000'
          }
        }
        // No requester/target filter - see everything in allowed warehouses
      } else {
        // Regular users: only see requests related to them
        where.OR = [
          { requester_user_id: user.id },
          { target_user_id: user.id },
        ]
      }
    } else {
      // Default: both sent and where I accepted
      where.OR = [
        { requester_user_id: user.id },
        { target_user_id: user.id },
      ]
    }

    // Status filter
    if (status && type !== "available") {
      where.status = status
    }

    // Swap type filter
    if (swapType && (swapType === "SWAP" || swapType === "REPLACE")) {
      where.swap_type = swapType
    }

    // Date range filter
    if (startDate) {
      where.requester_date = {
        ...where.requester_date,
        gte: new Date(startDate + 'T00:00:00.000Z')
      }
    }
    if (endDate) {
      where.requester_date = {
        ...where.requester_date,
        lte: new Date(endDate + 'T00:00:00.000Z')
      }
    }

    // Employee search filter (for HR)
    if (employeeSearch && employeeSearch.trim() && isHRorManager) {
      const searchTerm = employeeSearch.trim()
      where.OR = [
        { users_requester: { full_name: { contains: searchTerm, mode: 'insensitive' } } },
        { users_requester: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { users_target: { full_name: { contains: searchTerm, mode: 'insensitive' } } },
        { users_target: { email: { contains: searchTerm, mode: 'insensitive' } } },
      ]
    }

    const swapRequests = await prisma.shift_swap_requests.findMany({
      where,
      include: {
        users_requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        users_target: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        users_approver: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
        work_shifts: {
          select: {
            id: true,
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          }
        },
        target_work_shifts: {
          select: {
            id: true,
            shift_name: true,
            shift_code: true,
            start_time: true,
            end_time: true,
          }
        },
        warehouses: {
          select: {
            id: true,
            name: true,
          }
        }
      },
      orderBy: {
        created_at: "desc",
      },
    })

    // Debug: Log results
    if (type === "available") {
      console.log('[Shift Swap GET] Found', swapRequests.length, 'available requests')
      swapRequests.forEach((req, idx) => {
        console.log(`[Shift Swap GET] Request ${idx + 1}:`, {
          id: req.id,
          warehouse_id: req.warehouse_id,
          warehouse_name: req.warehouses?.name,
          requester: req.users_requester.email,
          status: req.status
        })
      })
      console.log('[Shift Swap GET] ===== DEBUG END =====')
    }

    // For "available" type, include user's shifts so they can select which to offer
    if (type === "available") {
      const today = getVietnamToday()

      // Filter out expired requests (requester_date has passed)
      const validRequests = swapRequests.filter(req => {
        const reqDateRaw = new Date(req.requester_date)
        const reqDate = new Date(Date.UTC(
          reqDateRaw.getUTCFullYear(),
          reqDateRaw.getUTCMonth(),
          reqDateRaw.getUTCDate(),
          0, 0, 0, 0
        ))
        return reqDate >= today
      })

      const userAssignments = await prisma.shift_assignments.findMany({
        where: {
          user_id: user.id,
          assigned_date: { gte: today },
        },
        include: {
          work_shifts: {
            select: {
              id: true,
              shift_name: true,
              shift_code: true,
              start_time: true,
              end_time: true,
            }
          }
        },
        orderBy: {
          assigned_date: "asc",
        }
      })

      // Format shift times for available requests
      const formattedValidRequests = validRequests.map(req => ({
        ...req,
        work_shifts: req.work_shifts ? {
          ...req.work_shifts,
          start_time: req.work_shifts.start_time instanceof Date
            ? req.work_shifts.start_time.toISOString().substring(11, 19)
            : String(req.work_shifts.start_time).substring(0, 8),
          end_time: req.work_shifts.end_time instanceof Date
            ? req.work_shifts.end_time.toISOString().substring(11, 19)
            : String(req.work_shifts.end_time).substring(0, 8),
        } : null,
        target_work_shifts: req.target_work_shifts ? {
          ...req.target_work_shifts,
          start_time: req.target_work_shifts.start_time instanceof Date
            ? req.target_work_shifts.start_time.toISOString().substring(11, 19)
            : String(req.target_work_shifts.start_time).substring(0, 8),
          end_time: req.target_work_shifts.end_time instanceof Date
            ? req.target_work_shifts.end_time.toISOString().substring(11, 19)
            : String(req.target_work_shifts.end_time).substring(0, 8),
        } : null,
      }))

      return NextResponse.json({
        success: true,
        data: formattedValidRequests,
        userAssignments: userAssignments.map(a => ({
          id: a.id,
          date: a.assigned_date,
          work_shift_id: a.work_shift_id,
          work_shifts: a.work_shifts ? {
            ...a.work_shifts,
            start_time: a.work_shifts.start_time instanceof Date
              ? a.work_shifts.start_time.toISOString().substring(11, 19)
              : String(a.work_shifts.start_time).substring(0, 8),
            end_time: a.work_shifts.end_time instanceof Date
              ? a.work_shifts.end_time.toISOString().substring(11, 19)
              : String(a.work_shifts.end_time).substring(0, 8),
          } : null,
        })),
      })
    }

    // Format shift times to prevent timezone issues
    const formattedRequests = swapRequests.map(req => ({
      ...req,
      work_shifts: req.work_shifts ? {
        ...req.work_shifts,
        start_time: req.work_shifts.start_time instanceof Date
          ? req.work_shifts.start_time.toISOString().substring(11, 19)
          : String(req.work_shifts.start_time).substring(0, 8),
        end_time: req.work_shifts.end_time instanceof Date
          ? req.work_shifts.end_time.toISOString().substring(11, 19)
          : String(req.work_shifts.end_time).substring(0, 8),
      } : null,
      target_work_shifts: req.target_work_shifts ? {
        ...req.target_work_shifts,
        start_time: req.target_work_shifts.start_time instanceof Date
          ? req.target_work_shifts.start_time.toISOString().substring(11, 19)
          : String(req.target_work_shifts.start_time).substring(0, 8),
        end_time: req.target_work_shifts.end_time instanceof Date
          ? req.target_work_shifts.end_time.toISOString().substring(11, 19)
          : String(req.target_work_shifts.end_time).substring(0, 8),
      } : null,
    }))

    return NextResponse.json({
      success: true,
      data: formattedRequests,
    })
  } catch (error) {
    console.error("Error fetching swap requests:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
