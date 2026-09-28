import { NextRequest, NextResponse } from 'next/server';
import net from 'net';

/**
 * API to test printer connectivity (TCP Port 9100)
 * POST /api/system/test-printer
 */
export async function POST(request: NextRequest) {
    try {
        const { ip, port = 9100 } = await request.json();

        if (!ip) {
            return NextResponse.json({ success: false, error: 'Thiếu địa chỉ IP' }, { status: 400 });
        }

        const result = await new Promise((resolve) => {
            const socket = new net.Socket();
            let hasError = false;

            socket.setTimeout(3000); // 3 seconds timeout

            socket.on('connect', () => {
                socket.destroy();
                resolve({ success: true, message: 'Kết nối thành công' });
            });

            socket.on('timeout', () => {
                hasError = true;
                socket.destroy();
                resolve({ success: false, error: 'Hết thời gian chờ (Timeout)' });
            });

            socket.on('error', (err) => {
                hasError = true;
                resolve({ success: false, error: `Lỗi kết nối: ${err.message}` });
            });
        });

        return NextResponse.json(result);
    } catch (error) {
        console.error('Test printer error:', error);
        return NextResponse.json({ success: false, error: 'Lỗi hệ thống khi kiểm tra' }, { status: 500 });
    }
}
