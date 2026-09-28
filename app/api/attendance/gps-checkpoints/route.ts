import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

/**
 * GET /api/attendance/gps-checkpoints
 * Lấy tất cả các điểm chấm công (warehouses có cấu hình GPS)
 * Endpoint này không filter theo role - cho phép nhân viên biết tất cả các điểm có thể chấm công
 */
export async function GET(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." },
                { status: 401 }
            )
        }

        // Lấy TẤT CẢ warehouses có cấu hình GPS - không filter theo role
        // Điều này cho phép nhân viên chấm công ở bất kỳ điểm nào
        const warehousesWithGPS = await prisma.warehouses.findMany({
            where: {
                is_active: true,
                latitude: { not: null },
                longitude: { not: null },
            },
            select: {
                id: true,
                code: true,
                name: true,
                type: true,
                latitude: true,
                longitude: true,
                checkin_radius_meters: true,
            },
            orderBy: {
                name: 'asc'
            }
        })

        console.log(`[GPS Checkpoints] Found ${warehousesWithGPS.length} warehouses with GPS for user ${user.id}`)

        // Log chi tiết để debug
        warehousesWithGPS.forEach(w => {
            console.log(`  - ${w.name} (${w.code}): lat=${w.latitude}, lng=${w.longitude}, radius=${w.checkin_radius_meters || 3000}m`)
        })

        return NextResponse.json({
            success: true,
            message: `Tìm thấy ${warehousesWithGPS.length} điểm chấm công`,
            data: warehousesWithGPS.map(w => ({
                id: w.id,
                code: w.code,
                name: w.name,
                type: w.type,
                latitude: w.latitude ? parseFloat(w.latitude.toString()) : null,
                longitude: w.longitude ? parseFloat(w.longitude.toString()) : null,
                radius: w.checkin_radius_meters || 3000,
            }))
        })

    } catch (error) {
        console.error("Error fetching GPS checkpoints:", error)
        return NextResponse.json(
            { success: false, error: "Lỗi hệ thống khi lấy thông tin điểm chấm công" },
            { status: 500 }
        )
    }
}
