import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin } from "@/lib/auth"

/**
 * @swagger
 * /api/admin/work-shifts/{id}:
 *   get:
 *     summary: Get Work Shift Details
 *     tags: [Admin - Work Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shift details
 *       404:
 *         description: Not found
 *   put:
 *     summary: Update Work Shift
 *     tags: [Admin - Work Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               warehouse_id:
 *                 type: string
 *               shift_name:
 *                 type: string
 *               shift_code:
 *                 type: string
 *               start_time:
 *                 type: string
 *               end_time:
 *                 type: string
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Shift updated
 *   delete:
 *     summary: Delete Work Shift
 *     tags: [Admin - Work Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Shift deleted/deactivated
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      )
    }

    const { id } = await params

    // Validate id is present
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Work shift ID is required" },
        { status: 400 }
      )
    }

    const workShift = await prisma.work_shifts.findUnique({
      where: { id },
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
        _count: {
          select: {
            shift_assignments: true,
            shift_sessions: true,
          },
        },
      },
    })

    if (!workShift) {
      return NextResponse.json(
        { success: false, error: "Work shift not found" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: workShift,
    })
  } catch (error) {
    console.error("Error fetching work shift:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/work-shifts/[id] - Update work shift
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      )
    }

    const { id } = await params

    // Validate id is present
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Work shift ID is required" },
        { status: 400 }
      )
    }

    const body = await request.json()
    const {
      warehouse_id,
      shift_name,
      shift_code,
      start_time,
      end_time,
      description,
      is_active,
    } = body

    // Check if shift exists
    const existing = await prisma.work_shifts.findUnique({
      where: { id },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Work shift not found" },
        { status: 404 }
      )
    }

    // If shift_code is being changed, check uniqueness
    if (shift_code && shift_code !== existing.shift_code) {
      const codeExists = await prisma.work_shifts.findUnique({
        where: { shift_code: shift_code.toUpperCase() },
      })

      if (codeExists) {
        return NextResponse.json(
          { success: false, error: `Shift code "${shift_code}" already exists` },
          { status: 400 }
        )
      }
    }

    // Build update data
    const updateData: any = {}
    if (warehouse_id) updateData.warehouse_id = warehouse_id
    if (shift_name) updateData.shift_name = shift_name
    if (shift_code) updateData.shift_code = shift_code.toUpperCase()
    if (description !== undefined) updateData.description = description || null
    if (is_active !== undefined) updateData.is_active = is_active

    // Parse times if provided
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:[0-5][0-9])?$/

    // Helper to parse time string to Date object with UTC
    const parseTimeToDate = (timeStr: string): Date => {
      const [hours, minutes, seconds = '0'] = timeStr.split(':')
      const date = new Date()
      date.setUTCHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0)
      return date
    }

    if (start_time) {
      if (!timeRegex.test(start_time)) {
        return NextResponse.json(
          { success: false, error: "Invalid start_time format. Use HH:MM or HH:MM:SS" },
          { status: 400 }
        )
      }
      updateData.start_time = parseTimeToDate(start_time)
    }

    if (end_time) {
      if (!timeRegex.test(end_time)) {
        return NextResponse.json(
          { success: false, error: "Invalid end_time format. Use HH:MM or HH:MM:SS" },
          { status: 400 }
        )
      }
      updateData.end_time = parseTimeToDate(end_time)
    }

    updateData.updated_at = new Date()

    // Update work shift
    const workShift = await prisma.work_shifts.update({
      where: { id },
      data: updateData,
      include: {
        warehouses: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: workShift,
    })
  } catch (error) {
    console.error("Error updating work shift:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}

// DELETE /api/admin/work-shifts/[id] - Delete (soft delete by setting is_active = false)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await verifyAuth(request)
    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      )
    }

    const { id } = await params

    // Validate id is present
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Work shift ID is required" },
        { status: 400 }
      )
    }

    // Check if shift exists
    const existing = await prisma.work_shifts.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            shift_assignments: true,
            shift_sessions: true,
          },
        },
      },
    })

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Work shift not found" },
        { status: 404 }
      )
    }

    // Check if shift has assignments or sessions
    const hasAssignments = existing._count.shift_assignments > 0
    const hasSessions = existing._count.shift_sessions > 0

    if (hasAssignments || hasSessions) {
      // Soft delete - just mark as inactive
      await prisma.work_shifts.update({
        where: { id },
        data: {
          is_active: false,
          updated_at: new Date(),
        },
      })

      return NextResponse.json({
        success: true,
        message: "Work shift deactivated (has existing assignments/sessions)",
      })
    } else {
      // Hard delete if no related records
      await prisma.work_shifts.delete({
        where: { id },
      })

      return NextResponse.json({
        success: true,
        message: "Work shift deleted",
      })
    }
  } catch (error) {
    console.error("Error deleting work shift:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
