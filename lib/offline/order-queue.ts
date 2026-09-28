/**
 * Order Queue Helper
 * Simplifies queueing orders for offline sync
 */

import { offlineDB } from './database'
import { generateTempInvoiceNumber } from './invoice-generator'
import type { PendingOrder, OrderItem, PaymentMethod, EwalletType } from './types'
import { v4 as uuidv4 } from 'uuid'

export interface QueueOrderParams {
  warehouseId: string
  shiftSessionId: string | null
  items: OrderItem[]
  totalAmount: number
  discountAmount?: number
  customerPayment: number
  changeAmount: number
  paymentMethod: PaymentMethod
  ewalletType?: EwalletType
  voucherId?: string
  voucherCode?: string
  promotionId?: string
  giftPromotionId?: string
  notes?: string
  createdBy: string
}

/**
 * Queue an order for offline sync
 */
export async function queueOrder(params: QueueOrderParams): Promise<{
  orderId: string
  tempInvoiceNumber: string
}> {
  try {
    // Generate temporary invoice number
    const tempInvoiceNumber = generateTempInvoiceNumber()

    console.log('[OrderQueue] Queueing order:', {
      tempInvoiceNumber,
      items: params.items.length,
      totalAmount: params.totalAmount,
    })

    // Prepare order data
    const orderData: Omit<PendingOrder, 'id' | 'created_at' | 'sync_status' | 'sync_attempts'> = {
      temp_invoice_number: tempInvoiceNumber,
      warehouse_id: params.warehouseId,
      shift_session_id: params.shiftSessionId,
      items: params.items,
      total_amount: params.totalAmount,
      discount_amount: params.discountAmount || 0,
      customer_payment: params.customerPayment,
      change_amount: params.changeAmount,
      payment_method: params.paymentMethod,
      ewallet_type: params.ewalletType,
      voucher_id: params.voucherId,
      voucher_code: params.voucherCode,
      promotion_id: params.promotionId,
      gift_promotion_id: params.giftPromotionId,
      notes: params.notes,
      created_by: params.createdBy,
    }

    // Queue to database
    const orderId = await offlineDB.queueOrder(orderData)

    // Update shift stats if applicable
    if (params.shiftSessionId) {
      await updateOfflineShiftStats(params.shiftSessionId, params)
    }

    console.log('[OrderQueue] ✅ Order queued successfully:', {
      orderId,
      tempInvoiceNumber,
    })

    return {
      orderId,
      tempInvoiceNumber,
    }
  } catch (error) {
    console.error('[OrderQueue] Error queueing order:', error)
    throw error
  }
}

/**
 * Update offline shift statistics (optimistic update)
 */
async function updateOfflineShiftStats(
  shiftId: string,
  params: QueueOrderParams
): Promise<void> {
  try {
    const updates: any = {
      total_orders: 1,
      total_revenue: params.totalAmount,
      total_discount: params.discountAmount || 0,
    }

    // Update payment method counters
    if (params.paymentMethod === 'CASH') {
      updates.cash_orders = 1
    } else if (params.paymentMethod === 'TRANSFER') {
      updates.transfer_orders = 1
      updates.transfer_total = params.totalAmount
    } else if (params.paymentMethod === 'EWALLET') {
      updates.ewallet_orders = 1
      updates.ewallet_total = params.totalAmount
    }

    // Update voucher counter
    if (params.voucherId) {
      updates.vouchers_used = 1
    }

    await offlineDB.updateShiftStats(shiftId, updates)

    console.log('[OrderQueue] Updated shift stats:', shiftId)
  } catch (error) {
    console.error('[OrderQueue] Error updating shift stats:', error)
    // Don't throw - shift stats update is not critical
  }
}

/**
 * Get pending orders count
 */
export async function getPendingOrdersCount(): Promise<number> {
  try {
    return await offlineDB.getPendingOrdersCount()
  } catch (error) {
    console.error('[OrderQueue] Error getting pending count:', error)
    return 0
  }
}

/**
 * Get all pending orders
 */
export async function getAllPendingOrders(): Promise<PendingOrder[]> {
  try {
    return await offlineDB.getAllPendingOrders()
  } catch (error) {
    console.error('[OrderQueue] Error getting all pending orders:', error)
    return []
  }
}
