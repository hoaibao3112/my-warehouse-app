/**
 * Inventory Check Excel Export - Sử dụng ExcelJS cho styling chuyên nghiệp
 * 
 * Hỗ trợ:
 * - Xuất từng phiếu (exportSingleCheckToExcel)
 * - Xuất hàng loạt nhóm theo kho (exportBatchByWarehouse)
 * - Xuất hàng loạt nhóm theo ngày (exportBatchByDate)
 * 
 * Liên kết: CODEBASE-DOCS/INVENTORY-CHECK-LIST-PAGINATION.txt
 */
import ExcelJS from 'exceljs'

// ========== INTERFACES ==========

interface InventoryCheckItem {
    productCode?: string
    productName?: string
    productUnit?: string
    openingBalance: number
    imports: number
    exports: number
    systemBalance: number
    actualBalance: number
    difference: number
    differencePercentage: number
    inputUnitCode?: string
    inputValue?: number | null
    note?: string
}

export interface InventoryCheckForExport {
    id?: string
    number: string
    warehouse: string
    warehouseId?: string
    period?: string
    status: string
    createdBy: string
    createdAt: string
    completed_at?: string | null
    items?: InventoryCheckItem[]
}

export type ExportGroupBy = 'warehouse' | 'date' | 'none'

export interface BatchExportOptions {
    groupBy: ExportGroupBy
    onlyDiscrepancy: boolean
    title?: string
}

// ========== STYLE CONSTANTS ==========

const COLORS = {
    headerBg: '1A237E',
    headerFont: 'FFFFFF',
    subHeaderBg: '3949AB',
    completedBg: '4CAF50',
    completedFont: 'FFFFFF',
    inProgressBg: 'FF9800',
    inProgressFont: 'FFFFFF',
    diffNegBg: 'FFEBEE',
    diffNegFont: 'D32F2F',
    diffPosBg: 'E8F5E9',
    diffPosFont: '2E7D32',
    zebraRow: 'F8F9FA',
    zebraRowAlt: 'F5F5F5',
    titleFont: '1A237E',
    subFont: '666666',
    summaryFont: '37474F',
    warehouseHeaderBg: '0D47A1',
    dateHeaderBg: '4A148C',
    separatorBg: 'E3F2FD'
}

const HEADER_FILL: ExcelJS.Fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.headerBg }
}

const HEADER_FONT: Partial<ExcelJS.Font> = {
    bold: true,
    color: { argb: COLORS.headerFont },
    size: 11,
    name: 'Arial'
}

const BORDER_ALL: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'B0B0B0' } },
    bottom: { style: 'thin', color: { argb: 'B0B0B0' } },
    left: { style: 'thin', color: { argb: 'B0B0B0' } },
    right: { style: 'thin', color: { argb: 'B0B0B0' } }
}

const DETAIL_HEADERS = ['STT', 'Mã SP', 'Tên Sản Phẩm', 'ĐVT', 'Tồn Đầu', 'Nhập', 'Xuất', 'Tồn HT', 'Thực Tế', 'Chênh Lệch', '% Lệch']

const DETAIL_COL_WIDTHS = [6, 14, 35, 10, 12, 12, 12, 12, 14, 14, 10]

// ========== XUẤT TỪNG PHIẾU ==========

/**
 * Xuất chi tiết 1 phiếu kiểm kê ra file Excel
 */
export async function exportSingleCheckToExcel(check: InventoryCheckForExport): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Warehouse Express'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('Chi Tiết Kiểm Kê', {
        views: [{ state: 'frozen', ySplit: 4 }]
    })

    // Title
    sheet.mergeCells('A1:K1')
    const titleCell = sheet.getCell('A1')
    titleCell.value = `PHIẾU KIỂM KÊ: ${check.number}`
    titleCell.font = { bold: true, size: 14, name: 'Arial', color: { argb: COLORS.titleFont } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 35

    // Sub info row 1
    sheet.mergeCells('A2:K2')
    const sub1 = sheet.getCell('A2')
    sub1.value = `Kho: ${check.warehouse} | Kỳ: ${check.period || '-'}`
    sub1.font = { size: 11, bold: true, name: 'Arial', color: { argb: COLORS.subFont } }
    sub1.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(2).height = 22

    // Sub info row 2
    sheet.mergeCells('A3:K3')
    const sub2 = sheet.getCell('A3')
    const statusVn = check.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang thực hiện'
    sub2.value = `Trạng thái: ${statusVn} | Người tạo: ${check.createdBy} | Ngày tạo: ${formatDateVN(check.createdAt)}${check.completed_at ? ` | Hoàn thành: ${formatDateVN(check.completed_at)}` : ''}`
    sub2.font = { size: 10, italic: true, name: 'Arial', color: { argb: COLORS.subFont } }
    sub2.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(3).height = 20

    // Header row
    addDetailHeaders(sheet)

    // Data
    const items = check.items || []
    addDetailItems(sheet, items)

    // Column widths
    applyDetailColumnWidths(sheet)

    // Summary
    addDetailSummary(sheet, items)

    const buffer = await workbook.xlsx.writeBuffer()
    return buffer as unknown as ArrayBuffer
}

