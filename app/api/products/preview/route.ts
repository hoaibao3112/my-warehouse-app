import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { query } from '@/lib/prisma'
import { validateExcelUpload } from '@/lib/file-validation'
import * as XLSX from 'xlsx'

interface PreviewRow {
    row: number
    code: string
    name: string
    category: string
    unit: string
    price?: number
    status: 'new' | 'update' | 'error'
    message?: string
}

/**
 * @swagger
 * /api/products/preview:
 *   post:
 *     summary: Preview Products Import
 *     description: Parse Excel file and preview products before importing. Shows which products are new vs will be updated.
 *     tags: [Products]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Preview result with all items and their status
 *       400:
 *         description: Invalid file
 */
export async function POST(request: Request) {
    try {
        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' } as ApiResponse<null>, { status: 400 })
        }

        // SECURITY: Validate file before processing
        const validation = await validateExcelUpload(file)
        if (!validation.valid) {
            return NextResponse.json({ success: false, error: validation.error } as ApiResponse<null>, { status: 400 })
        }

        // Read Excel file
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })

        // Get first sheet
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]

        // Convert to JSON (with header row)
        const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' })

        if (rawData.length < 2) {
            return NextResponse.json({ success: false, error: 'File is empty or has no data rows' } as ApiResponse<null>, { status: 400 })
        }

        // Parse header row to find column indices
        const headers = rawData[0] as string[]
        const categoryIdx = headers.findIndex(h => h.includes('Nhóm hàng') || h.includes('Danh Mục'))
        const codeIdx = headers.findIndex(h => h.includes('Mã hàng') || h.includes('Mã Sản Phẩm'))
        const nameIdx = headers.findIndex(h => h.includes('Tên hàng') || h.includes('Tên Sản Phẩm'))
        const unitIdx = headers.findIndex(h => h.includes('ĐVT') || h.includes('Đơn Vị'))
        const priceIdx = headers.findIndex(h => h.includes('Giá'))

        if (codeIdx === -1 || nameIdx === -1) {
            return NextResponse.json({
                success: false,
                error: 'Missing required columns. Expected: Mã hàng/Mã Sản Phẩm, Tên hàng/Tên Sản Phẩm'
            } as ApiResponse<null>, { status: 400 })
        }

        // Get existing products by code for comparison
        const existingProducts = (await query(`SELECT code, name FROM products`)) as any[]
        const existingProductMap = new Map(existingProducts.map(p => [p.code.toLowerCase(), p]))

        // Parse data and create preview items
        const previewItems: PreviewRow[] = []
        let newCount = 0
        let updateCount = 0
        let errorCount = 0

        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i] as any[]
            const code = String(row[codeIdx] || '').trim()
            const name = String(row[nameIdx] || '').trim()
            const category = categoryIdx !== -1 ? String(row[categoryIdx] || '').trim() : ''
            const unit = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : ''
            const priceStr = priceIdx !== -1 ? String(row[priceIdx] || '').trim() : ''
            const price = priceStr ? parseFloat(priceStr.replace(/[^0-9.-]/g, '')) : undefined

            // Skip empty rows
            if (!code && !name) continue

            // Validate required fields
            if (!code) {
                previewItems.push({
                    row: i + 1,
                    code: '',
                    name,
                    category,
                    unit,
                    price,
                    status: 'error',
                    message: 'Thiếu mã sản phẩm'
                })
                errorCount++
                continue
            }

            if (!name) {
                previewItems.push({
                    row: i + 1,
                    code,
                    name: '',
                    category,
                    unit,
                    price,
                    status: 'error',
                    message: 'Thiếu tên sản phẩm'
                })
                errorCount++
                continue
            }

            // Check if product already exists
            const existing = existingProductMap.get(code.toLowerCase())
            if (existing) {
                previewItems.push({
                    row: i + 1,
                    code,
                    name,
                    category,
                    unit,
                    price,
                    status: 'update',
                    message: `Ghi đè: "${existing.name}"`
                })
                updateCount++
            } else {
                previewItems.push({
                    row: i + 1,
                    code,
                    name,
                    category,
                    unit,
                    price,
                    status: 'new',
                    message: 'Thêm mới'
                })
                newCount++
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                items: previewItems,
                summary: {
                    total: previewItems.length,
                    new: newCount,
                    update: updateCount,
                    error: errorCount
                }
            }
        } as ApiResponse<any>)

    } catch (err: any) {
        console.error('Preview error:', err)
        return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
    }
}
