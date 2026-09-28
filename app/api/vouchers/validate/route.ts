import { NextRequest, NextResponse } from 'next/server'
import type { ApiResponse } from '@/lib/types'
import { prisma } from '@/lib/prisma'
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from '@/lib/auth'
import { getVietnamTime } from '@/lib/prisma'

/**
 * @swagger
 * /api/vouchers/validate:
 *   post:
 *     summary: Validate Voucher
 *     description: Check if a voucher is valid for a specific cart and calculate discount/gifts.
 *     tags: [Vouchers]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [code, total_amount]
 *             properties:
 *               code:
 *                 type: string
 *               total_amount:
 *                 type: number
 *               cart_items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     recipe_id:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unit_price:
 *                       type: number
 *     responses:
 *       200:
 *         description: Voucher valid
 *       400:
 *         description: Invalid voucher or conditions not met
 *       404:
 *         description: Voucher not found
 */
export async function POST(req: NextRequest) {
  try {
    // Authenticate user
    const token = getAuthToken(req)
    const user = token ? verifyToken(token) : null

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    const body = await req.json()
    const { code, total_amount, cart_items } = body || {}

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Mã giảm giá không được để trống' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (!total_amount || total_amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'Tổng tiền không hợp lệ' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Find voucher by code with program details
    const voucherData = await prisma.vouchers.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        program: {
          include: {
            voucher_gifts: true,
            voucher_products: true,
          },
        },
      },
    })

    if (!voucherData || !voucherData.program) {
      return NextResponse.json(
        { success: false, error: 'Mã giảm giá không tồn tại' } as ApiResponse<null>,
        { status: 404 }
      )
    }

    const program = voucherData.program

    // Check if voucher code has been used
    if (voucherData.is_used) {
      return NextResponse.json(
        { success: false, error: 'Mã giảm giá đã được sử dụng' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check if program is active
    if (!program.is_active) {
      return NextResponse.json(
        { success: false, error: 'Chương trình giảm giá đã kết thúc' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Check Warehouse Restriction
    if (program.warehouse_id) {
      if (!user?.warehouseId || user.warehouseId !== program.warehouse_id) {
        return NextResponse.json(
          { success: false, error: 'Mã giảm giá không áp dụng cho chi nhánh này' } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // Check dates - use Vietnam timezone
    const now = new Date(getVietnamTime())
    if (program.start_date && new Date(program.start_date) > now) {
      return NextResponse.json(
        { success: false, error: 'Mã giảm giá chưa có hiệu lực' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    if (program.end_date && new Date(program.end_date) < now) {
      return NextResponse.json(
        { success: false, error: 'Mã giảm giá đã hết hạn' } as ApiResponse<null>,
        { status: 400 }
      )
    }

    // Type-specific validation
    if (program.discount_type === 'GIFT') {
      // Check minimum amount or minimum quantity
      const minAmount = program.min_amount ? Number(program.min_amount) : 0
      const minQuantity = program.min_quantity || 0

      if (minAmount > 0 && total_amount < minAmount) {
        return NextResponse.json(
          {
            success: false,
            error: `Đơn hàng phải đạt tối thiểu ${minAmount.toLocaleString('vi-VN')}đ để nhận quà`,
          } as ApiResponse<null>,
          { status: 400 }
        )
      }

      if (minQuantity > 0 && cart_items) {
        const totalQuantity = cart_items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
        if (totalQuantity < minQuantity) {
          return NextResponse.json(
            {
              success: false,
              error: `Đơn hàng phải có tối thiểu ${minQuantity} sản phẩm để nhận quà`,
            } as ApiResponse<null>,
            { status: 400 }
          )
        }
      }
      // Fetch recipe names for gift items
      const giftItemsWithNames = await Promise.all(
        (program.voucher_gifts || []).map(async (gift: any) => {
          let itemName = 'Sản phẩm'
          if (gift.item_type === 'RECIPE' && gift.item_id) {
            try {
              const recipe = await prisma.product_recipes.findUnique({
                where: { id: gift.item_id },
                select: { name: true }
              })
              itemName = recipe?.name || itemName
            } catch (err) {
              console.error('Error fetching recipe:', err)
            }
          }
          return {
            id: gift.id,
            item_id: gift.item_id,
            item_type: gift.item_type,
            quantity: gift.quantity,
            item_name: itemName,
          }
        })
      )

      // Check if gift items match any cart items - if yes, treat as 100% discount instead of gift
      let discountAmount = 0
      let actualGiftItems = giftItemsWithNames

      if (cart_items && cart_items.length > 0) {
        // Filter out gift items that are in the cart
        actualGiftItems = giftItemsWithNames.filter((gift: any) => {
          return !cart_items.some((cartItem: any) =>
            cartItem.recipe_id === gift.item_id && gift.item_type === 'RECIPE'
          )
        })

        // Calculate discount for gift items that match cart items
        const matchingGifts = giftItemsWithNames.filter((gift: any) => {
          return cart_items.some((cartItem: any) =>
            cartItem.recipe_id === gift.item_id && gift.item_type === 'RECIPE'
          )
        })

        // Sum up 100% discount for matching items
        for (const gift of matchingGifts) {
          const cartItem = cart_items.find((c: any) => c.recipe_id === gift.item_id)
          if (cartItem) {
            // 100% discount for this item
            discountAmount += (cartItem.unit_price || 0) * cartItem.quantity
          }
        }
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            id: voucherData.id,
            code: voucherData.code,
            discount_type: program.discount_type,
            discount_value: 0,
            discount_amount: discountAmount,
            gift_items: actualGiftItems,
            message: discountAmount > 0
              ? `Giảm ${discountAmount.toLocaleString('vi-VN')}đ cho sản phẩm trong giỏ hàng + Nhận quà tặng`
              : `Nhận quà tặng miễn phí`,
          },
        } as ApiResponse<any>,
        { status: 200 }
      )
    } else if (program.discount_type === 'PRODUCT_DISCOUNT') {
      // Check if cart contains required products
      if (!cart_items || cart_items.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Giỏ hàng trống' } as ApiResponse<null>,
          { status: 400 }
        )
      }

      const requiredProducts = program.voucher_products || []
      let hasRequiredProducts = false
      let applicableAmount = 0

      for (const reqProduct of requiredProducts) {
        const cartItem = cart_items.find(
          (item: any) =>
            item.recipe_id === reqProduct.item_id && reqProduct.item_type === 'RECIPE'
        )

        if (cartItem && cartItem.quantity >= reqProduct.quantity_required) {
          hasRequiredProducts = true
          // Calculate discount only on the matching product
          applicableAmount += Number(cartItem.unit_price || 0) * cartItem.quantity
        }
      }

      if (!hasRequiredProducts) {
        return NextResponse.json(
          {
            success: false,
            error: 'Giỏ hàng không có sản phẩm áp dụng mã giảm giá này',
          } as ApiResponse<null>,
          { status: 400 }
        )
      }

      let discountAmount = 0
      if (program.discount_type === 'PRODUCT_DISCOUNT') {
        if (program.discount_value) {
          // Apply discount to applicable products only
          discountAmount = (applicableAmount * Number(program.discount_value)) / 100
        }
      }

      // Fetch recipe names for product items
      const productItemsWithNames = await Promise.all(
        (program.voucher_products || []).map(async (product: any) => {
          let itemName = 'Sản phẩm'
          if (product.item_type === 'RECIPE' && product.item_id) {
            try {
              const recipe = await prisma.product_recipes.findUnique({
                where: { id: product.item_id },
                select: { name: true }
              })
              itemName = recipe?.name || itemName
            } catch (err) {
              console.error('Error fetching recipe:', err)
            }
          }
          return {
            id: product.id,
            item_id: product.item_id,
            item_type: product.item_type,
            quantity_required: product.quantity_required,
            item_name: itemName,
          }
        })
      )

      return NextResponse.json(
        {
          success: true,
          data: {
            id: voucherData.id,
            code: voucherData.code,
            discount_type: program.discount_type,
            discount_value: program.discount_value,
            discount_amount: discountAmount,
            product_items: productItemsWithNames,
            message: `Giảm ${discountAmount.toLocaleString('vi-VN')}đ cho sản phẩm được chọn`,
          },
        } as ApiResponse<any>,
        { status: 200 }
      )
    } else {
      // PERCENTAGE or FIXED_AMOUNT
      // Check minimum amount
      const minAmount = program.min_amount ? Number(program.min_amount) : 0
      if (total_amount < minAmount) {
        return NextResponse.json(
          {
            success: false,
            error: `Đơn hàng phải đạt tối thiểu ${minAmount.toLocaleString('vi-VN')}đ để sử dụng mã này`,
          } as ApiResponse<null>,
          { status: 400 }
        )
      }

      // Calculate discount
      let discountAmount = 0
      if (program.discount_type === 'PERCENTAGE') {
        discountAmount = (total_amount * Number(program.discount_value)) / 100
      } else if (program.discount_type === 'FIXED_AMOUNT') {
        discountAmount = Number(program.discount_value)
      }

      return NextResponse.json(
        {
          success: true,
          data: {
            id: voucherData.id,
            code: voucherData.code,
            discount_type: program.discount_type,
            discount_value: program.discount_value,
            discount_amount: discountAmount,
            message: `Giảm ${discountAmount.toLocaleString('vi-VN')}đ`,
          },
        } as ApiResponse<any>,
        { status: 200 }
      )
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Lỗi kiểm tra mã giảm giá' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