// ========== XUẤT HÀNG LOẠT ==========

/**
 * Xuất hàng loạt phiếu kiểm kê ra file Excel
 * Hỗ trợ nhóm theo: kho, ngày, hoặc không nhóm
 */
export async function exportBatchToExcel(
    checks: InventoryCheckForExport[],
    options: BatchExportOptions
): Promise<ArrayBuffer> {
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'Warehouse Express'
    workbook.created = new Date()

    const { groupBy, onlyDiscrepancy, title } = options

    // Sheet 1: Bảng tổng hợp
    addSummarySheet(workbook, checks, title)

    // Tạo sheet chi tiết theo nhóm
    if (groupBy === 'warehouse') {
        addSheetsByWarehouse(workbook, checks, onlyDiscrepancy)
    } else if (groupBy === 'date') {
        addSheetsByDate(workbook, checks, onlyDiscrepancy)
    } else {
        // Không nhóm: mỗi phiếu 1 sheet (tối đa 15)
        addIndividualSheets(workbook, checks.slice(0, 15), onlyDiscrepancy)
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return buffer as unknown as ArrayBuffer
}

// ========== SHEET TỔNG HỢP ==========

function addSummarySheet(
    workbook: ExcelJS.Workbook,
    checks: InventoryCheckForExport[],
    title?: string
) {
    const sheet = workbook.addWorksheet('Tổng Hợp', {
        views: [{ state: 'frozen', ySplit: 2 }]
    })

    // Title
    sheet.mergeCells('A1:H1')
    const titleCell = sheet.getCell('A1')
    titleCell.value = title || 'BÁO CÁO TỔNG HỢP KIỂM KÊ'
    titleCell.font = { bold: true, size: 14, name: 'Arial', color: { argb: COLORS.titleFont } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    sheet.getRow(1).height = 35

    // Headers
    const headers = ['STT', 'Số Phiếu', 'Kho', 'Trạng Thái', 'Người Tạo', 'Ngày Tạo', 'Ngày HT', 'Tổng SP']
    const headerRow = sheet.addRow(headers)
    headerRow.height = 28
    headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = BORDER_ALL
    })

    // Data
    checks.forEach((check, idx) => {
        const statusLabel = check.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang thực hiện'
        const row = sheet.addRow([
            idx + 1,
            check.number,
            check.warehouse,
            statusLabel,
            check.createdBy,
            formatDateVN(check.createdAt),
            check.completed_at ? formatDateVN(check.completed_at) : '-',
            check.items?.length || 0
        ])

        row.eachCell((cell, colIdx) => {
            cell.border = BORDER_ALL
            cell.alignment = { vertical: 'middle' }

            // Trạng thái color
            if (colIdx === 4) {
                const isCompleted = check.status === 'COMPLETED'
                cell.fill = {
                    type: 'pattern',
                    pattern: 'solid',
                    fgColor: { argb: isCompleted ? COLORS.completedBg : COLORS.inProgressBg }
                }
                cell.font = { bold: true, color: { argb: isCompleted ? COLORS.completedFont : COLORS.inProgressFont }, size: 10, name: 'Arial' }
                cell.alignment = { horizontal: 'center', vertical: 'middle' }
            }

            // Zebra
            if (idx % 2 === 1 && colIdx !== 4) {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraRowAlt } }
            }
        })
    })

    // Column widths
    sheet.columns = [
        { width: 6 }, { width: 22 }, { width: 25 }, { width: 18 },
        { width: 22 }, { width: 20 }, { width: 20 }, { width: 10 }
    ]

    // Statistics row
    sheet.addRow([])
    const completed = checks.filter(c => c.status === 'COMPLETED').length
    const inProgress = checks.filter(c => c.status === 'IN_PROGRESS').length
    const statsRow = sheet.addRow([
        '', '', `Tổng: ${checks.length} phiếu | Hoàn thành: ${completed} | Đang thực hiện: ${inProgress}`,
        '', '', '', '', ''
    ])
    statsRow.getCell(3).font = { bold: true, italic: true, size: 11, name: 'Arial', color: { argb: COLORS.summaryFont } }
}

