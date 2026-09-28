import { NextRequest, NextResponse } from 'next/server'
import { startOfDay, endOfDay } from 'date-fns'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'

async function getUser(request: NextRequest) {
  const token = getAuthToken(request)

  if (!token) {
    return null
  }

  try {
    const user = verifyToken(token)
    return user as any
  } catch {
    return null
  }
}

// GET /api/reports/sales - Lấy báo cáo doanh số bán hàng
export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Cho phép QuanLyKhoCon, WAREHOUSE_MANAGER, GENERAL_MANAGER, Admin và AdminKhoTong xem báo cáo
    const allowedRoles = ['QuanLyKhoCon', 'WAREHOUSE_MANAGER', 'GENERAL_MANAGER', 'Admin', 'ADMIN', 'AdminKhoTong']
    if (!allowedRoles.includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const warehouseId = searchParams.get('warehouseId')
    const categoryId = searchParams.get('categoryId')
    const menuTypeId = searchParams.get('menuTypeId')
    const promotionId = searchParams.get('promotionId')

    // Handle warehouse_id from user
    const userWarehouseId = (user as any).warehouse_id || (user as any).warehouseId
    let finalWarehouseId = warehouseId || userWarehouseId

    // For GENERAL_MANAGER, use selected warehouse from query parameter
    if (user.role === 'GENERAL_MANAGER' && warehouseId) {
      finalWarehouseId = warehouseId
    }

    // Admin roles can view all warehouses
    const isAdmin = ['Admin', 'ADMIN', 'AdminKhoTong'].includes(user.role)
    if (!finalWarehouseId && !isAdmin) {
      return NextResponse.json({ error: 'Warehouse not found' }, { status: 400 })
    }


    // Build date filter
    const dateFilter: any = {}
    if (startDate) {
      // Use startOfDay to ensure we capture from 00:00:00.000
      dateFilter.gte = startOfDay(new Date(startDate))
    }
    if (endDate) {
      // Use endOfDay to ensure we capture -up to 23:59:59.999
      dateFilter.lte = endOfDay(new Date(endDate))
    }

    // Build where clause for invoices
    const whereClause: any = {}
    if (finalWarehouseId) {
      whereClause.warehouse_id = finalWarehouseId
    }
    if (Object.keys(dateFilter).length > 0) {
      whereClause.created_at = dateFilter
    }

    // Filter by promotion
    if (promotionId) {
      whereClause.promotion_id = promotionId
    }

    // Build filter for items based on category/menu_type
    const itemsWhereClause: any = {}
    if (categoryId) {
      itemsWhereClause.product_recipes = {
        category_id: categoryId
      }
    }
    if (menuTypeId) {
      itemsWhereClause.product_recipes = {
        ...itemsWhereClause.product_recipes,
        categories: {
          menu_type_id: menuTypeId
        }
      }
    }

    console.log(`[SalesReport] Debug: Role=${user.role}, Warehouse=${finalWarehouseId}`)
    console.log(`[SalesReport] Debug: DateFilter=`, JSON.stringify(dateFilter))
    console.log(`[SalesReport] Debug: WhereClause=`, JSON.stringify(whereClause))

    // Get all sales invoices with items
    const invoices = await prisma.sales_invoices.findMany({
      where: whereClause,
      include: {
        items: {
          where: Object.keys(itemsWhereClause).length > 0 ? itemsWhereClause : undefined,
          include: {
            product_recipes: {
              select: {
                id: true,
                name: true,
                price: true,
                product_id: true,
                category_id: true,
                categories: {
                  select: {
                    id: true,
                    name: true,
                    menu_type_id: true,
                    menu_types: {
                      select: {
                        id: true,
                        name: true,
                      }
                    }
                  }
                },
                products: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  }
                }
              }
            }
          }
        },
        users: {
          select: {
            id: true,
            full_name: true,
          }
        },
        warehouses: {
          select: {
            id: true,
            name: true,
          }
        },
        voucher: {
          select: {
            id: true,
            code: true,
            program: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    })

    console.log(`[SalesReport] Debug: Found ${invoices.length} invoices.`)
    if (invoices.length > 0) {
      console.log(`[SalesReport] Debug: First Invoice ID=${invoices[0].id}, ItemCount=${invoices[0].items.length}, Warehouse=${invoices[0].warehouse_id}`)
    }

    // Filter out invoices with no items (when category/menu filters are applied)
    // We removed the filter to ensure we see invoices even if items are missing
    const filteredInvoices = invoices // .filter(inv => inv.items.length > 0)

    console.log(`[SalesReport] Debug: Processing ${filteredInvoices.length} invoices`)

    // Aggregate product sales
    const productSalesMap: Record<string, {
      recipe_id: string
      recipe_name: string
      product_code: string | null
      product_name: string | null
      category_name: string | null
      menu_type_name: string | null
      quantity_sold: number
      total_revenue: number
    }> = {}

    for (const invoice of filteredInvoices) {
      // Add invoice items to product sales
      for (const item of invoice.items) {
        const recipeId = item.recipe_id
        const recipe = item.product_recipes

        if (!productSalesMap[recipeId]) {
          productSalesMap[recipeId] = {
            recipe_id: recipeId,
            recipe_name: recipe?.name || 'Không xác định',
            product_code: recipe?.products?.code || null,
            product_name: recipe?.products?.name || null,
            category_name: recipe?.categories?.name || null,
            menu_type_name: recipe?.categories?.menu_types?.name || null,
            quantity_sold: 0,
            total_revenue: 0,
          }
        }

        productSalesMap[recipeId].quantity_sold += item.quantity
        productSalesMap[recipeId].total_revenue += item.line_total ? parseFloat(item.line_total.toString()) : 0
      }

      // Add gift promotion items to product sales
      if (invoice.gift_promotion_id) {
        const giftProducts = await prisma.promotion_gifts.findMany({
          where: { promotion_id: invoice.gift_promotion_id },
          include: {
            products: true
          }
        })

        for (const gift of giftProducts) {
          if (gift.item_type === 'RECIPE') {
            const recipe = await prisma.product_recipes.findUnique({
              where: { id: gift.item_id || '' },
              select: {
                id: true,
                name: true,
                price: true,
                product_id: true,
                category_id: true,
                categories: {
                  select: {
                    id: true,
                    name: true,
                    menu_type_id: true,
                    menu_types: {
                      select: {
                        id: true,
                        name: true,
                      }
                    }
                  }
                },
                products: {
                  select: {
                    id: true,
                    code: true,
                    name: true,
                  }
                }
              }
            })

            if (recipe) {
              const recipeId = recipe.id
              if (!productSalesMap[recipeId]) {
                productSalesMap[recipeId] = {
                  recipe_id: recipeId,
                  recipe_name: recipe.name || 'Không xác định',
                  product_code: recipe.products?.code || null,
                  product_name: recipe.products?.name || null,
                  category_name: recipe.categories?.name || null,
                  menu_type_name: recipe.categories?.menu_types?.name || null,
                  quantity_sold: 0,
                  total_revenue: 0,
                }
              }
              // Add gift quantity and value
              productSalesMap[recipeId].quantity_sold += (gift.quantity || 1)
              productSalesMap[recipeId].total_revenue += recipe.price ? parseFloat(recipe.price.toString()) * (gift.quantity || 1) : 0
            }
          }
        }
      }

      // Add voucher gift items to product sales
      if (invoice.voucher_id) {
        const voucher = await prisma.vouchers.findUnique({
          where: { id: invoice.voucher_id },
          include: {
            program: {
              include: {
                voucher_gifts: true
              }
            }
          }
        })

        if (voucher?.program?.discount_type === 'GIFT' && voucher.program.voucher_gifts) {
          for (const gift of voucher.program.voucher_gifts) {
            if (gift.item_type === 'RECIPE') {
              const recipe = await prisma.product_recipes.findUnique({
                where: { id: gift.item_id },
                select: {
                  id: true,
                  name: true,
                  price: true,
                  product_id: true,
                  category_id: true,
                  categories: {
                    select: {
                      id: true,
                      name: true,
                      menu_type_id: true,
                      menu_types: {
                        select: {
                          id: true,
                          name: true,
                        }
                      }
                    }
                  },
                  products: {
                    select: {
                      id: true,
                      code: true,
                      name: true,
                    }
                  }
                }
              })

              if (recipe) {
                const recipeId = recipe.id
                if (!productSalesMap[recipeId]) {
                  productSalesMap[recipeId] = {
                    recipe_id: recipeId,
                    recipe_name: recipe.name || 'Không xác định',
                    product_code: recipe.products?.code || null,
                    product_name: recipe.products?.name || null,
                    category_name: recipe.categories?.name || null,
                    menu_type_name: recipe.categories?.menu_types?.name || null,
                    quantity_sold: 0,
                    total_revenue: 0,
                  }
                }
                // Add gift quantity and value
                productSalesMap[recipeId].quantity_sold += (gift.quantity || 1)
                productSalesMap[recipeId].total_revenue += recipe.price ? parseFloat(recipe.price.toString()) * (gift.quantity || 1) : 0
              }
            }
          }
        }
      }
    }

    // Sort product sales by revenue
    const productSales = Object.values(productSalesMap).sort((a, b) => b.total_revenue - a.total_revenue)

    // Calculate summary based on filtered items
    let totalRevenue = 0
    let totalDiscount = 0
    let totalGiftValue = 0
    let totalVAT = 0

    for (const invoice of filteredInvoices) {
      const itemsTotal = invoice.items.reduce((sum, item) => {
        return sum + (item.line_total ? parseFloat(item.line_total.toString()) : 0)
      }, 0)
      totalRevenue += itemsTotal

      // Accumulate VAT
      totalVAT += invoice.vat_amount ? parseFloat(invoice.vat_amount.toString()) : 0

      if (invoice.items.length > 0) {
        // Add regular discount amount
        totalDiscount += invoice.discount_amount ? parseFloat(invoice.discount_amount.toString()) : 0

        // Calculate gift value from gift_promotion_id
        if (invoice.gift_promotion_id) {
          const giftProducts = await prisma.promotion_gifts.findMany({
            where: { promotion_id: invoice.gift_promotion_id },
            include: {
              products: true
            }
          })

          for (const gift of giftProducts) {
            if (gift.item_type === 'RECIPE') {
              // For recipe gifts, get the recipe price
              const recipe = await prisma.product_recipes.findUnique({
                where: { id: gift.item_id || '' },
                select: { price: true }
              })
              if (recipe?.price) {
                totalGiftValue += parseFloat(recipe.price.toString()) * (gift.quantity || 1)
              }
            } else if (gift.item_type === 'PRODUCT') {
              // For product gifts, get the product price
              if (gift.products?.price) {
                totalGiftValue += parseFloat(gift.products.price.toString()) * (gift.quantity || 1)
              }
            }
          }
        }

        // Calculate gift value from voucher_id
        if (invoice.voucher_id) {
          const voucher = await prisma.vouchers.findUnique({
            where: { id: invoice.voucher_id },
            include: {
              program: {
                include: {
                  voucher_gifts: true
                }
              }
            }
          })

          if (voucher?.program?.discount_type === 'GIFT' && voucher.program.voucher_gifts) {
            for (const gift of voucher.program.voucher_gifts) {
              if (gift.item_type === 'RECIPE') {
                const recipe = await prisma.product_recipes.findUnique({
                  where: { id: gift.item_id },
                  select: { price: true }
                })
                if (recipe?.price) {
                  totalGiftValue += parseFloat(recipe.price.toString()) * (gift.quantity || 1)
                }
              } else if (gift.item_type === 'PRODUCT') {
                const product = await prisma.products.findUnique({
                  where: { id: gift.item_id },
                  select: { price: true }
                })
                if (product?.price) {
                  totalGiftValue += parseFloat(product.price.toString()) * (gift.quantity || 1)
                }
              }
            }
          }
        }
      }
    }

    // Total discount includes both cash discount and gift values
    totalDiscount += totalGiftValue

    const totalInvoices = filteredInvoices.length

    // Format invoices for response
    const formattedInvoices = filteredInvoices.map(inv => ({
      id: inv.id,
      invoice_number: inv.invoice_number,
      total_amount: inv.items.reduce((sum, item) => sum + (item.line_total ? parseFloat(item.line_total.toString()) : 0), 0),
      discount_amount: inv.discount_amount ? parseFloat(inv.discount_amount.toString()) : 0,
      vat_amount: inv.vat_amount ? parseFloat(inv.vat_amount.toString()) : 0,
      has_vat: inv.has_vat || false,
      voucher_code: inv.voucher?.code || null,
      voucher_program_name: inv.voucher?.program?.name || null,
      created_by_name: inv.users?.full_name || 'Không xác định',
      warehouse_name: inv.warehouses?.name || 'Không xác định',
      created_at: inv.created_at?.toISOString() || null,
      items: inv.items.map(item => ({
        recipe_name: item.product_recipes?.name || 'Không xác định',
        product_code: item.product_recipes?.products?.code || null,
        product_name: item.product_recipes?.products?.name || null,
        category_name: item.product_recipes?.categories?.name || null,
        menu_type_name: item.product_recipes?.categories?.menu_types?.name || null,
        quantity: item.quantity,
        unit_price: item.unit_price ? parseFloat(item.unit_price.toString()) : 0,
        line_total: item.line_total ? parseFloat(item.line_total.toString()) : 0,
      }))
    }))

    // Calculate daily breakdown for multi-day reports
    // ... (rest is same, skipped for brevity in replacement)
    // Wait, I need to preserve the rest. I'll include the return statement updates.

    // ... (Continuing the replacement)

    const dailyBreakdownMap: Record<string, {
      date: string
      revenue: number
      invoiceCount: number
      discount: number
      vat: number // Add VAT
    }> = {}

    for (const invoice of filteredInvoices) {
      if (invoice.created_at) {
        // Format date as YYYY-MM-DD in local timezone
        const dateKey = invoice.created_at.toISOString().split('T')[0]

        if (!dailyBreakdownMap[dateKey]) {
          dailyBreakdownMap[dateKey] = {
            date: dateKey,
            revenue: 0,
            invoiceCount: 0,
            discount: 0,
            vat: 0 // Add VAT
          }
        }

        const invoiceTotal = invoice.items.reduce((sum, item) =>
          sum + (item.line_total ? parseFloat(item.line_total.toString()) : 0), 0
        )

        dailyBreakdownMap[dateKey].revenue += invoiceTotal
        dailyBreakdownMap[dateKey].invoiceCount += 1
        dailyBreakdownMap[dateKey].discount += invoice.discount_amount ? parseFloat(invoice.discount_amount.toString()) : 0
        dailyBreakdownMap[dateKey].vat += invoice.vat_amount ? parseFloat(invoice.vat_amount.toString()) : 0
      }
    }

    // Sort daily breakdown by date
    const dailyBreakdown = Object.values(dailyBreakdownMap).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    )

    // Calculate hourly breakdown for order distribution
    const hourlyBreakdownMap: Record<number, {
      hour: number
      label: string
      invoiceCount: number
      revenue: number
    }> = {}

    // Initialize all 24 hours
    for (let h = 0; h < 24; h++) {
      hourlyBreakdownMap[h] = {
        hour: h,
        label: `${h.toString().padStart(2, '0')}:00`,
        invoiceCount: 0,
        revenue: 0,
      }
    }

    for (const invoice of filteredInvoices) {
      if (invoice.created_at) {
        const hour = invoice.created_at.getHours()
        const invoiceTotal = invoice.items.reduce((sum, item) =>
          sum + (item.line_total ? parseFloat(item.line_total.toString()) : 0), 0
        )
        hourlyBreakdownMap[hour].invoiceCount += 1
        hourlyBreakdownMap[hour].revenue += invoiceTotal
      }
    }

    // Convert to array and sort by hour
    const hourlyBreakdown = Object.values(hourlyBreakdownMap).sort((a, b) => a.hour - b.hour)

    return NextResponse.json({
      success: true,
      data: {
        summary: {
          // Gross revenue = sum of all items at full price (before discounts/gifts)
          gross_revenue: totalRevenue,
          // Total revenue = same as gross (backward compatible)
          total_revenue: totalRevenue,
          // Total discount includes regular discounts + gift item values
          total_discount: totalDiscount,
          // Value of all gifts (voucher + promotion)
          total_gift_value: totalGiftValue,
          // Net revenue = actual money received (gross - discounts)
          net_revenue: totalRevenue - totalDiscount,
          // Total VAT collected
          total_vat: totalVAT,
          total_invoices: totalInvoices,
        },
        product_sales: productSales,
        invoices: formattedInvoices,
        daily_breakdown: dailyBreakdown,
        hourly_breakdown: hourlyBreakdown,
      }
    })
  } catch (error: any) {
    console.error('Error fetching sales report:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch sales report' },
      { status: 500 }
    )
  }
}
