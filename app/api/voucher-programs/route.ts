import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

/**
 * GET /api/voucher-programs
 * List all voucher programs with pagination
 */
export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    const { searchParams } = new URL(request.url)
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"))
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") || "20"))
    const skip = (page - 1) * pageSize
    // const includeExpired = searchParams.get("includeExpired") === "true"

    let whereCondition: any = {}

    // Warehouse Filter
    if (user && user.warehouseId) {
      // Show global programs OR programs for this warehouse
      whereCondition = {
        OR: [
          { warehouse_id: null },
          { warehouse_id: user.warehouseId }
        ]
      }
    } else if (user && isAdmin(user)) {
      // Admin sees all? Or maybe filter by param if implemented later
    }

    // Get total count and paginated results
    const [totalCount, programs] = await Promise.all([
      prisma.voucher_programs.count({ where: whereCondition }),
      prisma.voucher_programs.findMany({
        where: whereCondition,
        skip,
        take: pageSize,
        orderBy: { created_at: "desc" },
        include: {
          _count: {
            select: { vouchers: true },
          },
        },
      }),
    ])

    // ... rest of GET function

    // Count used vouchers per program
    const programIds = programs.map(p => p.id)
    const usedCounts = await prisma.vouchers.groupBy({
      by: ["program_id"],
      where: {
        is_used: true,
        program_id: { in: programIds }
      },
      _count: {
        id: true,
      },
    })

    const usedCountMap = Object.fromEntries(
      usedCounts.map((item: any) => [item.program_id, item._count.id])
    )

    // Enrich programs with usage stats
    const enrichedPrograms = programs.map((p: any) => ({
      ...p,
      total_codes: p._count.vouchers,
      used_count: usedCountMap[p.id] || 0,
      discount_value: Number(p.discount_value),
      min_amount: p.min_amount ? Number(p.min_amount) : null,
      min_quantity: p.min_quantity || null,
    }))

    return NextResponse.json({
      success: true,
      data: enrichedPrograms,
      pagination: {
        page,
        pageSize,
        total: totalCount,
        totalPages: Math.ceil(totalCount / pageSize),
      },
    })
  } catch (error) {
    console.error("Error fetching voucher programs:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch voucher programs" },
      { status: 500 }
    )
  }
}

/**
 * POST /api/voucher-programs
 * Create a new voucher program with auto-generated codes
 */
