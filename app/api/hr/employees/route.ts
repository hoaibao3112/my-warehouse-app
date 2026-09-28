import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { isHR, isAdmin, hashPassword } from "@/lib/auth"

/**
 * @swagger
 * /api/hr/employees:
 *   get:
 *     summary: List Employees
 *     description: List all employees (HR only, excludes ADMIN).
 *     tags: [HR - Employees]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         schema:
 *           type: string
 *       - in: query
 *         name: role
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: List of employees
 *       403:
 *         description: Forbidden
 *   post:
 *     summary: Create Employee
 *     tags: [HR - Employees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, full_name, role]
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [MANAGER, STAFF, WAREHOUSE_MANAGER, WAREHOUSE_STAFF]
 *               warehouse_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Employee created
 *   patch:
 *     summary: Update Employee
 *     tags: [HR - Employees]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id]
 *             properties:
 *               id:
 *                 type: string
 *               full_name:
 *                 type: string
 *               role:
 *                 type: string
 *               warehouse_id:
 *                 type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Employee updated
 */
export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    // Only HR or Admin can access this endpoint
    if (!user || (!isHR(user) && !isAdmin(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const warehouseId = searchParams.get("warehouseId")
    const role = searchParams.get("role")
    const search = searchParams.get("search")
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "50")

    // Build where clause
    const where: any = {}

    // If user is HR, only allow them to see store staff
    // If user is ADMIN, they can see everyone except other ADMINs (standard practice, or maybe they want to see all)
    if (isHR(user)) {
      where.role = {
        in: ['WAREHOUSE_STAFF', 'ATTENDANCE_STAFF']
      }
    } else {
      where.role = { not: 'ADMIN' }
    }

    if (warehouseId) {
      where.warehouse_id = warehouseId
    }

    if (role) {
      where.role = role
    }

    if (search) {
      where.OR = [
        { full_name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone_number: { contains: search, mode: 'insensitive' } }
      ]
    }

    const workStatus = searchParams.get("workStatus")
    if (workStatus && workStatus !== 'all') {
      where.work_status = workStatus
    }

    // Fetch employees with pagination
    const [employees, total] = await Promise.all([
      prisma.users.findMany({
        where,
        include: {
          warehouses_users_warehouse_idTowarehouses: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true
            }
          }
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { created_at: 'desc' }
      }),
      prisma.users.count({ where })
    ])

    // Transform to camelCase
    const transformedEmployees = employees.map(emp => ({
      id: emp.id,
      email: emp.email,
      fullName: emp.full_name,
      employeeCode: emp.employee_code,
      role: emp.role,
      warehouseId: emp.warehouse_id,
      isActive: emp.is_active,
      permissions: emp.permissions ? JSON.parse(emp.permissions) : [],
      employmentType: emp.employment_type,
      contractSignedDate: emp.contract_signed_date,
      employmentStartDate: emp.employment_start_date,
      contractExpiryDate: emp.contract_expiry_date,
      workStatus: emp.work_status,
      nationalId: emp.national_id,
      permanentAddress: emp.permanent_address,
      phoneNumber: emp.phone_number,
      bankName: emp.bank_name,
      bankAccount: emp.bank_account,
      educationLevel: emp.education_level,
      emergencyContactName: emp.emergency_contact_name,
      emergencyContactPhone: emp.emergency_contact_phone,
      terminationDate: emp.termination_date,
      createdAt: emp.created_at,
      updatedAt: emp.updated_at,
      warehouse: emp.warehouses_users_warehouse_idTowarehouses ? {
        id: emp.warehouses_users_warehouse_idTowarehouses.id,
        code: emp.warehouses_users_warehouse_idTowarehouses.code,
        name: emp.warehouses_users_warehouse_idTowarehouses.name,
        type: emp.warehouses_users_warehouse_idTowarehouses.type
      } : null
    }))

    return NextResponse.json({
      success: true,
      data: transformedEmployees,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize)
    })
  } catch (error: any) {
    console.error('[API HR employees GET] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    // Only HR or Admin can access this endpoint
    if (!user || (!isHR(user) && !isAdmin(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const {
      email,
      password,
      full_name,
      role,
      warehouse_id,
      employment_type,
      phone_number,
      national_id,
      permanent_address,
      bank_name,
      bank_account,
      contract_signed_date,
      employment_start_date,
      contract_expiry_date,
      employee_code,
      education_level,
      emergency_contact_name,
      emergency_contact_phone
    } = body

    // Validation
    if (!password || !full_name || !role) {
      return NextResponse.json({
        success: false,
        error: "Vui lòng nhập đầy đủ Mật khẩu, Tên nhân viên và Vai trò"
      }, { status: 400 })
    }

    // Must have either Email or Phone for login
    const hasEmail = email && email.trim()
    const hasPhone = phone_number && phone_number.trim()

    if (!hasEmail && !hasPhone) {
      return NextResponse.json({
        success: false,
        error: "Vui lòng nhập Email hoặc Số điện thoại để làm tài khoản đăng nhập"
      }, { status: 400 })
    }

    // Validate email format if provided
    if (hasEmail) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        return NextResponse.json({
          success: false,
          error: "Email không hợp lệ"
        }, { status: 400 })
      }
    }

    // Validate phone format if provided
    if (hasPhone) {
      const phoneRegex = /^(0|\+84)[0-9]{9,10}$/
      const cleanPhone = phone_number.replace(/\s/g, '')
      if (!phoneRegex.test(cleanPhone)) {
        return NextResponse.json({
          success: false,
          error: "Số điện thoại không hợp lệ (VD: 0901234567 hoặc +84901234567)"
        }, { status: 400 })
      }
    }

    // Security: HR can ONLY create ATTENDANCE_STAFF
    // ADMIN can create any role (except ADMIN)
    const allowedRoles = isAdmin(user)
      ? ['MANAGER', 'STAFF', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ATTENDANCE_STAFF', 'GENERAL_MANAGER', 'HR']
      : ['ATTENDANCE_STAFF']
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({
        success: false,
        error: isAdmin(user)
          ? "Invalid role. Cannot create ADMIN users."
          : "HR chỉ được tạo nhân viên chấm công (ATTENDANCE_STAFF). Liên hệ Admin để tạo các loại nhân viên khác."
      }, { status: 403 })
    }

    // Warehouse is required for store staff
    if (!warehouse_id) {
      return NextResponse.json({
        success: false,
        error: "Vui lòng chọn Cửa hàng/Kho làm việc"
      }, { status: 400 })
    }

    // Verify warehouse is a STORE
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: warehouse_id },
      select: { type: true }
    })

    if (!warehouse) {
      return NextResponse.json({
        success: false,
        error: "Không tìm thấy kho/cửa hàng"
      }, { status: 404 })
    }

    if (warehouse.type !== 'STORE') {
      return NextResponse.json({
        success: false,
        error: "Chỉ có thể thêm nhân viên vào cửa hàng (STORE)"
      }, { status: 400 })
    }

    // Check if email already exists (only if email is provided)
    if (hasEmail) {
      const existingUser = await prisma.users.findUnique({
        where: { email },
        select: { id: true, full_name: true }
      })

      if (existingUser) {
        return NextResponse.json({
          success: false,
          error: `Email "${email}" đã được sử dụng bởi nhân viên khác`
        }, { status: 409 })
      }
    }

    // Check if phone number already exists (only if phone is provided)
    if (hasPhone) {
      const existingUserPhone = await prisma.users.findFirst({
        where: { phone_number },
        select: { id: true, full_name: true }
      })

      if (existingUserPhone) {
        return NextResponse.json({
          success: false,
          error: `Số điện thoại "${phone_number}" đã được sử dụng bởi nhân viên khác`
        }, { status: 409 })
      }
    }

    // Check if employee_code already exists (only if provided)
    if (employee_code) {
      const existingCode = await prisma.users.findUnique({
        where: { employee_code },
        select: { id: true }
      })

      if (existingCode) {
        return NextResponse.json({
          success: false,
          error: "Mã số nhân viên đã tồn tại"
        }, { status: 409 })
      }
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Create user
    const newUser = await prisma.users.create({
      data: {
        email: hasEmail ? email : null,
        password_hash: passwordHash,
        full_name,
        role,
        warehouse_id: warehouse_id || null,
        is_active: true,
        employment_type: employment_type || 'FULLTIME',
        phone_number: hasPhone ? phone_number : null,
        national_id: national_id || null,
        permanent_address: permanent_address || null,
        bank_name: bank_name || null,
        bank_account: bank_account || null,
        contract_signed_date: contract_signed_date ? new Date(contract_signed_date) : null,
        employment_start_date: employment_start_date ? new Date(employment_start_date) : null,
        contract_expiry_date: contract_expiry_date ? new Date(contract_expiry_date) : null,
        work_status: 'ACTIVE',
        employee_code: employee_code || null,
        education_level: education_level || null,
        emergency_contact_name: emergency_contact_name || null,
        emergency_contact_phone: emergency_contact_phone || null
      }
    })

    console.log(`[API HR employees POST] HR ${user.email} created employee ${newUser.email || newUser.phone_number} (${newUser.id})`)

    return NextResponse.json({
      success: true,
      message: "Employee created successfully",
      data: {
        id: newUser.id,
        email: newUser.email,
        phoneNumber: newUser.phone_number,
        fullName: newUser.full_name,
        employeeCode: newUser.employee_code,
        role: newUser.role,
        warehouseId: newUser.warehouse_id
      }
    })
  } catch (error: any) {
    console.error('[API HR employees POST] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

/**
 * PATCH /api/hr/employees
 * Update employee details (HR only, cannot modify ADMIN)
 * Body: { id, ...updateFields }
 */
export async function PATCH(request: NextRequest) {
  try {
    const user = await verifyAuth(request)

    // Only HR or Admin can access this endpoint
    if (!user || (!isHR(user) && !isAdmin(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 })
    }

    const body = await request.json()
    const { id, ...updateData } = body

    if (!id) {
      return NextResponse.json({
        success: false,
        error: "User id is required"
      }, { status: 400 })
    }

    // Security: Check if target user is ADMIN
    const targetUser = await prisma.users.findUnique({
      where: { id },
      select: { id: true, role: true, email: true }
    })

    if (!targetUser) {
      return NextResponse.json({
        success: false,
        error: "User not found"
      }, { status: 404 })
    }

    if (targetUser.role === 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: "HR cannot modify ADMIN users"
      }, { status: 403 })
    }

    // Prepare update data (convert camelCase to snake_case)
    const dbUpdateData: any = {}

    if (updateData.fullName !== undefined) dbUpdateData.full_name = updateData.fullName
    if (updateData.role !== undefined) {
      // HR can only update to STAFF role, Admin can update to any role except ADMIN
      const allowedRoles = isAdmin(user) ? ['MANAGER', 'STAFF', 'WAREHOUSE_MANAGER', 'WAREHOUSE_STAFF', 'ATTENDANCE_STAFF', 'GENERAL_MANAGER', 'HR'] : ['STAFF', 'WAREHOUSE_STAFF', 'ATTENDANCE_STAFF']
      if (!allowedRoles.includes(updateData.role)) {
        return NextResponse.json({
          success: false,
          error: isAdmin(user)
            ? "Cannot set role to ADMIN."
            : "HR can only set role to STAFF. Cannot set management or warehouse roles."
        }, { status: 403 })
      }
      dbUpdateData.role = updateData.role
    }
    if (updateData.warehouseId !== undefined) dbUpdateData.warehouse_id = updateData.warehouseId
    if (updateData.isActive !== undefined) dbUpdateData.is_active = updateData.isActive
    if (updateData.employmentType !== undefined) dbUpdateData.employment_type = updateData.employmentType
    if (updateData.phoneNumber !== undefined) dbUpdateData.phone_number = updateData.phoneNumber
    if (updateData.nationalId !== undefined) dbUpdateData.national_id = updateData.nationalId
    if (updateData.permanentAddress !== undefined) dbUpdateData.permanent_address = updateData.permanentAddress
    if (updateData.bankName !== undefined) dbUpdateData.bank_name = updateData.bankName
    if (updateData.bankAccount !== undefined) dbUpdateData.bank_account = updateData.bankAccount
    if (updateData.workStatus !== undefined) dbUpdateData.work_status = updateData.workStatus
    if (updateData.employeeCode !== undefined) {
      // Check if employee_code is unique
      if (updateData.employeeCode) {
        const existingCode = await prisma.users.findFirst({
          where: {
            employee_code: updateData.employeeCode,
            id: { not: id }
          },
          select: { id: true }
        })
        if (existingCode) {
          return NextResponse.json({
            success: false,
            error: "Mã số nhân viên đã tồn tại"
          }, { status: 409 })
        }
      }
      dbUpdateData.employee_code = updateData.employeeCode || null
    }
    if (updateData.contractSignedDate !== undefined) {
      dbUpdateData.contract_signed_date = updateData.contractSignedDate ? new Date(updateData.contractSignedDate) : null
    }
    if (updateData.employmentStartDate !== undefined) {
      dbUpdateData.employment_start_date = updateData.employmentStartDate ? new Date(updateData.employmentStartDate) : null
    }
    if (updateData.contractExpiryDate !== undefined) {
      dbUpdateData.contract_expiry_date = updateData.contractExpiryDate ? new Date(updateData.contractExpiryDate) : null
    }
    if (updateData.educationLevel !== undefined) dbUpdateData.education_level = updateData.educationLevel
    if (updateData.emergencyContactName !== undefined) dbUpdateData.emergency_contact_name = updateData.emergencyContactName
    if (updateData.emergencyContactPhone !== undefined) dbUpdateData.emergency_contact_phone = updateData.emergencyContactPhone
    if (updateData.terminationDate !== undefined) {
      dbUpdateData.termination_date = updateData.terminationDate ? new Date(updateData.terminationDate) : null
    }

    // Update user
    const updatedUser = await prisma.users.update({
      where: { id },
      data: dbUpdateData
    })

    console.log(`[API HR employees PATCH] HR ${user.email} updated employee ${targetUser.email} (${id})`)

    return NextResponse.json({
      success: true,
      message: "Employee updated successfully",
      data: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.full_name,
        role: updatedUser.role
      }
    })
  } catch (error: any) {
    console.error('[API HR employees PATCH] Error:', error)
    return NextResponse.json({ success: false, error: error?.message || 'Internal server error' }, { status: 500 })
  }
}

