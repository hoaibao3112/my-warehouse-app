import { NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { query, runTransaction } from '@/lib/prisma'
import { validateExcelUpload } from '@/lib/file-validation'
import * as XLSX from 'xlsx'

interface ImportRow {
  category: string
  code: string
  name: string
  unit: string
  price?: number | string
}

/**
 * @swagger
 * /api/products/import:
 *   post:
 *     summary: Import Products
 *     description: Import products from Excel file.
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
 *         description: Import result
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

    // Get User for Isolation
    const { getAuthToken } = await import('@/lib/auth-server')
    const { verifyToken } = await import('@/lib/auth')
    const token = getAuthToken(request as any)
    const user = token ? verifyToken(token) : null

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
    const priceIdx = headers.findIndex(h => h.includes('Giá') || h.includes('Giá'))

    if (categoryIdx === -1 || codeIdx === -1 || nameIdx === -1 || unitIdx === -1) {
      return NextResponse.json({
        success: false,
        error: 'Missing required columns. Expected: Nhóm hàng/Danh Mục, Mã hàng/Mã Sản Phẩm, Tên hàng/Tên Sản Phẩm, ĐVT/Đơn Vị'
      } as ApiResponse<null>, { status: 400 })
    }

    // Extract data rows
    const dataRows: ImportRow[] = []
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i] as any[]
      const category = String(row[categoryIdx] || '').trim()
      const code = String(row[codeIdx] || '').trim()
      const name = String(row[nameIdx] || '').trim()
      const unit = String(row[unitIdx] || '').trim()
      const priceStr = priceIdx !== -1 ? String(row[priceIdx] || '').trim() : ''
      const price = priceStr ? parseFloat(priceStr) : undefined

      // Skip empty rows
      if (!code || !name) continue

      dataRows.push({ category, code, name, unit, price })
    }

    if (dataRows.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid data rows found' } as ApiResponse<null>, { status: 400 })
    }

    // OPTIMIZED BATCH PROCESSING - Much faster for large imports
    const result = await runTransaction(async (tx) => {
      const startTime = Date.now()

      // STEP 1: Pre-fetch all existing categories and units (1 query each)
      const existingCategories = (await tx.query(
        `SELECT id, name FROM categories`
      )) as Array<{ id: string; name: string }>

      const existingUnits = (await tx.query(
        `SELECT id, code, name FROM product_units`
      )) as Array<{ id: string; code: string; name: string }>

      // STEP 2: Pre-fetch all existing product codes (1 query)
      // STRICT ISOLATION: Check warehouse_id
      // fetch User info if needed, but here we can rely on isolation logic if passed.
      // Actually we need to determine the context.
      // THIS FUNCTION IS GENERIC API, but used by Partner.
      // We must get warehouseId from token or context.

      // Since this is runTransaction, we can't easily get headers inside.
      // Let's get getUser OUTSIDE transaction.
      // !!! MOVED logic to outside transaction !!!

      const warehouseIdFilter = user?.warehouseId ? { warehouse_id: user.warehouseId } : {}
      const warehouseIdSql = user?.warehouseId ? `AND warehouse_id = '${user.warehouseId}'::uuid` : `AND warehouse_id IS NULL`
      // If Partner, only check OWN products.
      // If Admin, checks Global products (where warehouse_id IS NULL) ?? Or all?
      // Admin imports usually go to Global Catalog (warehouse_id IS NULL).

      const existingProductCodes = (await tx.query(
        `SELECT code, id FROM products WHERE code IN (${dataRows.map(() => '?').join(',')}) ${warehouseIdSql}`,
        dataRows.map(row => row.code)
      )) as Array<{ code: string; id: string }>

      const existingProductMap = new Map(existingProductCodes.map(p => [p.code, p.id]))
      const categoryMap = new Map(existingCategories.map(c => [c.name, c.id]))
      const unitMapByCode = new Map(existingUnits.map(u => [u.code, u.id]))
      const unitMapByName = new Map(existingUnits.map(u => [u.name, u.id]))

      // CHECK PREVIEW MODE
      const preview = formData.get('preview') === 'true'

      // STEP 3: Identify and create missing categories in BULK
      const uniqueCategories = [...new Set(dataRows.map(row => row.category).filter(Boolean))]
      const missingCategories = uniqueCategories.filter(cat => !categoryMap.has(cat))
      const createdCategoriesList: any[] = []

      if (missingCategories.length > 0) {
        if (!preview) {
           // Warehouse Isolation for Categories
           const whId = user?.warehouseId ? `'${user.warehouseId}'` : 'NULL'
           
           const categoryValues = missingCategories.map(cat => `('${cat.replace(/'/g, "''")}', ${whId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).join(',')
           const newCategories = (await tx.query(
             `INSERT INTO categories (name, warehouse_id, created_at, updated_at) 
              VALUES ${categoryValues} 
              RETURNING id, name`
           )) as Array<{ id: string; name: string }>
   
           // Update category map
           newCategories.forEach(cat => categoryMap.set(cat.name, cat.id))
        } else {
           // In preview, we just track them
           missingCategories.forEach(cat => createdCategoriesList.push(cat))
           // We can't update map with IDs since they don't exist yet
        }
      }

      // STEP 4: Identify and create missing units in BULK
      const uniqueUnits = [...new Set(dataRows.map(row => row.unit).filter(Boolean))]
      const missingUnits = uniqueUnits.filter(unit => {
        const unitCode = unit.toUpperCase().replace(/\s+/g, '_')
        return !unitMapByCode.has(unitCode) && !unitMapByName.has(unit)
      })
      const createdUnitsList: any[] = []

      if (missingUnits.length > 0) {
        if (!preview) {
            // Warehouse Isolation for Units
            const whId = user?.warehouseId ? `'${user.warehouseId}'` : 'NULL'

            const unitValues = missingUnits.map(unit => {
              const unitCode = unit.toUpperCase().replace(/\s+/g, '_')
              return `('${unitCode}', '${unit.replace(/'/g, "''")}', ${whId}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
            }).join(',')
    
            const newUnits = (await tx.query(
              `INSERT INTO product_units (code, name, warehouse_id, created_at, updated_at) 
               VALUES ${unitValues} 
               RETURNING id, code, name`
            )) as Array<{ id: string; code: string; name: string }>
    
            // Update unit maps
            newUnits.forEach(unit => {
              unitMapByCode.set(unit.code, unit.id)
              unitMapByName.set(unit.name, unit.id)
            })
        } else {
             missingUnits.forEach(u => createdUnitsList.push(u))
        }
      }

      // STEP 5: Prepare products for UPSERT
      const productsToInsert: any[] = []
      const productsToUpdate: any[] = []

      dataRows.forEach(row => {
        // In preview, we might not have IDs for new cats/units, so map is partial
        const categoryId = row.category ? categoryMap.get(row.category) || null : null
        const unitCode = row.unit ? row.unit.toUpperCase().replace(/\s+/g, '_') : null
        const unitId = unitCode ? (unitMapByCode.get(unitCode) || unitMapByName.get(row.unit) || null) : null

        const productData = {
          code: row.code,
          name: row.name,
          category_id: categoryId,
          unit_id: unitId,
          price: row.price || null,
          // Extra fields for preview
          category_name: row.category,
          unit_name: row.unit
        }

        if (existingProductMap.has(row.code)) {
          productsToUpdate.push({ ...productData, id: existingProductMap.get(row.code) })
        } else {
          productsToInsert.push(productData)
        }
      })

      let createdCount = 0
      let updatedCount = 0

      if (preview) {
         // Return Preview Data
         return {
             preview: true,
             newProducts: productsToInsert,
             updatedProducts: productsToUpdate,
             newCategories: createdCategoriesList,
             newUnits: createdUnitsList
         }
      }

      // STEP 6: Bulk INSERT new products (1 query for all new products)
      if (productsToInsert.length > 0) {
        // Split into batches of 500 to avoid query size limits
        const batchSize = 500
        for (let i = 0; i < productsToInsert.length; i += batchSize) {
          const batch = productsToInsert.slice(i, i + batchSize)
          const insertValues = batch.map(p =>
            `('${p.code.replace(/'/g, "''")}', '${p.name.replace(/'/g, "''")}', ${p.category_id ? `'${p.category_id}'::uuid` : 'NULL'}, ${p.unit_id ? `'${p.unit_id}'::uuid` : 'NULL'}, ${p.price || 'NULL'}, ${user?.warehouseId ? `'${user.warehouseId}'` : 'NULL'}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
          ).join(',')

          await tx.query(
            `INSERT INTO products (code, name, category_id, unit_id, price, warehouse_id, created_at, updated_at) 
             VALUES ${insertValues}`
          )
          createdCount += batch.length
        }
      }

      // STEP 7: Bulk UPDATE existing products (batch updates)
      if (productsToUpdate.length > 0) {
        // Use CASE statements for bulk update
        const batchSize = 500
        for (let i = 0; i < productsToUpdate.length; i += batchSize) {
          const batch = productsToUpdate.slice(i, i + batchSize)
          const ids = batch.map(p => `'${p.id}'::uuid`).join(',')

          const nameCases = batch.map(p =>
            `WHEN id = '${p.id}'::uuid THEN '${p.name.replace(/'/g, "''")}'`
          ).join(' ')

          const categoryCases = batch.map(p =>
            `WHEN id = '${p.id}'::uuid THEN ${p.category_id ? `'${p.category_id}'::uuid` : 'NULL'}`
          ).join(' ')

          const unitCases = batch.map(p =>
            `WHEN id = '${p.id}'::uuid THEN ${p.unit_id ? `'${p.unit_id}'::uuid` : 'NULL'}`
          ).join(' ')

          const priceCases = batch.map(p =>
            `WHEN id = '${p.id}'::uuid THEN ${p.price || 'NULL'}`
          ).join(' ')

          await tx.query(
            `UPDATE products SET 
               name = CASE ${nameCases} END,
               category_id = CASE ${categoryCases} END,
               unit_id = CASE ${unitCases} END,
               price = CASE ${priceCases} END,
               updated_at = CURRENT_TIMESTAMP
             WHERE id IN (${ids})`
          )
          updatedCount += batch.length
        }
      }

      const endTime = Date.now()
      const duration = endTime - startTime

      return {
        total: dataRows.length,
        created: createdCount,
        updated: updatedCount,
        duration_ms: duration,
        performance: `Processed ${dataRows.length} products in ${duration}ms (${Math.round(dataRows.length / (duration / 1000))} products/sec)`
      }
    }, { timeout: 60000 }) // 60 seconds timeout for very large imports

    return NextResponse.json({
      success: true,
      data: result,
      message: `Import completed: ${result.created} created, ${result.updated} updated`
    } as ApiResponse<any>)

  } catch (err: any) {
    console.error('Import error:', err)
    return NextResponse.json({ success: false, error: err?.message || String(err) } as ApiResponse<null>, { status: 500 })
  }
}
