import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Auth check
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await req.json()
    const { name } = body

    if (!name || typeof name !== "string") {
      return NextResponse.json(
        { success: false, error: "name is required and must be a string" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if menu type exists
    const menuType = await prisma.menu_types.findUnique({
      where: { id },
    })

    if (!menuType) {
      return NextResponse.json(
        { success: false, error: "Loại hàng không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Permission check
    const isGlobal = !menuType.warehouse_id
    if (isGlobal) {
      if (!isAdmin(user) && user.role !== 'GENERAL_MANAGER') {
        return NextResponse.json(
          { success: false, error: "Bạn không có quyền sửa loại hàng chung" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    } else {
      if (!isAdmin(user) && user.role !== 'GENERAL_MANAGER' && user.warehouseId !== menuType.warehouse_id) {
        return NextResponse.json(
          { success: false, error: "Bạn không có quyền sửa loại hàng của kho khác" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    // Check if new name already exists (but not the current one)
    if (name !== menuType.name) {
      const existing = await prisma.menu_types.findFirst({
        where: {
          name,
          warehouse_id: menuType.warehouse_id,
          NOT: { id }
        },
      })

      if (existing) {
        return NextResponse.json(
          { success: false, error: "Tên loại hàng này đã tồn tại" } as ApiResponse<null>,
          { status: 409 }
        )
      }
    }

    const updated = await prisma.menu_types.update({
      where: { id },
      data: { name },
      include: {
        categories: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    })

    return NextResponse.json({
      success: true,
      data: updated,
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error updating menu type:", error)
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

    // Auth check
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Check if menu type exists
    const menuType = await prisma.menu_types.findUnique({
      where: { id },
      include: {
        categories: true,
      },
    })

    if (!menuType) {
      return NextResponse.json(
        { success: false, error: "Loại hàng không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Permission check
    const isGlobal = !menuType.warehouse_id
    if (isGlobal) {
      if (!isAdmin(user) && user.role !== 'GENERAL_MANAGER') {
        return NextResponse.json(
          { success: false, error: "Bạn không có quyền xóa loại hàng chung" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    } else {
      if (!isAdmin(user) && user.role !== 'GENERAL_MANAGER' && user.warehouseId !== menuType.warehouse_id) {
        return NextResponse.json(
          { success: false, error: "Bạn không có quyền xóa loại hàng của kho khác" } as ApiResponse<null>,
          { status: 403 }
        )
      }
    }

    if (menuType.categories.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Không thể xóa loại hàng này vì có ${menuType.categories.length} nhóm hàng liên quan`,
        } as ApiResponse<null>,
        { status: 400 }
      )
    }

    await prisma.menu_types.delete({
      where: { id },
    })

    return NextResponse.json({
      success: true,
      data: { message: "Xóa loại hàng thành công" },
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error deleting menu type:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
