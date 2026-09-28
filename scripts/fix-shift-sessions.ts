/**
 * Migration script to fix legacy shift_sessions missing shift_assignment_id
 * 
 * Usage:
 *   pnpm tsx scripts/fix-shift-sessions.ts --dry-run   # Preview changes
 *   pnpm tsx scripts/fix-shift-sessions.ts             # Execute migration
 */

import { PrismaClient } from '../lib/generated/prisma'

const prisma = new PrismaClient()

async function main() {
    const dryRun = process.argv.includes('--dry-run')

    console.log(`\n=== Shift Sessions Migration ===`)
    console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'EXECUTE'}`)
    console.log(`\n`)

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

    console.log(`Found ${orphanedSessions.length} sessions without shift_assignment_id`)

    // Step 2: Group sessions by user_id + session_date + work_shift_id
    // Use | as delimiter since UUIDs contain dashes
    const sessionGroups = new Map<string, typeof orphanedSessions>()

    for (const session of orphanedSessions) {
        const dateStr = session.session_date?.toISOString().split('T')[0] || ''
        const key = `${session.user_id}|${dateStr}|${session.work_shift_id}`

        if (!sessionGroups.has(key)) {
            sessionGroups.set(key, [])
        }
        sessionGroups.get(key)!.push(session)
    }

    console.log(`Found ${sessionGroups.size} unique user+date+shift combinations\n`)

    let linkedCount = 0
    let duplicatesRemoved = 0
    let noAssignmentCount = 0
    let alreadyLinkedCount = 0

    // Step 3: For each group, find matching assignment and link
    for (const [key, sessions] of sessionGroups) {
        const [userId, dateStr, workShiftId] = key.split('|')

        // Find assignment for this user + date + shift
        const assignment = await prisma.shift_assignments.findFirst({
            where: {
                user_id: userId,
                work_shift_id: workShiftId,
                assigned_date: new Date(dateStr),
            }
        })

        if (!assignment) {
            noAssignmentCount++
            if (sessions.length > 1) {
                console.log(`  [WARN] No assignment for: user=${userId.slice(0, 8)}..., date=${dateStr}, ${sessions.length} orphaned sessions`)
            }
            continue
        }

        // Check if there's already a session linked to this assignment
        const existingLinkedSession = await prisma.shift_sessions.findFirst({
            where: { shift_assignment_id: assignment.id }
        })

        if (existingLinkedSession) {
            // Assignment already has a linked session - mark duplicates for removal
            if (!dryRun) {
                await prisma.shift_sessions.deleteMany({
                    where: {
                        id: { in: sessions.map(s => s.id) }
                    }
                })
            }
            duplicatesRemoved += sessions.length
            alreadyLinkedCount++
            console.log(`  [DEL] Removed ${sessions.length} duplicate sessions for date=${dateStr} (assignment already linked)`)
            continue
        }

        // Sort by most complete data first
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

            // Delete duplicates
            if (duplicateSessions.length > 0) {
                await prisma.shift_sessions.deleteMany({
                    where: {
                        id: { in: duplicateSessions.map(s => s.id) }
                    }
                })
            }
        }

        linkedCount++
        if (duplicateSessions.length > 0) {
            duplicatesRemoved += duplicateSessions.length
            console.log(`  [FIX] Linked session for date=${dateStr}, removed ${duplicateSessions.length} duplicates`)
        } else {
            console.log(`  [FIX] Linked session for date=${dateStr}`)
        }
    }

    console.log(`\n=== Summary ===`)
    console.log(`Total orphaned sessions: ${orphanedSessions.length}`)
    console.log(`Unique groups: ${sessionGroups.size}`)
    console.log(`Sessions linked: ${linkedCount}`)
    console.log(`Duplicates removed: ${duplicatesRemoved}`)
    console.log(`Groups without assignment: ${noAssignmentCount}`)
    console.log(`Already linked (removed orphans): ${alreadyLinkedCount}`)

    if (dryRun) {
        console.log(`\n[DRY RUN] No changes were made. Run without --dry-run to execute.`)
    } else {
        console.log(`\n[DONE] Migration completed successfully.`)
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect())
