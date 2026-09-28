import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query, runTransaction, getVietnamTime } from "@/lib/prisma"
import { verifyToken, isAdmin, canAccessWarehouse } from "@/lib/auth"
import { randomUUID } from "crypto"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Authenticate user
    const token = getAuthToken(request)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get current user info
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, warehouse_id: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // For GENERAL_MANAGER, load warehouse assignments
    let warehouseIds: string[] = []
    if (user.role === 'GENERAL_MANAGER') {
      const assignments = await prisma.user_warehouse_assignments.findMany({
        where: { user_id: user.id },
        select: { warehouse_id: true }
      })
      warehouseIds = assignments.map((a: any) => a.warehouse_id)
    }
    const userWithAssignments = { ...user, warehouseIds }

    const { id } = await params

    // Get basic report info
    const reportRows = (await query(
      `SELECT ilr.id, ilr.report_number, ilr.warehouse_id, ilr.reason, ilr.reported_by, ilr.approved_by, ilr.created_at, ilr.updated_at
       FROM inventory_loss_reports ilr
       WHERE ilr.id = ?`,
      [id]
    )) as any[]

    if (!reportRows || reportRows.length === 0) {
      return NextResponse.json(
        { success: false, error: "Báo cáo không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const report = reportRows[0]

    // Check warehouse access
    // Allow if user is the reporter OR if they have access to the warehouse
    const isOwner = report.reported_by === user.id
    if (!isOwner && !canAccessWarehouse(userWithAssignments, report.warehouse_id)) {
      return NextResponse.json(
        { success: false, error: "Forbidden: Cannot access other warehouse's data" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Get all items in this report
    const items = (await query(
      `SELECT ilri.id, ilri.product_id, p.code as product_code, p.name as product_name,
              ilri.unit_id, pu.code as unit_code, pu.name as unit_name,
              ilri.quantity_lost, ilri.unit_price
       FROM inventory_loss_report_items ilri
       LEFT JOIN products p ON ilri.product_id = p.id
       LEFT JOIN product_units pu ON ilri.unit_id = pu.id
       WHERE ilri.report_id = ?
       ORDER BY p.name ASC`,
      [id]
    )) as any[]

    // Check if report is finalized (locked by subsequent inventory check)
    const finalizedCheck = await prisma.inventory_checks.findFirst({
      where: {
        warehouse_id: report.warehouse_id,
        status: 'COMPLETED',
        created_at: { gt: report.created_at }
      }
    })

    const isLocked = !!finalizedCheck

    // ...

    return NextResponse.json(
      {
        success: true,
        data: {
          ...report,
          items,
          totalQuantity,
          totalAmount,
          isLocked, // Return locked status
          lockReason: isLocked ? `Đã có phiếu kiểm kê sau thời điểm tạo phiếu này` : null
        },
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to fetch inventory loss report" } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

import { inventoryService, StockOperation } from "@/lib/services/inventory-service"
import { unitConversionService } from "@/lib/services/unit-conversion-service"
import { isStoreManager } from "@/lib/auth"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { reason, items } = body

    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ success: false, error: "Items array is required" } as ApiResponse<null>, { status: 400 })
    }

    // Reason required check
    if (!reason || reason.trim() === '') {
      return NextResponse.json({
        success: false,
        error: "Vui lòng nhập lý do mất hàng",
      } as ApiResponse<null>, { status: 400 })
    }

    // Check if report exists
    const reportRows = (await query(
      `SELECT id, warehouse_id, reported_by, created_at FROM inventory_loss_reports WHERE id = ?`,
      [id]
    )) as any[]

    if (!reportRows || reportRows.length === 0) {
      return NextResponse.json({ success: false, error: "Báo cáo không tồn tại" } as ApiResponse<null>, { status: 404 })
    }

    const report = reportRows[0]

    // Check if report is finalized (locked by subsequent inventory check)
    const finalizedCheck = await prisma.inventory_checks.findFirst({
      where: {
        warehouse_id: report.warehouse_id,
        status: 'COMPLETED',
        created_at: { gt: report.created_at }
      }
    })

    if (finalizedCheck) {
      return NextResponse.json({
        success: false,
        error: "Không thể chỉnh sửa báo cáo đã được chốt sổ bởi phiếu kiểm kê sau đó"
      } as ApiResponse<null>, { status: 403 })
    }

    // Check ownership/permission
    const isOwner = report.reported_by === user.id
    const canManage = isAdmin(user) || (isStoreManager(user) && canAccessWarehouse(user, report.warehouse_id))

    if (!isOwner && !canManage) {
      return NextResponse.json({ success: false, error: "Bạn không có quyền chỉnh sửa báo cáo này" } as ApiResponse<null>, { status: 403 })
    }

    // Get old items to restore stock
    const oldItems = (await query(
      `SELECT product_id, unit_id, quantity_lost FROM inventory_loss_report_items WHERE report_id = ?`,
      [id]
    )) as any[]

    await prisma.$transaction(async (tx) => {
      const now = new Date()

      // 1. Restore stock for old items (Add back)
      for (const item of oldItems) {
        try {
          const conversion = await unitConversionService.convertToBaseUnit(item.product_id, Number(item.quantity_lost), item.unit_id)
          await inventoryService.updateStock({
            warehouseId: report.warehouse_id,
            productId: item.product_id,
            quantityChange: Math.abs(conversion.baseQuantity), // Positive adjustment to restore
            operation: StockOperation.ADJUSTMENT,
            tx,
            baseUnitId: conversion.baseUnitId
          })
        } catch (e) {
          console.error("Failed to restore stock item", item, e)
          // We continue if product not found etc, though typically should fail.
        }
      }

      // 2. Delete old items
      await tx.$executeRawUnsafe(`DELETE FROM inventory_loss_report_items WHERE report_id = $1::uuid`, id)

      // 3. Update report reason
      await tx.$executeRawUnsafe(
        `UPDATE inventory_loss_reports SET reason = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2::uuid`,
        reason, id
      )

      // 4. Insert new items and deduct stock
      for (const item of items) {
        if (!item.productId || !item.unitId || !item.quantityLost || item.quantityLost <= 0) {
          throw new Error("Invalid item data")
        }

        const itemId = randomUUID()
        const unitPrice = item.unitPrice || 0
        const quantityLost = Number(item.quantityLost)

        // Insert new loss report item
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_loss_report_items (id, report_id, product_id, unit_id, quantity_lost, unit_price, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7::timestamp, $8::timestamp)`,
          itemId, id, item.productId, item.unitId, quantityLost, unitPrice, now, now
        )

        // Deduct new stock
        const conversion = await unitConversionService.convertToBaseUnit(item.productId, quantityLost, item.unitId)
        await inventoryService.updateStock({
          warehouseId: report.warehouse_id,
          productId: item.productId,
          quantityChange: -Math.abs(conversion.baseQuantity), // Negative adjustment
          operation: StockOperation.ADJUSTMENT,
          tx,
          baseUnitId: conversion.baseUnitId
        })
      }
    }, { timeout: 20000 })

    return NextResponse.json({ success: true, message: "Báo cáo đã được cập nhật" } as ApiResponse<any>, { status: 200 })
  } catch (error: any) {
    console.error("Loss Report Patch Error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to update inventory loss report" } as ApiResponse<null>, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })

    const { id } = await params

    const reportRows = (await query(
      `SELECT id, warehouse_id, reported_by, created_at FROM inventory_loss_reports WHERE id = ?`,
      [id]
    )) as any[]

    if (!reportRows || reportRows.length === 0) {
      return NextResponse.json({ success: false, error: "Báo cáo không tồn tại" } as ApiResponse<null>, { status: 404 })
    }

    const report = reportRows[0]

    // Check for finalized inventory check
    const finalizedCheck = await prisma.inventory_checks.findFirst({
      where: {
        warehouse_id: report.warehouse_id,
        status: 'COMPLETED',
        created_at: { gt: report.created_at } // Created AFTER this report
      }
    })

    if (finalizedCheck) {
      return NextResponse.json({
        success: false,
        error: "Không thể xóa báo cáo đã được chốt sổ bởi phiếu kiểm kê sau đó"
      } as ApiResponse<null>, { status: 403 })
    }

    // Check permissions
    const isOwner = report.reported_by === user.id
    const canManage = isAdmin(user) || (isStoreManager(user) && canAccessWarehouse(user, report.warehouse_id))

    if (!isOwner && !canManage) {
      return NextResponse.json({ success: false, error: "Bạn không có quyền xóa báo cáo này" } as ApiResponse<null>, { status: 403 })
    }

    // Get items to restore stock
    const items = (await query(
      `SELECT product_id, unit_id, quantity_lost FROM inventory_loss_report_items WHERE report_id = ?`,
      [id]
    )) as any[]

    await prisma.$transaction(async (tx) => {
      // 1. Restore stock
      for (const item of items) {
        try {
          const conversion = await unitConversionService.convertToBaseUnit(item.product_id, Number(item.quantity_lost), item.unit_id)
          await inventoryService.updateStock({
            warehouseId: report.warehouse_id,
            productId: item.product_id,
            quantityChange: Math.abs(conversion.baseQuantity), // Positive
            operation: StockOperation.ADJUSTMENT,
            tx,
            baseUnitId: conversion.baseUnitId
          })
        } catch (e) {
          console.error("Failed to restore stock for deleted report", item, e)
        }
      }

      // 2. Delete items
      await tx.$executeRawUnsafe(`DELETE FROM inventory_loss_report_items WHERE report_id = $1::uuid`, id)

      // 3. Delete report
      await tx.$executeRawUnsafe(`DELETE FROM inventory_loss_reports WHERE id = $1::uuid`, id)
    })

    return NextResponse.json({ success: true, message: "Báo cáo đã xóa và tồn kho được khôi phục" } as ApiResponse<null>, { status: 200 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to delete inventory loss report" } as ApiResponse<null>, { status: 500 })
  }
}
