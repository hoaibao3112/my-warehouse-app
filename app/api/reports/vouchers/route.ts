import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { prisma } from "@/lib/prisma"
import { query } from "@/lib/prisma"

interface VoucherWithInvoices {
  program: {
    id: string
    programName: string
    discountType: string
    discountValue: number
    status: boolean
    totalCodes: number
    usedCodes: number
    usageRate: number
    startDate: string
    endDate: string
    totalValue: number
    totalRevenue: number
    netRevenue: number
    createdAt: string
  }
  invoices: Array<{
    invoiceNumber: string
    voucherCode: string
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

    console.log(`[Voucher Report] Query params - startDate: ${startDate}, endDate: ${endDate}, warehouseId: ${warehouseId}`)

    // Build query for voucher programs
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

    // Fetch voucher programs
    const voucherPrograms = await prisma.voucher_programs.findMany({
      where,
      include: {
        vouchers: {
          select: {
            id: true,
            is_used: true,
            code: true
          }
        }
      },
      orderBy: {
        created_at: "desc"
      }
    })

    console.log(`[Voucher Report] Found ${voucherPrograms.length} voucher programs`)
    voucherPrograms.forEach(program => {
      console.log(`[Voucher Report] Program: ${program.name}, Vouchers: ${program.vouchers.length}`)
      const usedVouchers = program.vouchers.filter(v => v.is_used)
      console.log(`[Voucher Report] Used vouchers for ${program.name}: ${usedVouchers.map(v => `${v.code}(${v.id})`).join(', ')}`)
    })

    // For each voucher program, fetch related invoices
    const result: VoucherWithInvoices[] = await Promise.all(
      voucherPrograms.map(async (program) => {
        const totalCodes = program.total_codes
        const usedCodes = program.vouchers?.filter(v => v.is_used).length || 0
        const usageRate = totalCodes > 0 ? usedCodes / totalCodes : 0

        // Get all vouchers for this program
        const programVouchers = program.vouchers?.map(v => v.id) || []

        console.log(`[Voucher Report] Program: ${program.name}, Total Codes: ${totalCodes}, Used Codes: ${usedCodes}, Voucher IDs: ${programVouchers.length}`)

        // Get invoices that used vouchers from this program
        let invoices: any[] = []

        if (programVouchers.length > 0) {
          console.log(`[Voucher Report] Looking for invoices with voucher IDs: ${programVouchers.join(', ')}`)

          // For Method 1: Direct voucher_id lookup
          let queryParams1 = [programVouchers]
          let dateCondition = ""
          let warehouseCondition = ""
          let paramIndex = 2

          if (startDate && endDate) {
            dateCondition = `AND si.created_at >= $${paramIndex} AND si.created_at <= $${paramIndex + 1}`
            queryParams1.push(startDate, endDate)
            paramIndex += 2
          }

          if (warehouseId) {
            warehouseCondition = `AND si.warehouse_id = $${paramIndex}`
            queryParams1.push(warehouseId)
            paramIndex += 1
          }

          let invoiceRows = await query(
            `SELECT si.id, si.invoice_number, si.total_amount, si.discount_amount, 
             si.created_at, si.voucher_id,
             u.full_name, v.code
             FROM sales_invoices si
             LEFT JOIN users u ON si.created_by = u.id
             LEFT JOIN vouchers v ON si.voucher_id = v.id
             WHERE si.voucher_id = ANY($1::uuid[])
             ${dateCondition}
             ${warehouseCondition}
             ORDER BY si.created_at DESC`,
            queryParams1
          ) as any[]

          console.log(`[Voucher Report] Method 1 (direct voucher_id): Found ${invoiceRows.length} invoices`)

          // Method 2: If no results, try looking for invoices by matching used voucher codes in notes
          if (invoiceRows.length === 0) {
            // Check used vouchers
            const usedVouchersInProgram = await query(
              `SELECT v.id, v.code, v.used_at FROM vouchers v WHERE v.program_id = $1 AND v.is_used = true ORDER BY v.used_at DESC`,
              [program.id]
            ) as any[]

            if (usedVouchersInProgram.length > 0) {
              console.log(`[Voucher Report] Method 1 failed, trying Method 2 - matching by voucher codes in notes`)
              const voucherCodes = usedVouchersInProgram.map(v => v.code)

              // Build WHERE clause dynamically for each code
              const whereConditions = voucherCodes.map((_, idx) => `si.notes ILIKE $${idx + 1}`).join(' OR ')
              const params = [...voucherCodes]
              let currentParamIdx = voucherCodes.length + 1

              let method2DateCondition = ""
              let method2WarehouseCondition = ""

              if (startDate && endDate) {
                method2DateCondition = `AND si.created_at >= $${currentParamIdx} AND si.created_at <= $${currentParamIdx + 1}`
                params.push(startDate, endDate)
                currentParamIdx += 2
              }

              if (warehouseId) {
                method2WarehouseCondition = `AND si.warehouse_id = $${currentParamIdx}`
                params.push(warehouseId)
                currentParamIdx += 1
              }

              invoiceRows = await query(
                `SELECT si.id, si.invoice_number, si.total_amount, si.discount_amount, 
                        si.created_at, si.voucher_id, si.notes,
                        u.full_name, v.code
                FROM sales_invoices si
                LEFT JOIN users u ON si.created_by = u.id
                LEFT JOIN vouchers v ON si.voucher_id = v.id
                WHERE si.notes IS NOT NULL AND (${whereConditions})
                ${method2DateCondition}
                ${method2WarehouseCondition}
                ORDER BY si.created_at DESC`,
                params
              ) as any[]

              console.log(`[Voucher Report] Method 2 (notes matching): Found ${invoiceRows.length} invoices`)
            }
          }

          // Method 3: If still no results, try matching by program name in notes
          if (invoiceRows.length === 0) {
            console.log(`[Voucher Report] Method 2 failed, trying Method 3 - matching by program name in notes`)

            let queryParams3 = [`%${program.name}%`]
            let m3ParamIdx = 2
            let m3DateCondition = ""
            let m3WarehouseCondition = ""

            if (startDate && endDate) {
              m3DateCondition = `AND si.created_at >= $${m3ParamIdx} AND si.created_at <= $${m3ParamIdx + 1}`
              queryParams3.push(startDate, endDate)
              m3ParamIdx += 2
            }

            if (warehouseId) {
              m3WarehouseCondition = `AND si.warehouse_id = $${m3ParamIdx}`
              queryParams3.push(warehouseId)
              m3ParamIdx += 1
            }

            invoiceRows = await query(
              `SELECT si.id, si.invoice_number, si.total_amount, si.discount_amount, 
                      si.created_at, si.voucher_id,
                      u.full_name, v.code
               FROM sales_invoices si
               LEFT JOIN users u ON si.created_by = u.id
               LEFT JOIN vouchers v ON si.voucher_id = v.id
               WHERE si.notes IS NOT NULL AND si.notes ILIKE $1
               ${m3DateCondition}
               ${m3WarehouseCondition}
               ORDER BY si.created_at DESC`,
              queryParams3
            ) as any[]

            console.log(`[Voucher Report] Method 3 (program name matching): Found ${invoiceRows.length} invoices`)
          }

          // Assign items
          invoices = invoiceRows.map(row => ({
            invoice_number: row.invoice_number,
            voucher_id: row.voucher_id,
            voucher_code: row.code || '',
            total_amount: row.total_amount,
            discount_amount: row.discount_amount,
            created_at: row.created_at,
            created_by: row.full_name || '',
            voucher: row.code ? { code: row.code } : null,
            users: row.full_name ? { full_name: row.full_name } : null
          }))

          console.log(`[Voucher Report] Final result: Found ${invoices.length} invoices for program ${program.name}`)
        } else {
          console.log(`[Voucher Report] No vouchers found for program ${program.name}, skipping invoice query`)
        }

        // Fetch invoice items and calculate gift values
        let totalGiftValue = 0
        const invoicesWithDetails = await Promise.all(invoices.map(async (invoiceRow: any) => {
          // Fetch invoice items
          const items = await prisma.sales_invoice_items.findMany({
            where: { invoice_id: invoiceRow.id || '' },
            include: {
              product_recipes: {
                select: {
                  id: true,
                  name: true,
                  price: true
                }
              }
            }
          })

          // Calculate gift value for GIFT type vouchers
          let giftItems: any[] = []
          let giftValue = 0

          if (program.discount_type === 'GIFT') {
            const gifts = await prisma.voucher_gifts.findMany({
              where: { program_id: program.id },
              select: {
                item_id: true,
                item_type: true,
                quantity: true
              }
            })

            for (const gift of gifts) {
              let itemName = 'Không xác định'
              let itemPrice = 0

              if (gift.item_type === 'RECIPE') {
                const recipe = await prisma.product_recipes.findUnique({
                  where: { id: gift.item_id },
                  select: { name: true, price: true }
                })
                if (recipe) {
                  itemName = recipe.name
                  itemPrice = Number(recipe.price || 0)
                }
              } else if (gift.item_type === 'PRODUCT') {
                const product = await prisma.products.findUnique({
                  where: { id: gift.item_id },
                  select: { name: true, price: true }
                })
                if (product) {
                  itemName = product.name
                  itemPrice = Number(product.price || 0)
                }
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
            ...invoiceRow,
            items,
            giftItems,
            giftValue
          }
        }))

        const totalDiscount = invoices.reduce((sum, inv) => sum + Number(inv.discount_amount || 0), 0)
        const totalRevenue = invoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
        const grossRevenue = totalRevenue + totalDiscount + totalGiftValue
        const netRevenue = totalRevenue

        return {
          program: {
            id: program.id,
            programName: program.name,
            discountType: program.discount_type,
            discountValue: Number(program.discount_value),
            status: program.is_active,
            totalCodes: totalCodes,
            usedCodes: usedCodes,
            usageRate: usageRate,
            startDate: program.start_date?.toISOString() || "",
            endDate: program.end_date?.toISOString() || "",
            totalValue: totalDiscount,
            totalGiftValue: totalGiftValue,
            grossRevenue: grossRevenue,
            totalRevenue: netRevenue,
            netRevenue: netRevenue,
            invoiceCount: invoices.length,
            createdAt: program.created_at?.toISOString() || ""
          },
          invoices: invoicesWithDetails.map((invoice) => ({
            id: invoice.id,
            invoiceNumber: invoice.invoice_number || invoice.invoice_number,
            voucherCode: invoice.voucher_code,
            totalAmount: Number(invoice.total_amount || 0),
            discountAmount: Number(invoice.discount_amount || 0),
            giftValue: invoice.giftValue || 0,
            createdAt: invoice.created_at?.toISOString?.() || invoice.created_at || "",
            createdBy: invoice.created_by || "",
            items: (invoice.items || []).map((item: any) => ({
              recipe_name: item.product_recipes?.name || 'Không xác định',
              quantity: item.quantity,
              unit_price: Number(item.unit_price || 0),
              line_total: Number(item.line_total || 0)
            })),
            giftItems: invoice.giftItems || []
          }))
        }
      })
    )

    return NextResponse.json({
      success: true,
      data: result
    } as ApiResponse<any>)

  } catch (error: any) {
    console.error("Error fetching vouchers:", error)
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
