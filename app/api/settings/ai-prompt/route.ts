import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"

const SETTING_KEY = "ai_analysis_prompt"

// GET /api/settings/ai-prompt - Get custom AI prompt
export async function GET(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        // Check admin role
        const userRecord = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true }
        })

        if (userRecord?.role !== "ADMIN") {
            return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 })
        }

        const setting = await prisma.system_settings.findUnique({
            where: { key: SETTING_KEY }
        })

        return NextResponse.json({
            success: true,
            data: setting ? { value: setting.value } : null
        })

    } catch (error) {
        console.error("Error fetching AI prompt setting:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}

// POST /api/settings/ai-prompt - Save custom AI prompt
export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 })
        }

        // Check admin role
        const userRecord = await prisma.users.findUnique({
            where: { id: user.id },
            select: { role: true }
        })

        if (userRecord?.role !== "ADMIN") {
            return NextResponse.json({ success: false, error: "Admin only" }, { status: 403 })
        }

        const body = await request.json()
        const { value } = body

        if (typeof value !== "string") {
            return NextResponse.json({ success: false, error: "Invalid value" }, { status: 400 })
        }

        await prisma.system_settings.upsert({
            where: { key: SETTING_KEY },
            update: {
                value,
                updated_at: new Date()
            },
            create: {
                key: SETTING_KEY,
                value,
                description: "Custom AI analysis prompt for sales reports"
            }
        })

        return NextResponse.json({ success: true, message: "Prompt saved" })

    } catch (error) {
        console.error("Error saving AI prompt setting:", error)
        return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
    }
}
