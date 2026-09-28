import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

export const dynamic = "force-dynamic"

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  // Verify authentication
  const user = await verifyAuth(request)
  if (!user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    )
  }

  const params = await context.params
  const sessionId = params.id

  console.log('=== SHIFT PRODUCTS API DEBUG ===')
  console.log('Session ID:', sessionId)
  console.log('User:', { id: user.id, role: user.role, warehouseId: user.warehouseId })

  try {
    // Try to find session - first check shift_sessions (attendance), then sales_sessions (sales)
    let session: any = await prisma.shift_sessions.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        user_id: true,
        warehouse_id: true,
        session_date: true,
        check_in_time: true,
        check_out_time: true,
      },
    })

    let isSalesSession = false

    if (!session) {
      // Try sales_sessions
      session = await prisma.sales_sessions.findUnique({
        where: { id: sessionId },
        select: {
          id: true,
          user_id: true,
          warehouse_id: true,
          session_date: true,
          shift_opened_at: true,
          shift_closed_at: true,
        },
      })
      isSalesSession = true
    }

    console.log('Found session:', session, 'isSalesSession:', isSalesSession)

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Ca làm việc không tồn tại" },
        { status: 404 }
      )
    }

    // Check permissions: user must be the session owner, manager, or admin
    const isOwner = session.user_id === user.id
    const isManager = ["WAREHOUSE_MANAGER", "ADMIN", "GENERAL_MANAGER", "QuanLyKhoCon"].includes(
      user.role
    )
    const isSameWarehouse = session.warehouse_id === user.warehouseId

    if (!isOwner && !isManager && !isSameWarehouse) {
      return NextResponse.json(
        { success: false, error: "Bạn không có quyền xem thông tin này" },
        { status: 403 }
      )
    }

    // First, let's check ALL invoices for this warehouse to debug
    const allInvoices = await prisma.sales_invoices.findMany({
      where: {
        warehouse_id: session.warehouse_id,
      },
      select: {
        id: true,
        invoice_number: true,
        sales_session_id: true,
        created_at: true,
      },
      orderBy: {
        created_at: "desc",
      },
      take: 5,
    })
    console.log('Recent invoices for warehouse:', allInvoices)

    // Get all invoices for this SPECIFIC session ONLY
    // Always use sales_session_id since sales_invoices links to sales_sessions
    const invoices = await prisma.sales_invoices.findMany({
      where: {
        sales_session_id: sessionId,
      },
      select: {
        id: true,
        invoice_number: true,
        created_at: true,
        sales_session_id: true,
      },
      orderBy: {
        created_at: "desc",
      },
    })

    console.log(`Found ${invoices.length} invoices for session ${sessionId}`)
    console.log('Invoices:', invoices.map(inv => ({
      number: inv.invoice_number,
      session_id: inv.sales_session_id,
      created: inv.created_at
    })))

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          products: [],
          totalProducts: 0,
          totalQuantity: 0,
          totalRevenue: 0,
        },
      })
    }

    const invoiceIds = invoices.map((inv) => inv.id)

    console.log(`Found ${invoices.length} invoices for session ${sessionId}`)
    console.log('Invoice IDs:', invoiceIds)

    // Get all invoice items with product details from recipes directly
    const invoiceItems = await prisma.sales_invoice_items.findMany({
      where: {
        invoice_id: { in: invoiceIds },
      },
      select: {
        id: true,
        invoice_id: true,
        recipe_id: true,
        quantity: true,
        unit_price: true,
        line_total: true,
        product_recipes: {
          select: {
            id: true,
            name: true,
            code: true,
            product_units: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    })

    console.log(`Found ${invoiceItems.length} invoice items`)
    console.log('Sample items:', invoiceItems.slice(0, 2))

    // Aggregate products by recipe_id (since recipes are the actual products being sold)
    const productMap = new Map<
      string,
      {
        product_id: string
        product_name: string
        product_code: string | null
        unit: string | null
        quantity: number
        revenue: number
        order_count: Set<string>
      }
    >()

    for (const item of invoiceItems || []) {
      const recipe = item.product_recipes
      if (!recipe) continue

      const recipeId = recipe.id
      const recipeName = recipe.name || "Sản phẩm không xác định"
      const recipeCode = recipe.code || null
      const unit = recipe.product_units?.name || null

      if (productMap.has(recipeId)) {
        const existing = productMap.get(recipeId)!
        existing.quantity += item.quantity
        existing.revenue += Number(item.line_total || 0)
        existing.order_count.add(item.invoice_id)
      } else {
        productMap.set(recipeId, {
          product_id: recipeId,
          product_name: recipeName,
          product_code: recipeCode,
          unit: unit,
          quantity: item.quantity,
          revenue: Number(item.line_total || 0),
          order_count: new Set([item.invoice_id]),
        })
      }
    }

    // Convert to array and format
    const products = Array.from(productMap.values())
      .map((product) => ({
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        unit: product.unit,
        quantity: product.quantity,
        revenue: product.revenue,
        order_count: product.order_count.size,
      }))
      .sort((a, b) => b.quantity - a.quantity) // Sort by quantity descending

    const totalProducts = products.length
    const totalQuantity = products.reduce((sum, p) => sum + p.quantity, 0)
    const totalRevenue = products.reduce((sum, p) => sum + p.revenue, 0)

    // =============================================================
    // GIÁ TRỊ SỬA ĐỔI QUAN TRỌNG:
    // Lấy sản phẩm tặng từ sales_invoice_items có unit_price = 0
    // Đây là dữ liệu THỰC TẾ đã tặng, không phải từ promotion_gifts (config)
    // =============================================================

    // Get gift items from invoice items where unit_price = 0 (free items = gifts/bonuses)
    const giftInvoiceItems = await prisma.sales_invoice_items.findMany({
      where: {
        invoice_id: { in: invoiceIds },
        unit_price: 0, // Free items are gifts
      },
      select: {
        id: true,
        invoice_id: true,
        recipe_id: true,
        quantity: true,
        product_recipes: {
          select: {
            id: true,
            name: true,
          },
        },
        sales_invoices: {
          select: {
            gift_promotion_id: true,
          },
        },
      },
    })

    console.log(`Found ${giftInvoiceItems.length} gift items (unit_price = 0) in invoices`)

    // Get promotion names for gift_promotion_ids
    const giftPromotionIds = [...new Set(
      giftInvoiceItems
        .map(item => item.sales_invoices?.gift_promotion_id)
        .filter(Boolean)
    )] as string[]

    const promotionsForGifts = giftPromotionIds.length > 0
      ? await prisma.promotions.findMany({
        where: { id: { in: giftPromotionIds } },
        select: { id: true, name: true },
      })
      : []

    const promotionNameMap = new Map(promotionsForGifts.map(p => [p.id, p.name]))

    // Aggregate gift products by recipe_id and promotion_id
    const giftProductMap = new Map<
      string,
      {
        product_name: string
        promotion_name: string
        quantity: number
        invoice_count: number
      }
    >()

    // Track unique invoices per gift product
    const giftInvoiceTracker = new Map<string, Set<string>>()

    for (const item of giftInvoiceItems) {
      const recipeName = item.product_recipes?.name || "Sản phẩm tặng"
      const promotionId = item.sales_invoices?.gift_promotion_id
      const promotionName = promotionId
        ? (promotionNameMap.get(promotionId) || "Khuyến mãi")
        : "Quà tặng"

      // Key by recipe_id to aggregate same products
      const key = `${promotionId || 'unknown'}_${item.recipe_id}`

      if (giftProductMap.has(key)) {
        const existing = giftProductMap.get(key)!
        existing.quantity += item.quantity

        // Track unique invoices
        if (!giftInvoiceTracker.has(key)) {
          giftInvoiceTracker.set(key, new Set())
        }
        giftInvoiceTracker.get(key)!.add(item.invoice_id)
        existing.invoice_count = giftInvoiceTracker.get(key)!.size
      } else {
        giftProductMap.set(key, {
          product_name: recipeName,
          promotion_name: promotionName,
          quantity: item.quantity,
          invoice_count: 1,
        })
        giftInvoiceTracker.set(key, new Set([item.invoice_id]))
      }
    }

    console.log(`Aggregated ${giftProductMap.size} unique gift products`)

    const giftProducts = Array.from(giftProductMap.values())
      .sort((a, b) => b.quantity - a.quantity)

    return NextResponse.json({
      success: true,
      data: {
        products,
        totalProducts,
        totalQuantity,
        totalRevenue,
        giftProducts,
      },
    })
  } catch (error) {
    console.error("Error fetching shift products:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Lỗi server khi tải danh sách sản phẩm",
      },
      { status: 500 }
    )
  }
}
