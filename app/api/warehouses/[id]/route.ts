import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyToken, isAdmin, hashPassword } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { translateError } from "@/lib/error-translator"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const warehouse = await prisma.warehouses.findUnique({
      where: { id }
    })

    // Fetch manager user separately
    let manager = null
    if (warehouse) {
      const managerData = await prisma.users.findMany({
        where: {
          warehouse_id: id,
          role: 'WAREHOUSE_MANAGER'
        },
        select: {
          id: true,
          email: true,
          full_name: true,
        },
        take: 1
      })
      manager = managerData.length > 0 ? managerData : []
    }

    const warehouseWithManager = {
      ...warehouse,
      users: manager
    }

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Warehouse not found" } as ApiResponse<null>, {
        status: 404,
      })
    }

    return NextResponse.json({ success: true, data: warehouseWithManager } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch warehouse" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const { id } = await params
    const body = await request.json()
    const { name, location, managerEmail, managerName, managerPassword, discountPercentage, latitude, longitude, checkin_radius_meters } = body || {}

    if (!name) {
      return NextResponse.json({ success: false, error: "Name is required" } as ApiResponse<null>, { status: 400 })
    }

    let updatedWarehouse, updatedManager
    await prisma.$transaction(async (tx: any) => {
      // Update warehouse
      const updateData: any = {
        name,
        location: location || null,
        updated_at: new Date().toISOString()
      }

      if (discountPercentage !== undefined && discountPercentage !== "") {
        updateData.discount_percentage = parseFloat(discountPercentage) || 0
      }

      // GPS coordinates
      if (latitude !== undefined) {
        updateData.latitude = latitude === null || latitude === "" ? null : parseFloat(latitude)
      }
      if (longitude !== undefined) {
        updateData.longitude = longitude === null || longitude === "" ? null : parseFloat(longitude)
      }
      if (checkin_radius_meters !== undefined) {
        updateData.checkin_radius_meters = checkin_radius_meters === null || checkin_radius_meters === "" ? 3000 : parseInt(checkin_radius_meters)
      }

      updatedWarehouse = await tx.warehouses.update({
        where: { id },
        data: updateData
      })

      // Update manager user if provided
      if (managerEmail || managerName || managerPassword) {
        const manager = await tx.users.findFirst({
          where: {
            warehouse_id: id,
            role: 'WAREHOUSE_MANAGER'
          }
        })

        if (manager) {
          const updateData: any = {
            updated_at: new Date().toISOString()
          }

          if (managerEmail) updateData.email = managerEmail
          if (managerName) updateData.full_name = managerName
          if (managerPassword) updateData.password_hash = await hashPassword(managerPassword)

          updatedManager = await tx.users.update({
            where: { id: manager.id },
            data: updateData
          })
        }
      }
    })

    return NextResponse.json({ success: true, data: { warehouse: updatedWarehouse, manager: updatedManager } } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to update warehouse" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, {
        status: 403,
      })
    }

    const { id } = await params

    // Kiểm tra kho tồn tại
    const warehouse = await prisma.warehouses.findUnique({ where: { id } })

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Không tìm thấy kho hàng" } as ApiResponse<null>, {
        status: 404,
      })
    }

    // Xóa toàn bộ dữ liệu của kho trong một transaction.
    await prisma.$transaction(async (tx) => {
      // 1. Tồn kho & Kiểm kê & Snapshot
      await tx.warehouse_stock.deleteMany({ where: { warehouse_id: id } })
      await tx.warehouse_stock_realtime.deleteMany({ where: { warehouse_id: id } })
      await tx.inventory_snapshots.deleteMany({ where: { warehouse_id: id } })
      
      await tx.inventory_check_completions.deleteMany({ where: { warehouse_id: id } })
      await tx.inventory_checks.deleteMany({ where: { warehouse_id: id } })

      // 2. Điều chỉnh & Hư hao
      await tx.inventory_adjustments.deleteMany({ where: { warehouse_id: id } })
      await tx.inventory_loss_report_items.deleteMany({ where: { inventory_loss_reports: { warehouse_id: id } } })
      await tx.inventory_loss_reports.deleteMany({ where: { warehouse_id: id } })

      // 3. Nhập hàng & Phê duyệt nhập
      await tx.inventory_import_items.deleteMany({ where: { import: { warehouse_id: id } } })
      await tx.inventory_imports.deleteMany({ where: { warehouse_id: id } })
      await tx.inventory_intakes.deleteMany({ where: { warehouse_id: id } })

      // 4. Sản xuất (Transactions & Ingredient Usages)
      await tx.production_ingredient_usages.deleteMany({ where: { production: { warehouse_id: id } } })
      await tx.production_transactions.deleteMany({ where: { warehouse_id: id } })
      await tx.production_records.deleteMany({ where: { warehouse_id: id } })

      // 5. Xuất hàng & Khách hàng
      await tx.external_sales_export_items.deleteMany({ where: { export: { warehouse_id: id } } })
      await tx.external_sales_exports.deleteMany({ where: { warehouse_id: id } })
      
      // 6. Chuyển kho (Internal & Warehouse Transfer)
      // Xóa items trước dựa trên relation đến request/transfer
      await tx.internal_transfer_request_items.deleteMany({
        where: { OR: [ { request: { from_warehouse_id: id } }, { request: { to_warehouse_id: id } } ] }
      })
      await tx.internal_transfer_requests.deleteMany({ 
        where: { OR: [{ from_warehouse_id: id }, { to_warehouse_id: id }] } 
      })
      
      await tx.warehouse_transfer_items.deleteMany({
        where: { OR: [ { warehouse_transfers: { from_warehouse_id: id } }, { warehouse_transfers: { to_warehouse_id: id } } ] }
      })
      await tx.warehouse_transfers.deleteMany({ 
        where: { OR: [{ from_warehouse_id: id }, { to_warehouse_id: id }] } 
      })

      // 7. Mua hàng (Purchase Orders)
      await tx.purchase_order_items.deleteMany({ where: { purchase_orders: { warehouse_id: id } } })
      await tx.purchase_orders.deleteMany({ where: { warehouse_id: id } })

      // 8. Bán hàng & Hóa đơn & Khấu trừ công thức
      await tx.recipe_deduction_items.deleteMany({ where: { deduction: { warehouse_id: id } } })
      await tx.recipe_deductions.deleteMany({ where: { warehouse_id: id } })
      await tx.sales_invoices.deleteMany({ where: { warehouse_id: id } })
      await tx.sales_sessions.deleteMany({ where: { warehouse_id: id } })

      // 9. Báo cáo & Tạm ứng & Khuyến mãi
      await tx.reports.deleteMany({ where: { warehouse_id: id } })
      await tx.salary_advance_requests.deleteMany({ where: { warehouse_id: id } })
      await tx.promotion_warehouses.deleteMany({ where: { warehouse_id: id } })

      // 10. Chấm công & Ca làm (Dữ liệu quan trọng nhất)
      await tx.attendance_sessions.deleteMany({ where: { warehouse_id: id } })
      await tx.shift_sessions.deleteMany({ where: { warehouse_id: id } })
      await tx.shift_assignments.deleteMany({ where: { warehouse_id: id } })
      await tx.leave_requests.deleteMany({ where: { warehouse_id: id } })
      await tx.shift_swap_requests.deleteMany({ where: { warehouse_id: id } })
      await tx.shift_registration_requests.deleteMany({ where: { warehouse_id: id } })
      await tx.work_shifts.deleteMany({ where: { warehouse_id: id } })

      // 11. Cấu hình & Phân quyền
      await tx.warehouse_category_permissions.deleteMany({ where: { warehouse_id: id } })
      await tx.warehouse_printer_configs.deleteMany({ where: { warehouse_id: id } })
      await tx.warehouse_sales_targets.deleteMany({ where: { warehouse_id: id } })
      await tx.user_warehouse_assignments.deleteMany({ where: { warehouse_id: id } })

      // 12. Unlink các thực thể cấp cao (không xóa, chỉ bỏ liên kết)
      await tx.menu_types.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.categories.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.product_units.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.products.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.product_recipes.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.suppliers.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.external_customers.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })
      await tx.voucher_programs.updateMany({ where: { warehouse_id: id }, data: { warehouse_id: null } })

      // 13. Xử lý Users (Tránh lỗi FK warehouses_manager_id_fkey)
      const warehouseUsers = await tx.users.findMany({
        where: { warehouse_id: id },
        select: { id: true, role: true }
      })

      const warehouseManagerIds = warehouseUsers
        .filter(u => u.role === 'WAREHOUSE_MANAGER')
        .map(u => u.id)

      const otherUserIds = warehouseUsers
        .filter(u => u.role !== 'WAREHOUSE_MANAGER')
        .map(u => u.id)

      if (warehouseManagerIds.length > 0) {
        // Nullify manager_id trong kho trước khi xóa user để tránh lỗi FK
        await tx.warehouses.update({
          where: { id },
          data: { manager_id: null }
        })
        await tx.users.deleteMany({ where: { id: { in: warehouseManagerIds } } })
      }

      if (otherUserIds.length > 0) {
        await tx.users.updateMany({
          where: { id: { in: otherUserIds } },
          data: { warehouse_id: null }
        })
      }

      // 14. Cuối cùng mới xóa kho
      await tx.warehouses.delete({ where: { id } })
    }, {
      timeout: 60000 // Tăng lên 60s cho transaction cực lớn
    })

    return NextResponse.json({ success: true, data: { message: "Đã xóa kho hàng thành công" } } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error deleting warehouse:", error)
    const friendlyError = translateError(error)
    return NextResponse.json({ success: false, error: friendlyError } as ApiResponse<null>, {
      status: 500,
    })
  }
}
