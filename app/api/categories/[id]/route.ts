import { NextResponse, NextRequest } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, hasPermission } from '@/lib/auth'

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Auth - require category_management permission
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, 'category_management')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await req.json()
    const { name, menu_type_id } = body || {}

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Category ID required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (!menu_type_id) {
      return NextResponse.json(
        { success: false, error: "Menu type ID is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if category exists
    const category = await prisma.categories.findUnique({
      where: { id },
    })

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Verify menu_type_id exists
    const menuType = await prisma.menu_types.findUnique({
      where: { id: menu_type_id }
    })

    if (!menuType) {
      return NextResponse.json(
        { success: false, error: "Menu type not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Update the category
    const updated = await prisma.categories.update({
      where: { id },
      data: {
        name,
        menu_type_id
      }
    })

    return NextResponse.json(
      { success: true, data: updated } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
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
    // Auth - require category_management permission
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, 'category_management')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Category ID required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if category exists
    const category = await prisma.categories.findUnique({
      where: { id },
    })

    if (!category) {
      return NextResponse.json(
        { success: false, error: "Category not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Delete the category
    const deleted = await prisma.categories.delete({
      where: { id },
    })

    return NextResponse.json(
      { success: true, data: deleted } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    // Handle foreign key constraint error
    if (error.code === 'P2014') {
      return NextResponse.json(
        { success: false, error: "Cannot delete category with products. Please reassign or delete products first." } as ApiResponse<null>,
        { status: 400 }
      )
    }

    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