// ========== NHÓM THEO KHO ==========

function addSheetsByWarehouse(
    workbook: ExcelJS.Workbook,
    checks: InventoryCheckForExport[],
    onlyDiscrepancy: boolean
) {
    // Nhóm checks theo warehouse
    const warehouseGroups = new Map<string, InventoryCheckForExport[]>()
    for (const check of checks) {
        const key = check.warehouse || 'Không xác định'
        if (!warehouseGroups.has(key)) {
            warehouseGroups.set(key, [])
        }
        warehouseGroups.get(key)!.push(check)
    }

    let sheetCount = 0
    for (const [warehouseName, warehouseChecks] of warehouseGroups) {
        if (sheetCount >= 20) break // Giới hạn sheets

        const sheetName = sanitizeSheetName(warehouseName)
        const sheet = workbook.addWorksheet(sheetName, {
            views: [{ state: 'frozen', ySplit: 2 }]
        })

        // Title
        sheet.mergeCells('A1:K1')
        const titleCell = sheet.getCell('A1')
        titleCell.value = `KHO: ${warehouseName.toUpperCase()} - ${warehouseChecks.length} PHIẾU KIỂM KÊ`
        titleCell.font = { bold: true, size: 13, name: 'Arial', color: { argb: COLORS.headerFont } }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.warehouseHeaderBg } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        sheet.getRow(1).height = 32

        let currentRow = 2

        // Duyệt qua từng phiếu trong kho
        for (const check of warehouseChecks) {
            const items = onlyDiscrepancy
                ? (check.items || []).filter(i => i.difference !== 0)
                : (check.items || [])

            if (items.length === 0 && onlyDiscrepancy) continue

            // Separator row cho mỗi phiếu
            currentRow++
            sheet.mergeCells(`A${currentRow}:K${currentRow}`)
            const sepCell = sheet.getCell(`A${currentRow}`)
            const statusVn = check.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang thực hiện'
            sepCell.value = `${check.number} | ${statusVn} | ${check.createdBy} | ${formatDateVN(check.createdAt)} | ${items.length} SP${onlyDiscrepancy ? ' chênh lệch' : ''}`
            sepCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.headerFont } }
            sepCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } }
            sepCell.alignment = { horizontal: 'left', vertical: 'middle' }
            sepCell.border = BORDER_ALL
            const sepRow = sheet.getRow(currentRow)
            sepRow.height = 24

            // Header
            currentRow++
            addDetailHeadersAtRow(sheet, currentRow)

            // Items
            items.forEach((item, idx) => {
                currentRow++
                addDetailItemAtRow(sheet, currentRow, idx, item)
            })

            // Mini summary
            currentRow++
            const totalItems = items.length
            const discItems = items.filter(i => i.difference !== 0).length
            sheet.mergeCells(`A${currentRow}:K${currentRow}`)
            const summaryCell = sheet.getCell(`A${currentRow}`)
            summaryCell.value = `  → ${totalItems} SP | Chênh lệch: ${discItems} SP`
            summaryCell.font = { italic: true, size: 9, name: 'Arial', color: { argb: COLORS.summaryFont } }
            summaryCell.border = BORDER_ALL
        }

        applyDetailColumnWidths(sheet)
        sheetCount++
    }
}

// ========== NHÓM THEO NGÀY ==========

