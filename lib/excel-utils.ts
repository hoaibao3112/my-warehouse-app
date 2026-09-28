import ExcelJS from 'exceljs'
// Do not import file-saver here if possible, or wrap it.
// file-saver is client-sided only. Next.js might complain if imported in API route (though usually fine if not used).
// Better to keep this file universal or safe.

/**
 * Create a styled workbook with headers and data
 */
export function createStyledWorkbook(
    headers: string[],
    sampleData: any[][],
    sheetName: string = 'Template',
    columnWidths?: number[]
): ExcelJS.Workbook {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet(sheetName)

    // Add headers
    const headerRow = worksheet.addRow(headers)

    // Style headers
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
        cell.alignment = { vertical: 'middle', horizontal: 'center' }
    })

    // Add sample data
    if (sampleData.length > 0) {
        sampleData.forEach(row => {
            const addedRow = worksheet.addRow(row)
            // Style data cells
            addedRow.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin', color: { argb: '000000' } },
                    left: { style: 'thin', color: { argb: '000000' } },
                    bottom: { style: 'thin', color: { argb: '000000' } },
                    right: { style: 'thin', color: { argb: '000000' } }
                }
                cell.alignment = { vertical: 'middle', wrapText: true }
            })
        })
    }

    // Set column widths
    worksheet.columns.forEach((column, index) => {
        let maxLength = 0
        if (columnWidths && columnWidths[index]) {
            column.width = columnWidths[index]
        } else {
            // Auto calculate
            maxLength = headers[index]?.length || 10

            if (sampleData.length > 0) {
                sampleData.forEach(row => {
                    const cellValue = row[index] ? String(row[index]) : ''
                    if (cellValue.length > maxLength) {
                        maxLength = cellValue.length
                    }
                })
            }
            // Add some padding
            column.width = Math.min(Math.max(maxLength + 2, 10), 50)
        }
    })

    return workbook
}

/**
 * Generate Excel buffer (for API routes)
 */
export async function generateExcelBuffer(
    headers: string[],
    sampleData: any[][],
    sheetName?: string
): Promise<Buffer> {
    const workbook = createStyledWorkbook(headers, sampleData, sheetName)
    // cast to Buffer because exceljs writes to buffer
    return await workbook.xlsx.writeBuffer() as unknown as Buffer
}

/**
 * Generate and download Excel template (Browser only)
 */
export async function downloadExcelTemplate(
    options: {
        fileName: string
        headers: string[]
        sampleData: any[][]
        sheetName?: string
        columnWidths?: number[]
    }
) {
    const {
        fileName,
        headers,
        sampleData,
        sheetName = 'Template',
        columnWidths
    } = options

    const workbook = createStyledWorkbook(headers, sampleData, sheetName, columnWidths)
    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })

    try {
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
    } catch (e) {
        console.error('Download failed', e)
    }
}