// DELETE: Delete an employee (HR only)
export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || (!isHR(user) && !isAdmin(user))) {
      return NextResponse.json({ success: false, error: "Forbidden" } as ApiResponse<null>, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing employee ID" } as ApiResponse<null>, { status: 400 })
    }

    // Check if user exists and is not ADMIN/HR (prevent deleting self or super admins easily)
    const targetUser = await prisma.users.findUnique({
      where: { id }
    })

    if (!targetUser) {
      return NextResponse.json({ success: false, error: "Employee not found" } as ApiResponse<null>, { status: 404 })
    }

    if (targetUser.role === 'ADMIN') {
      return NextResponse.json({ success: false, error: "Cannot delete Admin users" } as ApiResponse<null>, { status: 403 })
    }

    try {
      // First, try to delete related assignments (weak relations that can be cleaned up)
      await prisma.user_warehouse_assignments.deleteMany({
        where: { user_id: id }
      })

      // Attempt hard delete
      await prisma.users.delete({
        where: { id }
      })

      return NextResponse.json({ success: true, message: "Employee deleted successfully" } as ApiResponse<null>)
    } catch (deleteError: any) {
      // If FK constraint fails (P2003), switch to soft delete/deactivation
      if (deleteError.code === 'P2003') {
        console.log(`[API HR employees DELETE] Cannot hard delete user ${id} due to constraints. Deactivating instead.`)
        
        await prisma.users.update({
          where: { id },
          data: {
            is_active: false,
            work_status: 'INACTIVE',
            termination_date: new Date()
          }
        })

        return NextResponse.json({ 
          success: true, 
          message: "Nhân viên có dữ liệu liên quan (chấm công, ca làm) nên đã được chuyển sang trạng thái 'Ngưng hoạt động' thay vì xóa vĩnh viễn." 
        } as ApiResponse<null>)
      }
      throw deleteError
    }
  } catch (error: any) {
    console.error("Delete employee error:", error)
    return NextResponse.json({ success: false, error: error?.message || String(error) } as ApiResponse<null>, { status: 500 })
  }
}
