import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import ExcelJS from 'exceljs'
// import { applyWorksheetStyling } from '@/lib/xlsx-utils' // No longer needed

async function getUser(request: NextRequest) {
  let token = getAuthToken(request)

  if (!token) return null

  try {
    return verifyToken(token) as any
  } catch (err) {
    return null
  }
}

// Helper to style worksheet
function styleWorksheet(worksheet: ExcelJS.Worksheet, options: { headerRowIndex?: number, autoWidth?: boolean } = {}) {
  const headerRowIndex = options.headerRowIndex || 1

  // Style header row
  const headerRow = worksheet.getRow(headerRowIndex)
  headerRow.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: 'FFFFFF' } }
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: '4472C4' } // Blue header
    }
    cell.border = {
      top: { style: 'thin', color: { argb: '000000' } },
      left: { style: 'thin', color: { argb: '000000' } },
      bottom: { style: 'thin', color: { argb: '000000' } },
      right: { style: 'thin', color: { argb: '000000' } }
    }
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  })
  // Increase header height
  headerRow.height = 25

  // Style all data cells (border and alignment)
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > headerRowIndex) {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: '000000' } },
          left: { style: 'thin', color: { argb: '000000' } },
          bottom: { style: 'thin', color: { argb: '000000' } },
          right: { style: 'thin', color: { argb: '000000' } }
        }
        cell.alignment = { vertical: 'middle', wrapText: true }
      })
    }
  })

  // Auto width
  if (options.autoWidth !== false) {
    worksheet.columns.forEach(column => {
      let maxLength = 0
      column.eachCell && column.eachCell({ includeEmpty: true }, (cell) => {
        const columnLength = cell.value ? String(cell.value).length : 0
        if (columnLength > maxLength) {
          maxLength = columnLength
        }
      })
      column.width = Math.min(Math.max(maxLength + 2, 12), 60)
    })
  }
}

