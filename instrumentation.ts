export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[Instrumentation] Starting Cron Service...')
    try {
      const { schedule } = await import('node-cron')

      // ===== TỐI ƯU HÓA DB BẰNG BULLMQ =====
      // Khởi động Worker chạy ngầm và bộ lập lịch 1 lần duy nhất trong ngày (Để DB có thể Sleep)
      try {
        const { startShiftRemindersWorker, scheduleDailyReminders } = await import('@/lib/queue/shiftRemindersQueue')
        startShiftRemindersWorker();

        // Chạy lúc 00:01 mỗi ngày để tải cấu hình ca làm việc cho hôm đó
        schedule('1 0 * * *', async () => {
          try {
            await scheduleDailyReminders();
          } catch (e) { console.error('[Cron] Lỗi lập lịch Reminder:', e); }
        });

        // Tự động lên lịch 1 lần lúc vừa khởi động server (để đề phòng server crash giữa ngày bị mất lịch)
        if (process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'development') {
          setTimeout(() => {
            scheduleDailyReminders().catch(console.error);
          }, 5000); // Đợi 5s cho DB kết nối
        }
      } catch (err) {
        console.error('[Instrumentation] Lỗi khởi động Queue/Worker:', err);
      }

      // const { runAutoCloseShifts } = await import('@/lib/cron/auto-close-logic')
      // schedule('0,15,30,45 * * * *', async () => {
      //   console.log('[Cron] Checking for overdue shifts...')
      //   try {
      //     const result = await runAutoCloseShifts()
      //     if (result.closedCount > 0) {
      //       console.log(`[Cron] Auto-closed ${result.closedCount} shifts.`)
      //     }
      //   } catch (error) {
      //     console.error('[Cron] Error processing shifts:', error)
      //   }
      // })
      // console.log('[Instrumentation] Auto-Close Cron Job DISABLED by request.')

      // ===== AUTO-APPROVE SHIFTS CRON =====
      // Run daily at 00:05 to approve pending shift requests past deadline (day 30+)
      schedule('5 0 * * *', async () => {
        try {
          console.log('[Cron] Running daily shift auto-approval check...')
          // Dynamic import to avoid circular dep issues during init
          const { autoApprovePendingRequests } = await import('@/lib/shift-registration-validation')
          const result = await autoApprovePendingRequests()

          if (result.success && result.approvedCount > 0) {
            console.log(`[Cron] Auto-approved ${result.approvedCount} shift requests`)
          } else if (result.success) {
            console.log('[Cron] No shifts needed auto-approval')
          } else {
            console.error(`[Cron] Auto-approval failed: ${result.error}`)
          }
        } catch (error) {
          console.error('[Cron] Error running shift auto-approval:', error)
        }
      })
      console.log('[Instrumentation] Shift Auto-Approval Cron Job scheduled: daily at 00:05')

    } catch (e) {
      console.error('[Instrumentation] Failed to load cron modules:', e)
    }
  }
}
