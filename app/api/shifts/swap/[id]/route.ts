import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isWarehouseManager, isAdmin } from "@/lib/auth"
import { isValidUUID } from "@/lib/utils"
import { createNotification } from "@/lib/notification-service"
import { notification_type } from "@/lib/generated/prisma"
import { format } from "date-fns"
import { vi } from "date-fns/locale"

// Helper function to send swap notification using new notification service
async function sendSwapNotification(
  userId: string | string[],
  type: notification_type,
  title: string,
  message: string,
  data?: Record<string, any>
) {
  try {
    await createNotification({
      userId,
      type,
      title,
      message,
      redirectUrl: "/admin/schedule",
      data,
    })
  } catch (error) {
    console.error("Error sending notification:", error)
  }
}

// PUT /api/shifts/swap/[id] - Accept or cancel shift swap request
// New flow: action "accept" - another employee accepts with their shift info
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const { id } = await params

    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: "Invalid ID format" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const { action, target_shift_assignment_id, rejection_reason } = body
    // action: "accept" (any compatible employee accepts), "cancel" (requester cancels), "approve" (manager/HR approves), "reject" (manager/HR rejects)

    if (!action) {
      return NextResponse.json(
        { success: false, error: "Missing action field" },
        { status: 400 }
      )
    }

    // Get swap request with related data
    const swapRequest = await prisma.shift_swap_requests.findUnique({
      where: { id },
      include: {
        users_requester: {
          select: {
            id: true,
            full_name: true,
            email: true,
          }
        },
        users_target: {
          select: {
            id: true,
            full_name: true,
            email: true,
          }
        },
        work_shifts: {
          select: {
            id: true,
            shift_name: true,
            start_time: true,
            end_time: true,
          }
        },
      },
    })

    if (!swapRequest) {
      return NextResponse.json(
        { success: false, error: "Swap request not found" },
        { status: 404 }
      )
    }

    const isRequester = swapRequest.requester_user_id === user.id
    const isManager = isWarehouseManager(user) || isAdmin(user) || user.role === "HR"

    // Handle approve action (manager/HR only)
    if (action === "approve") {
      if (!isManager) {
        return NextResponse.json(
          { success: false, error: "Chỉ quản lý và HR mới có thể phê duyệt" },
          { status: 403 }
        )
      }

      if (swapRequest.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: "Yêu cầu đã được xử lý" },
          { status: 400 }
        )
      }

      // Check swap type
      if (swapRequest.swap_type === 'REPLACE') {
        // REPLACE type: Must have target_user_id (someone accepted)
        if (!swapRequest.target_user_id) {
          return NextResponse.json(
            { success: false, error: "Chưa có người nhận ca thay" },
            { status: 400 }
          )
        }

        if (!swapRequest.work_shift_id) {
          return NextResponse.json(
            { success: false, error: "Dữ liệu yêu cầu không hợp lệ (thiếu ca làm việc)" },
            { status: 400 }
          )
        }

        const requesterAssignment = await prisma.shift_assignments.findFirst({
          where: {
            user_id: swapRequest.requester_user_id,
            assigned_date: swapRequest.requester_date,
            work_shift_id: swapRequest.work_shift_id,
          },
        })

        if (!requesterAssignment) {
          return NextResponse.json(
            { success: false, error: "Không tìm thấy phân công ca làm việc" },
            { status: 400 }
          )
        }

        await prisma.$transaction(async (tx) => {
          // Reassign the shift to the target user
          await tx.shift_assignments.update({
            where: { id: requesterAssignment.id },
            data: {
              user_id: swapRequest.target_user_id!,
              notes: `Làm thay ca cho ${swapRequest.users_requester.full_name}`,
            },
          })

          // Update swap request status
          await tx.shift_swap_requests.update({
            where: { id },
            data: {
              status: "APPROVED",
              approved_by: user.id,
              approved_at: new Date(),
              updated_at: new Date(),
            },
          })
        })

        // Get target user info
        const targetUser = await prisma.users.findUnique({
          where: { id: swapRequest.target_user_id },
          select: { full_name: true },
        })

        // Send notifications
        const formattedDate = format(swapRequest.requester_date, "dd/MM/yyyy", { locale: vi })
        await sendSwapNotification(
          swapRequest.requester_user_id,
          "SHIFT_SWAP_APPROVED",
          "Yêu cầu làm thay ca được duyệt",
          `${targetUser?.full_name} sẽ làm thay ca cho bạn. Yêu cầu đã được ${user.fullName} phê duyệt.`,
          { swapId: id, shiftDate: swapRequest.requester_date.toISOString() }
        )

        await sendSwapNotification(
          swapRequest.target_user_id,
          "SHIFT_SWAP_APPROVED",
          "Làm thay ca được duyệt",
          `Bạn đã được phê duyệt làm thay ca ${swapRequest.work_shifts?.shift_name || ''} vào ${formattedDate}`,
          { swapId: id, shiftDate: swapRequest.requester_date.toISOString() }
        )

        return NextResponse.json({
          success: true,
          message: "Đã phê duyệt yêu cầu làm thay ca",
        })
      } else {
        // SWAP type: Requires target_user_id (someone accepted)
        if (!swapRequest.target_user_id) {
          return NextResponse.json(
            { success: false, error: "Yêu cầu đổi ca chưa có người chấp nhận" },
            { status: 400 }
          )
        }

        if (!swapRequest.work_shift_id || !swapRequest.target_date || !swapRequest.target_work_shift_id) {
          return NextResponse.json(
            { success: false, error: "Dữ liệu yêu cầu không hợp lệ (thiếu thông tin ca)" },
            { status: 400 }
          )
        }

        const requesterAssignment = await prisma.shift_assignments.findFirst({
          where: {
            user_id: swapRequest.requester_user_id,
            assigned_date: swapRequest.requester_date,
            work_shift_id: swapRequest.work_shift_id,
          },
        })

        const targetAssignment = await prisma.shift_assignments.findFirst({
          where: {
            user_id: swapRequest.target_user_id,
            assigned_date: swapRequest.target_date,
            work_shift_id: swapRequest.target_work_shift_id,
          },
        })

        if (!requesterAssignment || !targetAssignment) {
          return NextResponse.json(
            { success: false, error: "Không tìm thấy phân công ca làm việc" },
            { status: 400 }
          )
        }

        // Swap assignments in transaction
        await prisma.$transaction(async (tx) => {
          // Update requester's assignment to target's shift
          // Keep the same date (requester_date), only swap the shift
          await tx.shift_assignments.update({
            where: { id: requesterAssignment.id },
            data: {
              work_shift_id: swapRequest.target_work_shift_id!,
              // Do NOT change assigned_date - keep requesterAssignment.assigned_date
            },
          })

          // Update target's assignment to requester's shift
          // Keep the same date (target_date), only swap the shift
          await tx.shift_assignments.update({
            where: { id: targetAssignment.id },
            data: {
              work_shift_id: swapRequest.work_shift_id,
              // Do NOT change assigned_date - keep targetAssignment.assigned_date
            },
          })

          // Update swap request status
          await tx.shift_swap_requests.update({
            where: { id },
            data: {
              status: "APPROVED",
              approved_by: user.id,
              approved_at: new Date(),
              updated_at: new Date(),
            },
          })
        })

        // Send notifications
        await sendSwapNotification(
          swapRequest.requester_user_id,
          "SHIFT_SWAP_APPROVED",
          "Đổi ca được phê duyệt",
          `Yêu cầu đổi ca của bạn đã được ${user.fullName} phê duyệt`,
          { swapId: id }
        )

        await sendSwapNotification(
          swapRequest.target_user_id!,
          "SHIFT_SWAP_APPROVED",
          "Đổi ca được phê duyệt",
          `Yêu cầu đổi ca đã được ${user.fullName} phê duyệt`,
          { swapId: id }
        )

        return NextResponse.json({
          success: true,
          message: "Đã phê duyệt đổi ca thành công",
        })
      }
    }

    // Handle reject action (manager/HR only)
    if (action === "reject") {
      if (!isManager) {
        return NextResponse.json(
          { success: false, error: "Chỉ quản lý và HR mới có thể từ chối" },
          { status: 403 }
        )
      }

      if (swapRequest.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: "Yêu cầu đã được xử lý" },
          { status: 400 }
        )
      }

      await prisma.shift_swap_requests.update({
        where: { id },
        data: {
          status: "REJECTED",
          rejection_reason: rejection_reason || "Quản lý từ chối",
          updated_at: new Date(),
        },
      })

      // Send notifications
      await sendSwapNotification(
        swapRequest.requester_user_id,
        "SHIFT_SWAP_REJECTED",
        "Đổi ca bị từ chối",
        `Yêu cầu đổi ca của bạn đã bị từ chối. Lý do: ${rejection_reason || "Không có lý do"}`,
        { swapId: id }
      )

      if (swapRequest.target_user_id) {
        await sendSwapNotification(
          swapRequest.target_user_id,
          "SHIFT_SWAP_REJECTED",
          "Đổi ca bị từ chối",
          `Yêu cầu đổi ca đã bị từ chối. Lý do: ${rejection_reason || "Không có lý do"}`,
          { swapId: id }
        )
      }

      return NextResponse.json({
        success: true,
        message: "Đã từ chối yêu cầu đổi ca",
      })
    }

    if (action === "cancel") {
      // Only requester can cancel
      if (!isRequester) {
        return NextResponse.json(
          { success: false, error: "Chỉ người tạo yêu cầu mới có thể hủy" },
          { status: 403 }
        )
      }

      if (swapRequest.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: "Chỉ có thể hủy yêu cầu đang chờ" },
          { status: 400 }
        )
      }

      await prisma.shift_swap_requests.update({
        where: { id },
        data: {
          status: "CANCELLED",
          updated_at: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: "Đã hủy yêu cầu đổi ca",
      })
    }

    if (action === "accept") {
      // Anyone except requester can accept (if they're from same warehouse)
      if (isRequester) {
        return NextResponse.json(
          { success: false, error: "Không thể chấp nhận yêu cầu của chính mình" },
          { status: 400 }
        )
      }

      if (swapRequest.status !== "PENDING") {
        return NextResponse.json(
          { success: false, error: "Yêu cầu đã được xử lý" },
          { status: 400 }
        )
      }

      if (swapRequest.target_user_id) {
        return NextResponse.json(
          { success: false, error: "Yêu cầu đã có người chấp nhận" },
          { status: 400 }
        )
      }

      // For REPLACE type: Check if user already has a shift on that date
      if (swapRequest.swap_type === 'REPLACE') {
        // Get the shift details for the requested shift
        const requestedShift = await prisma.work_shifts.findUnique({
          where: { id: swapRequest.work_shift_id! },
          select: { start_time: true, end_time: true, shift_name: true }
        })

        if (!requestedShift) {
          return NextResponse.json(
            { success: false, error: "Ca làm việc không tồn tại" },
            { status: 400 }
          )
        }

        // Check if user has any shift on the same date
        const existingAssignments = await prisma.shift_assignments.findMany({
          where: {
            user_id: user.id,
            assigned_date: swapRequest.requester_date,
          },
          include: {
            work_shifts: {
              select: {
                shift_name: true,
                start_time: true,
                end_time: true,
              }
            }
          }
        })

        // Check for time overlap
        for (const existing of existingAssignments) {
          const existingStart = existing.work_shifts.start_time
          const existingEnd = existing.work_shifts.end_time
          const requestedStart = requestedShift.start_time
          const requestedEnd = requestedShift.end_time

          // Check if time ranges overlap
          if (requestedStart < existingEnd && requestedEnd > existingStart) {
            return NextResponse.json(
              {
                success: false,
                error: `Bạn đã có ca "${existing.work_shifts.shift_name}" (${existingStart}-${existingEnd}) trùng giờ với ca này (${requestedStart}-${requestedEnd})`
              },
              { status: 400 }
            )
          }
        }

        // For REPLACE type, we don't need target_shift_assignment_id
        // User is accepting to take over this shift
      } else {
        // For SWAP type: Require target shift assignment
        if (!target_shift_assignment_id) {
          return NextResponse.json(
            { success: false, error: "Vui lòng chọn ca của bạn để đổi" },
            { status: 400 }
          )
        }

        // Verify the target shift assignment belongs to the user
        const targetAssignment = await prisma.shift_assignments.findFirst({
          where: {
            id: target_shift_assignment_id,
            user_id: user.id,
          },
          include: {
            work_shifts: {
              select: {
                id: true,
                shift_name: true,
                start_time: true,
                end_time: true,
              }
            }
          }
        })

        if (!targetAssignment) {
          return NextResponse.json(
            { success: false, error: "Ca làm việc không tồn tại hoặc không thuộc về bạn" },
            { status: 400 }
          )
        }
      }

      // SECURITY: Verify user is from same warehouse
      // ONLY use warehouse from shift assignments (same logic as GET)
      const userRecord = await prisma.users.findUnique({
        where: { id: user.id },
        select: { warehouse_id: true, full_name: true }
      })

      // Get user's warehouse IDs from shift assignments
      const userAssignments = await prisma.shift_assignments.findMany({
        where: { user_id: user.id },
        select: {
          work_shift_id: true,
          work_shifts: {
            select: { warehouse_id: true }
          }
        }
      })

      // Extract unique warehouse IDs
      const userWarehouseIdsFromAssignments = [...new Set(
        userAssignments
          .map(a => a.work_shifts?.warehouse_id)
          .filter((id): id is string => Boolean(id))
      )]

      // SECURITY: ONLY use warehouse from assignments, NOT from profile
      const effectiveUserWarehouseIds = userWarehouseIdsFromAssignments.length > 0
        ? userWarehouseIdsFromAssignments
        : (userRecord?.warehouse_id ? [userRecord.warehouse_id] : [])

      // SECURITY: User must be from the same warehouse as the swap request
      if (!swapRequest.warehouse_id || !effectiveUserWarehouseIds.includes(swapRequest.warehouse_id)) {
        console.log('[SECURITY] Accept swap blocked:', {
          userId: user.id,
          userWarehouseIds: effectiveUserWarehouseIds,
          swapRequestWarehouseId: swapRequest.warehouse_id
        })
        return NextResponse.json(
          { success: false, error: "Bạn không thuộc cùng kho với người yêu cầu" },
          { status: 403 }
        )
      }

      if (swapRequest.swap_type === 'REPLACE') {
        // For REPLACE: User accepts to take over the shift
        // Update swap request with target user, waiting for manager approval
        await prisma.shift_swap_requests.update({
          where: { id },
          data: {
            target_user_id: user.id,
            updated_at: new Date(),
          },
        })

        // Send notification to requester
        const formattedDate = format(swapRequest.requester_date, "dd/MM/yyyy", { locale: vi })
        await sendSwapNotification(
          swapRequest.requester_user_id,
          "SHIFT_SWAP_ACCEPTED",
          "Có người nhận ca thay",
          `${userRecord?.full_name} đã đồng ý làm thay ca cho bạn. Đang chờ quản lý phê duyệt`,
          { swapId: id, shiftDate: swapRequest.requester_date.toISOString() }
        )

        // Send notification to accepting user
        await sendSwapNotification(
          user.id,
          "SHIFT_SWAP_ACCEPTED",
          "Đã gửi yêu cầu",
          `Bạn đã đồng ý làm thay ca ${swapRequest.work_shifts?.shift_name || ''} vào ${formattedDate}. Đang chờ quản lý phê duyệt`,
          { swapId: id, shiftDate: swapRequest.requester_date.toISOString() }
        )

        return NextResponse.json({
          success: true,
          message: "Đã gửi yêu cầu làm thay ca! Đang chờ quản lý phê duyệt.",
        })
      }

      // SWAP type: Get both assignments and perform swap immediately (no approval needed)
      const targetAssignment = await prisma.shift_assignments.findFirst({
        where: {
          id: target_shift_assignment_id,
          user_id: user.id,
        },
        include: {
          work_shifts: {
            select: {
              id: true,
              shift_name: true,
              start_time: true,
              end_time: true,
            }
          }
        }
      })

      if (!targetAssignment) {
        return NextResponse.json(
          { success: false, error: "Ca làm việc không tồn tại" },
          { status: 400 }
        )
      }

      if (!swapRequest.work_shift_id) {
        return NextResponse.json(
          { success: false, error: "Dữ liệu yêu cầu không hợp lệ" },
          { status: 400 }
        )
      }

      // SECURITY: Validate ca được chọn phải khớp với yêu cầu swap gốc
      // Người yêu cầu đã chỉ định muốn ca nào (target_date + target_work_shift_id)
      // Người chấp nhận phải có đúng ca đó (cùng ngày + cùng loại ca)
      if (swapRequest.target_date && swapRequest.target_work_shift_id) {
        const targetAssignmentDate = new Date(targetAssignment.assigned_date)
        const requestTargetDate = new Date(swapRequest.target_date)

        // Normalize dates to compare only date portion (no time)
        const targetAssignmentDateStr = targetAssignmentDate.toISOString().split('T')[0]
        const requestTargetDateStr = requestTargetDate.toISOString().split('T')[0]

        if (targetAssignmentDateStr !== requestTargetDateStr) {
          return NextResponse.json(
            { success: false, error: `Ca bạn chọn (${targetAssignmentDateStr}) khác ngày với yêu cầu (${requestTargetDateStr}). Vui lòng chọn ca đúng ngày.` },
            { status: 400 }
          )
        }

        if (targetAssignment.work_shift_id !== swapRequest.target_work_shift_id) {
          return NextResponse.json(
            { success: false, error: "Ca bạn chọn không khớp với loại ca yêu cầu. Vui lòng chọn đúng ca." },
            { status: 400 }
          )
        }
      }

      // Get requester's assignment
      const requesterAssignment = await prisma.shift_assignments.findFirst({
        where: {
          user_id: swapRequest.requester_user_id,
          assigned_date: swapRequest.requester_date,
          work_shift_id: swapRequest.work_shift_id,
        },
      })

      if (!requesterAssignment) {
        return NextResponse.json(
          { success: false, error: "Không tìm thấy phân công ca của người yêu cầu" },
          { status: 400 }
        )
      }

      // For SWAP type: Execute the swap immediately (no manager approval needed)
      await prisma.$transaction(async (tx) => {
        // Swap the work_shift_id between the two assignments
        // Requester gets target's shift
        await tx.shift_assignments.update({
          where: { id: requesterAssignment.id },
          data: {
            work_shift_id: targetAssignment.work_shift_id,
          },
        })

        // Target gets requester's shift
        await tx.shift_assignments.update({
          where: { id: targetAssignment.id },
          data: {
            work_shift_id: swapRequest.work_shift_id!,
          },
        })

        // Update swap request as APPROVED
        // Giữ nguyên target_date và target_work_shift_id gốc từ yêu cầu
        // Chỉ cập nhật target_user_id (người chấp nhận) và status
        await tx.shift_swap_requests.update({
          where: { id },
          data: {
            target_user_id: user.id,
            // KHÔNG cập nhật target_date và target_work_shift_id vì chúng đã được set khi tạo yêu cầu
            // và đã được validate ở trên là khớp với ca mà người chấp nhận chọn
            status: "APPROVED",
            approved_at: new Date(),
            updated_at: new Date(),
          },
        })
      })

      // Send notifications to both users
      // Notify requester
      await sendSwapNotification(
        swapRequest.requester_user_id,
        "SHIFT_SWAP_APPROVED",
        "Đổi ca thành công",
        `${userRecord?.full_name} đã đồng ý đổi ca với bạn. Đổi ca đã hoàn tất!`,
        { swapId: id }
      )

      // Notify accepting user (target)
      await sendSwapNotification(
        user.id,
        "SHIFT_SWAP_APPROVED",
        "Đổi ca thành công",
        `Bạn đã đổi ca thành công với ${swapRequest.users_requester.full_name}!`,
        { swapId: id }
      )

      return NextResponse.json({
        success: true,
        message: "Đổi ca thành công!",
      })
    }

    return NextResponse.json(
      { success: false, error: "Invalid action" },
      { status: 400 }
    )
  } catch (error) {
    console.error("Error processing swap request:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/shifts/swap/[id] - Delete swap request
// - PENDING requests: only requester can delete
// - CANCELLED/REJECTED requests: requester can delete (cleanup)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Please login" },
        { status: 401 }
      )
    }

    const { id } = await params

    const swapRequest = await prisma.shift_swap_requests.findUnique({
      where: { id },
    })

    if (!swapRequest) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy yêu cầu đổi ca" },
        { status: 404 }
      )
    }

    if (swapRequest.requester_user_id !== user.id) {
      return NextResponse.json(
        { success: false, error: "Chỉ người tạo mới có thể xóa yêu cầu" },
        { status: 403 }
      )
    }

    // Can delete PENDING, CANCELLED, or REJECTED requests
    if (swapRequest.status === "APPROVED") {
      return NextResponse.json(
        { success: false, error: "Không thể xóa yêu cầu đã được chấp nhận" },
        { status: 400 }
      )
    }

    await prisma.shift_swap_requests.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "Đã xóa yêu cầu đổi ca",
    })
  } catch (error) {
    console.error("Error deleting swap request:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
