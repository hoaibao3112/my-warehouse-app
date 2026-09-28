import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken, isAdmin } from '@/lib/auth'

// Day names in Vietnamese
const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7']

async function getUser(request: NextRequest) {
    const token = getAuthToken(request)
    if (!token) return null
    try {
        return verifyToken(token) as any
    } catch {
        return null
    }
}

// GET /api/warehouses/[id]/sales-targets - Get all sales targets for a warehouse
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUser(request)
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { id: warehouseId } = await params

        // Verify warehouse exists
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: warehouseId },
            select: { id: true, name: true, code: true }
        })

        if (!warehouse) {
            return NextResponse.json({ success: false, error: 'Warehouse not found' }, { status: 404 })
        }

        // Get existing targets
        const existingTargets = await prisma.warehouse_sales_targets.findMany({
            where: { warehouse_id: warehouseId },
            orderBy: { day_of_week: 'asc' }
        })

        // Create a map for quick lookup
        const targetMap = new Map(existingTargets.map(t => [t.day_of_week, t]))

        // Return all 7 days with defaults for missing entries
        const targets = Array.from({ length: 7 }, (_, dayOfWeek) => {
            const existing = targetMap.get(dayOfWeek)
            return {
                day_of_week: dayOfWeek,
                day_name: DAY_NAMES[dayOfWeek],
                shift_a_target: existing?.shift_a_target ? parseFloat(existing.shift_a_target.toString()) : 0,
                shift_b_target: existing?.shift_b_target ? parseFloat(existing.shift_b_target.toString()) : 0,
                shift_c_target: existing?.shift_c_target ? parseFloat(existing.shift_c_target.toString()) : 0,
                shift_d_target: existing?.shift_d_target ? parseFloat(existing.shift_d_target.toString()) : 0,
                daily_target: existing?.daily_target ? parseFloat(existing.daily_target.toString()) : 0,
            }
        })

        return NextResponse.json({
            success: true,
            data: {
                warehouse,
                targets
            }
        })
    } catch (error: any) {
        console.error('Error fetching sales targets:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch sales targets' },
            { status: 500 }
        )
    }
}

// PUT /api/warehouses/[id]/sales-targets - Update sales targets for a warehouse
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getUser(request)
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        // Only admin can update targets
        if (!isAdmin(user)) {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
        }

        const { id: warehouseId } = await params
        const body = await request.json()
        const { targets } = body

        if (!Array.isArray(targets)) {
            return NextResponse.json({ success: false, error: 'Invalid targets data' }, { status: 400 })
        }

        // Verify warehouse exists
        const warehouse = await prisma.warehouses.findUnique({
            where: { id: warehouseId },
            select: { id: true, name: true }
        })

        if (!warehouse) {
            return NextResponse.json({ success: false, error: 'Warehouse not found' }, { status: 404 })
        }

        // Upsert all targets
        const upsertPromises = targets.map(async (target: any) => {
            const dayOfWeek = parseInt(target.day_of_week)
            if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
                throw new Error(`Invalid day_of_week: ${target.day_of_week}`)
            }

            return prisma.warehouse_sales_targets.upsert({
                where: {
                    warehouse_id_day_of_week: {
                        warehouse_id: warehouseId,
                        day_of_week: dayOfWeek
                    }
                },
                create: {
                    warehouse_id: warehouseId,
                    day_of_week: dayOfWeek,
                    shift_a_target: target.shift_a_target || 0,
                    shift_b_target: target.shift_b_target || 0,
                    shift_c_target: target.shift_c_target || 0,
                    shift_d_target: target.shift_d_target || 0,
                    daily_target: target.daily_target || 0,
                },
                update: {
                    shift_a_target: target.shift_a_target || 0,
                    shift_b_target: target.shift_b_target || 0,
                    shift_c_target: target.shift_c_target || 0,
                    shift_d_target: target.shift_d_target || 0,
                    daily_target: target.daily_target || 0,
                    updated_at: new Date(),
                }
            })
        })

        await Promise.all(upsertPromises)

        // Fetch updated targets
        const updatedTargets = await prisma.warehouse_sales_targets.findMany({
            where: { warehouse_id: warehouseId },
            orderBy: { day_of_week: 'asc' }
        })

        return NextResponse.json({
            success: true,
            message: 'Sales targets updated successfully',
            data: updatedTargets.map(t => ({
                day_of_week: t.day_of_week,
                day_name: DAY_NAMES[t.day_of_week],
                shift_a_target: t.shift_a_target ? parseFloat(t.shift_a_target.toString()) : 0,
                shift_b_target: t.shift_b_target ? parseFloat(t.shift_b_target.toString()) : 0,
                shift_c_target: t.shift_c_target ? parseFloat(t.shift_c_target.toString()) : 0,
                shift_d_target: t.shift_d_target ? parseFloat(t.shift_d_target.toString()) : 0,
                daily_target: t.daily_target ? parseFloat(t.daily_target.toString()) : 0,
            }))
        })
    } catch (error: any) {
        console.error('Error updating sales targets:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to update sales targets' },
            { status: 500 }
        )
    }
}
