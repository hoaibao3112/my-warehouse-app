import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse, User } from "@/lib/types"
import { query, runTransaction } from "@/lib/prisma"
import { verifyToken, isAdmin } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"


/**
 * @swagger
 * /api/users/{id}:
 *   get:
 *     summary: Get User Details
 *     description: Retrieve details of a specific user by ID.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     fullName:
 *                       type: string
 *                     role:
 *                       type: string
 *       404:
 *         description: User not found
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const rows = (await query(`SELECT id, email, full_name as fullName, role, warehouse_id as warehouseId, is_active as isActive, permissions, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?`, [id])) as any[]
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: "User not found" } as ApiResponse<null>, { status: 404 })
    }

    return NextResponse.json({ success: true, data: rows[0] } as ApiResponse<User>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to fetch user" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update User
 *     description: Update user details (Admin only).
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *               role:
 *                 type: string
 *               warehouseId:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: Invalid input
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check admin permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user || !isAdmin(user)) return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })

    const { id } = await params
    const body = await request.json()
    const { full_name, fullName, role, warehouseId, warehouse_id, isActive, is_active, password, permissions } = body || {}

    const updates: string[] = []
    const params_list: any[] = []

    // Get current user to check role
    const currentUser = (await query(`SELECT role, warehouse_id FROM users WHERE id = ?`, [id])) as any[]
    if (!currentUser || currentUser.length === 0) {
      return NextResponse.json({ success: false, error: "User not found" } as ApiResponse<null>, { status: 404 })
    }

    const finalRole = role !== undefined ? role : currentUser[0].role
    const finalWarehouseId = warehouseId !== undefined ? warehouseId : (warehouse_id !== undefined ? warehouse_id : currentUser[0].warehouse_id)

    // Validate warehouseId is required for certain roles
    const rolesRequiringWarehouse = ['QuanLyKhoCon', 'WAREHOUSE_MANAGER', 'STAFF']
    if (rolesRequiringWarehouse.includes(finalRole) && !finalWarehouseId) {
      return NextResponse.json({
        success: false,
        error: `Role ${finalRole} yêu cầu phải chọn kho`
      } as ApiResponse<null>, { status: 400 })
    }

    if (fullName !== undefined) { updates.push("full_name = ?"); params_list.push(fullName) }
    if (full_name !== undefined) { updates.push("full_name = ?"); params_list.push(full_name) }
    if (role !== undefined) { updates.push("role = ?::user_role"); params_list.push(role) }
    if (warehouseId !== undefined) { updates.push("warehouse_id = ?::uuid"); params_list.push(warehouseId || null) }
    if (warehouse_id !== undefined) { updates.push("warehouse_id = ?::uuid"); params_list.push(warehouse_id || null) }
    if (isActive !== undefined) { updates.push("is_active = ?::boolean"); params_list.push(isActive) }
    if (is_active !== undefined) { updates.push("is_active = ?::boolean"); params_list.push(is_active) }
    if (password !== undefined && password) {
      const { hashPassword: hashPwd } = await import("@/lib/auth")
      const pwdHash = await hashPwd(String(password))
      updates.push("password_hash = ?")
      params_list.push(pwdHash)
    }
    if (permissions !== undefined) {
      updates.push("permissions = ?::jsonb")
      params_list.push(typeof permissions === 'string' ? permissions : JSON.stringify(permissions || []))
    }

    if (updates.length === 0) {
      return NextResponse.json({ success: false, error: "No fields to update" } as ApiResponse<null>, { status: 400 })
    }

    updates.push("updated_at = ?::timestamp")
    params_list.push(new Date().toISOString())
    params_list.push(id)

    await runTransaction(async () => {
      await query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`, params_list)
    })

    const rows = (await query(`SELECT id, email, full_name as fullName, role, warehouse_id as warehouseId, is_active as isActive, permissions, created_at as createdAt, updated_at as updatedAt FROM users WHERE id = ?`, [id])) as any[]
    return NextResponse.json({ success: true, data: (rows && rows[0]) || null } as ApiResponse<User>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to update user" } as ApiResponse<null>, {
      status: 500,
    })
  }
}

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete User
 *     description: Permanently remove a user (Admin only).
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Check admin permission
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null
    if (!user || !isAdmin(user)) return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })

    const { id } = await params

    // Check if user exists
    const rows = (await query(`SELECT id FROM users WHERE id = ?`, [id])) as any[]
    if (!rows || rows.length === 0) {
      return NextResponse.json({ success: false, error: "User not found" } as ApiResponse<null>, { status: 404 })
    }

    // Delete the user
    await runTransaction(async () => {
      await query(`DELETE FROM users WHERE id = ?`, [id])
    })

    return NextResponse.json({ success: true, data: null } as ApiResponse<null>)
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || "Failed to delete user" } as ApiResponse<null>, {
      status: 500,
    })
  }
}