function addSheetsByDate(
    workbook: ExcelJS.Workbook,
    checks: InventoryCheckForExport[],
    onlyDiscrepancy: boolean
) {
    // Nhóm theo ngày (YYYY-MM-DD)
    const dateGroups = new Map<string, InventoryCheckForExport[]>()
    for (const check of checks) {
        const dateKey = check.createdAt
            ? new Date(check.createdAt).toISOString().split('T')[0]
            : 'Không rõ ngày'
        if (!dateGroups.has(dateKey)) {
            dateGroups.set(dateKey, [])
        }
        dateGroups.get(dateKey)!.push(check)
    }

    // Sort by date desc
    const sortedDates = [...dateGroups.keys()].sort((a, b) => b.localeCompare(a))

    let sheetCount = 0
    for (const dateKey of sortedDates) {
        if (sheetCount >= 20) break

        const dateChecks = dateGroups.get(dateKey)!
        const dateLabel = dateKey !== 'Không rõ ngày'
            ? new Date(dateKey).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : dateKey

        const sheetName = sanitizeSheetName(`Ngày ${dateLabel}`)
        const sheet = workbook.addWorksheet(sheetName, {
            views: [{ state: 'frozen', ySplit: 2 }]
        })

        // Title
        sheet.mergeCells('A1:K1')
        const titleCell = sheet.getCell('A1')
        titleCell.value = `NGÀY: ${dateLabel} - ${dateChecks.length} PHIẾU KIỂM KÊ`
        titleCell.font = { bold: true, size: 13, name: 'Arial', color: { argb: COLORS.headerFont } }
        titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.dateHeaderBg } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        sheet.getRow(1).height = 32

        let currentRow = 2

        for (const check of dateChecks) {
            const items = onlyDiscrepancy
                ? (check.items || []).filter(i => i.difference !== 0)
                : (check.items || [])

            if (items.length === 0 && onlyDiscrepancy) continue

            // Separator
            currentRow++
            sheet.mergeCells(`A${currentRow}:K${currentRow}`)
            const sepCell = sheet.getCell(`A${currentRow}`)
            const statusVn = check.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang thực hiện'
            sepCell.value = `${check.number} | ${check.warehouse} | ${statusVn} | ${check.createdBy} | ${items.length} SP${onlyDiscrepancy ? ' chênh lệch' : ''}`
            sepCell.font = { bold: true, size: 10, name: 'Arial', color: { argb: COLORS.headerFont } }
            sepCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subHeaderBg } }
            sepCell.alignment = { horizontal: 'left', vertical: 'middle' }
            sepCell.border = BORDER_ALL
            sheet.getRow(currentRow).height = 24

            // Header
            currentRow++
            addDetailHeadersAtRow(sheet, currentRow)

            // Items
            items.forEach((item, idx) => {
                currentRow++
                addDetailItemAtRow(sheet, currentRow, idx, item)
            })

            // Mini summary
            currentRow++
            const totalItems = items.length
            const discItems = items.filter(i => i.difference !== 0).length
            sheet.mergeCells(`A${currentRow}:K${currentRow}`)
            const summaryCell = sheet.getCell(`A${currentRow}`)
            summaryCell.value = `  → ${totalItems} SP | Chênh lệch: ${discItems} SP`
            summaryCell.font = { italic: true, size: 9, name: 'Arial', color: { argb: COLORS.summaryFont } }
            summaryCell.border = BORDER_ALL
        }

        applyDetailColumnWidths(sheet)
        sheetCount++
    }
}

// ========== KHÔNG NHÓM - MỖI PHIẾU 1 SHEET ==========

function addIndividualSheets(
    workbook: ExcelJS.Workbook,
    checks: InventoryCheckForExport[],
    onlyDiscrepancy: boolean
) {
    for (const check of checks) {
        let items = check.items || []
        if (onlyDiscrepancy) items = items.filter(i => i.difference !== 0)
        if (items.length === 0) continue

        const sheetName = sanitizeSheetName(check.number)
        const sheet = workbook.addWorksheet(sheetName, {
            views: [{ state: 'frozen', ySplit: 4 }]
        })

        // Title
        sheet.mergeCells('A1:K1')
        const titleCell = sheet.getCell('A1')
        titleCell.value = `PHIẾU KIỂM KÊ: ${check.number} - ${check.warehouse}`
        titleCell.font = { bold: true, size: 13, name: 'Arial', color: { argb: COLORS.titleFont } }
        titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
        sheet.getRow(1).height = 30

        // Sub info
        sheet.mergeCells('A2:K2')
        const sub = sheet.getCell('A2')
        const statusVn = check.status === 'COMPLETED' ? 'Hoàn thành' : 'Đang thực hiện'
        sub.value = `Kỳ: ${check.period || '-'} | ${statusVn} | ${check.createdBy} | ${formatDateVN(check.createdAt)}`
        sub.font = { size: 10, italic: true, name: 'Arial', color: { argb: COLORS.subFont } }
        sub.alignment = { horizontal: 'center', vertical: 'middle' }
        sheet.getRow(2).height = 22

        // Empty separator row
        sheet.addRow([])

        // Headers + Data
        addDetailHeaders(sheet)
        addDetailItems(sheet, items)
        applyDetailColumnWidths(sheet)
        addDetailSummary(sheet, items)
    }
}

// ========== HELPER FUNCTIONS ==========

function addDetailHeaders(sheet: ExcelJS.Worksheet) {
    const headerRow = sheet.addRow(DETAIL_HEADERS)
    headerRow.height = 28
    headerRow.eachCell((cell) => {
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = BORDER_ALL
    })
}

