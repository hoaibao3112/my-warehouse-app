import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

/**
 * GET /api/warehouses/[id]/delete-preview
 * Lấy thống kê tất cả dữ liệu sẽ bị xóa khi xóa kho.
 * Dữ liệu chấm công được lọc chính xác theo warehouse_id
 * để KHÔNG ảnh hưởng đến dữ liệu nhân viên ở kho khác.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    const warehouse = await prisma.warehouses.findUnique({ where: { id } })
    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: "Không tìm thấy kho hàng" } as ApiResponse<null>,
        { status: 404 }
      )
    }

      // Lấy song song tất cả thống kê — chỉ lọc theo warehouse_id của kho này
    const [
      usersInWarehouse,
      warehouseStockCount,
      warehouseStockRealtimeCount,
      inventorySnapshotsCount,
      // Chấm công & ca làm việc
      attendanceSessionsCount,
      shiftSessionsCount,
      shiftAssignmentsCount,
      workShiftsCount,
      leaveRequestsCount,
      shiftSwapRequestsCount,
      shiftRegistrationRequestsCount,
      // Tồn kho
      inventoryChecksCount,
      inventoryAdjustmentsCount,
      inventoryLossReportsCount,
      inventoryImportsCount,
      productionTransactionsCount,
      productionRecordsCount,
      // Bán hàng
      salesInvoicesCount,
      salesSessionsCount,
      externalSalesExportsCount,
      // Báo cáo
      reportsCount,
      salaryAdvanceRequestsCount,
      // Ngăn xóa
      purchaseOrdersCount,
      transferFromCount,
      transferToCount,
      warehouseTransfersFromCount,
      warehouseTransfersToCount,
    ] = await Promise.all([
      prisma.users.findMany({
        where: { warehouse_id: id },
        select: { id: true, role: true, full_name: true, email: true },
      }),
      prisma.warehouse_stock.count({ where: { warehouse_id: id } }),
      prisma.warehouse_stock_realtime.count({ where: { warehouse_id: id } }),
      prisma.inventory_snapshots.count({ where: { warehouse_id: id } }),
      // Chấm công — lọc đúng theo warehouse_id
      prisma.attendance_sessions.count({ where: { warehouse_id: id } }),
      prisma.shift_sessions.count({ where: { warehouse_id: id } }),
      prisma.shift_assignments.count({ where: { warehouse_id: id } }),
      prisma.work_shifts.count({ where: { warehouse_id: id } }),
      prisma.leave_requests.count({ where: { warehouse_id: id } }),
      prisma.shift_swap_requests.count({ where: { warehouse_id: id } }),
      prisma.shift_registration_requests.count({ where: { warehouse_id: id } }),
      // Tồn kho
      prisma.inventory_checks.count({ where: { warehouse_id: id } }),
      prisma.inventory_adjustments.count({ where: { warehouse_id: id } }),
      prisma.inventory_loss_reports.count({ where: { warehouse_id: id } }),
      prisma.inventory_imports.count({ where: { warehouse_id: id } }),
      prisma.production_transactions.count({ where: { warehouse_id: id } }),
      prisma.production_records.count({ where: { warehouse_id: id } }),
      // Bán hàng
      prisma.sales_invoices.count({ where: { warehouse_id: id } }),
      prisma.sales_sessions.count({ where: { warehouse_id: id } }),
      prisma.external_sales_exports.count({ where: { warehouse_id: id } }),
      // Báo cáo
      prisma.reports.count({ where: { warehouse_id: id } }),
      prisma.salary_advance_requests.count({ where: { warehouse_id: id } }),
      // Ngăn xóa nếu còn
      prisma.purchase_orders.count({ where: { warehouse_id: id } }),
      prisma.internal_transfer_requests.count({ where: { from_warehouse_id: id } }),
      prisma.internal_transfer_requests.count({ where: { to_warehouse_id: id } }),
      prisma.warehouse_transfers.count({ where: { from_warehouse_id: id } }),
      prisma.warehouse_transfers.count({ where: { to_warehouse_id: id } }),
    ])

    const warehouseManagerCount = usersInWarehouse.filter(u => u.role === "WAREHOUSE_MANAGER").length
    const otherUsersCount = usersInWarehouse.filter(u => u.role !== "WAREHOUSE_MANAGER").length

    const blockingData = {
      purchaseOrders: purchaseOrdersCount,
      transferRequests: transferFromCount + transferToCount + warehouseTransfersFromCount + warehouseTransfersToCount,
    }

    const hasBlockingData = blockingData.purchaseOrders > 0 || blockingData.transferRequests > 0

    const preview = {
      warehouseId: id,
      warehouseName: warehouse.name,
      warehouseCode: warehouse.code,
      warehouseType: warehouse.type,
      hasBlockingData,
      blockingData,
      willBeDeleted: {
        warehouseStock: warehouseStockCount + warehouseStockRealtimeCount + inventorySnapshotsCount,
        inventoryChecks: inventoryChecksCount,
        inventoryAdjustments: inventoryAdjustmentsCount + inventoryLossReportsCount,
        inventoryImports: inventoryImportsCount,
        productionTransactions: productionTransactionsCount + productionRecordsCount,
        // Chấm công & ca — chỉ của kho này, không ảnh hưởng kho khác
        attendanceSessions: attendanceSessionsCount,
        shiftSessions: shiftSessionsCount,
        shiftAssignments: shiftAssignmentsCount,
        workShifts: workShiftsCount,
        leaveRequests: leaveRequestsCount,
        shiftSwapRequests: shiftSwapRequestsCount,
        shiftRegistrationRequests: shiftRegistrationRequestsCount,
        // Bán hàng
        salesInvoices: salesInvoicesCount,
        salesSessions: salesSessionsCount,
        externalSalesExports: externalSalesExportsCount,
        // Báo cáo
        reports: reportsCount,
        salaryAdvanceRequests: salaryAdvanceRequestsCount,
      },
      users: {
        willBeDeleted: warehouseManagerCount,
        willBeUnlinked: otherUsersCount,
      },
    }

    return NextResponse.json({ success: true, data: preview } as ApiResponse<typeof preview>)
  } catch (error: any) {
    console.error("Error fetching delete preview:", error)
    return NextResponse.json(
      { success: false, error: "Không thể tải thông tin xem trước" } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
