import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * GET /api/voucher-programs/[id]
 * Get a specific program with all its codes
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "50"))
    const skip = (page - 1) * pageSize
    const filter = searchParams.get("filter") || "all" // all, used, unused

    // Get program
    const program = await prisma.voucher_programs.findUnique({
      where: { id },
    })

    if (!program) {
      return NextResponse.json(
        { success: false, error: "Voucher program not found" },
        { status: 404 }
      )
    }

    // Build filter condition
    const whereCondition: any = { program_id: id }
    if (filter === "used") {
      whereCondition.is_used = true
    } else if (filter === "unused") {
      whereCondition.is_used = false
    }

    // Get total count and paginated codes
    const [totalCount, codes] = await Promise.all([
      prisma.vouchers.count({ where: whereCondition }),
      prisma.vouchers.findMany({
        where: whereCondition,
        skip,
        take: pageSize,
        orderBy: { created_at: "asc" },
      }),
    ])

    // Get usage summary
    const [usedCount, totalVouchers] = await Promise.all([
      prisma.vouchers.count({ where: { program_id: id, is_used: true } }),
      prisma.vouchers.count({ where: { program_id: id } }),
    ])

    return NextResponse.json({
      success: true,
      data: {
        ...program,
        discount_value: Number(program.discount_value),
        min_amount: program.min_amount ? Number(program.min_amount) : null,
        usage: {
          total: totalVouchers,
          used: usedCount,
          unused: totalVouchers - usedCount,
        },
        codes,
        pagination: {
          page,
          pageSize,
          total: totalCount,
          totalPages: Math.ceil(totalCount / pageSize),
        },
      },
    })
  } catch (error) {
    console.error("Error fetching voucher program details:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch voucher program details" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/voucher-programs/[id]
 * Update a voucher program (name, description, status, dates)
 */
export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, description, is_active, start_date, end_date } = body

    // Check if program exists
    const program = await prisma.voucher_programs.findUnique({
      where: { id },
    })

    if (!program) {
      return NextResponse.json(
        { success: false, error: "Voucher program not found" },
        { status: 404 }
      )
    }

    // Build update data
    const updateData: any = {}

    if (name !== undefined) updateData.name = name
    if (description !== undefined) updateData.description = description
    if (is_active !== undefined) updateData.is_active = is_active
    if (start_date !== undefined) updateData.start_date = start_date ? new Date(start_date) : null
    if (end_date !== undefined) updateData.end_date = end_date ? new Date(end_date) : null

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { success: false, error: "No fields to update" },
        { status: 400 }
      )
    }

    // Update program
    await prisma.voucher_programs.update({
      where: { id },
      data: updateData,
    })

    return NextResponse.json({
      success: true,
      message: "Voucher program updated successfully",
    })
  } catch (error) {
    console.error("Error updating voucher program:", error)
    return NextResponse.json(
      { success: false, error: "Failed to update voucher program" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/voucher-programs/[id]
 * Delete a voucher program and all its codes
 */
export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { id } = await params

    // Check if program exists
    const program = await prisma.voucher_programs.findUnique({
      where: { id },
    })

    if (!program) {
      return NextResponse.json(
        { success: false, error: "Voucher program not found" },
        { status: 404 }
      )
    }

    // Delete program (cascade deletes vouchers due to foreign key)
    await prisma.voucher_programs.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      message: "Voucher program and all its codes deleted successfully",
    })
  } catch (error) {
    console.error("Error deleting voucher program:", error)
    return NextResponse.json(
      { success: false, error: "Failed to delete voucher program" },
      { status: 500 }
    )
  }
}
