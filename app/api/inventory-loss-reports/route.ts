import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { handleApiError } from "@/lib/api-error"
import { query, runTransaction } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { randomUUID } from "crypto"
import { verifyToken, canAccessWarehouse, isStoreManager } from "@/lib/auth" // Added isStoreManager import if missing
import { prisma } from "@/lib/prisma"
import { inventoryService, StockOperation } from "@/lib/services/inventory-service"
import { unitConversionService } from "@/lib/services/unit-conversion-service"

const ensureLossTable = async () => {
  // create table if missing (helps when sqlite schema is older)
  await query(`CREATE TABLE IF NOT EXISTS inventory_loss_reports (
    id TEXT PRIMARY KEY,
    report_number TEXT UNIQUE,
    warehouse_id TEXT NOT NULL,
    reason TEXT,
    reported_by TEXT NOT NULL,
    approved_by TEXT,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
  )`);

  await query(`CREATE TABLE IF NOT EXISTS inventory_loss_report_items (
    id TEXT PRIMARY KEY,
    report_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    unit_id TEXT NOT NULL,
    quantity_lost REAL NOT NULL,
    unit_price REAL DEFAULT 0,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (report_id) REFERENCES inventory_loss_reports(id) ON DELETE CASCADE
  )`);
}

/**
 * @swagger
 * /api/inventory-loss-reports:
 *   get:
 *     summary: List Loss Reports
 *     tags: [Inventory]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of reports
 */
