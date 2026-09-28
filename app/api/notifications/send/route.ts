/**
 * API Route: Send Push Notification
 * POST /api/notifications/send
 * Sends push notification to specific users via FCM
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Firebase Admin SDK will be initialized lazily
let adminInitialized = false;
let admin: any = null;

/**
 * Initialize Firebase Admin SDK
 */
async function initializeFirebaseAdmin() {
  if (adminInitialized && admin) {
    return admin;
  }

  try {
    // Dynamically import firebase-admin
    const firebaseAdmin = await import('firebase-admin');

    // Check if already initialized
    if (firebaseAdmin.apps.length === 0) {
      // Initialize with credentials from environment variables
      const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

      if (!privateKey || !process.env.FIREBASE_PROJECT_ID || !process.env.FIREBASE_CLIENT_EMAIL) {
        throw new Error('Missing Firebase credentials in environment variables');
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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, userIds, title, body: messageBody, data, type } = body;

    // Validate input
    if (!title || !messageBody) {
      return NextResponse.json(
        { success: false, error: 'Missing title or body' },
        { status: 400 }
      );
    }

    if (!userId && (!userIds || userIds.length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Missing userId or userIds' },
        { status: 400 }
      );
    }

    // Initialize Firebase Admin
    const firebaseAdmin = await initializeFirebaseAdmin();

    // Get FCM tokens for the user(s)
    let tokens: string[] = [];

    if (userId) {
      // Single user
      const result = await prisma?.device_tokens.findMany({
        where: {
          user_id: userId,
          active: true
        },
        select: { token: true }
      }) || [];
      tokens = result.map(row => row.token);
    } else if (userIds && Array.isArray(userIds)) {
      // Multiple users
      const result = await prisma?.device_tokens.findMany({
        where: {
          user_id: { in: userIds },
          active: true
        },
        select: { token: true }
      }) || [];
      tokens = result.map(row => row.token);
    }

    if (tokens.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No active devices found for user(s)' },
        { status: 404 }
      );
    }

    // Prepare notification message with Android-specific options
    const message = {
      notification: {
        title: title,
        body: messageBody
      },
      android: {
        notification: {
          // Use default icon configured in AndroidManifest
          icon: 'ic_notification',
          // Use accent color configured in AndroidManifest
          color: '#F97316',
          // Sound for notification
          sound: 'default',
          // Priority
          priority: 'high' as const,
          // Notification channel (for Android 8+)
          channelId: 'default'
        },
        // Ensures delivery even when app is in background/killed
        priority: 'high' as const
      },
      // APNS config for iOS
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      },
      data: {
        type: type || 'general',
        ...data
      },
      tokens: tokens
    };

    // Send notification via FCM
    const response = await firebaseAdmin.messaging().sendEachForMulticast(message);

    console.log('FCM Response:', {
      successCount: response.successCount,
      failureCount: response.failureCount
    });

    // Save notification to database for the notification list
    try {
      // Use SYSTEM_ANNOUNCEMENT as default for generic/test notifications if type is not strictly matched
      const dbType = 'SYSTEM_ANNOUNCEMENT';
      const targetUserIds = userId ? [userId] : (userIds || []);

      if (targetUserIds.length > 0) {
        await Promise.all(targetUserIds.map((uid: string) =>
          prisma?.notifications.create({
            data: {
              user_id: uid,
              type: dbType as any,
              title: title,
              message: messageBody,
              data: data || {},
              is_read: false,
              created_at: new Date()
            }
          })
        ));
        console.log(`Saved ${targetUserIds.length} notifications to database`);
      }
    } catch (dbError) {
      console.error('Error saving notifications to DB:', dbError);
      // We don't fail the request here since FCM might have succeeded
    }

    // Handle failures (remove invalid tokens)
    if (response.failureCount > 0) {
      const failedTokens: string[] = [];

      response.responses.forEach((resp: any, idx: number) => {
        if (!resp.success) {
          console.error('Failed to send to token:', tokens[idx], resp.error);
          failedTokens.push(tokens[idx]);
        }
      });

      // Mark failed tokens as inactive
      if (failedTokens.length > 0) {
        await prisma?.device_tokens.updateMany({
          where: {
            token: { in: failedTokens }
          },
          data: {
            active: false
          }
        });
      }
    }

    return NextResponse.json({
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokens.length
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send notification'
      },
      { status: 500 }
    );
  }
}
