import { redirect } from "next/navigation"
import { verifyAuth, isAdmin } from "@/lib/auth"
import { RequestDetailView } from "@/components/internal-transfer/request-detail-view"
import { ExportForm } from "@/components/internal-transfer/export-form"
import { DiscrepancyConfirmForm } from "@/components/internal-transfer/discrepancy-confirm-form"
import { prisma } from "@/lib/prisma"
import { Button } from "@/components/ui/button"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

async function getRequestDetails(requestId: string) {
  try {
    const request = await prisma.internal_transfer_requests.findUnique({
      where: { id: requestId },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            requested_unit: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            manager_unit: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            exported_unit: {
              select: {
                id: true,
                name: true,
                code: true
              }
            },
            received_unit: {
              select: {
                id: true,
                name: true,
                code: true
              }
            }
          }
        },
        users_created: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_manager: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_gm: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_exported: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_received: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_discrepancy: {
          select: {
            id: true,
            full_name: true
          }
        },
        users_rejected: {
          select: {
            id: true,
            full_name: true
          }
        },
        warehouses_from: {
          select: {
            id: true,
            name: true,
            type: true
          }
        },
        warehouses_to: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    })

    if (!request) {
      return null
    }

    // Format the request for display
    const formattedRequest = {
      ...request,
      created_by_name: request.users_created?.full_name,
      manager_approved_by_name: request.users_manager?.full_name,
      gm_approved_by_name: request.users_gm?.full_name,
      exported_by_name: request.users_exported?.full_name,
      received_by_name: request.users_received?.full_name,
      discrepancy_confirmed_by_name: request.users_discrepancy?.full_name,
      rejected_by_name: request.users_rejected?.full_name,
      from_warehouse_name: request.warehouses_from.name,
      to_warehouse_name: request.warehouses_to.name
    }

    // Format items
    const formattedItems = request.items.map((item) => ({
      ...item,
      product_id: item.product_id,
      product_name: item.product.name,
      product_code: item.product.code,
      requested_unit_name: item.requested_unit.name,
      requested_unit_id: item.requested_unit_id,
      manager_unit_name: item.manager_unit?.name,
      manager_unit_id: item.manager_unit_id,
      exported_unit_name: item.exported_unit?.name,
      exported_unit_id: item.exported_unit_id,
      received_unit_name: item.received_unit?.name,
      received_unit_id: item.received_unit_id
    })) as any[]

    return { request: formattedRequest, items: formattedItems }
  } catch (error) {
    console.error("Error fetching request details:", error)
    return null
  }
}

async function getUnits() {
  try {
    const units = await prisma.product_units.findMany({
      where: { is_active: true },
      select: {
        id: true,
        name: true,
        code: true
      },
      orderBy: { name: "asc" }
    })
    return units
  } catch (error) {
    console.error("Error fetching units:", error)
    return []
  }
}

async function getMainWarehouseStock(productId: string) {
  try {
    // Get MAIN warehouse
    const mainWarehouse = await prisma.warehouses.findFirst({
      where: { type: "MAIN" },
      select: { id: true }
    })

    if (!mainWarehouse) return 0

    const stock = await prisma.stock_locations.findFirst({
      where: {
        warehouse_id: mainWarehouse.id,
        product_id: productId
      },
      select: {
        quantity: true
      }
    })
    return stock?.quantity || 0
  } catch (error) {
    return 0
  }
}

export default async function AdminInternalTransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await verifyAuth()

  if (!auth.isAuthenticated || !auth.user) {
    redirect("/login")
  }

  // Only ADMIN and MANAGER (Main Warehouse) can access
  if (!isAdmin(auth.user) && auth.user.role !== "MANAGER") {
    redirect("/admin")
  }

  const { id } = await params
  const data = await getRequestDetails(id)

  if (!data) {
    redirect("/admin/internal-transfers")
  }

  const { request, items } = data
  const units = await getUnits()

  // Add main warehouse stock for export stage
  if (request.status === "CHO_KHO_TONG_XUAT") {
    for (const item of items) {
      const stock = await getMainWarehouseStock(item.product_id)
      item.main_stock_display = stock
    }
  }

  // Determine which component to show based on status
  let actionComponent = null

  if (request.status === "CHO_KHO_TONG_XUAT") {
    actionComponent = (
      <ExportForm
        requestId={request.id}
        items={items}
        units={units}
        toWarehouseName={request.to_warehouse_name}
      />
    )
  } else if (request.status === "CHO_XAC_NHAN_CHENH_LECH") {
    actionComponent = (
      <DiscrepancyConfirmForm
        requestId={request.id}
        items={items}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/admin/internal-transfers">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Quay lại
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Chi Tiết Phiếu Yêu Cầu</h1>
          <p className="text-muted-foreground mt-1">
            Xử lý xuất hàng và xác nhận chênh lệch
          </p>
        </div>
      </div>

      {actionComponent}

      <RequestDetailView
        request={request}
        items={items}
        userRole={auth.user.role}
      />
    </div>
  )
}
