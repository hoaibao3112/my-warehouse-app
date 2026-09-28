import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'
import * as XLSX from 'xlsx'
import { validateExcelUpload } from '@/lib/file-validation'

export async function POST(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File

        if (!file) {
            return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 })
        }

        // Validate file (allow Excel)
        // We can use validateExcelUpload from lib/file-validation if it exists, otherwise manual check
        // app/api/inventory-intake/parse-import uses validateExcelUpload, so it likely exists.
        // If not, we'll check mime type.

        // Read buffer
        const arrayBuffer = await file.arrayBuffer()
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]

        // Convert to JSON
        const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' })

        if (rawData.length < 2) {
            return NextResponse.json({ success: false, error: 'File is empty' }, { status: 400 })
        }

        // Headers: ["Tên Nhà Cung Cấp", "Người Liên Hệ", "Email", "Điện Thoại", "Địa Chỉ", "Mã Sản Phẩm & Giá"]
        const headers = rawData[0] as string[]

        // Map headers to columns
        // We'll use fuzzy matching or exact matching
        const nameIdx = headers.findIndex(h => h.includes('Tên Nhà Cung Cấp'))
        const contactIdx = headers.findIndex(h => h.includes('Người Liên Hệ'))
        const emailIdx = headers.findIndex(h => h.includes('Email'))
        const phoneIdx = headers.findIndex(h => h.includes('Điện Thoại'))
        const addressIdx = headers.findIndex(h => h.includes('Địa Chỉ'))
        const productsIdx = headers.findIndex(h => h.includes('Mã Sản Phẩm & Giá'))

        if (nameIdx === -1) {
            return NextResponse.json({
                success: false,
                error: 'Thiếu cột "Tên Nhà Cung Cấp". Vui lòng tải template mới nhất.'
            }, { status: 400 })
        }

        const items = []
        const errors = []

        for (let i = 1; i < rawData.length; i++) {
            const row = rawData[i]
            const name = String(row[nameIdx] || '').trim()

            // Skip empty rows
            if (!name) continue

            const contact_person = contactIdx !== -1 ? String(row[contactIdx] || '').trim() : ''
            const email = emailIdx !== -1 ? String(row[emailIdx] || '').trim() : ''
            const phone = phoneIdx !== -1 ? String(row[phoneIdx] || '').trim() : ''
            const address = addressIdx !== -1 ? String(row[addressIdx] || '').trim() : ''
            const productsStr = productsIdx !== -1 ? String(row[productsIdx] || '').trim() : ''

            // Validate basic
            const rowErrors = []
            if (!name) rowErrors.push('Thiếu tên nhà cung cấp')
            if (email && !email.includes('@')) rowErrors.push('Email không hợp lệ')

            // Parse products string: "P001:25000;P002:35000"
            const products = []
            if (productsStr) {
                const pairs = productsStr.split(';')
                for (const pair of pairs) {
                    const [code, priceStr] = pair.split(':').map(s => s.trim())
                    if (code && priceStr) {
                        const price = parseFloat(priceStr)
                        if (!isNaN(price)) {
                            products.push({ code, price })
                        }
                    }
                }
            }

            if (rowErrors.length > 0) {
                errors.push({ row: i + 1, error: rowErrors.join(', '), name })
            } else {
                // Check if exists
                const existing = await prisma.suppliers.findFirst({
                    where: { name: name }
                })

                items.push({
                    name,
                    contact_person,
                    email,
                    phone,
                    address,
                    products,
                    status: existing ? 'UPDATE' : 'NEW'
                })
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                items,
                errors,
                total: rawData.length - 1
            }
        })

    } catch (error: any) {
        console.error('Parse supplier import error:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
