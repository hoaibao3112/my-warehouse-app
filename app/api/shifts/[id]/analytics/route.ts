import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await verifyAuth(request)
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const { id } = await params

    // 1. Try to find in attendance_sessions (NEW TABLE)
    let session: any = await prisma.attendance_sessions.findUnique({
      where: { id },
      include: {
        users_attendance_sessions_user_idTousers: true,
        warehouses: true
      }
    })

    let isSalesSession = false
    let sessionType = 'attendance_session'

    if (!session) {
      // 2. Try to find in shift_sessions (LEGACY TABLE)
      session = await prisma.shift_sessions.findUnique({
        where: { id },
        include: {
          users_shift_sessions_user_idTousers: true,
          warehouses: true
        }
      })
      sessionType = 'shift_session'
    }

    if (!session) {
      // 3. Try finding sales session
      session = await prisma.sales_sessions.findUnique({
        where: { id },
        include: {
          users_sales_sessions_user_idTousers: true,
          warehouses: true
        }
      })
      isSalesSession = true
      sessionType = 'sales_session'
    }

    if (!session) {
      return NextResponse.json(
        { success: false, error: "Session not found" },
        { status: 404 }
      )
    }

    // Check permissions - staff roles can only see their own sessions
    const isStaffRole = user.role === "STAFF" || user.role === "ATTENDANCE_STAFF" || user.role === "WAREHOUSE_STAFF"
    if (isStaffRole) {
      if (session.user_id !== user.id) {
        return NextResponse.json(
          { success: false, error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    } else if (user.role === "WAREHOUSE_MANAGER") {
      const isOwnShift = session.user_id === user.id
      const isInTheirWarehouse = user.warehouseId && session.warehouse_id === user.warehouseId

      let isUserInManagerWarehouse = false
      if (sessionType === 'attendance_session') {
        isUserInManagerWarehouse = user.warehouseId && session.users_attendance_sessions_user_idTousers?.warehouse_id === user.warehouseId
      } else if (sessionType === 'shift_session') {
        isUserInManagerWarehouse = user.warehouseId && session.users_shift_sessions_user_idTousers?.warehouse_id === user.warehouseId
      }

      if (!isOwnShift && !isInTheirWarehouse && !isUserInManagerWarehouse) {
        return NextResponse.json(
          { success: false, error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    } else if (user.role === "GENERAL_MANAGER") {
      // GENERAL_MANAGER can view shifts in their assigned warehouses
      const hasAccess = user.warehouseIds?.includes(session.warehouse_id)
      if (!hasAccess) {
        return NextResponse.json(
          { success: false, error: "Insufficient permissions" },
          { status: 403 }
        )
      }
    }

    // Get all invoices for this shift - always use sales_session_id since sales_invoices links to sales_sessions
    const invoices = await prisma.sales_invoices.findMany({
      where: { sales_session_id: id },
      include: {
        items: {
          include: {
            product_recipes: true
          }
        },
        voucher: {
          include: {
            program: true
          }
        }
      }
    })

    // Initialize hourly distribution map (0-23 hours)
    const hourlyMap = new Map<number, { count: number; total: number }>()
    for (let h = 0; h < 24; h++) {
      hourlyMap.set(h, { count: 0, total: 0 })
    }

    // Track product quantities
    const productMap = new Map<string, { recipe: any; quantity: number; revenue: number }>()

    // Track vouchers
    const voucherMap = new Map<string, { code: string; discountAmount: number; count: number }>()

    // Track promotions
    const promotionMap = new Map<string, { name: string; discountAmount: number; count: number }>()

    // Track gift promotions (Buy 1 Get 1)
    const giftPromotionMap = new Map<string, { name: string; discountAmount: number; count: number }>()

    // Calculate analytics
    const analytics = {
      topProducts: [] as any[],
      discountBreakdown: {
        totalDiscount: 0,
        regularDiscount: 0,
        promotionDiscount: 0,
        voucherDiscount: 0,
        giftDiscount: 0 // NEW: Value of free items from GIFT promotions
      },
      vouchersUsed: [] as any[],
      topVouchers: [] as any[],
      paymentBreakdown: {
        cash: { count: 0, total: 0 },
        transfer: { count: 0, total: 0 },
        ewallet: { count: 0, total: 0 }
      },
      hourlyDistribution: [] as any[],
      promotionsUsed: [] as any[],
      giftPromotionsUsed: [] as any[] // NEW: List of GIFT promotions used
    }

    // Process each invoice
    for (const invoice of invoices) {
      const totalAmount = invoice.total_amount ? parseFloat(invoice.total_amount.toString()) : 0
      const discountAmount = invoice.discount_amount ? parseFloat(invoice.discount_amount.toString()) : 0

      // Hourly distribution (use getUTCHours for Vietnam time)
      if (invoice.created_at) {
        const hour = new Date(invoice.created_at).getUTCHours()
        const hourlyData = hourlyMap.get(hour)
        if (hourlyData) {
          hourlyData.count++
          hourlyData.total += totalAmount
        }
      }

      // Payment method tracking
      if (invoice.notes) {
        if (invoice.notes.includes("Tiền mặt") || invoice.notes.includes("CASH")) {
          analytics.paymentBreakdown.cash.count++
          analytics.paymentBreakdown.cash.total += totalAmount
        } else if (invoice.notes.includes("Chuyển khoản") || invoice.notes.includes("TRANSFER")) {
          analytics.paymentBreakdown.transfer.count++
          analytics.paymentBreakdown.transfer.total += totalAmount
        } else if (invoice.notes.includes("Ví Điện Tử") || invoice.notes.includes("EWALLET")) {
          analytics.paymentBreakdown.ewallet.count++
          analytics.paymentBreakdown.ewallet.total += totalAmount
        }
      }

      // Discount tracking
      analytics.discountBreakdown.totalDiscount += discountAmount

      // Promotion tracking
      if (invoice.promotion_id) {
        analytics.discountBreakdown.promotionDiscount += discountAmount
        if (!promotionMap.has(invoice.promotion_id)) {
          promotionMap.set(invoice.promotion_id, {
            name: `Promotion ${invoice.promotion_id.substring(0, 8)}`,
            discountAmount: discountAmount,
            count: 1
          })
        } else {
          const p = promotionMap.get(invoice.promotion_id)!
          p.discountAmount += discountAmount
          p.count++
        }
      }

      // Gift promotion tracking (Buy 1 Get 1)
      if (invoice.gift_promotion_id) {
        // For gift promotions, the discount_amount includes the value of free items
        const giftValue = discountAmount
        analytics.discountBreakdown.giftDiscount += giftValue

        if (!giftPromotionMap.has(invoice.gift_promotion_id)) {
          giftPromotionMap.set(invoice.gift_promotion_id, {
            name: `Mua 1 Tặng 1 (${invoice.gift_promotion_id.substring(0, 8)})`,
            discountAmount: giftValue,
            count: 1
          })
        } else {
          const g = giftPromotionMap.get(invoice.gift_promotion_id)!
          g.discountAmount += giftValue
          g.count++
        }
      }

      // Voucher tracking
      if (invoice.voucher_id && invoice.voucher) {
        if (!voucherMap.has(invoice.voucher_id)) {
          voucherMap.set(invoice.voucher_id, {
            code: invoice.voucher.code,
            discountAmount: discountAmount,
            count: 1
          })
        } else {
          const v = voucherMap.get(invoice.voucher_id)!
          v.discountAmount += discountAmount
          v.count++
        }
        analytics.discountBreakdown.voucherDiscount += discountAmount
      }

      // Product tracking
      if (invoice.items && invoice.items.length > 0) {
        for (const item of invoice.items) {
          const recipeId = item.recipe_id
          const quantity = item.quantity
          const lineTotal = item.line_total ? parseFloat(item.line_total.toString()) : 0

          if (!productMap.has(recipeId)) {
            productMap.set(recipeId, {
              recipe: item.product_recipes,
              quantity,
              revenue: lineTotal
            })
          } else {
            const p = productMap.get(recipeId)!
            p.quantity += quantity
            p.revenue += lineTotal
          }
        }
      }
    }

    // Convert maps to arrays and sort
    analytics.topProducts = Array.from(productMap.values())
      .map(p => ({
        id: p.recipe.id,
        name: p.recipe.name,
        quantity: p.quantity,
        revenue: p.revenue,
        price: p.recipe.price ? parseFloat(p.recipe.price.toString()) : 0
      }))
      .sort((a, b) => b.quantity - a.quantity)
    // Show all products instead of limiting to top 10

    analytics.vouchersUsed = Array.from(voucherMap.values())
      .map(v => ({
        code: v.code,
        count: v.count,
        totalDiscount: v.discountAmount
      }))
      .sort((a, b) => b.count - a.count)

    analytics.topVouchers = Array.from(voucherMap.values())
      .map(v => ({
        code: v.code,
        count: v.count,
        totalDiscount: v.discountAmount
      }))
      .sort((a, b) => b.count - a.count)

    analytics.promotionsUsed = Array.from(promotionMap.values())
      .map(p => ({
        name: p.name,
        count: p.count,
        totalDiscount: p.discountAmount
      }))
      .sort((a, b) => b.count - a.count)

    // Gift promotions (Buy 1 Get 1)
    analytics.giftPromotionsUsed = Array.from(giftPromotionMap.values())
      .map(g => ({
        name: g.name,
        count: g.count,
        totalGiftValue: g.discountAmount
      }))
      .sort((a, b) => b.count - a.count)

    analytics.hourlyDistribution = Array.from(hourlyMap.entries())
      .map(([hour, data]) => ({
        hour,
        count: data.count,
        total: data.total,
        avgPerTransaction: data.count > 0 ? data.total / data.count : 0
      }))
      .sort((a, b) => a.hour - b.hour)

    // Filter peak hours (only hours with orders, sorted by count)
    const peakHours = analytics.hourlyDistribution
      .filter(h => h.count > 0)
      .sort((a, b) => b.count - a.count)

    // Calculate summary statistics
    // Net revenue = what customer actually paid (total_amount)
    const netRevenue = invoices.reduce((sum, inv) =>
      sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0), 0)

    // Total discount = includes regular discounts + gift item values
    const totalDiscountValue = invoices.reduce((sum, inv) =>
      sum + (inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0), 0)

    // Gross revenue = net revenue + total discounts (what customer would have paid without discounts/gifts)
    const grossRevenue = netRevenue + totalDiscountValue

    const totalProducts = Array.from(productMap.values()).reduce((sum, p) => sum + p.quantity, 0)
    const invoicesWithVoucher = invoices.filter(inv => inv.voucher_id).length
    const invoicesWithPromotion = invoices.filter(inv => inv.promotion_id).length
    const invoicesWithGiftPromotion = invoices.filter(inv => inv.gift_promotion_id).length

    const summaryStats = {
      totalInvoices: invoices.length,
      // Revenue breakdown
      grossRevenue, // Before discounts/gifts
      netRevenue, // After discounts/gifts (actual money received)
      totalDiscount: totalDiscountValue, // All discounts including gift values
      // Legacy field for backward compatibility
      totalRevenue: netRevenue,
      avgRevenuePerOrder: invoices.length > 0 ? netRevenue / invoices.length : 0,
      totalProductsSold: totalProducts,
      avgProductsPerOrder: invoices.length > 0 ? totalProducts / invoices.length : 0,
      uniqueProducts: productMap.size,
      peakHour: peakHours.length > 0 ? peakHours[0] : null,
      bestSellingProduct: analytics.topProducts.length > 0 ? analytics.topProducts[0] : null,
      // Usage rates
      voucherUsageRate: invoices.length > 0 ? (invoicesWithVoucher / invoices.length) * 100 : 0,
      promotionUsageRate: invoices.length > 0 ? (invoicesWithPromotion / invoices.length) * 100 : 0,
      giftPromotionUsageRate: invoices.length > 0 ? (invoicesWithGiftPromotion / invoices.length) * 100 : 0,
      // Counts
      voucherCount: invoicesWithVoucher,
      promotionCount: invoicesWithPromotion,
      giftPromotionCount: invoicesWithGiftPromotion,
    }

    return NextResponse.json({
      success: true,
      data: {
        shift: {
          ...session,
          type: sessionType
        },
        invoiceCount: invoices.length,
        analytics,
        peakHours,
        summaryStats
      }
    })
  } catch (error) {
    console.error("Get shift analytics error:", error)
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    )
  }
}
