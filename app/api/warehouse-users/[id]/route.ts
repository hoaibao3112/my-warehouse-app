import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyToken, isWarehouseManager, canManageWarehouseUsers } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const staffUser = await prisma.users.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        warehouse_id: true,
        is_active: true,
        permissions: true,
        employment_type: true,
        contract_signed_date: true,
        employment_start_date: true,
        contract_expiry_date: true,
        work_status: true,
        national_id: true,
        bank_account: true,
        bank_name: true,
        permanent_address: true,
        phone_number: true,
        created_at: true,
        updated_at: true
      }
    })

    if (!staffUser) {
      return NextResponse.json({ success: false, error: "Staff user not found" } as ApiResponse<null>, {
        status: 404,
      })
    }

    return NextResponse.json({ success: true, data: staffUser } as ApiResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch staff user" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    // Get current user
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const body = await request.json()
    const { password, full_name, permissions, contract_signed_date, employment_start_date, contract_expiry_date, work_status, national_id, bank_account, bank_name, permanent_address } = body || {}

    console.log("[PUT /warehouse-users/[id]] Received permissions from client:", permissions, "type:", typeof permissions)

    // Get the staff user to check warehouse
    const staffUser = await prisma.users.findUnique({
      where: { id },
      select: { warehouse_id: true }
    })

    if (!staffUser) {
      return NextResponse.json({ success: false, error: "Staff user not found" } as ApiResponse<null>, { status: 404 })
    }

    // Check permissions - can only update staff in their own warehouse
    if (!staffUser.warehouse_id || !canManageWarehouseUsers(user, staffUser.warehouse_id)) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (password) {
      const { hashPassword } = await import("@/lib/auth")
      updateData.password_hash = await hashPassword(password)
    }

    if (full_name) {
      updateData.full_name = full_name
    }

    // Always update permissions if provided (even if empty array)
    if (permissions !== undefined) {
      const permissionsJson = JSON.stringify(permissions)
      console.log("[PUT /warehouse-users/[id]] Stringifying permissions:", permissions, "->", permissionsJson)
      updateData.permissions = permissionsJson
    }

    // Update work status fields if provided
    if (contract_signed_date !== undefined) {
      updateData.contract_signed_date = contract_signed_date ? new Date(contract_signed_date) : null
    }
    if (employment_start_date !== undefined) {
      updateData.employment_start_date = employment_start_date ? new Date(employment_start_date) : null
    }
    if (contract_expiry_date !== undefined) {
      updateData.contract_expiry_date = contract_expiry_date ? new Date(contract_expiry_date) : null
    }
    if (work_status !== undefined) {
      updateData.work_status = work_status
    }

    // Update personal information fields if provided
    if (national_id !== undefined) {
      updateData.national_id = national_id || null
    }
    if (bank_account !== undefined) {
      updateData.bank_account = bank_account || null
    }
    if (bank_name !== undefined) {
      updateData.bank_name = bank_name || null
    }
    if (permanent_address !== undefined) {
      updateData.permanent_address = permanent_address || null
    }

    console.log("[PUT /warehouse-users/[id]] Update data before saving:", updateData)

    const updatedUser = await prisma.users.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        full_name: true,
        role: true,
        warehouse_id: true,
        is_active: true,
        permissions: true,
        employment_type: true,
        contract_signed_date: true,
        employment_start_date: true,
        contract_expiry_date: true,
        work_status: true,
        national_id: true,
        bank_account: true,
        bank_name: true,
        permanent_address: true,
        phone_number: true,
        created_at: true,
        updated_at: true
      }
    })

    console.log("[PUT /warehouse-users/[id]] Updated user from DB:", updatedUser)

    return NextResponse.json({ success: true, data: updatedUser } as ApiResponse<any>)
  } catch (error: any) {
    console.error("[PUT /warehouse-users/[id]] Error:", error)
    return NextResponse.json({ success: false, error: error?.message || "Failed to update staff user" } as ApiResponse<null>, {
      status: 500,
    })
  }
}
