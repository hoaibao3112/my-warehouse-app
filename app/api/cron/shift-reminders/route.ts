/**
 * Cron API: Shift Reminders
 * POST /api/cron/shift-reminders
 * 
 * Sends FCM reminders to employees:
 * - 5 minutes BEFORE shift start: Check-in reminder
 * - 5 minutes AFTER shift end: Check-out reminder (if not checked out)
 * 
 * Should be called every minute by external cron job
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/prisma';

// Firebase Admin SDK - lazy initialization
let adminInitialized = false;
let admin: any = null;

async function initializeFirebaseAdmin() {
    if (adminInitialized && admin) {
        return admin;
    }

    try {
        const firebaseAdmin = await import('firebase-admin');

        if (firebaseAdmin.apps.length === 0) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
                throw new Error('Missing Firebase credentials');
            }

            firebaseAdmin.initializeApp({
                credential: firebaseAdmin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
        }

        admin = firebaseAdmin;
        adminInitialized = true;
        return firebaseAdmin;
    } catch (error) {
        console.error('Error initializing Firebase Admin:', error);
        throw error;
    }
}

/**
 * Send FCM notification to a user
 */
async function sendFCMToUser(
    firebaseAdmin: any,
    userId: string,
    tokens: string[],
    title: string,
    body: string,
    type: string,
    data?: Record<string, string>
): Promise<boolean> {
    try {
        if (!tokens || tokens.length === 0) {
            console.log(`No active tokens for user ${userId}`);
            return false;
        }

        const message = {
            notification: { title, body },
            android: {
                notification: {
                    icon: 'ic_launcher',
                    color: '#3B82F6',
                    sound: 'default',
                    priority: 'high' as const,
                    channelId: 'default'
                },
                priority: 'high' as const
            },
            data: { type, ...data },
            tokens: tokens
        };

        const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
        console.log(`FCM sent to user ${userId}: success=${response.successCount}, fail=${response.failureCount}`);

        return response.successCount > 0;
    } catch (error) {
        console.error(`Error sending FCM to user ${userId}:`, error);
        return false;
    }
}

/**
 * Format time for display (HH:mm)
 */
function formatTime(timeStr: string): string {
    // Handle both Date object and string formats
    if (timeStr.includes('T')) {
        return timeStr.substring(11, 16);
    }
    return timeStr.substring(0, 5);
}

export async function POST(request: NextRequest) {
    try {
        // Optional: Verify cron secret for security
        const cronSecret = request.headers.get('x-cron-secret');
        if (process.env.CRON_SECRET && cronSecret !== process.env.CRON_SECRET) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const firebaseAdmin = await initializeFirebaseAdmin();

        // Get current time in Vietnam timezone
        const now = new Date();
        const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
        const currentHour = vietnamTime.getHours();
        const currentMinute = vietnamTime.getMinutes();

        // Today's date in YYYY-MM-DD format
        const today = vietnamTime.toISOString().split('T')[0];

        console.log(`[Shift Reminders] Running at ${currentHour}:${currentMinute.toString().padStart(2, '0')} for date ${today}`);

        // Get all shift assignments for today with work shift times and user device tokens
        // CRITICAL: Only send reminders to employees with shift assignments
        // Exclude GENERAL_MANAGER as they typically don't check in/out
        // Using subquery for tokens to avoid N+1 problem
        const assignments = await query(`
      SELECT 
        sa.id as assignment_id,
        sa.user_id,
        sa.work_shift_id,
        ws.shift_name,
        ws.start_time,
        ws.end_time,
        u.full_name as user_name,
        u.role as user_role,
        ss.id as session_id,
        ss.check_in_time,
        ss.check_out_time,
        (
            SELECT json_agg(dt.token) 
            FROM device_tokens dt 
            WHERE dt.user_id = sa.user_id AND dt.active = true
        ) as tokens
      FROM shift_assignments sa
      JOIN work_shifts ws ON sa.work_shift_id = ws.id
      JOIN users u ON sa.user_id = u.id
      LEFT JOIN shift_sessions ss ON ss.user_id = sa.user_id 
        AND ss.session_date = sa.assigned_date::date
      WHERE sa.assigned_date = $1::date
        AND ws.is_active = true
        AND u.work_status = 'ACTIVE'
        AND u.role != 'GENERAL_MANAGER'
    `, [today]);

        let checkInReminders = 0;
        let checkOutReminders = 0;

        for (const assignment of assignments) {
            // Parse shift times (stored as TIME in PostgreSQL)
            const startTime = formatTime(String(assignment.start_time));
            const endTime = formatTime(String(assignment.end_time));

            const [startHour, startMinute] = startTime.split(':').map(Number);
            const [endHour, endMinute] = endTime.split(':').map(Number);

            // Calculate reminder times
            // Check-in reminder: 5 minutes before start
            let reminderCheckInHour = startHour;
            let reminderCheckInMinute = startMinute - 5;
            if (reminderCheckInMinute < 0) {
                reminderCheckInMinute += 60;
                reminderCheckInHour -= 1;
                if (reminderCheckInHour < 0) reminderCheckInHour = 23;
            }

            // Check-out reminder: 5 minutes after end
            let reminderCheckOutHour = endHour;
            let reminderCheckOutMinute = endMinute + 5;
            if (reminderCheckOutMinute >= 60) {
                reminderCheckOutMinute -= 60;
                reminderCheckOutHour += 1;
                if (reminderCheckOutHour >= 24) reminderCheckOutHour = 0;
            }

            // Get tokens (handle case where it might be null or already an array)
            const userTokens: string[] = Array.isArray(assignment.tokens)
                ? assignment.tokens
                : [];

            // Send check-in reminder if:
            // - Current time matches reminder time (within 1 minute window)
            // - User has NOT checked in yet
            if (
                currentHour === reminderCheckInHour &&
                currentMinute === reminderCheckInMinute &&
                !assignment.check_in_time
            ) {
                const sent = await sendFCMToUser(
                    firebaseAdmin,
                    assignment.user_id,
                    userTokens,
                    '⏰ Nhắc nhở Check-in',
                    `Ca ${assignment.shift_name} bắt đầu lúc ${startTime}. Hãy check-in ngay!`,
                    'shift_reminder_checkin',
                    { shiftName: assignment.shift_name, startTime }
                );
                if (sent) checkInReminders++;
            }

            // Send check-out reminder if:
            // - Current time matches reminder time (within 1 minute window)
            // - User HAS checked in (session exists)
            // - User has NOT checked out yet
            if (
                currentHour === reminderCheckOutHour &&
                currentMinute === reminderCheckOutMinute &&
                assignment.check_in_time &&
                !assignment.check_out_time
            ) {
                const sent = await sendFCMToUser(
                    firebaseAdmin,
                    assignment.user_id,
                    userTokens,
                    '⏰ Nhắc nhở Check-out',
                    `Ca ${assignment.shift_name} đã kết thúc lúc ${endTime}. Hãy check-out!`,
                    'shift_reminder_checkout',
                    { shiftName: assignment.shift_name, endTime }
                );
                if (sent) checkOutReminders++;
            }
        }

        return NextResponse.json({
            success: true,
            timestamp: vietnamTime.toISOString(),
            assignmentsChecked: assignments.length,
            checkInReminders,
            checkOutReminders
        });

    } catch (error) {
        console.error('Error in shift reminders cron:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Internal error' },
            { status: 500 }
        );
    }
}

// Also allow GET for easy testing
export async function GET(request: NextRequest) {
    return POST(request);
}
