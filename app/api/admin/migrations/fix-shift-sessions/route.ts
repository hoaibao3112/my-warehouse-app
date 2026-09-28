import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isAdmin } from "@/lib/auth"

/**
 * Migration API to fix legacy shift_sessions that are missing shift_assignment_id
 * This links sessions to their corresponding assignments based on user_id, session_date, and work_shift_id
 * 
 * Also cleans up duplicate sessions and audit logs
 */
export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user || !isAdmin(user)) {
            return NextResponse.json(
                { success: false, error: "Unauthorized - Admin only" },
                { status: 403 }
            )
        }

        const body = await request.json()
        const dryRun = body.dryRun !== false // Default to dry run for safety

        console.log(`[Migration] Starting shift_sessions migration (dryRun: ${dryRun})`)

        // Step 1: Find all sessions without shift_assignment_id
        const orphanedSessions = await prisma.shift_sessions.findMany({
            where: {
                shift_assignment_id: null,
            },
            select: {
                id: true,
                user_id: true,
                session_date: true,
                work_shift_id: true,
                check_in_time: true,
                check_out_time: true,
                created_at: true,
            },
            orderBy: { created_at: 'desc' }
        })

        console.log(`[Migration] Found ${orphanedSessions.length} sessions without shift_assignment_id`)

        // Step 2: Group sessions by user_id + session_date + work_shift_id
        const sessionGroups = new Map<string, typeof orphanedSessions>()

        for (const session of orphanedSessions) {
            const dateStr = session.session_date?.toISOString().split('T')[0] || ''
            const key = `${session.user_id}_${dateStr}_${session.work_shift_id}`

            if (!sessionGroups.has(key)) {
                sessionGroups.set(key, [])
            }
            sessionGroups.get(key)!.push(session)
        }

        console.log(`[Migration] Found ${sessionGroups.size} unique user+date+shift combinations`)

        let linkedCount = 0
        let duplicatesRemoved = 0
        let errors: string[] = []

        // Step 3: For each group, find matching assignment and link
        for (const [key, sessions] of sessionGroups) {
            const [userId, dateStr, workShiftId] = key.split('_')

            // Find assignment for this user + date + shift
            const assignment = await prisma.shift_assignments.findFirst({
                where: {
                    user_id: userId,
                    work_shift_id: workShiftId,
                    assigned_date: new Date(dateStr),
                }
            })

            if (!assignment) {
                // No assignment found - these are orphaned sessions
                errors.push(`No assignment found for user=${userId}, date=${dateStr}, shift=${workShiftId}`)
                continue
            }

            // Check if there's already a session linked to this assignment
            const existingLinkedSession = await prisma.shift_sessions.findFirst({
                where: { shift_assignment_id: assignment.id }
            })

            if (existingLinkedSession) {
                // Assignment already has a linked session - mark duplicates for removal
                if (!dryRun) {
                    // Delete all orphaned sessions in this group
                    await prisma.shift_sessions.deleteMany({
                        where: {
                            id: { in: sessions.map(s => s.id) }
                        }
                    })
                }
                duplicatesRemoved += sessions.length
                continue
            }

            // Sort by most recent first (prefer session with most data)
            sessions.sort((a, b) => {
                // Prefer sessions with check_out_time
                if (a.check_out_time && !b.check_out_time) return -1
                if (!a.check_out_time && b.check_out_time) return 1
                // Then prefer sessions with check_in_time
                if (a.check_in_time && !b.check_in_time) return -1
                if (!a.check_in_time && b.check_in_time) return 1
                // Then by created_at (newest first)
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
            })

            const primarySession = sessions[0]
            const duplicateSessions = sessions.slice(1)

            if (!dryRun) {
                // Link the primary session to assignment
                await prisma.shift_sessions.update({
                    where: { id: primarySession.id },
                    data: { shift_assignment_id: assignment.id }
                })
                linkedCount++

                // Delete duplicates
                if (duplicateSessions.length > 0) {
                    await prisma.shift_sessions.deleteMany({
                        where: {
                            id: { in: duplicateSessions.map(s => s.id) }
                        }
                    })
                    duplicatesRemoved += duplicateSessions.length
                }
            } else {
                linkedCount++
                duplicatesRemoved += duplicateSessions.length
            }
        }

        const result = {
            success: true,
            dryRun,
            totalOrphanedSessions: orphanedSessions.length,
            uniqueGroups: sessionGroups.size,
            sessionsLinked: linkedCount,
            duplicatesRemoved,
            errors: errors.length > 0 ? errors.slice(0, 20) : undefined, // Limit errors for response size
            message: dryRun
                ? `Dry run complete. Would link ${linkedCount} sessions and remove ${duplicatesRemoved} duplicates.`
                : `Migration complete. Linked ${linkedCount} sessions and removed ${duplicatesRemoved} duplicates.`
        }

        console.log(`[Migration] Complete:`, result)
        return NextResponse.json(result)

    } catch (error) {
        console.error("[Migration] Error:", error)
        return NextResponse.json(
            { success: false, error: "Migration failed", details: String(error) },
            { status: 500 }
        )
    }
}
