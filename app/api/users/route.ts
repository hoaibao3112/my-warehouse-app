import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, PaginatedResponse } from "@/lib/types"
import { query, runTransaction } from "@/lib/prisma"
import { randomUUID } from "crypto"
import { hashPassword, verifyToken, isAdmin, isHR } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"


/**
 * @swagger
 * /api/users:
 *   get:
 *     description: Returns a list of users
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       email:
 *                         type: string
 *                       fullName:
 *                         type: string
 *                       role:
 *                         type: string
 */
export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication to list users
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const searchParams = request.nextUrl.searchParams
    const page = Number.parseInt(searchParams.get("page") || "1")
    const pageSize = Number.parseInt(searchParams.get("pageSize") || "10")
    const role = searchParams.get("role")
    const warehouseId = searchParams.get("warehouseId")

    const offset = (Math.max(1, page) - 1) * Math.max(1, pageSize)
    const where: string[] = []
    const params: any[] = []
    if (role) { where.push("u.role = ?::user_role"); params.push(role) }
    if (warehouseId) { where.push("u.warehouse_id = ?::uuid"); params.push(warehouseId) }

    // SECURITY: Enforce isolation
    // 1. Warehouse Managers can only see users in their own warehouse
    if (user.role === 'WAREHOUSE_MANAGER' && user.warehouseId) {
      where.push("u.warehouse_id = ?::uuid")
      params.push(user.warehouseId)
    }

    // 2. Admin/HR/GM cannot see users from PARTNER warehouses
    const adminRoles = ['ADMIN', 'HR', 'GENERAL_MANAGER']
    if (adminRoles.includes(user.role)) {
      where.push("(w.type IS DISTINCT FROM 'PARTNER' OR w.type IS NULL)")
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""

    const queryStr = `
      SELECT 
        u.id, 
        u.email, 
        u.full_name as "fullName", 
        u.role, 
        u.warehouse_id as "warehouseId", 
        u.is_active as "isActive", 
        u.permissions, 
        u.created_at as "createdAt", 
        u.updated_at as "updatedAt",
        w.name as "warehouseName",
        w.type as "warehouseType",
        (SELECT COUNT(*) FROM user_warehouse_assignments WHERE user_id = u.id) as "warehouseAssignmentCount"
      FROM users u
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      ${whereSql} 
      ORDER BY u.created_at DESC 
      LIMIT ? OFFSET ?
    `

    const rows = (await query(queryStr, [...params, pageSize, offset])) as any[]
    const countRows = (await query(`
      SELECT COUNT(*) as cnt 
      FROM users u 
      LEFT JOIN warehouses w ON u.warehouse_id = w.id
      ${whereSql}
    `, params)) as any[]
    const total = Number((countRows && countRows[0] && countRows[0].cnt) || rows.length)

    return NextResponse.json({ success: true, data: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) } as PaginatedResponse<any>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    // Allow ADMIN or HR to create users
    if (!user || (!isAdmin(user) && !isHR(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const body = await request.json()
    const { email, fullName, role, warehouseId, password, permissions, phoneNumber } = body || {}

    // HR can ONLY create ATTENDANCE_STAFF users
    if (isHR(user) && !isAdmin(user)) {
      const hrAllowedRoles = ['ATTENDANCE_STAFF']
      if (!hrAllowedRoles.includes(role)) {
        return NextResponse.json({
          success: false,
          error: "HR chỉ được tạo nhân viên chấm công (ATTENDANCE_STAFF). Liên hệ Admin để tạo các loại nhân viên khác."
        } as ApiResponse<null>, { status: 403 })
      }
    }
    if ((!email && !phoneNumber) || !fullName || !role || !password) {
      return NextResponse.json({ success: false, error: "Missing fields (Email or Phone required)" } as ApiResponse<null>, { status: 400 })
    }

    // Validate warehouseId is required for certain roles
    const rolesRequiringWarehouse = ['QuanLyKhoCon', 'WAREHOUSE_MANAGER', 'STAFF', 'WAREHOUSE_STAFF']
    if (rolesRequiringWarehouse.includes(role) && !warehouseId) {
      return NextResponse.json({
        success: false,
        error: `Role ${role} yêu cầu phải chọn kho`
      } as ApiResponse<null>, { status: 400 })
    }

    // Validate email format if provided
    if (email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(String(email))) {
        return NextResponse.json({ success: false, error: "Invalid email format" } as ApiResponse<null>, { status: 400 })
      }

      // Check if email already exists
      const existingUser = (await query(`SELECT id FROM users WHERE email = ?`, [email])) as any[]
      if (existingUser && existingUser.length > 0) {
        return NextResponse.json({ success: false, error: "Email already exists" } as ApiResponse<null>, { status: 409 })
      }
    }

    // Check if phone already exists if provided
    if (phoneNumber) {
      const existingUserPhone = (await query(`SELECT id FROM users WHERE phone_number = ?`, [phoneNumber])) as any[]
      if (existingUserPhone && existingUserPhone.length > 0) {
        return NextResponse.json({ success: false, error: "Phone number already exists" } as ApiResponse<null>, { status: 409 })
      }
    }

    // Validate password strength (minimum 6 characters)
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, error: "Password must be at least 6 characters" } as ApiResponse<null>, { status: 400 })
    }

    const id = randomUUID()
    const pwdHash = await hashPassword(String(password))
    const now = new Date().toISOString()

    await runTransaction(async () => {
      await query(`INSERT INTO users (id, email, password_hash, full_name, role, warehouse_id, is_active, permissions, created_at, updated_at) VALUES (?::uuid, ?, ?, ?, ?::user_role, ?::uuid, ?::boolean, ?::jsonb, ?::timestamp, ?::timestamp)`, [
        id,
        email,
        pwdHash,
        fullName,
        role,
        warehouseId || null,
        true,
        permissions ? JSON.stringify(permissions) : "[]",
        now,
        now,
      ])
    })

    const rows = (await query(`SELECT id, email, full_name as fullName, role, warehouse_id as warehouseId, is_active as isActive, permissions, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?`, [id])) as any[]
    return NextResponse.json({ success: true, data: (rows && rows[0]) || null } as ApiResponse<any>, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
