import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { validateShiftRegistration, isValidRegistrationPeriod } from "@/lib/shift-registration-validation"
import { getVietnamToday } from "@/lib/server-time"

// POST /api/shifts/self-register - Staff self-register for shifts (creates pending request)
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Only staff can self-register
    if (user.role !== "STAFF" && user.role !== "WAREHOUSE_STAFF" && user.role !== "ATTENDANCE_STAFF") {
      return NextResponse.json(
        { success: false, error: "Only staff can self-register for shifts" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { work_shift_id, assigned_date, notes } = body

    // Validate required fields
    if (!work_shift_id || !assigned_date) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Get user's full profile including employment type
    const userProfile = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        warehouse_id: true,
        employment_type: true,
      },
    })

    if (!userProfile?.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "User is not assigned to a warehouse" },
        { status: 400 }
      )
    }

    const targetDate = new Date(assigned_date)
    const employmentType = userProfile.employment_type || "FULLTIME"

    // Validate registration period
    const periodCheck = isValidRegistrationPeriod(targetDate)
    if (!periodCheck.valid) {
      return NextResponse.json(
        { success: false, error: periodCheck.error },
        { status: 400 }
      )
    }

    // Check if user already has a pending or approved request for this date
    const existingRequest = await prisma.shift_registration_requests.findFirst({
      where: {
        user_id: user.id,
        requested_date: targetDate,
      },
    })

    if (existingRequest) {
      if (existingRequest.status === "PENDING") {
        return NextResponse.json(
          { success: false, error: "Bạn đã có yêu cầu đăng ký đang chờ duyệt cho ngày này" },
          { status: 400 }
        )
      } else if (existingRequest.status === "APPROVED") {
        return NextResponse.json(
          { success: false, error: "Bạn đã được phê duyệt ca cho ngày này rồi" },
          { status: 400 }
        )
      }
      // If status is CANCELLED or REJECTED, we can re-use this record by updating it
    }

    // Check if user already has an existing assignment for this date
    const existingAssignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id: user.id,
        assigned_date: targetDate,
      },
    })

    if (existingAssignment) {
      return NextResponse.json(
        { success: false, error: "Bạn đã có ca được phân công cho ngày này rồi" },
        { status: 400 }
      )
    }

    // Validate shift requirements (full-time/part-time rules)
    const validation = await validateShiftRegistration(
      user.id,
      targetDate,
      employmentType
    )

    let registrationRequest

    // If there's an existing CANCELLED/REJECTED request, update it instead of creating new
    if (existingRequest && (existingRequest.status === "CANCELLED" || existingRequest.status === "REJECTED")) {
      registrationRequest = await prisma.shift_registration_requests.update({
        where: { id: existingRequest.id },
        data: {
          work_shift_id,
          warehouse_id: userProfile.warehouse_id,
          status: "PENDING",
          notes: notes || null,
          updated_at: new Date(),
        },
        include: {
          work_shifts: true,
          users_requester: {
            select: {
              id: true,
              full_name: true,
            },
          },
        },
      })
    } else {
      // Create new registration REQUEST (not assignment - manager will approve)
      registrationRequest = await prisma.shift_registration_requests.create({
        data: {
          work_shift_id,
          user_id: user.id,
          warehouse_id: userProfile.warehouse_id,
          requested_date: targetDate,
          status: "PENDING",
          notes: notes || null,
        },
        include: {
          work_shifts: true,
          users_requester: {
            select: {
              id: true,
              full_name: true,
            },
          },
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: registrationRequest,
      message: "Đã gửi yêu cầu đăng ký ca, vui lòng chờ quản lý phê duyệt",
      warnings: validation.warnings,
    })
  } catch (error) {
    console.error("Error self-registering shift:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/shifts/self-register?date=YYYY-MM-DD - Staff cancel their own registration request
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    // Only staff can cancel their own registration
    if (user.role !== "STAFF" && user.role !== "WAREHOUSE_STAFF" && user.role !== "ATTENDANCE_STAFF") {
      return NextResponse.json(
        { success: false, error: "Only staff can manage their own shift registrations" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const dateStr = searchParams.get("date")

    if (!dateStr) {
      return NextResponse.json(
        { success: false, error: "Missing date parameter" },
        { status: 400 }
      )
    }

    const targetDate = new Date(dateStr)

    // Cannot cancel past registrations
    // CRITICAL: Use server time (Vietnam timezone) not device time
    // Convert targetDate to UTC midnight for consistent comparison with getVietnamToday()
    const today = getVietnamToday()
    const targetDateUTC = new Date(Date.UTC(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0))

    if (targetDateUTC < today) {
      return NextResponse.json(
        { success: false, error: "Không thể hủy đăng ký ca đã qua" },
        { status: 400 }
      )
    }

    // First check for pending registration request
    const pendingRequest = await prisma.shift_registration_requests.findFirst({
      where: {
        user_id: user.id,
        requested_date: targetDate,
        status: "PENDING",
      },
    })

    if (pendingRequest) {
      // Delete the pending request completely instead of just cancelling
      await prisma.shift_registration_requests.delete({
        where: { id: pendingRequest.id },
      })

      return NextResponse.json({
        success: true,
        message: "Đã hủy yêu cầu đăng ký ca thành công",
      })
    }

    // Then check for existing assignment (approved request creates assignment)
    const assignment = await prisma.shift_assignments.findFirst({
      where: {
        user_id: user.id,
        assigned_date: targetDate,
      },
    })

    if (!assignment) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy ca đã đăng ký hoặc yêu cầu đang chờ" },
        { status: 404 }
      )
    }

    // Check if there's an active shift session (already checked in)
    const activeSession = await prisma.shift_sessions.findFirst({
      where: {
        user_id: user.id,
        session_date: targetDate,
        status: "IN_PROGRESS",
      },
    })

    if (activeSession) {
      return NextResponse.json(
        {
          success: false,
          error: "Không thể hủy ca đang làm việc",
        },
        { status: 400 }
      )
    }

    // Delete assignment
    await prisma.shift_assignments.delete({
      where: { id: assignment.id },
    })

    // Also update the approved request if exists
    await prisma.shift_registration_requests.updateMany({
      where: {
        user_id: user.id,
        requested_date: targetDate,
        status: "APPROVED",
      },
      data: { status: "CANCELLED" },
    })

    return NextResponse.json({
      success: true,
      message: "Đã hủy đăng ký ca thành công",
    })
  } catch (error) {
    console.error("Error canceling shift registration:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
