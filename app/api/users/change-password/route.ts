import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, hashPassword } from "@/lib/auth"
import bcrypt from "bcryptjs"

/**
 * @swagger
 * /api/users/change-password:
 *   post:
 *     summary: Change Password
 *     description: Change the password for the current user.
 *     tags: [Users]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 description: The current password
 *               newPassword:
 *                 type: string
 *                 description: The new password (min 6 chars)
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid password or format
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  try {
    // Get current user
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json({ success: false, error: "Unauthorized" } as ApiResponse<null>, { status: 401 })
    }

    const body = await request.json()
    const { currentPassword, newPassword } = body || {}

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ success: false, error: "Vui lòng nhập đầy đủ thông tin" } as ApiResponse<null>, { status: 400 })
    }

    if (newPassword.length < 6) {
      return NextResponse.json({ success: false, error: "Mật khẩu mới phải có ít nhất 6 ký tự" } as ApiResponse<null>, { status: 400 })
    }

    // Get user from database with password hash
    const dbUser = await prisma.users.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        password_hash: true
      }
    })

    if (!dbUser) {
      return NextResponse.json({ success: false, error: "Người dùng không tồn tại" } as ApiResponse<null>, { status: 404 })
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, dbUser.password_hash)
    if (!isValidPassword) {
      return NextResponse.json({ success: false, error: "Mật khẩu hiện tại không đúng" } as ApiResponse<null>, { status: 400 })
    }

    // Hash new password and update
    const newPasswordHash = await hashPassword(newPassword)
    await prisma.users.update({
      where: { id: user.id },
      data: {
        password_hash: newPasswordHash,
        updated_at: new Date()
      }
    })

    return NextResponse.json({ success: true, message: "Đổi mật khẩu thành công" } as ApiResponse<any>)
  } catch (error: any) {
    console.error("Error changing password:", error)
    return NextResponse.json({ success: false, error: error?.message || "Lỗi server" } as ApiResponse<null>, { status: 500 })
  }
}
