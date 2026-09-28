import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { query, runTransaction } from '@/lib/prisma'
import { verifyToken, isAdmin } from '@/lib/auth'
import { getAuthToken } from '@/lib/auth-server'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const fromUnit = url.searchParams.get('fromUnit')
    const toUnit = url.searchParams.get('toUnit')
    if (fromUnit && toUnit) {
      const rows = (await query(`SELECT id, from_unit_id as "fromUnitId", to_unit_id as "toUnitId", multiplier, from_quantity as "fromQuantity", to_quantity as "toQuantity" FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`, [fromUnit, toUnit])) as any[]
      return NextResponse.json({ success: true, data: rows } as ApiResponse<any>)
    }
    // otherwise return all relations
    const all = (await query(`SELECT ur.id, ur.from_unit_id as "fromUnitId", ur.to_unit_id as "toUnitId", ur.multiplier, ur.from_quantity as "fromQuantity", ur.to_quantity as "toQuantity", f.code as "fromCode", f.name as "fromName", t.code as "toCode", t.name as "toName" FROM unit_relations ur JOIN product_units f ON f.id = ur.from_unit_id JOIN product_units t ON t.id = ur.to_unit_id ORDER BY f.name, t.name`)) as any[]
    return NextResponse.json({ success: true, data: all } as ApiResponse<any>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    // Authenticate user - only admin can create unit conversions
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await request.json()
    const { fromUnitId, toUnitId, multiplier, fromQuantity, toQuantity } = body || {}

    // Support both old API (multiplier) and new API (fromQuantity + toQuantity)
    let finalFromQty = fromQuantity || 1
    let finalToQty = toQuantity || multiplier || 1
    let finalMultiplier = multiplier || (finalToQty / finalFromQty)

    if (!fromUnitId || !toUnitId) return NextResponse.json({ success: false, error: 'Missing fromUnitId or toUnitId' } as ApiResponse<null>, { status: 400 })
    if (finalFromQty <= 0 || finalToQty <= 0) return NextResponse.json({ success: false, error: 'Quantities must be positive' } as ApiResponse<null>, { status: 400 })
    // validation: from != to
    if (fromUnitId === toUnitId) return NextResponse.json({ success: false, error: 'fromUnitId and toUnitId must be different' } as ApiResponse<null>, { status: 400 })

    // Check for existing forward relation (we'll update it instead of rejecting)
    const existingForward = (await query(`SELECT id FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`, [fromUnitId, toUnitId])) as any[]
    const existingReverse = (await query(`SELECT id FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`, [toUnitId, fromUnitId])) as any[]

    // Build adjacency for cycle detection (skip existing relations to allow updates)
    const rels = (await query(`SELECT from_unit_id as "fromUnitId", to_unit_id as "toUnitId" FROM unit_relations WHERE NOT (from_unit_id = ? AND to_unit_id = ?) AND NOT (from_unit_id = ? AND to_unit_id = ?)`, [fromUnitId, toUnitId, toUnitId, fromUnitId])) as any[]
    const adj: Record<string, string[]> = {}
    for (const r of rels) {
      adj[r.fromUnitId] = adj[r.fromUnitId] || []
      adj[r.fromUnitId].push(r.toUnitId)
    }

    // Only check for cycles if this is a new relation (not an update)
    if (!existingForward || existingForward.length === 0) {
      const reachable = (start: string, target: string): boolean => {
        const stack = [start]
        const seen = new Set<string>([start])
        while (stack.length) {
          const cur = stack.pop()!
          const edges = adj[cur] || []
          for (const nxt of edges) {
            if (nxt === target) return true
            if (!seen.has(nxt)) {
              seen.add(nxt)
              stack.push(nxt)
            }
          }
        }
        return false
      }
      if (reachable(toUnitId, fromUnitId)) {
        return NextResponse.json({ success: false, error: 'Inserting this relation would create a cycle; operation rejected.' } as ApiResponse<null>, { status: 400 })
      }
    }

    // Upsert both forward and reverse relations (bidirectional)
    await runTransaction(async () => {
      // Forward relation: fromUnitId -> toUnitId
      await query(`INSERT INTO unit_relations (from_unit_id, to_unit_id, multiplier, from_quantity, to_quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (from_unit_id, to_unit_id)
        DO UPDATE SET multiplier = EXCLUDED.multiplier, from_quantity = EXCLUDED.from_quantity, to_quantity = EXCLUDED.to_quantity, updated_at = CURRENT_TIMESTAMP`,
        [fromUnitId, toUnitId, finalMultiplier, finalFromQty, finalToQty])

      // Reverse relation: toUnitId -> fromUnitId (swap quantities and invert multiplier)
      await query(`INSERT INTO unit_relations (from_unit_id, to_unit_id, multiplier, from_quantity, to_quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (from_unit_id, to_unit_id)
        DO UPDATE SET multiplier = EXCLUDED.multiplier, from_quantity = EXCLUDED.from_quantity, to_quantity = EXCLUDED.to_quantity, updated_at = CURRENT_TIMESTAMP`,
        [toUnitId, fromUnitId, finalFromQty / finalToQty, finalToQty, finalFromQty])
    })

    const rows = (await query(`SELECT * FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`, [fromUnitId, toUnitId])) as any[]
    return NextResponse.json({ success: true, data: rows && rows[0] } as ApiResponse<any>, { status: 201 })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Authenticate user - only admin can delete unit conversions
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await request.json()
    const { id } = body || {}
    if (!id) return NextResponse.json({ success: false, error: 'Missing id' } as ApiResponse<null>, { status: 400 })
    // delete global relation by id
    const rows = (await query(`SELECT from_unit_id as "fromUnitId", to_unit_id as "toUnitId" FROM unit_relations WHERE id = ?`, [id])) as any[]
    const fromUnitId = rows && rows[0] ? rows[0].fromUnitId : null
    const toUnitId = rows && rows[0] ? rows[0].toUnitId : null
    await runTransaction(async () => {
      await query(`DELETE FROM unit_relations WHERE id = ?`, [id])
      // also delete reverse relation if it exists
      if (fromUnitId && toUnitId) {
        await query(`DELETE FROM unit_relations WHERE from_unit_id = ? AND to_unit_id = ?`, [toUnitId, fromUnitId])
      }
    })
    return NextResponse.json({ success: true } as ApiResponse<null>)
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}
