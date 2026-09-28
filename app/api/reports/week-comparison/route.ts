import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { startOfDay, endOfDay, subWeeks, format } from 'date-fns'
import { vi } from 'date-fns/locale'

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

// Find the most recent date that matches the given day of week
function getDateForDayOfWeek(dayOfWeek: number, weeksAgo: number = 0): Date {
    const today = new Date()
    const currentDay = today.getDay()

    // Calculate days to subtract to get to the target day this week
    let daysToSubtract = currentDay - dayOfWeek
    if (daysToSubtract < 0) {
        // Target day is later in the week, go to previous week
        daysToSubtract += 7
    }

    // Add weeks to go back further
    daysToSubtract += weeksAgo * 7

    const targetDate = new Date(today)
    targetDate.setDate(today.getDate() - daysToSubtract)
    return targetDate
}

// GET /api/reports/week-comparison - Compare same weekday across weeks
export async function GET(request: NextRequest) {
    try {
        const user = await getUser(request)
        if (!user) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const warehouseId = searchParams.get('warehouseId')
        const dayOfWeekStr = searchParams.get('dayOfWeek')
        const weeksStr = searchParams.get('weeks') || '4'

        // Determine warehouse
        const userWarehouseId = user.warehouse_id || user.warehouseId
        const finalWarehouseId = warehouseId || userWarehouseId

        if (!finalWarehouseId) {
            return NextResponse.json({ success: false, error: 'Warehouse ID required' }, { status: 400 })
        }

        // Parse day of week (0-6, Sunday-Saturday)
        const dayOfWeek = dayOfWeekStr !== null ? parseInt(dayOfWeekStr) : new Date().getDay()
        if (isNaN(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
            return NextResponse.json({ success: false, error: 'Invalid dayOfWeek (0-6)' }, { status: 400 })
        }

        const weeks = parseInt(weeksStr) || 4

        // Get target for this day
        const target = await prisma.warehouse_sales_targets.findFirst({
            where: {
                warehouse_id: finalWarehouseId,
                day_of_week: dayOfWeek
            }
        })

        const dailyTarget = target?.daily_target ? parseFloat(target.daily_target.toString()) : 0

        // Collect data for each week
        const weekData: {
            date: string
            weekLabel: string
            revenue: number
            target: number
            invoiceCount: number
            percentage: number
        }[] = []

        for (let w = 0; w < weeks; w++) {
            const targetDate = getDateForDayOfWeek(dayOfWeek, w)
            const dayStart = startOfDay(targetDate)
            const dayEnd = endOfDay(targetDate)

            // Get invoices for this date
            const invoices = await prisma.sales_invoices.findMany({
                where: {
                    warehouse_id: finalWarehouseId,
                    created_at: {
                        gte: dayStart,
                        lte: dayEnd
                    }
                },
                select: {
                    total_amount: true
                }
            })

            const revenue = invoices.reduce((sum, inv) => {
                return sum + (inv.total_amount ? parseFloat(inv.total_amount.toString()) : 0)
            }, 0)

            // Generate week label
            let weekLabel: string
            if (w === 0) {
                weekLabel = 'Tuần này'
            } else if (w === 1) {
                weekLabel = 'Tuần trước'
            } else {
                weekLabel = `${w} tuần trước`
            }

            weekData.push({
                date: format(targetDate, 'yyyy-MM-dd'),
                weekLabel,
                revenue,
                target: dailyTarget,
                invoiceCount: invoices.length,
                percentage: dailyTarget > 0 ? Math.round((revenue / dailyTarget) * 100) : (revenue > 0 ? 100 : 0)
            })
        }

        return NextResponse.json({
            success: true,
            data: {
                dayOfWeek,
                dayName: DAY_NAMES[dayOfWeek],
                target: dailyTarget,
                weeks: weekData
            }
        })
    } catch (error: any) {
        console.error('Error fetching week comparison:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Failed to fetch week comparison' },
            { status: 500 }
        )
    }
}