export async function GET(request: NextRequest) {
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

    // Get current user info from database
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
      // Allow access to ALL warehouses except MAIN
      const storeWarehouses = await prisma.warehouses.findMany({
        where: { type: { not: 'MAIN' }, is_active: true },
        select: { id: true }
      })
      warehouseIds = storeWarehouses.map((w: any) => w.id)
    }

    const userWithAssignments = {
      ...user,
      warehouseId: user.warehouse_id,
      warehouseIds
    }

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    let warehouseId = searchParams.get("warehouseId")

    // Check warehouse access permissions using canAccessWarehouse helper
    if (warehouseId) {
      if (!canAccessWarehouse(userWithAssignments as any, warehouseId)) {
        return NextResponse.json(
          { success: false, error: "Forbidden: Cannot access other warehouse's data" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    } else {
      // No warehouseId specified - for non-admin/non-HR users, use their assigned warehouse
      if (user.role !== "ADMIN" && user.role !== "HR") {
        if (!user.warehouse_id) {
          return NextResponse.json(
            { success: false, error: "User not assigned to any warehouse" } as ApiResponse<null>,
            { status: 403 }
          )
        }
        warehouseId = user.warehouse_id
      }
    }

    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize)

    // Fetch reports with items using Prisma
    const where: any = {}
    if (warehouseId) {
      where.warehouse_id = warehouseId
    }

    const total = await prisma.inventory_loss_reports.count({ where })
    const rows = await prisma.inventory_loss_reports.findMany({
      where,
      include: {
        inventory_loss_report_items: {
          include: {
            products: {
              select: { id: true, name: true, code: true }
            },
            product_units: {
              select: { id: true, name: true, code: true }
            }
          }
        },
        products: {
          select: { id: true, name: true, code: true }
        },
        warehouses: {
          select: { id: true, name: true }
        }
      },
      orderBy: { created_at: 'desc' },
      skip: offset,
      take: pageSize
    })

    // Transform data to ensure consistent structure for frontend
    const transformedRows = rows.map(report => {
      // If report has items, use those; otherwise create item from report's product_id/quantity_lost
      const items = report.inventory_loss_report_items && report.inventory_loss_report_items.length > 0
        ? report.inventory_loss_report_items.map(item => ({
          ...item,
          product_code: item.products?.code,
          product_name: item.products?.name,
          unit_code: item.product_units?.code,
          unit_name: item.product_units?.name
        }))
        : (report.product_id && report.quantity_lost !== null)
          ? [{
            id: `synthetic-${report.id}`,
            report_id: report.id,
            product_id: report.product_id,
            product_code: report.products?.code,
            product_name: report.products?.name,
            quantity_lost: report.quantity_lost,
            unit_price: 0,
            unit_id: '',
            unit_name: '',
            product_units: null,
            created_at: report.created_at,
            updated_at: report.updated_at
          }]
          : []

      return {
        ...report,
        items // Return as 'items' to match frontend expectation
      }
    })

    return NextResponse.json({ success: true, data: transformedRows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } as PaginatedResponse<any>)
  } catch (error: any) {
    return handleApiError(error, 'GET /api/inventory-loss-reports')
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user) return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 403 })

    const body = await request.json()
    const { warehouseId, reason, items } = body || {}

    if (!warehouseId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({
        success: false,
        error: "warehouseId và items array là bắt buộc",
      } as ApiResponse<null>, { status: 400 })
    }

    // Reason validation (User Request: "phần lý do cần bắt buộc")
    if (!reason || reason.trim() === '') {
      return NextResponse.json({
        success: false,
        error: "Vui lòng nhập lý do mất hàng",
      } as ApiResponse<null>, { status: 400 })
    }

    // Validate items
    for (const item of items) {
      if (!item.productId || !item.unitId || !Number.isFinite(Number(item.quantityLost)) || Number(item.quantityLost) <= 0) {
        return NextResponse.json({
          success: false,
          error: "Mỗi item phải có productId, unitId, và quantityLost > 0",
        } as ApiResponse<null>, { status: 400 })
      }
    }

    // store manager may report for their warehouse
    if (isStoreManager(user) && !canAccessWarehouse(user, warehouseId)) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    await ensureLossTable()

    const reportId = randomUUID()
    const reportNumber = `ILR-${new Date().getFullYear()}-${Date.now()}`

    // We will perform actions inside a transaction manually or better yet, chain them. 
    // Since inventoryService handles its own transactions or accepts a tx, we might need adjustments.
    // Ideally we wrap everything in prisma.$transaction, but inventoryService.updateStock uses optimistic locking which might conflict if not careful.
    // For simplicity and safety with optimistic locking, we will execute DB inserts first then stock updates.
    // If stock update fails, we should technically roll back DB inserts. 
    // However, Prisma makes sharing TX with complex services harder if not designed for it.
    // Given the constraints, we will try to do it all in one runTransaction if possible, 
    // OR just do standard Prisma transaction.
    // inventoryService.updateStock DOES support accepting a `tx`.

    await prisma.$transaction(async (tx) => {
      const now = new Date()

      // Create main report
      await tx.$executeRawUnsafe(
        `INSERT INTO inventory_loss_reports (id, report_number, warehouse_id, reason, reported_by, created_at, updated_at) VALUES ($1::uuid, $2, $3::uuid, $4, $5::uuid, $6::timestamp, CURRENT_TIMESTAMP)`,
        reportId, reportNumber, warehouseId, reason, user.id, now
      )

      // Process items
      for (const item of items) {
        const itemId = randomUUID()
        const unitPrice = item.unitPrice || 0
        const quantityLost = Number(item.quantityLost)

        // Insert item
        await tx.$executeRawUnsafe(
          `INSERT INTO inventory_loss_report_items (id, report_id, product_id, unit_id, quantity_lost, unit_price, created_at, updated_at)
           VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7::timestamp, $8::timestamp)`,
          itemId, reportId, item.productId, item.unitId, quantityLost, unitPrice, now, now
        )

        // Convert to base unit for stock deduction
        const conversion = await unitConversionService.convertToBaseUnit(item.productId, quantityLost, item.unitId)

        // Deduct stock (negative adjustment)
        await inventoryService.updateStock({
          warehouseId,
          productId: item.productId,
          quantityChange: -Math.abs(conversion.baseQuantity),
          operation: StockOperation.ADJUSTMENT, // Or LOSS if available, using ADJUSTMENT for now
          tx, // Pass transaction client
          baseUnitId: conversion.baseUnitId
        })
      }
    }, { timeout: 20000 })

    return NextResponse.json(
      { success: true, data: { reportId, reportNumber, itemCount: items.length } } as ApiResponse<any>,
      { status: 201 }
    )
  } catch (error: any) {
    return handleApiError(error, 'POST /api/inventory-loss-reports')
  }
}
