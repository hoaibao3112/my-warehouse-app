import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyAuth } from '@/lib/auth-server';
import { canAccessWarehouse } from '@/lib/auth';
import { format, startOfMonth, endOfMonth, addDays, getDaysInMonth, getDay } from 'date-fns';
import { vi } from 'date-fns/locale';

// Day names in Vietnamese
const dayNames = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/**
 * GET /api/shifts/template
 * Generate Excel template for shift import - Matrix format (employees x days)
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Chưa đăng nhập' },
        { status: 401 }
      );
    }

    // Only managers, general managers and admins can download template
    if (user.role !== 'WAREHOUSE_MANAGER' && user.role !== 'ADMIN' && user.role !== 'GENERAL_MANAGER') {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền tải template' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get('warehouseId') || user.warehouseId;
    const monthStr = searchParams.get('month'); // yyyy-MM format
    const includeData = searchParams.get('includeData') === 'true';

    if (!warehouseId) {
      return NextResponse.json(
        { success: false, error: 'Thiếu thông tin kho' },
        { status: 400 }
      );
    }

    // Verify warehouse access - use canAccessWarehouse for proper GENERAL_MANAGER support
    if (user.role !== 'ADMIN' && !canAccessWarehouse(user, warehouseId)) {
      return NextResponse.json(
        { success: false, error: 'Bạn không có quyền truy cập kho này' },
        { status: 403 }
      );
    }

    // Get warehouse info
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
      select: { name: true }
    });

    // Get all active users in warehouse (include all roles that can work shifts)
    const users = await prisma.users.findMany({
      where: { 
        warehouse_id: warehouseId, 
        is_active: true
      },
      select: { 
        id: true, 
        full_name: true, 
        email: true,
        role: true
      },
      orderBy: { full_name: 'asc' }
    });

    // Get all shifts in warehouse (both active and inactive for reference)
    let shifts = await prisma.work_shifts.findMany({
      where: { warehouse_id: warehouseId },
      select: { 
        id: true, 
        shift_code: true, 
        shift_name: true,
        start_time: true,
        end_time: true,
        is_active: true
      },
      orderBy: { shift_code: 'asc' }
    });

    // If no shifts in this warehouse, try to get all shifts from system for reference
    if (shifts.length === 0) {
      shifts = await prisma.work_shifts.findMany({
        select: { 
          id: true, 
          shift_code: true, 
          shift_name: true,
          start_time: true,
          end_time: true,
          is_active: true
        },
        orderBy: { shift_code: 'asc' }
      });
    }

    // Filter active shifts for template, but show all in reference
    const activeShifts = shifts.filter(s => s.is_active);

    // Parse target month or use current month
    let targetMonth = new Date();
    if (monthStr) {
      const [year, month] = monthStr.split('-').map(Number);
      if (year && month) {
        targetMonth = new Date(year, month - 1, 1);
      }
    }

    const daysInMonth = getDaysInMonth(targetMonth);
    const monthStart = startOfMonth(targetMonth);
    
    // If includeData, fetch existing assignments
    let existingAssignments: any[] = [];
    if (includeData) {
      existingAssignments = await prisma.shift_assignments.findMany({
        where: {
          warehouse_id: warehouseId,
          assigned_date: {
            gte: monthStart,
            lte: endOfMonth(targetMonth)
          }
        },
        include: {
          work_shifts: true
        }
      });
    }

    // Create assignment map: userId_date -> shift_code
    const assignmentMap = new Map<string, string>();
    existingAssignments.forEach(a => {
      const key = `${a.user_id}_${format(a.assigned_date, 'yyyy-MM-dd')}`;
      assignmentMap.set(key, a.work_shifts?.shift_code || '');
    });

    // Generate day header row (with day of week)
    const dayHeaders: Record<string, string> = {
      'STT': 'STT',
      'Họ tên': 'Họ tên',
      'Email': 'Email'
    };
    
    // Add columns for each day
    for (let day = 0; day < daysInMonth; day++) {
      const date = addDays(monthStart, day);
      const dayOfWeek = getDay(date);
      const dayNum = day + 1;
      // Format: "1 (T2)" for day 1 Monday
      dayHeaders[`D${dayNum}`] = `${dayNum} (${dayNames[dayOfWeek]})`;
    }

    // Generate matrix rows - each row is one employee
    const templateRows: any[] = [];
    
    users.forEach((u, index) => {
      const row: Record<string, string | number> = {
        'STT': index + 1,
        'Họ tên': u.full_name || '',
        'Email': u.email || ''
      };
      
      // Add shift code for each day
      for (let day = 0; day < daysInMonth; day++) {
        const date = addDays(monthStart, day);
        const dayNum = day + 1;
        const key = `${u.id}_${format(date, 'yyyy-MM-dd')}`;
        row[`D${dayNum}`] = assignmentMap.get(key) || '';
      }
      
      templateRows.push(row);
    });

    // If no users, add sample row
    if (templateRows.length === 0) {
      const sampleRow: Record<string, string | number> = {
        'STT': 1,
        'Họ tên': 'Nguyễn Văn A (mẫu)',
        'Email': 'example@email.com'
      };
      for (let day = 0; day < daysInMonth; day++) {
        sampleRow[`D${day + 1}`] = '';
      }
      templateRows.push(sampleRow);
    }

    // Generate shift list for reference (show all shifts with status)
    const shiftList = shifts.map(s => ({
      'Mã ca': s.shift_code,
      'Tên ca': s.shift_name,
      'Giờ bắt đầu': format(s.start_time, 'HH:mm'),
      'Giờ kết thúc': format(s.end_time, 'HH:mm'),
      'Trạng thái': s.is_active ? 'Đang sử dụng' : 'Đã tắt'
    }));

    // Map role to Vietnamese labels
    const roleLabels: Record<string, string> = {
      'ADMIN': 'Quản trị viên',
      'WAREHOUSE_MANAGER': 'Quản lý kho',
      'WAREHOUSE_STAFF': 'Nhân viên kho',
      'STORE_OWNER': 'Chủ cửa hàng',
      'STORE_STAFF': 'Nhân viên cửa hàng',
      'STAFF': 'Nhân viên'
    };

    // Generate employee list for reference
    const employeeList = users.map((u, i) => ({
      'STT': i + 1,
      'Họ tên': u.full_name || '',
      'Email': u.email || '',
      'Chức vụ': roleLabels[u.role] || u.role
    }));

    // Generate column info for client to build Excel properly
    const columns = [
      { key: 'STT', label: 'STT', width: 5 },
      { key: 'Họ tên', label: 'Họ tên', width: 25 },
      { key: 'Email', label: 'Email', width: 25 }
    ];
    
    for (let day = 0; day < daysInMonth; day++) {
      const date = addDays(monthStart, day);
      const dayOfWeek = getDay(date);
      const dayNum = day + 1;
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      columns.push({
        key: `D${dayNum}`,
        label: `${dayNum}\n${dayNames[dayOfWeek]}`,
        width: 6,
        isWeekend
      } as any);
    }

    return NextResponse.json({
      success: true,
      data: {
        warehouse: warehouse?.name || 'N/A',
        warehouseId,
        month: format(targetMonth, 'MM/yyyy'),
        monthLabel: format(targetMonth, 'MMMM yyyy', { locale: vi }),
        year: targetMonth.getFullYear(),
        monthNum: targetMonth.getMonth() + 1,
        daysInMonth,
        template: templateRows,
        dayHeaders,
        columns,
        shifts: shiftList,
        employees: employeeList,
        // Debug info
        _debug: {
          totalUsers: users.length,
          totalShifts: shifts.length,
          activeShifts: activeShifts.length
        },
        instructions: [
          'Mỗi hàng là 1 nhân viên, mỗi cột (D1, D2, ...) là ngày trong tháng',
          'Điền mã ca (VD: S, C, D...) vào ô tương ứng ngày làm việc',
          'Để trống ô nếu nhân viên nghỉ ngày đó',
          'Xem sheet "Danh sách ca" để biết các mã ca có sẵn',
          'Có thể điền nhiều ca trong 1 ô, cách nhau bởi dấu phẩy (VD: S,C)',
          'Nếu nhân viên đã có ca trong ngày đó, hệ thống sẽ bỏ qua',
          'Cột cuối tuần (T7, CN) được tô màu để dễ phân biệt'
        ]
      }
    });

  } catch (error) {
    console.error('Error generating template:', error);
    return NextResponse.json(
      { success: false, error: 'Lỗi hệ thống khi tạo template' },
      { status: 500 }
    );
  }
}