// GET /api/product-recipes/template - Download Excel template for importing recipes
export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only AdminKhoTong can download template
    const isAdminKhoTong = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    if (!isAdminKhoTong) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)

    // Fetch all available products for reference
    const products = await prisma.products.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        unit_id: true,
        product_units: {
          select: { code: true, name: true }
        }
      },
      orderBy: { name: 'asc' }
    })

    // Fetch all available units
    const units = await prisma.product_units.findMany({
      select: { id: true, code: true, name: true },
      orderBy: { code: 'asc' }
    })

    // Fetch warehouses that are STORE type (allowed to sell)
    const warehouses = await prisma.warehouses.findMany({
      where: { type: 'STORE', is_active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' }
    })

    // Fetch categories
    const categories = await prisma.categories.findMany({
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    })

    // Create workbook
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'System'
    workbook.lastModifiedBy = user.username || 'User'
    workbook.created = new Date()
    workbook.modified = new Date()

    // Sheet 1: Template for importing recipes
    const ws1 = workbook.addWorksheet('Import Template')
    ws1.columns = [
      { header: 'MÃ MÓN', key: 'code' },
      { header: 'TÊN CÔNG THỨC', key: 'name' },
      { header: 'GIÁ TIỀN', key: 'price' },
      { header: 'NHÓM HÀNG', key: 'group' },
      { header: 'MÃ KHO (nhiều kho phân cách bằng dấu phẩy, để trống = toàn hệ thống)', key: 'warehouses' },
      { header: 'NGUYÊN LIỆU (tùy chọn, MÃ SP:SỐ LƯỢNG:MÃ ĐƠN VỊ)', key: 'ingredients' },
    ]

    // Add sample data
    ws1.addRow(['CF001', 'Cà phê đen', '25000', 'Đồ uống', 'STORE01,STORE02', 'CF001:20:g;WATER01:200:ml'])
    ws1.addRow(['STB001', 'Sinh tố bơ', '35000', 'Đồ uống', 'STORE01,STORE02,STORE03', 'BO001:150:g;SUGAR01:30:g;MILK01:100:ml;ICE01:100:g'])
    ws1.addRow(['BMT001', 'Bánh mì thịt', '20000', 'Đồ ăn', '', 'BREAD01:1:cai;THIT01:50:g;RAU01:30:g'])
    ws1.addRow(['NL001', 'Nước lọc', '10000', 'Đồ uống', 'STORE01', ''])

    styleWorksheet(ws1)


    // Sheet 2: Products reference
    const ws2 = workbook.addWorksheet('Danh Sách Sản Phẩm')
    ws2.columns = [
      { header: 'MÃ SẢN PHẨM', key: 'code' },
      { header: 'TÊN SẢN PHẨM', key: 'name' },
      { header: 'ĐƠN VỊ MẶC ĐỊNH', key: 'unit' },
      { header: 'ID (không cần thiết)', key: 'id' }
    ]
    products.forEach(p => {
      ws2.addRow([p.code, p.name, p.product_units?.code || '', p.id])
    })
    styleWorksheet(ws2)


    // Sheet 3: Units reference
    const ws3 = workbook.addWorksheet('Danh Sách Đơn Vị')
    ws3.columns = [
      { header: 'MÃ ĐƠN VỊ', key: 'code' },
      { header: 'TÊN ĐƠN VỊ', key: 'name' },
      { header: 'ID (không cần thiết)', key: 'id' }
    ]
    units.forEach(u => {
      ws3.addRow([u.code, u.name, u.id])
    })
    styleWorksheet(ws3)


    // Sheet 4: Warehouses reference
    const ws4 = workbook.addWorksheet('Danh Sách Kho Bán')
    ws4.columns = [
      { header: 'MÃ KHO', key: 'code' },
      { header: 'TÊN KHO', key: 'name' },
      { header: 'ID (không cần thiết)', key: 'id' }
    ]
    warehouses.forEach(w => {
      ws4.addRow([w.code, w.name, w.id])
    })
    styleWorksheet(ws4)


    // Sheet 5: Categories reference
    const ws5 = workbook.addWorksheet('Danh Sách Nhóm Hàng')
    ws5.columns = [
      { header: 'TÊN NHÓM HÀNG', key: 'name' },
      { header: 'ID (không cần thiết)', key: 'id' }
    ]
    categories.forEach(c => {
      ws5.addRow([c.name, c.id])
    })
    styleWorksheet(ws5)


    // Sheet 6: Instructions
    const ws6 = workbook.addWorksheet('Hướng Dẫn')
    ws6.getColumn(1).width = 100
    const instructions = [
      'HƯỚNG DẪN IMPORT CÔNG THỨC CHẾ BIẾN',
      '',
      '1. CHUẨN BỊ FILE IMPORT:',
      '   - Sử dụng sheet "Import Template" để nhập dữ liệu',
      '   - Điền đầy đủ thông tin theo các cột đã có sẵn',
      '',
      '2. CÁC CỘT BẮT BUỘC:',
      '   - TÊN CÔNG THỨC: Tên công thức chế biến (bắt buộc)',
      '',
      '3. CÁC CỘT TÙY CHỌN:',
      '   - MÃ MÓN: Mã định danh của món (VD: CF001, NC001, ...) - phải là duy nhất trong hệ thống',
      '   - GIÁ TIỀN: Giá bán sản phẩm chế biến',
      '   - NHÓM HÀNG: Tên nhóm hàng (xem sheet "Danh Sách Nhóm Hàng")',
      '   - MÃ KHO: Mã các kho bán hàng (xem sheet "Danh Sách Kho Bán")',
      '   - NGUYÊN LIỆU: Danh sách nguyên liệu (có thể để trống)',
      '',
      '4. ĐỊNH DẠNG NGUYÊN LIỆU:',
      '   - Mỗi nguyên liệu theo định dạng: MÃ_SP:SỐ_LƯỢNG:MÃ_ĐƠN_VỊ',
      '   - Nhiều nguyên liệu phân cách bằng dấu chấm phẩy (;)',
      '   - Ví dụ: CF001:20:g;WATER01:200:ml',
      '',
      '5. ĐỊNH DẠNG KHO BÁN:',
      '   - Để trống: Công thức áp dụng cho TOÀN HỆ THỐNG (tất cả các kho)',
      '   - Một kho: STORE01',
      '   - Nhiều kho: STORE01,STORE02,STORE03 (phân cách bằng dấu phẩy)',
      '   - Mỗi kho sẽ tạo 1 công thức riêng với cùng thông tin',
      '   - Khi có nhiều kho, mã món sẽ được tự động thêm suffix kho (VD: CF001-STORE01, CF001-STORE02)',
      '',
      '6. LƯU Ý:',
      '   - Mã món phải là duy nhất trong toàn hệ thống (hoặc để trống)',
      '   - Mã sản phẩm phải tồn tại trong hệ thống (xem sheet "Danh Sách Sản Phẩm")',
      '   - Mã đơn vị phải tồn tại trong hệ thống (xem sheet "Danh Sách Đơn Vị")',
      '   - Nếu không chỉ định kho, công thức sẽ được tạo dạng toàn hệ thống',
      '   - File import chỉ chấp nhận định dạng .xlsx'
    ]
    instructions.forEach(line => ws6.addRow([line]))

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer() as unknown as Buffer

    // Return Excel file
    return new NextResponse(buffer as any, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="product-recipes-template.xlsx"`,
        'Cache-Control': 'no-cache'
      }
    })

  } catch (error) {
    console.error('Error generating template:', error)
    return NextResponse.json(
      { error: 'Failed to generate template' },
      { status: 500 }
    )
  }
}
