import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isWarehouseManager, isAdmin, hashPassword, canManageWarehouseUsers } from "@/lib/auth"
import { randomUUID } from "crypto"

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    const warehouseId = searchParams.get("warehouseId")

    // Get current user
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    // Check permissions
    if (!warehouseId || !canManageWarehouseUsers(user, warehouseId)) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const skip = (Math.max(1, page) - 1) * Math.max(1, pageSize)

    // Get warehouse type to determine which role to fetch
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
      select: { type: true }
    })

    if (!warehouse) {
      return NextResponse.json({ success: false, error: "Warehouse not found" } as ApiResponse<null>, { status: 404 })
    }

    // Determine which roles to fetch based on warehouse type
    // For MAIN warehouse, fetch MANAGER, WAREHOUSE_STAFF, HR, and GENERAL_MANAGER
    // For other warehouses, fetch STAFF, ATTENDANCE_STAFF, and WAREHOUSE_STAFF
    const rolesToFetch = warehouse.type === 'MAIN'
      ? ['MANAGER', 'WAREHOUSE_STAFF', 'HR', 'GENERAL_MANAGER']
      : ['STAFF', 'ATTENDANCE_STAFF', 'WAREHOUSE_STAFF']

    // For MAIN warehouse, we need to fetch users in three groups:
    // 1. Users with warehouse_id matching (MANAGER, WAREHOUSE_STAFF)
    // 2. HR users (always have warehouse_id = null)
    // 3. GENERAL_MANAGER users (can be assigned to any warehouse or none)
    let whereClause: any
    if (warehouse.type === 'MAIN') {
      whereClause = {
        OR: [
          {
            warehouse_id: warehouseId,
            role: { in: ['MANAGER', 'WAREHOUSE_STAFF'] }
          },
          {
            role: 'HR'
          },
          {
            role: 'GENERAL_MANAGER'
          }
        ]
      }
    } else {
      whereClause = {
        warehouse_id: warehouseId,
        role: { in: rolesToFetch }
      }
    }

    // Fetch warehouse users
    const [users, total] = await Promise.all([
      prisma.users.findMany({
        where: whereClause,
        orderBy: { created_at: 'desc' },
        skip,
        take: pageSize,
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
      }),
      prisma.users.count({
        where: whereClause
      })
    ])

    return NextResponse.json({
      success: true,
      data: users,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    } as PaginatedResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get current user
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const body = await request.json()
    const { username, phoneNumber, fullName, warehouseId, password, employmentType, contractSignedDate, employmentStartDate, contractExpiryDate, workStatus, nationalId, bankAccount, bankName, permanentAddress, accountType, email } = body || {}

    // Support both phoneNumber (new) and username (legacy) for backward compatibility
    const identifier = phoneNumber || username

    // Identifier is required unless email is provided
    if ((!identifier && !email) || !fullName || !warehouseId || !password) {
      return NextResponse.json({ success: false, error: "Missing fields" } as ApiResponse<null>, { status: 400 })
    }

    // Validate employment type
    const validEmploymentTypes = ["FULLTIME", "PARTTIME"]
    const empType = validEmploymentTypes.includes(employmentType) ? employmentType : "FULLTIME"

    // Check permissions - can only create users for their own warehouse
    if (!canManageWarehouseUsers(user, warehouseId)) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    // Get warehouse type to determine email generation strategy
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
      select: { type: true }
    })

    let staffEmail: string

    if (warehouse?.type === 'STORE') {
      // For STORE warehouse: use email if provided, otherwise phone number as identifier
      if (email) {
        staffEmail = email
      } else {
        // Validate phone number format (Vietnamese phone numbers)
        if (phoneNumber && !/^0\d{9,10}$/.test(phoneNumber)) {
          return NextResponse.json({ success: false, error: "Số điện thoại không hợp lệ" } as ApiResponse<null>, { status: 400 })
        }
        staffEmail = identifier
      }
    } else {
      // For MAIN warehouse: use the old method with manager email
      const manager = await prisma.users.findFirst({
        where: {
          warehouse_id: warehouseId,
          role: 'WAREHOUSE_MANAGER'
        },
        select: {
          email: true
        }
      })

      if (!manager) {
        return NextResponse.json({ success: false, error: "Warehouse manager not found" } as ApiResponse<null>, { status: 400 })
      }
      staffEmail = `${identifier}.${manager.email}`
    }

    // Check if email already exists
    const existingUser = await prisma.users.findUnique({
      where: { email: staffEmail }
    })
    if (existingUser) {
      return NextResponse.json({ success: false, error: "Số điện thoại đã được sử dụng" } as ApiResponse<null>, { status: 400 })
    }

    // Create staff user
    const staffId = randomUUID()
    const pwdHash = await hashPassword(password)
    const now = new Date().toISOString()

    const staffUser = await prisma.users.create({
      data: {
        id: staffId,
        email: staffEmail,
        password_hash: pwdHash,
        full_name: fullName,
        role: accountType === 'ATTENDANCE_STAFF' ? 'ATTENDANCE_STAFF' : (accountType === 'WAREHOUSE_STAFF' ? 'WAREHOUSE_STAFF' : 'STAFF'),
        warehouse_id: warehouseId,
        is_active: true,
        employment_type: empType,
        contract_signed_date: contractSignedDate ? new Date(contractSignedDate) : null,
        employment_start_date: employmentStartDate ? new Date(employmentStartDate) : null,
        contract_expiry_date: contractExpiryDate ? new Date(contractExpiryDate) : null,
        work_status: workStatus || 'ACTIVE',
        national_id: nationalId || null,
        bank_account: bankAccount || null,
        bank_name: bankName || null,
        permanent_address: permanentAddress || null,
        phone_number: phoneNumber || null,
        created_at: now,
        updated_at: now
      },
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

    return NextResponse.json({ success: true, data: staffUser } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
