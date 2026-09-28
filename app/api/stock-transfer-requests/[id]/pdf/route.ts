import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { query } from "@/lib/prisma"

/**
 * GET /api/stock-transfer-requests/[id]/pdf
 * Generate PDF phiếu xuất kho A4
 * Trả về dạng PDF hoặc HTML để in
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const requestData = (await query(
      `SELECT wt.*,
         fw.name as from_warehouse_name, fw.code as from_warehouse_code,
         tw.name as to_warehouse_name, tw.code as to_warehouse_code,
         u.full_name as requested_by_name
       FROM warehouse_transfers wt
       JOIN warehouses fw ON wt.from_warehouse_id = fw.id
       JOIN warehouses tw ON wt.to_warehouse_id = tw.id
       JOIN users u ON wt.requested_by = u.id
       WHERE wt.id = ?`,
      [id]
    )) as any[]

    if (!requestData || requestData.length === 0) {
      return NextResponse.json(
        { success: false, error: "Yêu cầu không tồn tại" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const req = requestData[0]

    // Chỉ cho phép in PDF khi yêu cầu đã hoàn thành (đã có đủ 2 chữ ký)
    if (req.status !== "HOAN_THANH") {
      return NextResponse.json(
        { success: false, error: "Chỉ được in phiếu khi yêu cầu đã hoàn thành (đã có đủ 2 chữ ký)" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const details = (await query(
      `SELECT wti.*, p.code as product_code, p.name as product_name, pu.name as unit_name
       FROM warehouse_transfer_items wti
       JOIN products p ON wti.product_id = p.id
       JOIN product_units pu ON p.unit_id = pu.id
       WHERE wti.transfer_id = ?
       ORDER BY wti.created_at`,
      [id]
    )) as any[]

    // Generate HTML for printing
    const html = generatePrintableHTML(req, details)

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

function generatePrintableHTML(request: any, details: any[]) {
  const formatDate = (date: any) => {
    if (!date) return ""
    const d = new Date(date)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
  }

  const formatDateTime = (date: any) => {
    if (!date) return ""
    const d = new Date(date)
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`
  }

  const totalQuantity = details.reduce((sum, d) => sum + (d.quantity || 0), 0)

  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phiếu Xuất Kho - ${request.transfer_number || request.id}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Times New Roman', serif;
      line-height: 1.4;
      color: #333;
      background: white;
    }

    .page {
      width: 210mm;
      height: 297mm;
      margin: 0 auto;
      padding: 20mm;
      background: white;
    }

    .header {
      text-align: center;
      margin-bottom: 20px;
      border-bottom: 2px solid #000;
      padding-bottom: 10px;
    }

    .header h1 {
      font-size: 18px;
      font-weight: bold;
      margin-bottom: 5px;
    }

    .header p {
      font-size: 12px;
    }

    .info-section {
      margin-bottom: 15px;
      font-size: 13px;
    }

    .info-row {
      display: flex;
      margin-bottom: 8px;
    }

    .info-label {
      width: 120px;
      font-weight: bold;
    }

    .info-value {
      flex: 1;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 20px;
      font-size: 13px;
    }

    th {
      border: 1px solid #000;
      padding: 8px;
      text-align: left;
      background: #f5f5f5;
      font-weight: bold;
    }

    td {
      border: 1px solid #000;
      padding: 8px;
    }

    .text-center {
      text-align: center;
    }

    .text-right {
      text-align: right;
    }

    .signature-section {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      gap: 15px;
    }

    .signature-box {
      flex: 1;
      text-align: center;
      font-size: 12px;
    }

    .signature-box p {
      margin-bottom: 40px;
      font-weight: bold;
    }

    .signature-image {
      width: 100%;
      height: 70px;
      border: 1px solid #000;
      margin-bottom: 5px;
      position: relative;
      overflow: hidden;
      background: #fff;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .signature-image img {
      max-width: 100%;
      max-height: 100%;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }

    .signature-placeholder {
      font-size: 14px;
      color: #666;
      font-weight: bold;
      letter-spacing: 2px;
    }

    @media print {
      body {
        margin: 0;
        padding: 0;
      }
      .page {
        margin: 0;
        padding: 0;
        box-shadow: none;
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <h1>PHIẾU XUẤT KHO</h1>
      <p>Số: ${request.transfer_number || request.id}</p>
    </div>

    <div class="info-section">
      <div class="info-row">
        <span class="info-label">Kho Xuất:</span>
        <span class="info-value">${request.from_warehouse_name} (${request.from_warehouse_code})</span>
      </div>
      <div class="info-row">
        <span class="info-label">Kho Nhận:</span>
        <span class="info-value">${request.to_warehouse_name} (${request.to_warehouse_code})</span>
      </div>
      <div class="info-row">
        <span class="info-label">Ngày Xuất:</span>
        <span class="info-value">${formatDate(request.exported_at || request.created_at)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Người Yêu Cầu:</span>
        <span class="info-value">${request.requested_by_name}</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 5%">STT</th>
          <th style="width: 20%">Mã Sản Phẩm</th>
          <th style="width: 35%">Tên Sản Phẩm</th>
          <th style="width: 15%">Đơn Vị</th>
          <th style="width: 15%">Số Lượng</th>
          <th style="width: 10%">Ghi Chú</th>
        </tr>
      </thead>
      <tbody>
        ${details
          .map(
            (detail, idx) => `
          <tr>
            <td class="text-center">${idx + 1}</td>
            <td>${detail.product_code}</td>
            <td>${detail.product_name}</td>
            <td class="text-center">${detail.unit_name}</td>
            <td class="text-right">${detail.quantity || 0}</td>
            <td></td>
          </tr>
        `
          )
          .join("")}
        <tr>
          <td colspan="4" class="text-right"><strong>Tổng Cộng:</strong></td>
          <td class="text-right"><strong>${totalQuantity}</strong></td>
          <td></td>
        </tr>
      </tbody>
    </table>

    <div class="signature-section">
      <div class="signature-box">
        <p>Người Xuất Kho</p>
        <p style="margin-bottom: 10px; font-size: 10px;">(Kho Tổng)</p>
        <div class="signature-image">
          ${request.main_warehouse_signature
            ? `<img src="${request.main_warehouse_signature}" alt="Chữ ký Kho Tổng" style="max-height: 70px;" />`
            : '<span class="signature-placeholder">_________________</span>'}
        </div>
        <p style="font-size: 11px; margin-top: 5px;">
          ${request.main_signed_at ? formatDateTime(request.main_signed_at) : ""}
        </p>
      </div>

      <div class="signature-box">
        <p>Người Nhận Kho</p>
        <p style="margin-bottom: 10px; font-size: 10px;">(Kho Con)</p>
        <div class="signature-image">
          ${request.store_warehouse_signature
            ? `<img src="${request.store_warehouse_signature}" alt="Chữ ký Kho Con" style="max-height: 70px;" />`
            : '<span class="signature-placeholder">_________________</span>'}
        </div>
        <p style="font-size: 11px; margin-top: 5px;">
          ${request.store_signed_at ? formatDateTime(request.store_signed_at) : ""}
        </p>
      </div>

      <div class="signature-box">
        <p>Người Phê Duyệt</p>
        <p style="margin-bottom: 10px; font-size: 10px;">(Quản Lý)</p>
        <div class="signature-image">
          <span class="signature-placeholder">_________________</span>
        </div>
        <p style="font-size: 11px; margin-top: 5px;"></p>
      </div>
    </div>
  </div>
</body>
</html>
  `
}
