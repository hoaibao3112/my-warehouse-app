import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"

/**
 * Sales Invoice Detail API - COMPLETE REWRITE
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Fetch invoice with all available relations
    const invoice = await prisma.sales_invoices.findUnique({
      where: { id },
      include: {
        warehouses: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        users: {
          select: {
            id: true,
            full_name: true,
            email: true
          }
        },
        sales_sessions: {
          select: {
            id: true,
            session_date: true,
            status: true
          }
        },
        items: {
          include: {
            product_recipes: {
              select: {
                name: true,
                price: true
              }
            }
          }
        },
        voucher: {
          select: {
            id: true,
            code: true,
            is_used: true,
            used_at: true,
            program: {
              select: {
                name: true,
                discount_type: true,
                discount_value: true
              }
            }
          }
        }
      }
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Fetch promotions separately (no relation in schema)
    let promotion = null
    let giftPromotion = null

    if (invoice.promotion_id) {
      promotion = await prisma.promotions.findUnique({
        where: { id: invoice.promotion_id },
        select: {
          id: true,
          name: true,
          promotion_type: true,
          discount_type: true,
          discount_value: true
        }
      })
    }

    if (invoice.gift_promotion_id) {
      giftPromotion = await prisma.promotions.findUnique({
        where: { id: invoice.gift_promotion_id },
        select: {
          id: true,
          name: true,
          promotion_type: true
        }
      })
    }

    // Format voucher for frontend
    const formattedVoucher = invoice.voucher ? {
      id: invoice.voucher.id,
      code: invoice.voucher.code,
      discount_type: invoice.voucher.program?.discount_type,
      discount_value: invoice.voucher.program?.discount_value
    } : null

    // Build complete response
    const response = {
      ...invoice,
      created_by: invoice.users?.full_name || "N/A",
      promotion,
      giftPromotion,
      voucher: formattedVoucher
    }

    return NextResponse.json({
      success: true,
      data: response
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error fetching invoice:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get invoice to verify ownership/warehouse
    const invoice = await prisma.sales_invoices.findUnique({
      where: { id },
      select: { id: true, warehouse_id: true, created_by: true, invoice_number: true, created_at: true }
    })

    if (!invoice) {
      return NextResponse.json(
        { success: false, error: "Invoice not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // CHECK INVENTORY LOCK - Block if inventory check is in progress
    const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
    const lockCheck = await checkInventoryCheckLock(invoice.warehouse_id)
    if (lockCheck.isLocked) {
      return NextResponse.json(
        { success: false, error: lockCheck.message } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // CHECK COMPLETED INVENTORY - Block if invoice created before last completed inventory
    const lastCompletedCheck = await prisma.inventory_check_completions.findFirst({
      where: { warehouse_id: invoice.warehouse_id },
      orderBy: { completed_at: 'desc' },
      select: { completed_at: true, check: { select: { number: true } } }
    })

    if (lastCompletedCheck && invoice.created_at && lastCompletedCheck.completed_at) {
      if (new Date(invoice.created_at) < new Date(lastCompletedCheck.completed_at)) {
        return NextResponse.json(
          {
            success: false,
            error: `Không thể xóa hóa đơn. Đã có kiểm kê ${lastCompletedCheck.check?.number || ''} hoàn thành sau hóa đơn này.`
          } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    // Check authorization
    let isAuthorized = false

    if (user.role === 'ADMIN') {
      isAuthorized = true
    } else if (invoice.created_by === user.id) {
      isAuthorized = true
    } else if (user.role === 'GENERAL_MANAGER') {
      const userAssignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      const managedIds = userAssignments.map(a => a.warehouse_id)
      if (managedIds.includes(invoice.warehouse_id)) {
        isAuthorized = true
      }
    } else if ((user.role === 'MANAGER' || user.role === 'WAREHOUSE_MANAGER' || user.role === 'QuanLyKhoCon') && user.warehouseId === invoice.warehouse_id) {
      isAuthorized = true
    }

    if (!isAuthorized) {
      return NextResponse.json(
        { success: false, error: "Forbidden: You do not have permission to delete this invoice" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Perform deletion and stock restoration in transaction
    let restoredCount = 0
    await prisma.$transaction(async (tx) => {
      // 1. Find all recipe deductions for this invoice
      const deductions = await tx.recipe_deductions.findMany({
        where: { invoice_id: id },
        include: {
          ingredients: true
        }
      })

      console.log(`[Invoice Delete] Found ${deductions.length} recipe deductions for invoice ${invoice.invoice_number}`)

      // 2. Restore inventory for each deducted ingredient
      for (const deduction of deductions) {
        for (const item of deduction.ingredients) {
          try {
            // Check if stock record exists
            const stockRecord = await tx.warehouse_stock_realtime.findUnique({
              where: {
                warehouse_id_product_id: {
                  warehouse_id: invoice.warehouse_id,
                  product_id: item.ingredient_id
                }
              }
            })

            if (stockRecord) {
              await tx.warehouse_stock_realtime.update({
                where: {
                  warehouse_id_product_id: {
                    warehouse_id: invoice.warehouse_id,
                    product_id: item.ingredient_id
                  }
                },
                data: {
                  quantity: { increment: item.quantity_deducted },
                  qty_sold: { increment: item.quantity_deducted }
                }
              })
              restoredCount++
              console.log(`[Invoice Delete] Restored ${item.quantity_deducted} of product ${item.ingredient_id}`)
            } else {
              console.warn(`[Invoice Delete] No stock record found for product ${item.ingredient_id} in warehouse ${invoice.warehouse_id}`)
            }
          } catch (err) {
            console.error(`[Invoice Delete] Error restoring product ${item.ingredient_id}:`, err)
          }
        }
      }

      // 3. Delete invoice (cascades to items and recipe_deductions)
      await tx.sales_invoices.delete({
        where: { id }
      })
    })

    return NextResponse.json({
      success: true,
      message: `Đã xóa hóa đơn ${invoice.invoice_number} và hoàn lại ${restoredCount} nguyên liệu thành công`
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error deleting invoice:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
