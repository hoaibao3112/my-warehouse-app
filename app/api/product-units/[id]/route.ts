import { NextResponse, NextRequest } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { query, runTransaction } from '@/lib/prisma'
import { verifyToken, hasPermission, isAdmin } from '@/lib/auth'
import { getAuthToken } from "@/lib/auth-server"

// Helper to check if user can manage units
function canManageUnits(user: any): boolean {
  if (!user) return false
  // ADMIN and MANAGER (main warehouse) can manage units
  if (user.role === 'ADMIN' || user.role === 'MANAGER') return true
  // Otherwise check permission
  return hasPermission(user, 'unit_management')
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!canManageUnits(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { code, name } = body || {}

    if (!code || !name) {
      return NextResponse.json(
        { success: false, error: 'Missing code or name' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    await runTransaction(async () => {
      await query(`UPDATE product_units SET code = ?, name = ?, updated_at = NOW() WHERE id = ?`, [code, name, id])
    })

    const rows = (await query(`SELECT * FROM product_units WHERE id = ?`, [id])) as any[]

    return NextResponse.json({
      success: true,
      data: rows?.[0] || null
    } as ApiResponse<any>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!canManageUnits(user)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const { id } = await params

    await runTransaction(async () => {
      await query(`DELETE FROM product_units WHERE id = ?`, [id])
    })

    return NextResponse.json({ success: true, data: null } as ApiResponse<null>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

