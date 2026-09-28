import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"

interface PromotionWithInvoices {
  promotion: {
    id: string
    name: string
    discountType: string
    discountValue: number
    promotionType: string
    status: boolean
    startDate: string
    endDate: string
    affectedProducts: number
    totalDiscount: number
    totalRevenue: number
    netRevenue: number
    createdAt: string
  }
  invoices: Array<{
    invoiceNumber: string
    totalAmount: number
    discountAmount: number
    createdAt: string
    createdBy: string
  }>
}

export async function GET(request: NextRequest) {
  try {
    // Authenticate user
    const token = getAuthToken(request)
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload || !payload.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    // Get current user
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true }
    })

    if (!user) {
      return NextResponse.json({ success: false, error: "User not found" } as ApiResponse<null>, { status: 404 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const startDateStr = searchParams.get("startDate")
    const endDateStr = searchParams.get("endDate")
    const warehouseId = searchParams.get("warehouseId")

    let startDate: Date | null = null
    let endDate: Date | null = null

    if (startDateStr) {
      startDate = new Date(startDateStr)
      startDate.setHours(0, 0, 0, 0)
    }

    if (endDateStr) {
      endDate = new Date(endDateStr)
      endDate.setHours(23, 59, 59, 999)
    }

    // Build query for promotions
    const where: any = {}

    if (startDate && endDate) {
      where.OR = [
        {
          start_date: {
            gte: startDate,
            lte: endDate
          }
        },
        {
          end_date: {
            gte: startDate,
            lte: endDate
          }
        },
        {
          AND: [
            { start_date: { lte: startDate } },
            { end_date: { gte: endDate } }
          ]
        }
      ]
    }

    // Fetch promotions with their invoices
    const promotions = await prisma.promotions.findMany({
      where,
      include: {
        promotion_products: {
          select: { id: true }
        }
      },
      orderBy: {
        created_at: "desc"
      }
    })

    // For each promotion, fetch related invoices
    // Check both promotion_id and gift_promotion_id (for GIFT/Buy 1 Get 1 promotions)
    const result: PromotionWithInvoices[] = await Promise.all(
      promotions.map(async (promo) => {
        const invoiceWhere: any = {
          OR: [
            { promotion_id: promo.id },
            { gift_promotion_id: promo.id }
          ]
        }

        if (startDate && endDate) {
          invoiceWhere.created_at = {
            gte: startDate,
            lte: endDate
          }
        }

        if (warehouseId) {
          invoiceWhere.warehouse_id = warehouseId
        }

        const invoices = await prisma.sales_invoices.findMany({
          where: invoiceWhere,
          include: {
            users: {
              select: { full_name: true }
            },
            items: {
              include: {
                product_recipes: {
                  select: {
                    id: true,
                    name: true,
                    price: true
                  }
                }
              }
            }
          },
          orderBy: {
            created_at: "desc"
          }
        })

        // Calculate gift value for each invoice
        let totalGiftValue = 0
        const invoicesWithDetails = await Promise.all(invoices.map(async (invoice) => {
          let giftItems: any[] = []
          let giftValue = 0

          // Get gift items if this promotion is a gift promotion
          if (promo.promotion_type === 'GIFT' && invoice.gift_promotion_id === promo.id) {
            const gifts = await prisma.promotion_gifts.findMany({
              where: { promotion_id: promo.id },
              include: {
                products: {
                  select: { name: true, price: true }
                }
              }
            })

            for (const gift of gifts) {
              let itemName = 'Không xác định'
              let itemPrice = 0

              if (gift.item_type === 'RECIPE') {
                const recipe = await prisma.product_recipes.findUnique({
                  where: { id: gift.item_id || '' },
                  select: { name: true, price: true }
                })
                if (recipe) {
                  itemName = recipe.name
                  itemPrice = Number(recipe.price || 0)
                }
              } else if (gift.item_type === 'PRODUCT' && gift.products) {
                itemName = gift.products.name
                itemPrice = Number(gift.products.price || 0)
              }

              const qty = gift.quantity || 1
              const lineTotal = itemPrice * qty
              giftValue += lineTotal

              giftItems.push({
                name: itemName,
                quantity: qty,
                unit_price: itemPrice,
                line_total: lineTotal
              })
            }
          }

          totalGiftValue += giftValue

          return {
            invoice,
            giftItems,
            giftValue
          }
        }))

        const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0)
        const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
        // Gross revenue = net revenue + discount + gift value
        const grossRevenue = totalRevenue + totalDiscount + totalGiftValue
        const netRevenue = totalRevenue

        return {
          promotion: {
            id: promo.id,
            name: promo.name,
            discountType: promo.discount_type,
            discountValue: Number(promo.discount_value),
            promotionType: promo.promotion_type || "DISCOUNT",
            status: promo.is_active,
            startDate: promo.start_date?.toISOString() || "",
            endDate: promo.end_date?.toISOString() || "",
            affectedProducts: promo.promotion_products?.length || 0,
            totalDiscount: totalDiscount,
            totalGiftValue: totalGiftValue,
            grossRevenue: grossRevenue, // Before discounts
            totalRevenue: netRevenue, // Actual revenue received (backward compatible)
            netRevenue: netRevenue, // Actual revenue received
            invoiceCount: invoices.length,
            createdAt: promo.created_at?.toISOString() || ""
          },
          invoices: invoicesWithDetails.map(({ invoice, giftItems, giftValue }) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoice_number,
            totalAmount: Number(invoice.total_amount || 0),
            discountAmount: Number(invoice.discount_amount || 0),
            giftValue: giftValue,
            createdAt: invoice.created_at?.toISOString() || "",
            createdBy: invoice.users?.full_name || "",
            items: invoice.items.map(item => ({
              recipe_name: item.product_recipes?.name || 'Không xác định',
              quantity: item.quantity,
              unit_price: Number(item.unit_price || 0),
              line_total: Number(item.line_total || 0)
            })),
            giftItems: giftItems
          }))
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: result
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching promotions:", error)
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
