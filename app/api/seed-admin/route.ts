import { NextRequest, NextResponse } from "next/server"
import { randomUUID } from "crypto"
import type { ApiResponse, AuthSession } from "@/lib/types"
import { query, runTransaction } from "@/lib/prisma"
import { hashPassword, generateToken } from "@/lib/auth"

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Only allow seeding in development mode
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { success: false, error: "Seed endpoint is disabled in production" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const email = body.email || "admin@example.com"
    const password = body.password || "password"
    const role = body.role || "AdminKhoTong"

    // if user already exists, return a session
    const existing = (await query(`SELECT * FROM users WHERE email = ?`, [email])) as any[]
    let userRow = existing && existing[0]

    if (!userRow) {
      const id = randomUUID()
      const pwd = await hashPassword(String(password))
      const now = new Date().toISOString()
      // Avoid nested transaction issues: insert directly via query()
      await query(`INSERT INTO users (id, email, password_hash, full_name, role, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        id,
        email,
        pwd,
        "Admin User",
        role,
        1,
        now,
        now,
      ])

      const rows = (await query(`SELECT * FROM users WHERE id = ?`, [id])) as any[]
      userRow = rows && rows[0]
    }

    const user = {
      id: userRow.id,
      email: userRow.email,
      fullName: userRow.full_name,
      role: userRow.role,
      warehouseId: userRow.warehouse_id,
      isActive: Boolean(userRow.is_active),
      createdAt: userRow.created_at,
      updatedAt: userRow.updated_at,
    }

    const token = generateToken(user as any)
    const session: AuthSession = { user: user as any, token, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }

    const response = NextResponse.json({ success: true, data: { session, password } } as ApiResponse<any>)
    try {
      response.cookies.set("auth-token", token, { httpOnly: true, path: "/", maxAge: 24 * 60 * 60 })
    } catch (e) {
      response.headers.set("Set-Cookie", `auth-token=${encodeURIComponent(token)}; Path=/; Max-Age=${24 * 60 * 60}; HttpOnly; SameSite=Lax`)
    }

    return response
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}
