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

interface ImportRow {
  code?: string
  name: string
  price?: string
  category?: string
  warehouseCode?: string
  ingredients?: string
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

// POST /api/product-recipes/import - Import recipes from Excel file
export async function POST(request: Request) {
  try {
    const user = await getUser(request)
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only AdminKhoTong can import
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
    const [products, units, warehouses, categories] = await Promise.all([
      prisma.products.findMany({
        select: { id: true, code: true, unit_id: true }
      }),
      prisma.product_units.findMany({
        select: { id: true, code: true }
      }),
      prisma.warehouses.findMany({
        where: { type: 'STORE', is_active: true },
        select: { id: true, code: true }
      }),
      prisma.categories.findMany({
        select: { id: true, name: true }
      })
    ])

    // Create lookup maps (case-insensitive) with proper types
    const productMap = new Map<string, { id: string; code: string; unit_id: string }>(
      products.map(p => [p.code.toLowerCase(), p])
    )
    const unitMap = new Map<string, { id: string; code: string }>(
      units.map(u => [u.code.toLowerCase(), u])
    )
    const warehouseMap = new Map<string, { id: string; code: string }>(
      warehouses.map(w => [w.code.toLowerCase(), w])
    )
    const categoryMap = new Map<string, { id: string; name: string }>(
      categories.map(c => [c.name.toLowerCase(), c])
    )

    const imported: string[] = []
    const errors: string[] = []

    // OPTIMIZED: Collect all recipes and ingredients first
    const startTime = Date.now()
    const recipesToCreate: any[] = []
    const recipeIngredientsToCreate: any[] = []
    const recipeMap = new Map<string, { warehouses: string[], ingredients: any[] }>()

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const rowNum = i + 2

      if (!row || !row[0]) continue

      try {
        const code = String(row[0] || '').trim()
        const name = String(row[1] || '').trim()
        const priceStr = String(row[2] || '').trim()
        const categoryName = String(row[3] || '').trim()
        const warehouseCode = String(row[4] || '').trim()
        const ingredientsStr = String(row[5] || '').trim()

        // Validate required fields
        if (!code) {
          errors.push(`Dòng ${rowNum}: Thiếu mã công thức (bắt buộc)`)
          continue
        }

        if (!name) {
          errors.push(`Dòng ${rowNum}: Thiếu tên công thức`)
          continue
        }

        if (!priceStr) {
          errors.push(`Dòng ${rowNum}: Thiếu giá tiền (bắt buộc)`)
          continue
        }

        if (!categoryName) {
          errors.push(`Dòng ${rowNum}: Thiếu nhóm hàng (bắt buộc)`)
          continue
        }

        // Parse ingredients
        const parsedIngredients = ingredientsStr ? parseIngredients(ingredientsStr) : []

        // Validate and resolve ingredients
        const ingredientsData: { ingredient_id: string; unit_id: string; quantity_required: number }[] = []
        let hasIngredientError = false

        for (const ing of parsedIngredients) {
          const product = productMap.get(ing.productCode.toLowerCase())
          if (!product) {
            errors.push(`Dòng ${rowNum}: Không tìm thấy sản phẩm với mã "${ing.productCode}"`)
            hasIngredientError = true
            continue
          }

          const unit = unitMap.get(ing.unitCode.toLowerCase())
          if (!unit) {
            errors.push(`Dòng ${rowNum}: Không tìm thấy đơn vị với mã "${ing.unitCode}"`)
            hasIngredientError = true
            continue
          }

          ingredientsData.push({
            ingredient_id: product.id,
            unit_id: unit.id,
            quantity_required: ing.quantity
          })
        }

        if (parsedIngredients.length > 0 && hasIngredientError && ingredientsData.length === 0) {
          continue
        }

        // Resolve warehouses
        const warehouseIds: (string | null)[] = []
        if (warehouseCode) {
          const warehouseCodes = warehouseCode.split(',').map(c => c.trim()).filter(c => c)
          const invalidCodes: string[] = []

          for (const whCode of warehouseCodes) {
            const warehouse = warehouseMap.get(whCode.toLowerCase())
            if (!warehouse) {
              invalidCodes.push(whCode)
            } else {
              warehouseIds.push(warehouse.id)
            }
          }

          if (invalidCodes.length > 0) {
            errors.push(`Dòng ${rowNum}: Không tìm thấy kho bán với mã "${invalidCodes.join(', ')}"`)
          }

          if (warehouseIds.length === 0) {
            warehouseIds.push(null)
          }
        } else {
          warehouseIds.push(null)
        }

        // Resolve category
        const category = categoryMap.get(categoryName.toLowerCase())
        if (!category) {
          errors.push(`Dòng ${rowNum}: Không tìm thấy nhóm hàng "${categoryName}"`)
          continue
        }
        const categoryId = category.id

        // Parse price
        const parsedPrice = parseFloat(priceStr.replace(/[,\s]/g, ''))
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
          errors.push(`Dòng ${rowNum}: Giá tiền không hợp lệ "${priceStr}"`)
          continue
        }
        const price = parsedPrice

        // Get output unit
        let outputUnitId: string
        if (ingredientsData.length > 0) {
          outputUnitId = ingredientsData[0].unit_id
        } else {
          const defaultUnit = units[0]
          if (!defaultUnit) {
            errors.push(`Dòng ${rowNum}: Không có đơn vị nào trong hệ thống`)
            continue
          }
          outputUnitId = defaultUnit.id
        }

        // Store for batch creation
        for (const warehouseId of warehouseIds) {
          let recipeCode: string | null = null
          if (code) {
            if (warehouseIds.length > 1 && warehouseId) {
              const warehouse = warehouses.find(w => w.id === warehouseId)
              recipeCode = warehouse ? `${code}-${warehouse.code}` : code
            } else {
              recipeCode = code
            }
          }

          recipesToCreate.push({
            code: recipeCode,
            name,
            warehouse_id: warehouseId,
            category_id: categoryId,
            price: price,
            output_quantity: 1,
            output_unit_id: outputUnitId,
            created_by: user.id,
            _temp_code: code, // Temp field to link ingredients later
            _temp_warehouse_id: warehouseId
          })
        }

        // Store ingredients data for later
        if (!recipeMap.has(code)) {
          recipeMap.set(code, { warehouses: [], ingredients: ingredientsData })
        }
        recipeMap.get(code)!.warehouses.push(...warehouseIds)

        if (warehouseIds.length > 1) {
          imported.push(`${name} (${warehouseIds.length} kho)`)
        } else {
          imported.push(name)
        }
      } catch (err: any) {
        console.error(`Error processing row ${rowNum}:`, err)
        errors.push(`Dòng ${rowNum}: Lỗi xử lý - ${err.message || 'Unknown error'}`)
      }
    }