function addDetailHeadersAtRow(sheet: ExcelJS.Worksheet, rowNum: number) {
    const row = sheet.getRow(rowNum)
    DETAIL_HEADERS.forEach((header, idx) => {
        const cell = row.getCell(idx + 1)
        cell.value = header
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
        cell.border = BORDER_ALL
    })
    row.height = 26
}

function addDetailItems(sheet: ExcelJS.Worksheet, items: InventoryCheckItem[]) {
    items.forEach((item, idx) => {
        const actualDisplay = item.inputValue !== null && item.inputValue !== undefined
            ? item.inputValue
            : item.actualBalance

        const row = sheet.addRow([
            idx + 1,
            item.productCode || '',
            item.productName || '',
            item.inputUnitCode || item.productUnit || '',
            item.openingBalance,
            item.imports,
            item.exports,
            item.systemBalance,
            actualDisplay,
            item.difference,
            parseFloat(item.differencePercentage.toFixed(2))
        ])

        styleDetailRow(row, idx, item)
    })
}

function addDetailItemAtRow(
    sheet: ExcelJS.Worksheet,
    rowNum: number,
    idx: number,
    item: InventoryCheckItem
) {
    const row = sheet.getRow(rowNum)
    const actualDisplay = item.inputValue !== null && item.inputValue !== undefined
        ? item.inputValue
        : item.actualBalance

    const values = [
        idx + 1,
        item.productCode || '',
        item.productName || '',
        item.inputUnitCode || item.productUnit || '',
        item.openingBalance,
        item.imports,
        item.exports,
        item.systemBalance,
        actualDisplay,
        item.difference,
        parseFloat(item.differencePercentage.toFixed(2))
    ]

    values.forEach((val, i) => {
        row.getCell(i + 1).value = val
    })

    styleDetailRow(row, idx, item)
}

function styleDetailRow(row: ExcelJS.Row, idx: number, item: InventoryCheckItem) {
    row.eachCell((cell, colIdx) => {
        cell.border = BORDER_ALL
        cell.alignment = { vertical: 'middle' }

        // Zebra
        if (idx % 2 === 1) {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.zebraRow } }
        }

        // Số liệu căn phải
        if (colIdx >= 5) {
            cell.alignment = { horizontal: 'right', vertical: 'middle' }
            cell.numFmt = '#,##0.######'
        }

        // Chênh lệch
        if (colIdx === 10) {
            if (item.difference < 0) {
                cell.font = { bold: true, color: { argb: COLORS.diffNegFont }, name: 'Arial', size: 10 }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.diffNegBg } }
            } else if (item.difference > 0) {
                cell.font = { bold: true, color: { argb: COLORS.diffPosFont }, name: 'Arial', size: 10 }
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.diffPosBg } }
            }
        }

        // % lệch
        if (colIdx === 11) {
            cell.numFmt = '0.00"%"'
            if (item.differencePercentage < 0) {
                cell.font = { color: { argb: COLORS.diffNegFont }, name: 'Arial', size: 10 }
            } else if (item.differencePercentage > 0) {
                cell.font = { color: { argb: COLORS.diffPosFont }, name: 'Arial', size: 10 }
            }
        }
    })
}

function addDetailSummary(sheet: ExcelJS.Worksheet, items: InventoryCheckItem[]) {
    const totalItems = items.length
    const discItems = items.filter(i => i.difference !== 0).length
    const excessItems = items.filter(i => i.difference > 0).length
    const shortItems = items.filter(i => i.difference < 0).length

    sheet.addRow([])
    const summaryRow = sheet.addRow([
        '', '',
        `Tổng: ${totalItems} SP | Chênh lệch: ${discItems} (Thừa: ${excessItems}, Thiếu: ${shortItems})`,
        '', '', '', '', '', '', '', ''
    ])
    summaryRow.getCell(3).font = { bold: true, italic: true, size: 11, name: 'Arial', color: { argb: COLORS.summaryFont } }
}

function applyDetailColumnWidths(sheet: ExcelJS.Worksheet) {
    sheet.columns = DETAIL_COL_WIDTHS.map(w => ({ width: w }))
}

function formatDateVN(dateStr: string | null | undefined): string {
    if (!dateStr) return '-'
    try {
        return new Date(dateStr).toLocaleDateString('vi-VN', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
    } catch {
        return dateStr || '-'
    }
}

function sanitizeSheetName(name: string): string {
    return name
        .replace(/[\\/*?:\[\]]/g, '')
        .substring(0, 31)
}
