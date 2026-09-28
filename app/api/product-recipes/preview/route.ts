import { NextResponse, NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { validateExcelUpload } from '@/lib/file-validation'
import * as XLSX from 'xlsx'

async function getUser(request: Request) {
  const token = getAuthToken(request as NextRequest)

  if (!token) return null

  try {
    return verifyToken(token) as any
  } catch (err) {
    return null
  }
}

interface ParsedIngredient {
  productCode: string
  quantity: number
  unitCode: string
}

function parseIngredients(ingredientsStr: string): ParsedIngredient[] {
  if (!ingredientsStr || typeof ingredientsStr !== 'string') return []

  const ingredients: ParsedIngredient[] = []
  const parts = ingredientsStr.split(';').filter(p => p.trim())

  for (const part of parts) {
    const [productCode, quantityStr, unitCode] = part.split(':').map(s => s.trim())
    if (productCode && quantityStr && unitCode) {
      const quantity = parseFloat(quantityStr)
      if (!isNaN(quantity) && quantity > 0) {
        ingredients.push({ productCode, quantity, unitCode })
      }
    }
  }

  return ingredients
}

// POST /api/product-recipes/preview - Preview and validate import data
export async function POST(request: Request) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only AdminKhoTong can preview import
    const isAdminKhoTong = user.role === 'AdminKhoTong' || user.role === 'ADMIN'
    if (!isAdminKhoTong) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = (formData as any).get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    }

    // SECURITY: Validate file before processing
    const validation = await validateExcelUpload(file)
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }

    // Read file
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: 'buffer' })

    // Get first sheet (Import Template)
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: 'File is empty or has no data rows' }, { status: 400 })
    }

    // Skip header row
    const dataRows = rows.slice(1)

    // Pre-fetch all products, units, warehouses, categories for lookup
    const [products, units, warehouses, categories, existingRecipeCodes] = await Promise.all([
      prisma.products.findMany({
        select: { id: true, code: true, name: true }
      }),
      prisma.product_units.findMany({
        select: { id: true, code: true, name: true }
      }),
      prisma.warehouses.findMany({
        where: { type: 'STORE', is_active: true },
        select: { id: true, code: true, name: true }
      }),
      prisma.categories.findMany({
        select: { id: true, name: true }
      }),
      prisma.product_recipes.findMany({
        where: { code: { not: null } },
        select: { code: true }
      })
    ])

    // Create lookup maps (case-insensitive)
    const productMap = new Map(products.map(p => [p.code.toLowerCase(), p]))
    const unitMap = new Map(units.map(u => [u.code.toLowerCase(), u]))
    const warehouseMap = new Map(warehouses.map(w => [w.code.toLowerCase(), w]))
    const categoryMap = new Map(categories.map(c => [c.name.toLowerCase(), c]))
    const existingCodeSet = new Set(existingRecipeCodes.map(r => r.code?.toUpperCase()).filter(Boolean))

    const previewItems: any[] = []
    const importedCodes = new Set<string>() // Track codes within this import file

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowNum = i + 2 // Excel row number (1-indexed + header)

      // Skip empty rows - check name column (row[1]) since code (row[0]) is optional
      if (!row || (!row[0] && !row[1])) continue

      const code = String(row[0] || '').trim().toUpperCase()
      const name = String(row[1] || '').trim()
      const priceStr = String(row[2] || '').trim()
      const categoryName = String(row[3] || '').trim()
      const warehouseCode = String(row[4] || '').trim()
      const ingredientsStr = String(row[5] || '').trim()

      const errors: string[] = []
      const warnings: string[] = []

      // Validate code (optional but must be unique if provided)
      if (code) {
        if (existingCodeSet.has(code)) {
          errors.push(`Mã món "${code}" đã tồn tại trong hệ thống`)
        } else if (importedCodes.has(code)) {
          errors.push(`Mã món "${code}" bị trùng lặp trong file import`)
        } else {
          importedCodes.add(code)
        }
      }

      // Validate name
      if (!name) {
        errors.push('Thiếu tên công thức')
      }

      // Parse and validate ingredients (optional)
      const parsedIngredients = ingredientsStr ? parseIngredients(ingredientsStr) : []
      const validatedIngredients: { code: string; name: string; quantity: string; unit: string; unitName: string }[] = []

      if (ingredientsStr && parsedIngredients.length === 0) {
        errors.push('Định dạng nguyên liệu không hợp lệ')
      }

      for (const ing of parsedIngredients) {
        const product = productMap.get(ing.productCode.toLowerCase())
        const unit = unitMap.get(ing.unitCode.toLowerCase())

        if (!product) {
          errors.push(`Không tìm thấy sản phẩm với mã "${ing.productCode}"`)
        }
        if (!unit) {
          errors.push(`Không tìm thấy đơn vị với mã "${ing.unitCode}"`)
        }

        validatedIngredients.push({
          code: ing.productCode,
          name: product?.name || `(${ing.productCode})`,
          quantity: ing.quantity.toString(),
          unit: ing.unitCode,
          unitName: unit?.name || `(${ing.unitCode})`
        })
      }

      // Validate warehouses (optional)
      const warehouseCodes = warehouseCode
        ? warehouseCode.split(',').map(c => c.trim()).filter(c => c)
        : []
      const validatedWarehouses: { code: string; name: string }[] = []

      for (const code of warehouseCodes) {
        const warehouse = warehouseMap.get(code.toLowerCase())
        if (!warehouse) {
          warnings.push(`Không tìm thấy kho bán với mã "${code}"`)
        } else {
          validatedWarehouses.push({ code: warehouse.code, name: warehouse.name })
        }
      }

      // Validate category (optional)
      let validatedCategory: { name: string } | null = null
      if (categoryName) {
        const category = categoryMap.get(categoryName.toLowerCase())
        if (!category) {
          warnings.push(`Không tìm thấy nhóm hàng "${categoryName}"`)
        } else {
          validatedCategory = { name: category.name }
        }
      }

      // Parse price
      let price: number | null = null
      if (priceStr) {
        const parsedPrice = parseFloat(priceStr.replace(/[,\s]/g, ''))
        if (isNaN(parsedPrice) || parsedPrice < 0) {
          warnings.push('Giá tiền không hợp lệ')
        } else {
          price = parsedPrice
        }
      }

      previewItems.push({
        rowNum,
        code: code || '',
        name: name || '(Không có tên)',
        price: price !== null ? price.toLocaleString('vi-VN') + ' đ' : '',
        category: validatedCategory?.name || categoryName || '',
        categoryValid: !categoryName || !!validatedCategory,
        warehouses: validatedWarehouses.length > 0
          ? validatedWarehouses.map(w => w.name)
          : warehouseCodes.length > 0
            ? warehouseCodes
            : ['Toàn hệ thống'],
        warehouseCount: warehouseCodes.length || 1,
        ingredients: validatedIngredients,
        valid: errors.length === 0,
        errors,
        warnings
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        total: previewItems.length,
        valid: previewItems.filter(p => p.valid).length,
        invalid: previewItems.filter(p => !p.valid).length,
        items: previewItems
      }
    })

  } catch (error: any) {
    console.error('Error previewing recipes:', error)
    return NextResponse.json(
      { error: `Failed to preview recipes: ${error.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}