export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Allowed: Admin, Manager, Warehouse Manager
    const allowedRoles = ['ADMIN', 'MANAGER', 'GENERAL_MANAGER', 'WAREHOUSE_MANAGER']
    if (!user || (!isAdmin(user) && !allowedRoles.includes(user.role))) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      name,
      description,
      discount_type,
      discount_value,
      min_amount,
      min_quantity,
      total_codes,
      is_active,
      start_date,
      end_date,
      code_prefix, // Custom prefix from user
      gift_items, // For GIFT type: array of {item_type, item_id, quantity}
      product_items, // For PRODUCT_DISCOUNT type: array of {item_type, item_id, quantity_required}
    } = body

    // Validation
    if (!name || !discount_type || !total_codes) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Type-specific validation
    if (discount_type === "GIFT") {
      if (!gift_items || !Array.isArray(gift_items) || gift_items.length === 0) {
        return NextResponse.json(
          { success: false, error: "GIFT type requires at least one gift item" },
          { status: 400 }
        )
      }
      if (!min_amount && !min_quantity) {
        return NextResponse.json(
          { success: false, error: "GIFT type requires either min_amount or min_quantity" },
          { status: 400 }
        )
      }
    } else if (discount_type === "PRODUCT_DISCOUNT") {
      if (!discount_value) {
        return NextResponse.json(
          { success: false, error: "PRODUCT_DISCOUNT type requires discount_value" },
          { status: 400 }
        )
      }
      if (!product_items || !Array.isArray(product_items) || product_items.length === 0) {
        return NextResponse.json(
          { success: false, error: "PRODUCT_DISCOUNT type requires at least one product" },
          { status: 400 }
        )
      }
    } else {
      // PERCENTAGE or FIXED_AMOUNT
      if (!discount_value) {
        return NextResponse.json(
          { success: false, error: "Discount value is required" },
          { status: 400 }
        )
      }
    }

    if (total_codes < 1 || total_codes > 1000) {
      return NextResponse.json(
        { success: false, error: "Total codes must be between 1 and 1000" },
        { status: 400 }
      )
    }

    // Use custom prefix if provided, otherwise generate from name
    let prefix = code_prefix
      ? code_prefix.replace(/[^a-zA-Z0-9]/g, "").toUpperCase()
      : name.replace(/[^a-zA-Z0-9]/g, "").substring(0, 4).toUpperCase()

    // Fallback if prefix is empty
    if (!prefix) prefix = "PROG"

    // Limit prefix length to 6 characters
    prefix = prefix.substring(0, 6)

    // Characters to use for random part (avoiding confusing ones like 0, O, I, 1)
    const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

    // Function to generate random code
    const generateCode = () => {
      let code = prefix + "-"
      for (let i = 0; i < 8; i++) {
        code += chars[Math.floor(Math.random() * chars.length)]
      }
      return code
    }

    // Generate unique codes
    const codes = new Set<string>()
    let attempts = 0
    const maxAttempts = total_codes * 10

    while (codes.size < total_codes && attempts < maxAttempts) {
      codes.add(generateCode())
      attempts++
    }

    if (codes.size < total_codes) {
      return NextResponse.json(
        { success: false, error: "Failed to generate unique codes" },
        { status: 500 }
      )
    }

    // Use Prisma transaction to create program and codes atomically
    const program = await prisma.$transaction(async (tx) => {
      // Create program
      const newProgram = await tx.voucher_programs.create({
        data: {
          name,
          warehouse_id: (user && !isAdmin(user) && user.warehouseId) ? user.warehouseId : null,
          description: description || null,
          discount_type,
          discount_value: discount_value ? parseFloat(String(discount_value)) : 0,
          min_amount: min_amount ? parseFloat(String(min_amount)) : null,
          min_quantity: min_quantity ? parseInt(String(min_quantity)) : null,
          total_codes,
          is_active: is_active ?? true,
          start_date: start_date ? new Date(start_date) : null,
          end_date: end_date ? new Date(end_date) : null,
        },
      })

      // Create voucher codes
      const voucherCodes = Array.from(codes).map((code) => ({
        program_id: newProgram.id,
        code,
        is_used: false,
      }))

      await tx.vouchers.createMany({
        data: voucherCodes,
      })

      // Create gift items if GIFT type
      if (discount_type === "GIFT" && gift_items && gift_items.length > 0) {
        await tx.voucher_gifts.createMany({
          data: gift_items.map((item: any) => ({
            program_id: newProgram.id,
            item_type: item.item_type || "PRODUCT",
            item_id: item.item_id,
            quantity: item.quantity || 1,
          })),
        })
      }

      // Create product items if PRODUCT_DISCOUNT type
      if (discount_type === "PRODUCT_DISCOUNT" && product_items && product_items.length > 0) {
        await tx.voucher_products.createMany({
          data: product_items.map((item: any) => ({
            program_id: newProgram.id,
            item_type: item.item_type || "PRODUCT",
            item_id: item.item_id,
            quantity_required: item.quantity_required || 1,
          })),
        })
      }

      return newProgram
    })

    return NextResponse.json(
      {
        success: true,
        message: `Created ${total_codes} voucher codes for program "${name}"`,
        data: {
          id: program.id,
          name: program.name,
          total_codes: program.total_codes,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Error creating voucher program:", error)
    return NextResponse.json(
      { success: false, error: "Failed to create voucher program" },
      { status: 500 }
    )
  }
}
