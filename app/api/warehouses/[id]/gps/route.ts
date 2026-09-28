import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyToken, isWarehouseManager, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

// API for warehouse managers to update GPS settings for their own warehouse
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    // Must be warehouse manager or admin
    if (!isWarehouseManager(user) && !isAdmin(user)) {
      return NextResponse.json({ success: false, error: "Only warehouse managers or admins can update GPS settings" } as ApiResponse<null>, { status: 403 })
    }

    const { id } = await params

    // Warehouse manager can only update their own warehouse, admin can update any
    if (!isAdmin(user) && user.warehouseId !== id) {
      return NextResponse.json({ success: false, error: "You can only update GPS settings for your own warehouse" } as ApiResponse<null>, { status: 403 })
    }

    const body = await request.json()
    const { latitude, longitude, checkin_radius_meters } = body || {}

    // Build update data - only allow GPS fields
    const updateData: any = {
      updated_at: new Date().toISOString()
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

    const updatedWarehouse = await prisma.warehouses.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({
      success: true,
      data: { warehouse: updatedWarehouse }
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error updating warehouse GPS:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to update GPS settings" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const { id } = await params

    // Check if user has access to this warehouse (admin can access any)
    if (!isAdmin(user) && !isWarehouseManager(user) && user.warehouseId !== id) {
      return NextResponse.json({ success: false, error: "Access denied" } as ApiResponse<null>, { status: 403 })
    }

    const warehouse = await prisma.warehouses.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
        checkin_radius_meters: true,
      }
    })

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Warehouse not found" } as ApiResponse<null>, { status: 404 })
    }

    return NextResponse.json({ success: true, data: warehouse } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch GPS settings" } as ApiResponse<null>, {
      status: 500,
    })
  }
}
