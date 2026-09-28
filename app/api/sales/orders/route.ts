import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { query } from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { getAuthToken } from '@/lib/auth-server'
import { getVietnamToday, addDays } from '@/lib/server-time'

/**
 * @swagger
 * /api/sales/orders:
 *   post:
 *     summary: Create Sales Order
 *     description: Create a complex sales order with multiple items, vouchers, and payment methods.
 *     tags: [Sales]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [items, total_amount, payment_method]
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     product_id:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unit_price:
 *                       type: number
 *               voucher_id:
 *                 type: string
 *               total_amount:
 *                 type: number
 *               payment_method:
 *                 type: string
 *                 enum: [CASH, TRANSFER, EWALLET]
 *               customer_payment:
 *                 type: number
 *     responses:
 *       201:
 *         description: Order created
 *       400:
 *         description: Invalid input
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const token = getAuthToken(req)
    const payload = token ? verifyToken(token) : null

    if (!payload) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" } as ApiResponse<null>,
        { status: 401 }
      )
    }

    // Get current user info
    const user = await prisma.users.findUnique({
      where: { id: payload.id },
      select: { id: true, role: true, warehouse_id: true, full_name: true }
    })

    if (!user) {
      return NextResponse.json(
        { success: false, error: "User not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    if (!user.warehouse_id) {
      return NextResponse.json(
        { success: false, error: "User not assigned to any warehouse" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Check for active SALES session - all users MUST have opened a sales session
    let salesSession: any = null
    const today = getVietnamToday()
    const tomorrow = addDays(today, 1)

    // Get sales session with status IN_PROGRESS
    salesSession = await prisma.sales_sessions.findFirst({
      where: {
        user_id: user.id,
        session_date: {
          gte: today,
          lt: tomorrow
        },
        status: "IN_PROGRESS"
      }
    })

    if (!salesSession) {
      // Check if there's a closed sales session to give appropriate error message
      const closedSession = await prisma.sales_sessions.findFirst({
        where: {
          user_id: user.id,
          session_date: {
            gte: today,
            lt: tomorrow
          },
          status: { not: "IN_PROGRESS" }
        }
      })

      if (closedSession) {
        return NextResponse.json(
          { success: false, error: "Ca bán hàng đã đóng. Vui lòng mở ca mới để tiếp tục bán hàng." } as ApiResponse<null>,
          { status: 400 }
        )
      }

      return NextResponse.json(
        { success: false, error: "Vui lòng mở ca bán hàng trước khi tạo đơn hàng" } as ApiResponse<null>,
        { status: 400 }
      )
    }

    const body = await req.json()
    const {
      items,
      bonus_items, // Gift items (Buy 1 Get 1) - calculated dynamically from frontend
      voucher_id,
      promotion_id,
      gift_promotion_id,
      discount_amount,
      total_amount,
      customer_payment,
      change,
      payment_method,
      ewallet_type,
      has_vat,
      vat_amount,
    } = body || {}

    if (!items || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Giỏ hàng trống' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Use the user's assigned warehouse
    const warehouse = await prisma.warehouses.findUnique({
      where: { id: user.warehouse_id }
    })

    if (!warehouse) {
      return NextResponse.json(
        { success: false, error: 'Không tìm thấy kho hàng được gán' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // OPTIMIZED BATCH PROCESSING - Much faster for sales orders
    const startTime = Date.now()

    // Check if there are bonus items from GIFT promotion (Buy 1 Get 1)
    const hasBonusItems = bonus_items && Array.isArray(bonus_items) && bonus_items.length > 0

    // ============================================================
    // CRITICAL: VALIDATE INGREDIENTS BEFORE CREATING INVOICE
    // This prevents invoice creation when ingredients are insufficient
    // ============================================================

    // Import deduction service for validation
    const { deductionService } = await import('@/lib/services')

    // Step 1: Get all recipes for validation
    const recipeIds = items.map((item: any) => item.product_id)
    const recipes = await prisma.product_recipes.findMany({
      where: { id: { in: recipeIds } },
      include: { recipe_ingredients: true }
    })

    // Step 2: Validate regular sale items
    const validationData = []
    for (const item of items) {
      const recipe = recipes.find(r => r.id === item.product_id)
      if (recipe && recipe.recipe_ingredients.length > 0) {
        validationData.push({
          recipeId: recipe.id,
          recipeName: recipe.name,
          warehouseId: warehouse.id,
          quantitySold: item.quantity
        })
      }
    }

    if (validationData.length > 0) {
      console.log(`🔍 Validating ${validationData.length} recipes before creating invoice`)
      const validationResults = await deductionService.batchValidateRecipeIngredients(validationData)

      const insufficientItems = validationResults.filter(r => r.insufficient.length > 0)

      if (insufficientItems.length > 0) {
        // Separete Stock Errors vs Conversion Errors
        const conversionErrors = insufficientItems.flatMap(item =>
          item.insufficient
            .filter(ing => ing.required === -1 && ing.available === -1)
            .map(ing => `${item.recipeName}: ${ing.unit}`)
        )

        const stockErrors = insufficientItems.flatMap(item =>
          item.insufficient
            .filter(ing => ing.required !== -1)
            .map(ing => `${item.recipeName}: Thiếu ${ing.productCode} (${ing.productName}) - Cần: ${ing.required} ${ing.unit}, Có: ${ing.available} ${ing.unit}`)
        )

        // CRITICAL: Only block if there are CONVERSION ERRORS (Data configuration issues)
        if (conversionErrors.length > 0) {
          console.error('❌ Validation blocked due to conversion errors:', conversionErrors.join('; '))
          return NextResponse.json(
            { success: false, error: 'Lỗi cấu hình quy đổi:\n' + conversionErrors.join('\n') } as ApiResponse<null>,
            { status: 400 }
          )
        }

        // WARN: Log stock errors but ALLOW PROCEEDING (Negative Stock)
        // Treated as standard flow, no warning needed as per user request.
        if (stockErrors.length > 0) {
          // Silently proceed
        }
      }
      console.log('✅ Validation checks completed')
    }

    // Step 3: Validate bonus items (if any)
    if (hasBonusItems) {
      const bonusValidationData = []
      for (const bonusItem of bonus_items) {
        const recipe = await prisma.product_recipes.findUnique({
          where: { id: bonusItem.product_id },
          select: { id: true, name: true, recipe_ingredients: true }
        })

        if (recipe && recipe.recipe_ingredients.length > 0) {
          bonusValidationData.push({
            recipeId: recipe.id,
            recipeName: recipe.name,
            warehouseId: warehouse.id,
            quantitySold: bonusItem.quantity
          })
        }
      }

      if (bonusValidationData.length > 0) {
        console.log(`🔍 Validating ${bonusValidationData.length} bonus recipes`)
        const bonusValidationResults = await deductionService.batchValidateRecipeIngredients(bonusValidationData)

        const insufficientBonusItems = bonusValidationResults.filter(r => r.insufficient.length > 0)

        if (insufficientBonusItems.length > 0) {
          // Separete Stock Errors vs Conversion Errors
          const conversionErrors = insufficientBonusItems.flatMap(item =>
            item.insufficient
              .filter(ing => ing.required === -1 && ing.available === -1)
              .map(ing => `${item.recipeName}: ${ing.unit}`)
          )

          const stockErrors = insufficientBonusItems.flatMap(item =>
            item.insufficient
              .filter(ing => ing.required !== -1)
              .map(ing => `${item.recipeName} (Quà tặng): Thiếu ${ing.productCode} - Cần: ${ing.required} ${ing.unit}, Có: ${ing.available} ${ing.unit}`)
          )

          // CRITICAL: Only block if there are CONVERSION ERRORS (Data configuration issues)
          if (conversionErrors.length > 0) {
            console.error('❌ Bonus validation blocked due to conversion errors:', conversionErrors.join('; '))
            return NextResponse.json(
              { success: false, error: 'Lỗi cấu hình quy đổi (Quà tặng):\n' + conversionErrors.join('\n') } as ApiResponse<null>,
              { status: 400 }
            )
          }

          // WARN: Log stock errors but ALLOW PROCEEDING (Negative Stock)
          // Treated as standard flow, no warning needed.
          if (stockErrors.length > 0) {
            // Silently proceed
          }
        }
        console.log('✅ All bonus ingredients validated successfully (or warnings logged)')
      }
    }

    // ============================================================
    // END OF VALIDATION - Proceed with invoice creation
    // ============================================================

    // Generate invoice number
    const date = new Date()
    const invoiceNumber = `HD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`

    // Build notes with promotion/voucher info and payment method
    let notes = ''
    const notesParts: string[] = []

    if (promotion_id) {
      const promotion = await prisma.promotions.findUnique({ where: { id: promotion_id } })
      notesParts.push(`Promotion: ${promotion?.name || promotion_id}`)
    }

    if (gift_promotion_id) {
      const giftPromotion = await prisma.promotions.findUnique({ where: { id: gift_promotion_id } })
      notesParts.push(`Gift: ${giftPromotion?.name || gift_promotion_id}`)
    }

    if (voucher_id) {
      const voucher = await prisma.vouchers.findUnique({ where: { id: voucher_id } })
      notesParts.push(`Voucher: ${voucher?.code || voucher_id}`)
    }

    // Calculate bonus items value for GIFT promotions (Buy 1 Get 1)
    let bonus_items_value = 0
    if (hasBonusItems) {
      for (const bonusItem of bonus_items) {
        const originalItem = items.find((item: any) => item.product_id === bonusItem.product_id)
        if (originalItem && originalItem.unit_price > 0) {
          bonus_items_value += (bonusItem.quantity * originalItem.unit_price)
        } else {
          const recipe = await prisma.product_recipes.findUnique({
            where: { id: bonusItem.product_id },
            select: { price: true }
          })
          if (recipe && recipe.price) {
            const price = parseFloat(recipe.price.toString())
            bonus_items_value += (bonusItem.quantity * price)
          }
        }
      }
      console.log('🎁 Bonus items value (gift value):', bonus_items_value)

      if (bonus_items_value > 0) {
        notesParts.push(`Quà tặng kèm: ${bonus_items_value.toLocaleString('vi-VN')}đ`)
      }
    }

    // Total discount includes both regular discount and bonus items value
    const total_discount_amount = (discount_amount || 0) + bonus_items_value

    if (total_discount_amount > 0) {
      notesParts.push(`Giảm/Tặng: ${Number(total_discount_amount).toLocaleString('vi-VN')}đ`)
    }

    // Add payment method info
    if (payment_method === 'CASH') {
      notesParts.push(`Thanh toán: Tiền mặt (Khách đưa: ${Number(customer_payment).toLocaleString('vi-VN')}đ, Thối: ${Number(change).toLocaleString('vi-VN')}đ)`)
    } else if (payment_method === 'TRANSFER') {
      notesParts.push(`Thanh toán: Chuyển khoản`)
    } else if (payment_method === 'EWALLET') {
      notesParts.push(`Thanh toán: Ví Điện Tử (${ewallet_type || 'N/A'})`)
    }

    notes = notesParts.join(' | ')

    // CRITICAL: Check for IN_PROGRESS inventory check
    const { checkInventoryCheckLock } = await import('@/lib/inventory-check-lock')
    const lockCheck = await checkInventoryCheckLock(warehouse.id)

    if (lockCheck.isLocked) {
      return NextResponse.json(
        { success: false, error: lockCheck.message } as ApiResponse<null>,
        { status: 423 }
      )
    }

    // Transaction to create invoice + deduct ingredients + update voucher + update session
    const invoice = await prisma.$transaction(async (tx) => {
      // Create sales invoice
      const newInvoice = await tx.sales_invoices.create({
        data: {
          invoice_number: invoiceNumber,
          warehouse_id: warehouse.id,
          sales_session_id: salesSession?.id || null,
          total_amount: total_amount,
          discount_amount: total_discount_amount,
          promotion_id: promotion_id || null,
          gift_promotion_id: gift_promotion_id || null,
          voucher_id: voucher_id || null,
          notes: notes || undefined,
          created_by: user.id,
          has_vat: has_vat || false,
          vat_amount: vat_amount || 0,
        },
      })

      // STEP 1: Bulk create invoice items FIRST (needed for deduction service)
      const invoiceItemsData = items.map((item: any) => ({
        invoice_id: newInvoice.id,
        recipe_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        line_total: item.quantity * item.unit_price,
      }))

      console.log(`📝 Creating ${invoiceItemsData.length} invoice items in bulk`)
      await tx.sales_invoice_items.createMany({
        data: invoiceItemsData
      })

      // Get created invoice items for reference (using tx)
      const createdItems = await tx.sales_invoice_items.findMany({
        where: { invoice_id: newInvoice.id }
      })

      // STEP 2: Deduct ingredients for regular sale items using BATCH DeductionService
      console.log(`🔧 Processing ${items.length} regular sale items through BATCH DeductionService`)

      // Prepare batch data
      const batchDeductionData = []
      for (const item of items) {
        const recipe = recipes.find(r => r.id === item.product_id)
        const invoiceItem = createdItems.find(i => i.recipe_id === item.product_id)

        if (recipe && recipe.recipe_ingredients.length > 0 && invoiceItem) {
          batchDeductionData.push({
            invoiceId: newInvoice.id,
            invoiceItemId: invoiceItem.id,
            recipeId: recipe.id,
            recipe: recipe, // Pass pre-fetched recipe to avoid re-query
            warehouseId: warehouse.id,
            quantitySold: item.quantity
          })
        }
      }

      // Batch process all regular items in SINGLE transaction (passed tx)
      if (batchDeductionData.length > 0) {
        try {
          // Pass tx to ensure atomicity
          const deductionIds = await deductionService.batchCreateRecipeDeductions(batchDeductionData, tx)
          console.log(`✅ Batch deducted ${deductionIds.length} items in single transaction`)
        } catch (deductionError: any) {
          console.error(`❌ Batch deduction failed:`, deductionError.message)
          throw new Error(`Không đủ nguyên liệu: ${deductionError.message}`)
        }
      }

      // STEP 3: Handle gift products from promotion (LEGACY)
      console.log('🔍 Checking for gift products. gift_promotion_id:', gift_promotion_id, 'bonus_items:', bonus_items?.length || 0)

      if (gift_promotion_id && !hasBonusItems) {
        // Query raw SQL using prisma.$queryRaw since we are in transaction?
        // Actually `query` helper uses `pool` or `prisma`. If it uses pool, it's outside transaction.
        // If we want it inside, we should use tx.$queryRaw. 
        // But READ operations are fine outside if isolation level is default (Read Committed).
        // For safety, let's keep using `query` helper assuming gift config doesn't change mid-transaction.
        // Wait, `query` helper (line 4) imports from `@/lib/prisma`.

        const giftProducts = (await query(
          `SELECT pg.*, 
                  COALESCE(p.name, pr.name) as product_name,
                  pg.item_id as productId,
                  pg.item_type as source
           FROM promotion_gifts pg
           LEFT JOIN products p ON pg.item_type = 'PRODUCT' AND pg.item_id::uuid = p.id
           LEFT JOIN product_recipes pr ON pg.item_type = 'RECIPE' AND pg.item_id::uuid = pr.id
           WHERE pg.promotion_id = $1::uuid`,
          [gift_promotion_id]
        )) as any[]

        console.log(`🎁 Found ${giftProducts.length} gift products for promotion ${gift_promotion_id}`)

        for (const gift of giftProducts) {
          const giftQuantity = gift.quantity || 1

          if (gift.source === 'RECIPE' || gift.item_type === 'RECIPE') {
            const giftRecipe = await tx.product_recipes.findUnique({
              where: { id: gift.item_id },
              include: { recipe_ingredients: true }
            })

            if (giftRecipe && giftRecipe.recipe_ingredients.length > 0) {
              // Create temporary invoice item for gift deduction tracking
              const giftInvoiceItem = await tx.sales_invoice_items.create({
                data: {
                  invoice_id: newInvoice.id,
                  recipe_id: giftRecipe.id,
                  quantity: giftQuantity,
                  unit_price: 0, // Gift is free
                  line_total: 0
                }
              })

              try {
                await deductionService.createRecipeDeduction({
                  invoiceId: newInvoice.id,
                  invoiceItemId: giftInvoiceItem.id,
                  recipeId: giftRecipe.id,
                  warehouseId: warehouse.id,
                  quantitySold: giftQuantity,
                  tx: tx // Pass transaction
                })
                console.log(`✅ Gift deduction: ${giftRecipe.name} x${giftQuantity}`)
              } catch (deductionError: any) {
                console.error(`❌ Failed gift deduction for ${giftRecipe.name}:`, deductionError.message)
                throw new Error(`Không đủ nguyên liệu cho quà tặng ${giftRecipe.name}`)
              }
            }
          } else {
            // Direct product gift (not recipe-based) - use inventory service
            const { inventoryService, StockOperation } = await import('@/lib/services')
            await inventoryService.updateStock({
              warehouseId: warehouse.id,
              productId: gift.item_id,
              quantityChange: -(gift.quantity || 1),
              operation: StockOperation.SALE,
              tx: tx, // Pass transaction
              skipLockCheck: true // Optimization
            })
          }
        }
      }

      // STEP 4: Handle bonus items (Buy 1 Get 1)
      if (hasBonusItems) {
        console.log(`🎁 Processing ${bonus_items.length} bonus items from Buy 1 Get 1 promotion`)

        for (const bonusItem of bonus_items) {
          const bonusQuantity = bonusItem.quantity || 1
          const productId = bonusItem.product_id

          if (!productId) {
            console.warn('⚠️ Bonus item missing product_id, skipping')
            continue
          }

          const recipe = await tx.product_recipes.findUnique({
            where: { id: productId },
            include: { recipe_ingredients: true }
          })

          if (recipe && recipe.recipe_ingredients.length > 0) {
            console.log(`🎁 Deducting ingredients for bonus recipe: ${recipe.name} x${bonusQuantity}`)

            // Create invoice item for bonus
            const bonusInvoiceItem = await tx.sales_invoice_items.create({
              data: {
                invoice_id: newInvoice.id,
                recipe_id: recipe.id,
                quantity: bonusQuantity,
                unit_price: 0, // Bonus is free
                line_total: 0
              }
            })

            try {
              await deductionService.createRecipeDeduction({
                invoiceId: newInvoice.id,
                invoiceItemId: bonusInvoiceItem.id,
                recipeId: recipe.id,
                warehouseId: warehouse.id,
                quantitySold: bonusQuantity,
                tx: tx // Pass transaction
              })
              console.log(`✅ Bonus deduction: ${recipe.name} x${bonusQuantity}`)
            } catch (deductionError: any) {
              console.error(`❌ Failed bonus deduction for ${recipe.name}:`, deductionError.message)
              throw new Error(`Không đủ nguyên liệu cho quà tặng ${recipe.name}`)
            }
          } else {
            console.log(`🎁 Deducting bonus product: ${bonusItem.product_name || productId} x${bonusQuantity}`)
            const { inventoryService, StockOperation } = await import('@/lib/services')
            await inventoryService.updateStock({
              warehouseId: warehouse.id,
              productId: productId,
              quantityChange: -bonusQuantity,
              operation: StockOperation.SALE,
              tx: tx, // Pass transaction
              skipLockCheck: true // Optimization
            })
          }
        }

        console.log(`✅ All bonus items processed`)
      }

      // STEP 5: Mark voucher as used and handle gift vouchers
      if (voucher_id) {
        const voucherData = await tx.vouchers.findUnique({
          where: { id: voucher_id },
          include: {
            program: {
              include: {
                voucher_gifts: true,
              },
            },
          },
        })

        // Mark voucher as used
        if (voucherData && !voucherData.is_used) {
          await tx.vouchers.update({
            where: { id: voucher_id },
            data: {
              is_used: true,
              used_at: new Date(),
            },
          })
        }

        // Handle GIFT type vouchers
        if (voucherData && voucherData.program && voucherData.program.discount_type === 'GIFT') {
          const giftItems = voucherData.program.voucher_gifts || []

          for (const gift of giftItems) {
            const giftQuantity = gift.quantity || 1

            // Check if this gift item is in the customer's cart
            const matchingCartItem = items.find((item: any) =>
              item.product_id === gift.item_id && gift.item_type === 'RECIPE'
            )

            if (matchingCartItem) {
              continue
            }

            // Gift item does NOT match cart items - deduct as free gift
            if (gift.item_type === 'RECIPE') {
              const giftRecipe = await tx.product_recipes.findUnique({
                where: { id: gift.item_id },
                include: { recipe_ingredients: true }
              })

              if (giftRecipe && giftRecipe.recipe_ingredients.length > 0) {
                const giftInvoiceItem = await tx.sales_invoice_items.create({
                  data: {
                    invoice_id: newInvoice.id,
                    recipe_id: giftRecipe.id,
                    quantity: giftQuantity,
                    unit_price: 0,
                    line_total: 0
                  }
                })

                try {
                  await deductionService.createRecipeDeduction({
                    invoiceId: newInvoice.id,
                    invoiceItemId: giftInvoiceItem.id,
                    recipeId: giftRecipe.id,
                    warehouseId: warehouse.id,
                    quantitySold: giftQuantity,
                    tx: tx // Pass transaction
                  })
                } catch (deductionError: any) {
                  throw new Error(`Không đủ nguyên liệu cho quà voucher ${giftRecipe.name}`)
                }
              }
            } else {
              const { inventoryService, StockOperation } = await import('@/lib/services')
              await inventoryService.updateStock({
                warehouseId: warehouse.id,
                productId: gift.item_id,
                quantityChange: -giftQuantity,
                operation: StockOperation.SALE,
                tx: tx, // Pass transaction
                skipLockCheck: true // Optimization
              })
            }
          }
        }
      }

      // Update shift session statistics
      let cashOrdersCount = 0
      let transferOrdersCount = 0
      let ewalletOrdersCount = 0

      if (payment_method === 'CASH') {
        cashOrdersCount = 1
      } else if (payment_method === 'TRANSFER') {
        transferOrdersCount = 1
      } else if (payment_method === 'EWALLET') {
        ewalletOrdersCount = 1
      }

      const invoiceAmount = total_amount ? parseFloat(total_amount) : 0
      const invoiceDiscount = discount_amount ? parseFloat(discount_amount) : 0

      const updateData: any = {
        total_orders: {
          increment: 1
        },
        total_revenue: {
          increment: invoiceAmount
        },
        total_discount: {
          increment: invoiceDiscount
        },
        cash_orders: {
          increment: cashOrdersCount
        },
        transfer_orders: {
          increment: transferOrdersCount
        },
        ewallet_orders: {
          increment: ewalletOrdersCount
        }
      }

      // Add payment total based on method
      if (payment_method === 'TRANSFER') {
        updateData.transfer_total = { increment: invoiceAmount }
      } else if (payment_method === 'EWALLET') {
        updateData.ewallet_total = { increment: invoiceAmount }
      }

      // Track voucher usage
      if (voucher_id) {
        updateData.vouchers_used = { increment: 1 }
      }

      // Update SALES session statistics only if user is in a session
      if (salesSession) {
        await tx.sales_sessions.update({
          where: { id: salesSession.id },
          data: updateData
        })
      }

      return newInvoice
    }, {
      maxWait: 5000,
      timeout: 20000
    }) // END TRANSACTION

    const duration = Date.now() - startTime

    return NextResponse.json(
      {
        success: true,
        data: {
          invoice_id: invoice.id,
          invoice_number: invoiceNumber,
          total_amount,
          customer_payment,
          change,
          message: 'Đơn hàng đã được lưu thành công',
          performance: {
            total_items: items.length,
            duration_ms: duration,
            throughput: items.length > 0 ? `${Math.round(items.length / (duration / 1000))} items/sec` : 'N/A'
          }
        },
      } as ApiResponse<any>,
      { status: 201 }
    )


  } catch (error: any) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi lưu đơn hàng' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
