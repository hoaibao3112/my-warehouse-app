import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { format, parse, isValid, startOfDay, getDaysInMonth } from 'date-fns';

/**
 * POST /api/shifts/import
 * Import shifts from Excel - supports both matrix format (employees x days) and row format
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Chưa đăng nhập' },
        { status: 401 }
      );
    }

    // Only managers, general managers, HR and admins can import
    if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'ADMIN' && user.role !== 'GENERAL_MANAGER' && user.role !== 'HR') {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền import lịch làm việc' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { warehouseId, data, month, year } = body;

    const targetWarehouseId = warehouseId || user.warehouseId;

    if (!targetWarehouseId) {
      return NextResponse.json(
        { success: false, error: 'Thiếu thông tin kho' },
        { status: 400 }
      );
    }

    // Verify warehouse access
    // ADMIN and HR can access all warehouses
    if (user.role === 'WAREHOUSE_MANAGER' && user.warehouseId !== targetWarehouseId) {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền import cho kho này' },
        { status: 403 }
      );
    }

    // GENERAL_MANAGER must have access to warehouse
    if (user.role === 'GENERAL_MANAGER' && !user.warehouseIds?.includes(targetWarehouseId)) {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền import cho kho này' },
        { status: 403 }
      );
    }

    if (!data || !Array.isArray(data) || data.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Không có dữ liệu để import' },
        { status: 400 }
      );
    }

    // Get all users in warehouse
    const warehouseUsers = await prisma.users.findMany({
      where: { warehouse_id: targetWarehouseId, is_active: true },
      select: { id: true, full_name: true, email: true }
    });

    const userMap = new Map<string, string>();
    warehouseUsers.forEach(u => {
      // Map by email and full_name (case-insensitive)
      if (u.email) userMap.set(u.email.toLowerCase(), u.id);
      if (u.full_name) userMap.set(u.full_name.toLowerCase(), u.id);
    });

    // Get all shifts - try warehouse first, then fallback to all active shifts
    let warehouseShifts = await prisma.work_shifts.findMany({
      where: { warehouse_id: targetWarehouseId, is_active: true },
      select: { id: true, shift_code: true, shift_name: true }
    });

    // Fallback: if no shifts in warehouse, get all active shifts from system
    if (warehouseShifts.length === 0) {
      warehouseShifts = await prisma.work_shifts.findMany({
        where: { is_active: true },
        select: { id: true, shift_code: true, shift_name: true }
      });
    }

    const shiftMap = new Map<string, string>();
    warehouseShifts.forEach(s => {
      if (s.shift_code) shiftMap.set(s.shift_code.toLowerCase(), s.id);
      if (s.shift_name) shiftMap.set(s.shift_name.toLowerCase(), s.id);
    });

    // Debug: log available shift codes
    console.log('[SHIFT IMPORT] Available shifts:', warehouseShifts.map(s => s.shift_code));

    // Detect format: matrix or row-based
    const firstRow = data[0];
    const keys = Object.keys(firstRow);
    const hasDateColumn = keys.some(k => 
      /^(ngày|date|ngay|ngày làm|ngay_lam|assigned_date)$/i.test(k)
    );
    const hasDayColumns = keys.some(k => /^D\d+$/i.test(k) || /^\d+$/.test(k));
    
    const isMatrixFormat = hasDayColumns && !hasDateColumn;

    // Determine target month/year
    let targetYear = year || new Date().getFullYear();
    let targetMonth = month || new Date().getMonth() + 1;
    
    // Parse data based on format
    const assignments: {
      userId: string;
      shiftId: string;
      date: Date;
      rowNum: number;
    }[] = [];

    const errors: { row: number; reason: string }[] = [];
    let skipped = 0;

    if (isMatrixFormat) {
      // Matrix format: each row = employee, each column = day
      const daysInMonth = getDaysInMonth(new Date(targetYear, targetMonth - 1));
      
      data.forEach((row, index) => {
        const rowNum = index + 2; // Excel row (header is row 1)
        
        // Find user by email or name
        const employeeIdentifier = (
          row['Email'] || row['email'] ||
          row['Họ tên'] || row['ho_ten'] || row['full_name'] || ''
        ).toString().trim();

        if (!employeeIdentifier) {
          errors.push({ row: rowNum, reason: 'Thiếu thông tin nhân viên (Email hoặc Họ tên)' });
          return;
        }

        const userId = userMap.get(employeeIdentifier.toLowerCase());
        if (!userId) {
          errors.push({ row: rowNum, reason: `Không tìm thấy nhân viên: ${employeeIdentifier}` });
          return;
        }

        // Process each day column (D1, D2, ... or 1, 2, ...)
        for (let day = 1; day <= daysInMonth; day++) {
          const dayKey = keys.find(k => 
            k === `D${day}` || k === `d${day}` || k === `${day}`
          );
          
          if (!dayKey) continue;
          
          const shiftValue = (row[dayKey] || '').toString().trim();
          if (!shiftValue) continue; // Empty = no shift
          
          // Handle multiple shifts per day (comma separated)
          const shiftCodes = shiftValue.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean);
          
          for (const rawShiftCode of shiftCodes) {
            // Normalize shift code: trim whitespace, remove special chars
            const shiftCode = rawShiftCode.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
            
            if (!shiftCode) continue;
            
            const shiftId = shiftMap.get(shiftCode.toLowerCase());
            if (!shiftId) {
              // Try matching by removing all whitespace
              const shiftCodeNoSpace = shiftCode.replace(/\s/g, '');
              const shiftIdByNoSpace = Array.from(shiftMap.entries()).find(([key]) => 
                key.replace(/\s/g, '') === shiftCodeNoSpace.toLowerCase()
              )?.[1];
              
              if (shiftIdByNoSpace) {
                // Create date as UTC midnight to avoid timezone issues
                const assignedDate = new Date(Date.UTC(targetYear, targetMonth - 1, day));
                assignments.push({
                  userId,
                  shiftId: shiftIdByNoSpace,
                  date: assignedDate,
                  rowNum
                });
                continue;
              }
              
              // Get list of valid shift codes for error message
              const validCodes = warehouseShifts.map(s => s.shift_code).filter(Boolean).join(', ');
              errors.push({ 
                row: rowNum, 
                reason: `Ngày ${day}: Mã ca "${shiftCode}" không hợp lệ. Các mã hợp lệ: ${validCodes}` 
              });
              continue;
            }

            // Create date as UTC midnight to avoid timezone issues
            const assignedDate = new Date(Date.UTC(targetYear, targetMonth - 1, day));
            
            assignments.push({
              userId,
              shiftId,
              date: assignedDate,
              rowNum
            });
          }
        }
      });
    } else {
      // Row format: each row = one assignment (legacy format)
      data.forEach((row, index) => {
        const rowNum = index + 2;
        
        // Skip empty rows
        if (!row || Object.keys(row).length === 0) {
          return;
        }
        
        // Find user
        const employeeIdentifier = (
          row['Email'] || row['email'] ||
          row['Họ tên'] || row['ho_ten'] || row['Tên NV'] || row['ten_nv'] ||
          row['full_name'] || ''
        ).toString().trim();

        if (!employeeIdentifier) {
          errors.push({ row: rowNum, reason: 'Thiếu thông tin nhân viên' });
          return;
        }

        const userId = userMap.get(employeeIdentifier.toLowerCase());
        if (!userId) {
          errors.push({ row: rowNum, reason: `Không tìm thấy nhân viên: ${employeeIdentifier}` });
          return;
        }

        // Find shift
        const rawShiftIdentifier = (
          row['Mã ca'] || row['ma_ca'] || row['shift_code'] ||
          row['Tên ca'] || row['ten_ca'] || row['shift_name'] || 
          row['Ca làm'] || row['ca_lam'] || ''
        ).toString();

        // Normalize shift code: remove unicode special chars and trim
        const shiftIdentifier = rawShiftIdentifier.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();

        if (!shiftIdentifier) {
          errors.push({ row: rowNum, reason: 'Thiếu thông tin ca làm việc' });
          return;
        }

        // Try exact match first, then try without spaces
        let shiftId = shiftMap.get(shiftIdentifier.toLowerCase());
        
        if (!shiftId) {
          const shiftIdentifierNoSpace = shiftIdentifier.replace(/\s/g, '');
          for (const [key, id] of shiftMap.entries()) {
            if (key.replace(/\s/g, '') === shiftIdentifierNoSpace.toLowerCase()) {
              shiftId = id;
              break;
            }
          }
        }
        
        if (!shiftId) {
          const validCodes = warehouseShifts.map(s => s.shift_code).filter(Boolean).join(', ');
          errors.push({ row: rowNum, reason: `Không tìm thấy ca: "${shiftIdentifier}". Các mã hợp lệ: ${validCodes}` });
          return;
        }

        // Parse date
        const dateValue = row['Ngày'] || row['ngày'] || row['Date'] || row['date'] || 
                          row['Ngày làm'] || row['ngay_lam'] || row['assigned_date'] || '';
        let assignedDate: Date | null = null;

        if (dateValue) {
          const dateStr = dateValue.toString().trim();
          
          // Try different date formats
          const formats = ['dd/MM/yyyy', 'yyyy-MM-dd', 'dd-MM-yyyy', 'MM/dd/yyyy', 'd/M/yyyy'];
          for (const fmt of formats) {
            try {
              const parsed = parse(dateStr, fmt, new Date());
              if (isValid(parsed)) {
                assignedDate = parsed;
                break;
              }
            } catch {
              // Try next format
            }
          }

          // Also try Excel serial date
          if (!assignedDate && !isNaN(Number(dateStr))) {
            const excelSerial = Number(dateStr);
            if (excelSerial > 1 && excelSerial < 100000) {
              const excelDate = new Date((excelSerial - 25569) * 86400 * 1000);
              if (isValid(excelDate)) {
                assignedDate = excelDate;
              }
            }
          }
        }

        if (!assignedDate) {
          errors.push({ row: rowNum, reason: `Ngày không hợp lệ: ${dateValue}` });
          return;
        }

        // Convert to UTC midnight for consistent storage
        const utcDate = new Date(Date.UTC(
          assignedDate.getFullYear(),
          assignedDate.getMonth(),
          assignedDate.getDate()
        ));

        assignments.push({
          userId,
          shiftId,
          date: utcDate,
          rowNum
        });
      });
    }

    // No valid assignments
    if (assignments.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Không có dữ liệu hợp lệ để import',
        details: {
          success: 0,
          skipped,
          errors
        }
      }, { status: 400 });
    }

    // Get existing assignments to avoid duplicates
    // Important: Query by user_ids, not just warehouse, because constraint is on user_id + date
    const userIds = [...new Set(assignments.map(a => a.userId))];
    const dateRange = assignments.map(a => a.date);
    const minDate = new Date(Math.min(...dateRange.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dateRange.map(d => d.getTime())));

    console.log('[SHIFT IMPORT] Checking existing assignments for', userIds.length, 'users from', format(minDate, 'yyyy-MM-dd'), 'to', format(maxDate, 'yyyy-MM-dd'));

    const existingAssignments = await prisma.shift_assignments.findMany({
      where: {
        user_id: { in: userIds },
        assigned_date: { gte: minDate, lte: maxDate }
      },
      include: { 
        work_shifts: { select: { shift_code: true } },
        users_assigned: { select: { full_name: true } }
      }
    });

    console.log('[SHIFT IMPORT] Found', existingAssignments.length, 'existing assignments');

    const existingSet = new Set(
      existingAssignments.map(e => 
        `${e.user_id}_${format(e.assigned_date, 'yyyy-MM-dd')}_${e.work_shift_id}`
      )
    );

    // Track ALL existing shifts per user+date (support multiple shifts)
    const userDateShiftsMap = new Map<string, Set<string>>();
    existingAssignments.forEach(e => {
      const key = `${e.user_id}_${format(e.assigned_date, 'yyyy-MM-dd')}`;
      if (!userDateShiftsMap.has(key)) {
        userDateShiftsMap.set(key, new Set());
      }
      userDateShiftsMap.get(key)!.add(e.work_shift_id);
    });

    // Track skipped items with details
    const skippedDetails: { row: number; reason: string }[] = [];

    // Filter out duplicates
    const batchSet = new Set<string>();
    const newAssignments = assignments.filter(a => {
      const fullKey = `${a.userId}_${format(a.date, 'yyyy-MM-dd')}_${a.shiftId}`;
      const userDateKey = `${a.userId}_${format(a.date, 'yyyy-MM-dd')}`;
      const dayNum = a.date.getDate();

      // Skip if exact same assignment exists (same shift)
      if (existingSet.has(fullKey)) {
        skipped++;
        // Don't add to skippedDetails - this is expected when re-importing same data
        return false;
      }

      // Skip if user already has THIS SPECIFIC SHIFT for this day (in DB)
      const existingShifts = userDateShiftsMap.get(userDateKey);
      if (existingShifts && existingShifts.has(a.shiftId)) {
        skipped++;
        skippedDetails.push({
          row: a.rowNum,
          reason: `Ngày ${dayNum}: Ca này đã được xếp - bỏ qua`
        });
        return false;
      }

      // Skip if already in current batch (duplicate in Excel file)
      if (batchSet.has(fullKey)) {
        skipped++;
        skippedDetails.push({
          row: a.rowNum,
          reason: `Ngày ${dayNum}: Trùng lặp trong file - bỏ qua`
        });
        return false;
      }

      batchSet.add(fullKey);
      return true;
    });

    // Create new assignments
    let actualCreated = 0;
    if (newAssignments.length > 0) {
      console.log('[SHIFT IMPORT] Creating', newAssignments.length, 'new assignments');
      console.log('[SHIFT IMPORT] All assignments to create:', newAssignments.map(a => ({
        user_id: a.userId,
        shift_id: a.shiftId,
        date: format(a.date, 'yyyy-MM-dd'),
        dateISO: a.date.toISOString(),
        row: a.rowNum
      })));
      
      try {
        const dataToInsert = newAssignments.map(a => ({
          work_shift_id: a.shiftId,
          user_id: a.userId,
          warehouse_id: targetWarehouseId,
          assigned_date: a.date,
          assigned_by: user.id
        }));
        
        console.log('[SHIFT IMPORT] Data being inserted:', dataToInsert.map(d => ({
          user_id: d.user_id,
          assigned_date: d.assigned_date.toISOString()
        })));
        
        const result = await prisma.shift_assignments.createMany({
          data: dataToInsert,
          skipDuplicates: true
        });
        
        actualCreated = result.count;
        console.log('[SHIFT IMPORT] createMany result - count:', result.count);
        
        if (result.count < newAssignments.length) {
          console.log('[SHIFT IMPORT] WARNING: Only', result.count, 'of', newAssignments.length, 'were created (duplicates skipped by DB)');
        }
      } catch (dbError) {
        console.error('[SHIFT IMPORT] Database error:', dbError);
        return NextResponse.json({
          success: false,
          error: 'Lỗi database khi tạo ca làm việc: ' + (dbError instanceof Error ? dbError.message : 'Unknown error'),
          details: { success: 0, skipped, errors }
        }, { status: 500 });
      }
    }

    const successCount = actualCreated;

    // Build message with summary
    let message = `Import thành công ${successCount} ca làm việc`;
    if (skipped > 0) {
      message += `, bỏ qua ${skipped} ca đã tồn tại`;
    }
    if (errors.length > 0) {
      message += `, ${errors.length} lỗi`;
    }

    return NextResponse.json({
      success: true,
      message,
      details: {
        success: successCount,
        skipped,
        skippedDetails: skippedDetails.slice(0, 20), // Limit to first 20 to avoid huge response
        errors
      }
    });

  } catch (error) {
    console.error('Error importing shifts:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi hệ thống khi import' },
      { status: 500 }
    );
  }
}
