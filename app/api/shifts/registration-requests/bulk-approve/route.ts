import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

// POST /api/shifts/registration-requests/bulk-approve - Approve multiple requests at once
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Only managers, general managers and admins can approve requests
    const allowedRoles = ["ADMIN", "MANAGER", "WAREHOUSE_MANAGER", "GENERAL_MANAGER"]
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json(
        { success: false, error: "Only managers can approve registration requests" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { request_ids, notes } = body

    if (!request_ids || !Array.isArray(request_ids) || request_ids.length === 0) {
      return NextResponse.json(
        { success: false, error: "Vui lòng chọn ít nhất một yêu cầu" },
        { status: 400 }
      )
    }

    // Get all pending requests
    const pendingRequests = await prisma.shift_registration_requests.findMany({
      where: {
        id: { in: request_ids },
        status: "PENDING",
      },
      include: {
        users_requester: {
          select: { id: true, full_name: true },
        },
        work_shifts: true,
      },
    })

    if (pendingRequests.length === 0) {
      return NextResponse.json(
        { success: false, error: "Không có yêu cầu nào đang chờ duyệt" },
        { status: 400 }
      )
    }

    const results = {
      approved: [] as string[],
      failed: [] as { id: string; name: string; reason: string }[],
    }

    // Process each request
    for (const req of pendingRequests) {
      try {
        // Check if user already has an assignment for this date
        const existingAssignment = await prisma.shift_assignments.findFirst({
          where: {
            user_id: req.user_id,
            assigned_date: req.requested_date,
          },
        })

        if (existingAssignment) {
          results.failed.push({
            id: req.id,
            name: req.users_requester.full_name,
            reason: "Đã có ca làm việc vào ngày này",
          })
          continue
        }

        // Check shift capacity
        const maxStaffPerShift = 10
        const existingStaffOnShift = await prisma.shift_assignments.count({
          where: {
            work_shift_id: req.work_shift_id,
            assigned_date: req.requested_date,
          },
        })

        if (existingStaffOnShift >= maxStaffPerShift) {
          results.failed.push({
            id: req.id,
            name: req.users_requester.full_name,
            reason: `Ca đã đủ ${maxStaffPerShift} người`,
          })
          continue
        }

        // Create assignment and update request
        await prisma.$transaction(async (tx) => {
          await tx.shift_assignments.create({
            data: {
              work_shift_id: req.work_shift_id,
              user_id: req.user_id,
              warehouse_id: req.warehouse_id,
              assigned_date: req.requested_date,
              assigned_by: user.id,
              notes: notes || req.notes,
            },
          })

          await tx.shift_registration_requests.update({
            where: { id: req.id },
            data: {
              status: "APPROVED",
              approved_by: user.id,
              approved_at: new Date(),
            },
          })
        })

        results.approved.push(req.users_requester.full_name)
      } catch (err) {
        console.error(`Error processing request ${req.id}:`, err)
        results.failed.push({
          id: req.id,
          name: req.users_requester.full_name,
          reason: "Lỗi hệ thống",
        })
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      message: `Đã phê duyệt ${results.approved.length}/${pendingRequests.length} yêu cầu`,
    })
  } catch (error) {
    console.error("Error bulk approving registration requests:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
