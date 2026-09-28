import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import type { ApiResponse } from "@/lib/types"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isHR } from "@/lib/auth"

/** Warehouse Management API */

export async function GET(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Prepare where clause
    const where: any = {}

    // HR Security Restriction: Cannot see PARTNER or MAIN warehouses
    if (isHR(user)) {
      where.type = {
        notIn: ['PARTNER', 'MAIN']
      }
    }

    // Get all warehouses
    const warehouses = await prisma.warehouses.findMany({
      where,
      include: {
        users_warehouses_manager_idTousers: {
          select: {
            id: true,
            full_name: true,
            email: true
          }
        }
      },
      orderBy: {
        type: 'asc' // MAIN warehouses first
      }
    })

    return NextResponse.json({
      success: true,
      data: warehouses.map(w => ({
        id: w.id,
        code: w.code,
        name: w.name,
        location: w.location,
        type: w.type,
        latitude: w.latitude,
        longitude: w.longitude,
        checkin_radius_meters: w.checkin_radius_meters,
        is_active: w.is_active,
        manager: w.users_warehouses_manager_idTousers ? {
          id: w.users_warehouses_manager_idTousers.id,
          name: w.users_warehouses_manager_idTousers.full_name,
          email: w.users_warehouses_manager_idTousers.email
        } : null,
        created_at: w.created_at
      }))
    } as ApiResponse<any>)

  } catch (error: any) {
    console.error("Error fetching warehouses:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || user.role !== 'ADMIN') {
      return NextResponse.json(
        { success: false, error: "Only admins can create warehouses" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const { name, address, type, manager_id, code, location, managerEmail, managerName, managerPassword } = body

    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (!code) {
      return NextResponse.json(
        { success: false, error: "Code is required" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if code already exists
    const existing = await prisma.warehouses.findUnique({
      where: { code }
    })

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Mã kho "${code}" đã tồn tại` } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Use transaction to create warehouse and manager user together
    const result = await prisma.$transaction(async (tx) => {
      // For PARTNER warehouses, manager is REQUIRED
      const warehouseType = type || 'STORE'
      if (warehouseType === 'PARTNER') {
        if (!managerEmail || !managerName || !managerPassword) {
          throw new Error('Kho nhượng quyền (PARTNER) bắt buộc phải có thông tin quản lý')
        }
      }

      // Create warehouse first
      const warehouse = await tx.warehouses.create({
        data: {
          code,
          name,
          location: location || address,
          type: warehouseType,
          manager_id,
          is_active: true
        }
      })

      // If manager details are provided, create user account
      // For MAIN/STORE: optional, For PARTNER: required (validated above)
      let managerUser = null
      if (managerEmail && managerName && managerPassword) {
        const { hashPassword } = await import('@/lib/auth')
        const hashedPassword = await hashPassword(managerPassword)

        // Check if email already exists
        const existingUser = await tx.users.findUnique({
          where: { email: managerEmail }
        })

        if (existingUser) {
          throw new Error(`Email "${managerEmail}" đã được sử dụng`)
        }

        // Role depends on warehouse type
        const userRole = warehouseType === 'MAIN' ? 'MANAGER' : 'WAREHOUSE_MANAGER'

        managerUser = await tx.users.create({
          data: {
            email: managerEmail,
            full_name: managerName,
            password_hash: hashedPassword,
            role: userRole,
            warehouse_id: warehouse.id,
            is_active: true
          }
        })
      }

      return { warehouse, managerUser }
    })

    return NextResponse.json({
      success: true,
      data: result.warehouse
    } as ApiResponse<any>)

  } catch (error: any) {
    console.error("Error creating warehouse:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
