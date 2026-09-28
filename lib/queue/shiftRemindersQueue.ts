import { Queue, Worker, Job } from 'bullmq';
import { connection } from './redis';
import { query } from '@/lib/prisma';
import admin from 'firebase-admin';

const QUEUE_NAME = 'shift-reminders-queue';

export const shiftRemindersQueue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 1000 // Keep last 1000 failed jobs
    }
});

// Helper: Khởi tạo Firebase Admin
let adminInitialized = false;
async function initializeFirebaseAdmin() {
    if (adminInitialized) return admin;

    try {
        if (admin.apps.length === 0) {
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
                console.warn('Thiếu cấu hình Firebase, bỏ qua tính năng Push Notification.');
                return null;
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: privateKey
                })
            });
        }

        adminInitialized = true;
        return admin;
    } catch (error) {
        console.error('Lỗi khi khởi tạo Firebase Admin:', error);
        return null;
    }
}

// Worker xử lý job gửi thông báo
export function startShiftRemindersWorker() {
    console.log(`[BullMQ] Bắt đầu Worker cho Queue: ${QUEUE_NAME} 🚀`);

    const worker = new Worker(QUEUE_NAME, async (job: Job) => {
        try {
            const { assignment_id, type } = job.data;

            // Xac thuc Assignment
            const assignments = await query(`
                SELECT 
                    sa.id as assignment_id,
                    sa.user_id,
                    ws.shift_name,
                    ws.start_time,
                    ws.end_time,
                    u.full_name as user_name,
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
                WHERE sa.id = $1
                  AND ws.is_active = true
                  AND u.work_status = 'ACTIVE'
            `, [assignment_id]);

            if (assignments.length === 0) {
                console.log(`[Worker] Bỏ qua: Assignment ${assignment_id} không tồn tại hoặc đã bị hủy.`);
                return;
            }

            const assignment = assignments[0];
            const startTime = String(assignment.start_time).substring(0, 5);
            const endTime = String(assignment.end_time).substring(0, 5);

            // Nếu là Check-in, kiểm tra xem đã check in chưa
            if (type === 'check_in' && assignment.check_in_time) {
                console.log(`[Worker] Bỏ qua: Nhân viên đã Check-in ca ${assignment.shift_name}`);
                return;
            }
            // Nếu là Check-out, phải kiểm tra xem có Check-in và chưa Check-out
            if (type === 'check_out' && (!assignment.check_in_time || assignment.check_out_time)) {
                console.log(`[Worker] Bỏ qua: Nhân viên chưa Check-in hoặc đã Check-out ca ${assignment.shift_name}`);
                return;
            }

            const tokens: string[] = Array.isArray(assignment.tokens) ? assignment.tokens : [];
            if (tokens.length === 0) {
                console.log(`[Worker] Bỏ qua: Không có token hợp lệ cho user ${assignment.user_id}`);
                return;
            }

            const firebaseAdmin = await initializeFirebaseAdmin();
            if (!firebaseAdmin) return;

            let title = '';
            let body = '';
            let actionType = '';

            if (type === 'check_in') {
                title = '⏰ Nhắc nhở Check-in';
                body = `Ca ${assignment.shift_name} bắt đầu lúc ${startTime}. Hãy check-in ngay!`;
                actionType = 'shift_reminder_checkin';
            } else {
                title = '⏰ Nhắc nhở Check-out';
                body = `Ca ${assignment.shift_name} đã kết thúc lúc ${endTime}. Hãy check-out!`;
                actionType = 'shift_reminder_checkout';
            }

            const message = {
                notification: { title, body },
                android: {
                    notification: { icon: 'ic_launcher', color: '#3B82F6', sound: 'default', priority: 'high' as const, channelId: 'default' },
                    priority: 'high' as const
                },
                data: { type: actionType, shiftName: assignment.shift_name, startTime: startTime || '', endTime: endTime || '' },
                tokens: tokens
            };

            const response = await firebaseAdmin.messaging().sendEachForMulticast(message);
            console.log(`[Worker] FCM gửi đến ${assignment.user_id} (${type}): Thành công=${response.successCount}, Thất bại=${response.failureCount}`);
        } catch (error) {
            console.error(`[Worker] Lỗi khi xử lý job ${job.id}:`, error);
        }
    }, { connection });

    worker.on('failed', (job, err) => {
        console.error(`[Worker] Job ${job?.id} thất bại: ${err.message}`);
    });

    return worker;
}

// Hàm hỗ trợ lập lịch hàng ngày
export async function scheduleDailyReminders() {
    console.log('[Queue] Đang lập lịch gửi thông báo ca làm việc...');
    const now = new Date();
    const vietnamTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    const today = vietnamTime.toISOString().split('T')[0];

    // Lấy toàn bộ ca làm việc cho hôm nay
    const assignments = await query(`
        SELECT sa.id as assignment_id, ws.start_time, ws.end_time
        FROM shift_assignments sa
        JOIN work_shifts ws ON sa.work_shift_id = ws.id
        JOIN users u ON sa.user_id = u.id
        WHERE sa.assigned_date = $1::date
          AND ws.is_active = true
          AND u.work_status = 'ACTIVE'
          AND u.role != 'GENERAL_MANAGER'
    `, [today]);

    for (const assignment of assignments) {
        // start_time / end_time are retrieved as strings from DB or time objects.
        const startStr = String(assignment.start_time);
        const endStr = String(assignment.end_time);

        const [startHH, startMM] = startStr.substring(0, 5).split(':').map(Number);
        const [endHH, endMM] = endStr.substring(0, 5).split(':').map(Number);

        // Tính Epoch time (ms) tại VN cho Check IN (Nhắc trước 5 phút)
        const checkInTarget = new Date(vietnamTime.getFullYear(), vietnamTime.getMonth(), vietnamTime.getDate(), startHH, startMM - 5, 0, 0);
        // Tính Epoch time (ms) tại VN cho Check OUT (Nhắc sau 5 phút)
        const checkOutTarget = new Date(vietnamTime.getFullYear(), vietnamTime.getMonth(), vietnamTime.getDate(), endHH, endMM + 5, 0, 0);

        const currentMs = vietnamTime.getTime();

        // Thêm Job Check-In (Nếu chưa qua giờ)
        if (checkInTarget.getTime() > currentMs) {
            const delay = checkInTarget.getTime() - currentMs;
            await shiftRemindersQueue.add('check-in-job', { assignment_id: assignment.assignment_id, type: 'check_in' }, { delay, jobId: `in_${assignment.assignment_id}` });
        }

        // Thêm Job Check-Out (Nếu chưa qua giờ)
        if (checkOutTarget.getTime() > currentMs) {
            const delay = checkOutTarget.getTime() - currentMs;
            await shiftRemindersQueue.add('check-out-job', { assignment_id: assignment.assignment_id, type: 'check_out' }, { delay, jobId: `out_${assignment.assignment_id}` });
        }
    }
    console.log(`[Queue] Đã lên lịch xong cho ${assignments.length} ca làm việc hôm nay.`);
}
