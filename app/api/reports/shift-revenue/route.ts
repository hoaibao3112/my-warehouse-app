import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns'

async function getUser(request: NextRequest) {
    const token = getAuthToken(request)
    if (!token) return null
    try {
        return verifyToken(token) as any
    } catch {
        return null
    }
}

function getTargetStatus(revenue: number, target: number): 'achieved' | 'partial' | 'not_achieved' {
    if (target === 0) return 'achieved'
    const percentage = (revenue / target) * 100
    if (percentage >= 100) return 'achieved'
    if (percentage >= 80) return 'partial'
    return 'not_achieved'
}

// Fixed shift colors for Ca A, B, C, D
const SHIFT_COLORS: Record<string, string> = {
    'A': '#3b82f6', // Blue
    'B': '#10b981', // Green
    'C': '#f59e0b', // Orange
    'D': '#8b5cf6', // Purple
}

// No longer needed - using SQL query instead

// GET /api/reports/shift-revenue - Get revenue broken down by FIXED SHIFT TIME RANGES (Ca A, B, C, D)
export async function GET(request: NextRequest) {
    try {
        const user = await getUser(request)
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const warehouseId = searchParams.get('warehouseId')
        const dateStr = searchParams.get('date')
        const startDateStr = searchParams.get('startDate')
        const endDateStr = searchParams.get('endDate')
        const period = searchParams.get('period') || 'day' // day, week, month

        // Determine warehouse
        const userWarehouseId = user.warehouse_id || user.warehouseId
        const finalWarehouseId = warehouseId || userWarehouseId

        if (!finalWarehouseId) {
            return NextResponse.json({ success: false, error: 'Warehouse ID required' }, { status: 400 })
        }

        // Determine date range
        let startDate: Date, endDate: Date
        const baseDate = dateStr ? new Date(dateStr) : new Date()

        switch (period) {
            case 'week':
                startDate = startOfWeek(baseDate, { weekStartsOn: 1 }) // Monday
                endDate = endOfWeek(baseDate, { weekStartsOn: 1 })
                break
            case 'month':
                startDate = startOfMonth(baseDate)
                endDate = endOfMonth(baseDate)
                break
            default: // day
                if (startDateStr && endDateStr) {
                    startDate = new Date(startDateStr)
                    endDate = new Date(endDateStr)
                } else {
                    startDate = startOfDay(baseDate)
                    endDate = endOfDay(baseDate)
                }
        }

        console.log(`[ShiftReport] Range: ${startDate.toISOString()} - ${endDate.toISOString()} | Warehouse: ${finalWarehouseId}`)

        // 1. Fetch sales targets for the day
        const dayOfWeek = baseDate.getDay() // 0 = Sunday
        const targets = await prisma.warehouse_sales_targets.findFirst({
            where: {
                warehouse_id: finalWarehouseId,
                day_of_week: dayOfWeek
            }
        })
        const dailyTarget = targets?.daily_target ? parseFloat(targets.daily_target.toString()) : 0

        // 2. Define fixed shift time ranges (fallback if not in database)
        const fixedShifts = [
            { code: 'A', name: 'Ca A', start: '06:30:00', end: '10:30:00' },
            { code: 'B', name: 'Ca B', start: '10:31:00', end: '14:30:00' },
            { code: 'C', name: 'Ca C', start: '14:31:00', end: '18:30:00' },
            { code: 'D', name: 'Ca D', start: '18:31:00', end: '22:30:00' }
        ]

        // Use raw SQL to categorize invoices by shift time ranges
        // Convert timestamp to Vietnam timezone (UTC+7) before comparing
        const shiftsDataRaw = await query(`
            WITH fixed_shifts AS (
                SELECT 'A' as shift_code, 'Ca A' as shift_name, '00:00:00'::time as start_time, '10:30:59'::time as end_time
                UNION ALL
                SELECT 'B', 'Ca B', '10:31:00'::time, '14:30:59'::time
                UNION ALL
                SELECT 'C', 'Ca C', '14:31:00'::time, '18:30:59'::time
                UNION ALL
                SELECT 'D', 'Ca D', '18:31:00'::time, '23:59:59'::time
            ),
            shift_invoices AS (
                SELECT
                    fs.shift_code,
                    fs.shift_name,
                    fs.start_time,
                    fs.end_time,
                    si.id as invoice_id,
                    si.total_amount,
                    (si.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::time as invoice_time
                FROM fixed_shifts fs
                LEFT JOIN sales_invoices si ON
                    si.warehouse_id = $3::uuid
                    AND si.created_at >= $1::timestamp
                    AND si.created_at <= $2::timestamp
                    AND (
                        (si.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::time >= fs.start_time 
                        AND (si.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::time <= fs.end_time
                    )
            )
            SELECT
                shift_code,
                shift_name,
                COUNT(invoice_id) as invoice_count,
                COALESCE(SUM(total_amount), 0) as revenue
            FROM shift_invoices
            GROUP BY shift_code, shift_name
            ORDER BY shift_code
        `, [startDate, endDate, finalWarehouseId]) as any[]

        console.log(`[ShiftReport] SQL returned ${shiftsDataRaw.length} shifts with data`)

        // 3. Build shifts data with targets - ensure all 4 shifts are always shown
        const shiftsData = []
        let totalRevenue = 0
        let totalInvoices = 0

        // Always show all 4 shifts even if no revenue
        for (const fixedShift of fixedShifts) {
            const row = shiftsDataRaw.find(r => r.shift_code === fixedShift.code)
            const shiftCode = fixedShift.code
            const revenue = row ? parseFloat(row.revenue || '0') : 0
            const count = row ? parseInt(row.invoice_count || '0') : 0

            totalRevenue += revenue
            totalInvoices += count

            // Get target for this shift
            let shiftTarget = 0
            if (shiftCode === 'A') shiftTarget = targets?.shift_a_target ? parseFloat(targets.shift_a_target.toString()) : 0
            else if (shiftCode === 'B') shiftTarget = targets?.shift_b_target ? parseFloat(targets.shift_b_target.toString()) : 0
            else if (shiftCode === 'C') shiftTarget = targets?.shift_c_target ? parseFloat(targets.shift_c_target.toString()) : 0
            else if (shiftCode === 'D') shiftTarget = targets?.shift_d_target ? parseFloat(targets.shift_d_target.toString()) : 0

            shiftsData.push({
                shift: shiftCode,
                name: fixedShift.name,
                code: shiftCode,
                color: SHIFT_COLORS[shiftCode] || '#64748b',
                revenue,
                target: shiftTarget,
                percentage: shiftTarget > 0 ? Math.round((revenue / shiftTarget) * 100) : (revenue > 0 ? 100 : 0),
                invoiceCount: count,
                status: getTargetStatus(revenue, shiftTarget)
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                period,
                date: baseDate.toISOString().split('T')[0],
                dayOfWeek,
                shifts: shiftsData,
                total: {
                    revenue: totalRevenue,
                    target: dailyTarget,
                    percentage: dailyTarget > 0 ? Math.round((totalRevenue / dailyTarget) * 100) : (totalRevenue > 0 ? 100 : 0),
                    invoiceCount: totalInvoices,
                    status: getTargetStatus(totalRevenue, dailyTarget)
                }
            }
        })
    } catch (error: any) {
        console.error('Error fetching shift revenue:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch shift revenue' },
            { status: 500 }
        )
    }
}