    // STEP 1: Bulk create all recipes
    if (recipesToCreate.length > 0) {
      console.log(`Creating ${recipesToCreate.length} recipes in bulk...`)

      // Remove temp fields before creating
      const cleanRecipes = recipesToCreate.map(r => {
        const { _temp_code, _temp_warehouse_id, ...clean } = r
        return clean
      })

      const createdRecipes = await prisma.product_recipes.createManyAndReturn({
        data: cleanRecipes
      })

      // STEP 2: Map created recipes to ingredients
      for (let i = 0; i < recipesToCreate.length; i++) {
        const tempRecipe = recipesToCreate[i]
        const createdRecipe = createdRecipes[i]
        const recipeData = recipeMap.get(tempRecipe._temp_code)

        if (recipeData && recipeData.ingredients.length > 0) {
          for (const ing of recipeData.ingredients) {
            recipeIngredientsToCreate.push({
              recipe_id: createdRecipe.id,
              ingredient_id: ing.ingredient_id,
              unit_id: ing.unit_id,
              quantity_required: ing.quantity_required
            })
          }
        }
      }

      // STEP 3: Bulk create all recipe ingredients
      if (recipeIngredientsToCreate.length > 0) {
        console.log(`Creating ${recipeIngredientsToCreate.length} recipe ingredients in bulk...`)
        await prisma.recipe_ingredients.createMany({
          data: recipeIngredientsToCreate
        })
      }
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      data: {
        imported: imported.length,
        importedNames: imported,
        errors: errors,
        performance: {
          total_recipes: recipesToCreate.length,
          total_ingredients: recipeIngredientsToCreate.length,
          duration_ms: duration,
          throughput: recipesToCreate.length > 0 ? `${Math.round(recipesToCreate.length / (duration / 1000))} recipes/sec` : 'N/A'
        }
      }
    })

  } catch (error: any) {
    console.error('Error importing recipes:', error)
    return NextResponse.json(
      { error: `Failed to import recipes: ${error.message || 'Unknown error'}` },
      { status: 500 }
    )
  }
}
