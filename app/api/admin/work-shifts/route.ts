import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin } from "@/lib/auth"
import { handlePrismaError } from "@/lib/server-error-handler"


/**
 * @swagger
 * /api/admin/work-shifts:
 *   get:
 *     summary: List Work Shifts
 *     tags: [Admin - Work Shifts]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of shifts
 *   post:
 *     summary: Create Work Shift
 *     tags: [Admin - Work Shifts]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouse_id, shift_name, shift_code, start_time, end_time]
 *             properties:
 *               warehouse_id:
 *                 type: string
 *               shift_name:
 *                 type: string
 *               shift_code:
 *                 type: string
 *               start_time:
 *                 type: string
 *                 example: "08:00"
 *               end_time:
 *                 type: string
 *                 example: "17:00"
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Shift created
 *       400:
 *         description: Invalid input or duplicate
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
      )
    }

    const { searchParams } = new URL(request.url)
    const warehouseId = searchParams.get("warehouseId")
    const isActive = searchParams.get("isActive")
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")

    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (warehouseId) {
      where.warehouse_id = warehouseId
    }
    if (isActive !== null && isActive !== undefined && isActive !== "") {
      where.is_active = isActive === "true"
    }

    // Query shifts with warehouse info
    const [shifts, total] = await Promise.all([
      prisma.work_shifts.findMany({
        where,
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
        orderBy: [
          { warehouse_id: "asc" },
          { start_time: "asc" },
        ],
        skip,
        take: limit,
      }),
      prisma.work_shifts.count({ where }),
    ])

    // Serialize Time fields to strings (HH:MM:SS format)
    const serializedShifts = shifts.map((shift) => ({
      ...shift,
      start_time: shift.start_time instanceof Date
        ? shift.start_time.toISOString().substr(11, 8)
        : shift.start_time,
      end_time: shift.end_time instanceof Date
        ? shift.end_time.toISOString().substr(11, 8)
        : shift.end_time,
    }))

    return NextResponse.json({
      success: true,
      data: serializedShifts,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching work shifts:", error)
    return NextResponse.json(
      { success: false, error: handlePrismaError(error) },
      { status: 500 }
    )
  }

}

// POST /api/admin/work-shifts - Create new work shift template
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized - Admin access required" },
        { status: 403 }
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
      is_active = true,
    } = body

    // Validate required fields
    if (!warehouse_id || !shift_name || !shift_code || !start_time || !end_time) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Validate shift_code is unique
    const existing = await prisma.work_shifts.findUnique({
      where: { shift_code },
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Shift code "${shift_code}" already exists` },
        { status: 400 }
      )
    }

    // Parse and validate times
    // For PostgreSQL TIME type, we need to store as Date object with time component
    // Validate format HH:MM:SS or HH:MM
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])(:[0-5][0-9])?$/
    if (!timeRegex.test(start_time) || !timeRegex.test(end_time)) {
      return NextResponse.json(
        { success: false, error: "Invalid time format. Use HH:MM or HH:MM:SS" },
        { status: 400 }
      )
    }

    // Parse time strings to Date objects (use UTC to avoid timezone issues)
    const parseTimeToDate = (timeStr: string): Date => {
      const [hours, minutes, seconds = '0'] = timeStr.split(':')
      const date = new Date()
      date.setUTCHours(parseInt(hours), parseInt(minutes), parseInt(seconds), 0)
      return date
    }

    const startTimeDate = parseTimeToDate(start_time)
    const endTimeDate = parseTimeToDate(end_time)

    // Create work shift
    const workShift = await prisma.work_shifts.create({
      data: {
        warehouse_id,
        shift_name,
        shift_code: shift_code.toUpperCase(),
        start_time: startTimeDate,
        end_time: endTimeDate,
        description: description || null,
        is_active,
      },
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
    console.error("Error creating work shift:", error)
    return NextResponse.json(
      { success: false, error: handlePrismaError(error) },
      { status: 500 }
    )
  }

}
