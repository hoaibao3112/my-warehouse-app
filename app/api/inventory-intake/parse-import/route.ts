import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { validateExcelUpload } from '@/lib/file-validation'
import * as XLSX from 'xlsx'
import { prisma } from '@/lib/prisma'

interface ImportRow {
  code: string
  name: string
  quantity: number
  unitId?: string
}

/**
 * POST /api/inventory-intake/parse-import
 * Parse Excel file for inventory intake import
 * Returns list of products with quantities - does NOT create intake
 *
 * Expected columns:
 * - Mã Sản Phẩm (Product Code) - required
 * - Tên Sản Phẩm (Product Name) - required
 * - Số Lượng (Quantity) - required
 * - Đơn Vị (Unit) - optional, defaults to product's base unit
 */
export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // SECURITY: Validate file before processing
    const validation = await validateExcelUpload(file)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Read Excel file
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })

    // Get first sheet
    const firstSheetName = workbook.SheetNames[0]
    const worksheet = workbook.Sheets[firstSheetName]

    // Convert to JSON
    const rawData = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1, defval: '' })

    if (rawData.length < 2) {
      return NextResponse.json(
        { success: false, error: 'File is empty or has no data rows' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Parse header row
    const headers = rawData[0] as string[]
    const codeIdx = headers.findIndex(h =>
      h.includes('Mã Sản Phẩm') || h.includes('Mã hàng') || h.includes('Code')
    )
    const nameIdx = headers.findIndex(h =>
      h.includes('Tên Sản Phẩm') || h.includes('Tên hàng') || h.includes('Name')
    )
    const quantityIdx = headers.findIndex(h =>
      h.includes('Số Lượng') || h.includes('Quantity') || h.includes('Tồn Kho')
    )
    const unitIdx = headers.findIndex(h =>
      h.includes('Đơn Vị') || h.includes('Unit') || h.includes('Đơn vị')
    )

    if (codeIdx === -1 || nameIdx === -1 || quantityIdx === -1) {
      return NextResponse.json({
        success: false,
        error: 'Missing required columns. Expected: Mã Sản Phẩm, Tên Sản Phẩm, Số Lượng'
      } as ApiResponse<null>,
        { status: 400 })
    }

    // Extract data rows
    const dataRows: ImportRow[] = []
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as any[]
      const code = String(row[codeIdx] || '').trim()
      const name = String(row[nameIdx] || '').trim()
      const quantityStr = String(row[quantityIdx] || '0').trim()
      const unitName = unitIdx !== -1 ? String(row[unitIdx] || '').trim() : ''
      const quantity = parseInt(quantityStr) || 0

      // Skip empty rows
      if (!code || !name) continue

      dataRows.push({ code, name, quantity, unitId: unitName })
    }

    if (dataRows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid data rows found' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // OPTIMIZED: Pre-fetch all products and units in batch
    const startTime = Date.now()

    // Get all product codes from import file
    const productCodes = dataRows.map(row => row.code)

    // STEP 1: Fetch all products in one query
    const products = await prisma.products.findMany({
      where: {
        code: {
          in: productCodes
        }
      },
      include: {
        product_units: true,
        categories: true
      }
    })

    // Create a map for quick lookup
    const productMap = new Map(products.map(p => [p.code, p]))

    // STEP 2: Fetch all units in one query (if needed)
    const uniqueUnitNames = [...new Set(dataRows.map(row => row.unitId).filter(Boolean))] as string[]
    let unitMap = new Map<string, { id: string; name: string }>()

    if (uniqueUnitNames.length > 0) {
      const units = await prisma.product_units.findMany({
        where: {
          name: {
            in: uniqueUnitNames,
            mode: 'insensitive'
          }
        }
      })
      unitMap = new Map(units.map(u => [u.name.toLowerCase(), { id: u.id, name: u.name }]))
    }

    // STEP 3: Fetch product package units for conversion calculation
    const productIds = products.map(p => p.id)
    const packageUnits = await prisma.product_package_units.findMany({
      where: {
        product_id: {
          in: productIds
        }
      },
      include: {
        product_units: true
      }
    })

    // Create package units map: productId -> (packageUnitId -> multiplier)
    const packageUnitsMap = new Map<string, Map<string, { multiplier: number; unitName: string }>>()
    for (const pkg of packageUnits) {
      if (!packageUnitsMap.has(pkg.product_id)) {
        packageUnitsMap.set(pkg.product_id, new Map())
      }
      packageUnitsMap.get(pkg.product_id)!.set(pkg.package_unit_id, {
        multiplier: Number(pkg.base_quantity),
        unitName: pkg.product_units.name
      })
    }

    // STEP 4: Process all rows using the pre-fetched data
    const result = dataRows.map((row) => {
      const product = productMap.get(row.code)

      if (!product) {
        return {
          success: false,
          error: `Product not found: ${row.code}`,
          code: row.code,
          name: row.name,
          quantity: row.quantity
        }
      }

      // Find unit by name
      let unitId = product.unit_id
      let unitName = product.product_units?.name || ''
      const baseUnitId = product.unit_id
      const baseUnitName = product.product_units?.name || ''

      // If unit is specified in Excel, validate it
      if (row.unitId) {
        const unit = unitMap.get(row.unitId.toLowerCase())
        if (unit) {
          unitId = unit.id
          unitName = unit.name

          // Validate: unit must be either base unit OR have a conversion
          if (unitId !== baseUnitId) {
            const productPackages = packageUnitsMap.get(product.id)
            if (!productPackages || !productPackages.has(unitId)) {
              // Unit exists but has no conversion for this product
              return {
                success: false,
                error: `Đơn vị "${row.unitId}" không hợp lệ cho sản phẩm "${product.name}". Vui lòng sử dụng đơn vị gốc "${baseUnitName}" hoặc các đơn vị quy đổi đã được cấu hình.`,
                code: row.code,
                name: row.name,
                quantity: row.quantity,
                unitName: row.unitId
              }
            }
          }
        } else {
          // Unit name not found in system
          return {
            success: false,
            error: `Đơn vị "${row.unitId}" không tồn tại trong hệ thống. Vui lòng kiểm tra lại tên đơn vị.`,
            code: row.code,
            name: row.name,
            quantity: row.quantity,
            unitName: row.unitId
          }
        }
      }

      // Calculate conversion if unit differs from base unit
      let baseQuantity = row.quantity
      let conversionInfo: string | undefined

      // Validate quantity
      if (row.quantity <= 0) {
        return {
          success: false,
          error: `Số lượng phải lớn hơn 0`,
          code: row.code,
          name: row.name,
          quantity: row.quantity
        }
      }

      if (unitId !== baseUnitId) {
        // Check if there's a package unit conversion
        const productPackages = packageUnitsMap.get(product.id)
        if (productPackages && productPackages.has(unitId)) {
          const packageInfo = productPackages.get(unitId)!
          baseQuantity = row.quantity * packageInfo.multiplier
          conversionInfo = `${row.quantity} ${unitName} = ${baseQuantity} ${baseUnitName}`
        }
      }

      return {
        success: true,
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        categoryName: product.categories?.name || '',
        quantity: row.quantity,
        unitId: unitId,
        unitName: unitName,
        baseUnitId: baseUnitId,
        baseUnitName: baseUnitName,
        baseQuantity: baseQuantity,
        conversionInfo: conversionInfo
      }
    })

    const endTime = Date.now()
    const duration = endTime - startTime

    // Separate successful and failed rows
    const successfulItems = result.filter(r => r.success)
    const failedItems = result.filter(r => !r.success)

    return NextResponse.json(
      {
        success: true,
        data: {
          items: successfulItems,
          errors: failedItems,
          total: dataRows.length,
          successCount: successfulItems.length,
          errorCount: failedItems.length,
          duration_ms: duration,
          message: `Parsed ${successfulItems.length}/${dataRows.length} products in ${duration}ms`
        }
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (err: any) {
    console.error('Parse import error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Parse failed' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
