/**
 * XLSX styling utility for creating professional Excel templates
 * Provides borders, header styling, and auto-width functionality
 */
import * as XLSX from 'xlsx'

// Border styles
export const BORDER_THIN = {
    top: { style: 'thin', color: { rgb: '000000' } },
    bottom: { style: 'thin', color: { rgb: '000000' } },
    left: { style: 'thin', color: { rgb: '000000' } },
    right: { style: 'thin', color: { rgb: '000000' } }
}

export const BORDER_MEDIUM = {
    top: { style: 'medium', color: { rgb: '000000' } },
    bottom: { style: 'medium', color: { rgb: '000000' } },
    left: { style: 'medium', color: { rgb: '000000' } },
    right: { style: 'medium', color: { rgb: '000000' } }
}

// Header style
export const HEADER_STYLE = {
    font: { bold: true, color: { rgb: 'FFFFFF' } },
    fill: { fgColor: { rgb: '4472C4' }, type: 'pattern', patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: BORDER_MEDIUM
}

// Data cell style  
export const DATA_STYLE = {
    border: BORDER_THIN,
    alignment: { vertical: 'center', wrapText: true }
}

/**
 * Apply borders and styling to worksheet
 * Note: xlsx library doesn't natively support cell styles.
 * We need xlsx-style or exceljs for full styling support.
 * This utility adds column widths and basic formatting that xlsx supports.
 */
export function applyWorksheetStyling(
    ws: XLSX.WorkSheet,
    options: {
        headerRows?: number
        columnWidths?: number[] | Record<string, number>
        autoWidth?: boolean
        minWidth?: number
        maxWidth?: number
    } = {}
) {
    const {
        headerRows = 1,
        columnWidths,
        autoWidth = true,
        minWidth = 10,
        maxWidth = 50
    } = options

    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1')

    // Calculate column widths
    const cols: XLSX.ColInfo[] = []

    for (let c = range.s.c; c <= range.e.c; c++) {
        let width = minWidth

        // Check if explicit width is provided
        if (columnWidths) {
            if (Array.isArray(columnWidths) && columnWidths[c]) {
                width = columnWidths[c]
            } else if (typeof columnWidths === 'object' && !Array.isArray(columnWidths)) {
                const colLetter = XLSX.utils.encode_col(c)
                if (columnWidths[colLetter]) {
                    width = columnWidths[colLetter]
                }
            }
        }

        // Auto-calculate width based on content
        if (autoWidth) {
            for (let r = range.s.r; r <= range.e.r; r++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c })]
                if (cell && cell.v !== undefined) {
                    const value = String(cell.v)
                    const lines = value.split('\n')
                    const maxLineLength = Math.max(...lines.map(l => l.length))
                    // Header rows get extra padding
                    const padding = r < headerRows ? 2 : 1
                    const contentWidth = maxLineLength + padding
                    width = Math.max(width, contentWidth)
                }
            }
        }

        // Clamp width to max
        width = Math.min(width, maxWidth)

        cols.push({ wch: width })
    }

    ws['!cols'] = cols

    // Row heights for header rows (to accommodate wrapped text)
    if (headerRows > 0) {
        ws['!rows'] = ws['!rows'] || []
        for (let r = 0; r < headerRows; r++) {
            ws['!rows'][r] = { hpt: 25 } // Height in points
        }
    }

    return ws
}

/**
 * Create styled sheet from array of arrays
 */
export function createStyledSheet(
    data: any[][],
    options: {
        headerRows?: number
        columnWidths?: number[]
        autoWidth?: boolean
    } = {}
): XLSX.WorkSheet {
    const ws = XLSX.utils.aoa_to_sheet(data)
    return applyWorksheetStyling(ws, options)
}

/**
 * Create styled sheet from JSON data with headers
 */
export function createStyledSheetFromJSON(
    data: Record<string, any>[],
    headers: { key: string; label: string; width?: number }[],
    options: {
        autoWidth?: boolean
    } = {}
): XLSX.WorkSheet {
    // Build header row
    const headerRow = headers.map(h => h.label)

    // Build data rows
    const dataRows = data.map(item => {
        return headers.map(h => item[h.key] ?? '')
    })

    // Combine
    const allData = [headerRow, ...dataRows]

    // Get column widths from headers
    const columnWidths = headers.map(h => h.width || 15)

    return createStyledSheet(allData, {
        headerRows: 1,
        columnWidths,
        autoWidth: options.autoWidth ?? true
    })
}
