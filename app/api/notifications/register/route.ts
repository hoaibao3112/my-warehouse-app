/**
 * API Route: Register FCM Token
 * POST /api/notifications/register
 * Saves FCM token for a user to send push notifications
 */

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, userId, platform } = body;

    // Validate input
    if (!token || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing token or userId' },
        { status: 400 }
      );
    }

    // Check if token already exists
    const existing = await query(
      `SELECT id FROM device_tokens WHERE token = ? AND user_id = ?`,
      [token, userId]
    );

    if (existing.length > 0) {
      // Update existing token
      await query(
        `UPDATE device_tokens
         SET platform = ?, updated_at = NOW(), active = true
         WHERE token = ? AND user_id = ?`,
        [platform || 'android', token, userId]
      );

      return NextResponse.json({
        success: true,
        message: 'Token updated successfully'
      });
    }

    // Insert new token
    await query(
      `INSERT INTO device_tokens (user_id, token, platform, active, created_at, updated_at)
       VALUES (?, ?, ?, true, NOW(), NOW())`,
      [userId, token, platform || 'android']
    );

    return NextResponse.json({
      success: true,
      message: 'Token registered successfully'
    });
  } catch (error) {
    console.error('Error registering FCM token:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to register token' },
      { status: 500 }
    );
  }
}

/**
 * DELETE: Remove FCM token (when user logs out or uninstalls)
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token, userId } = body;

    if (!token || !userId) {
      return NextResponse.json(
        { success: false, error: 'Missing token or userId' },
        { status: 400 }
      );
    }

    // Soft delete - mark as inactive
    await query(
      `UPDATE device_tokens SET active = false, updated_at = NOW()
       WHERE token = ? AND user_id = ?`,
      [token, userId]
    );

    return NextResponse.json({
      success: true,
      message: 'Token removed successfully'
    });
  } catch (error) {
    console.error('Error removing FCM token:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to remove token' },
      { status: 500 }
    );
  }
}
