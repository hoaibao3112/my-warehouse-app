import { unitConversionService } from '../services/unit-conversion-service'

/**
 * Display Utilities
 * 
 * Helper functions for displaying quantities in user's preferred units
 * Used in reports, dashboards, and anywhere quantities need to be displayed
 */

/**
 * Format quantity with unit for display
 * 
 * @param baseQuantity - Quantity in base unit
 * @param baseUnitCode - Base unit code (e.g., "CHAI")
 * @param displayUnitCode - Preferred display unit (optional)
 * @param multiplier - Conversion multiplier (optional)
 * @returns Formatted string
 */
export function formatQuantityWithUnit(
    baseQuantity: number,
    baseUnitCode: string,
    displayUnitCode?: string,
    multiplier?: number
): string {
    if (!displayUnitCode || !multiplier || multiplier === 1) {
        // Display in base unit
        return `${baseQuantity.toLocaleString()} ${baseUnitCode}`
    }

    // Convert to display unit
    const displayQuantity = Math.floor(baseQuantity / multiplier)
    return `${displayQuantity.toLocaleString()} ${displayUnitCode} (${baseQuantity.toLocaleString()} ${baseUnitCode})`
}

/**
 * Get display quantity for a product
 * Converts from base unit to user's preferred unit
 * 
 * @param productId - Product ID
 * @param baseQuantity - Quantity in base unit
 * @param preferredUnitId - User's preferred unit ID (optional)
 * @returns Display information
 */
export async function getDisplayQuantity(
    productId: string,
    baseQuantity: number,
    preferredUnitId?: string
) {
    // Get display options
    const displayOptions = await unitConversionService.getDisplayUnitOptions(
        productId,
        baseQuantity
    )

    // If no preferred unit, return base unit
    if (!preferredUnitId) {
        const baseOption = displayOptions.find((opt: any) => opt.multiplier === 1)
        return {
            quantity: baseQuantity,
            unitCode: baseOption?.unitCode || '',
            unitName: baseOption?.unitName || '',
            baseQuantity: baseQuantity,
            displayOptions: displayOptions
        }
    }

    // Find preferred unit option
    const preferredOption = displayOptions.find((opt: any) => opt.unitId === preferredUnitId)

    if (!preferredOption) {
        // Fallback to base unit
        const baseOption = displayOptions.find((opt: any) => opt.multiplier === 1)
        return {
            quantity: baseQuantity,
            unitCode: baseOption?.unitCode || '',
            unitName: baseOption?.unitName || '',
            baseQuantity: baseQuantity,
            displayOptions: displayOptions
        }
    }

    return {
        quantity: preferredOption.quantity,
        unitCode: preferredOption.unitCode,
        unitName: preferredOption.unitName,
        baseQuantity: baseQuantity,
        displayOptions: displayOptions
    }
}

/**
 * Format stock level with color indicator
 * 
 * @param quantity - Current quantity
 * @param minLevel - Minimum stock level (optional)
 * @param maxLevel - Maximum stock level (optional)
 * @returns Stock level info with status
 */
export function getStockLevelStatus(
    quantity: number,
    minLevel?: number,
    maxLevel?: number
): {
    quantity: number
    status: 'CRITICAL' | 'LOW' | 'NORMAL' | 'HIGH'
    statusColor: string
    statusText: string
} {
    if (quantity <= 0) {
        return {
            quantity,
            status: 'CRITICAL',
            statusColor: '#EF4444', // Red
            statusText: 'Hết hàng'
        }
    }

    if (minLevel && quantity < minLevel) {
        return {
            quantity,
            status: 'LOW',
            statusColor: '#F59E0B', // Orange
            statusText: 'Sắp hết'
        }
    }

    if (maxLevel && quantity > maxLevel) {
        return {
            quantity,
            status: 'HIGH',
            statusColor: '#3B82F6', // Blue
            statusText: 'Dư thừa'
        }
    }

    return {
        quantity,
        status: 'NORMAL',
        statusColor: '#10B981', // Green
        statusText: 'Bình thường'
    }
}

/**
 * Calculate inventory turnover rate
 * 
 * @param totalSold - Total quantity sold (in base unit)
 * @param averageStock - Average stock level (in base unit)
 * @param periodDays - Period in days
 * @returns Turnover metrics
 */
export function calculateInventoryTurnover(
    totalSold: number,
    averageStock: number,
    periodDays: number = 30
): {
    turnoverRate: number
    daysOfStock: number
    velocityPerDay: number
} {
    if (averageStock === 0) {
        return {
            turnoverRate: 0,
            daysOfStock: 0,
            velocityPerDay: totalSold / periodDays
        }
    }

    const turnoverRate = totalSold / averageStock
    const daysOfStock = averageStock / (totalSold / periodDays)
    const velocityPerDay = totalSold / periodDays

    return {
        turnoverRate: Math.round(turnoverRate * 100) / 100,
        daysOfStock: Math.round(daysOfStock * 10) / 10,
        velocityPerDay: Math.round(velocityPerDay * 10) / 10
    }
}

/**
 * Format breakdown for display
 * Shows where stock came from / went to
 */
export interface StockBreakdown {
    qtyImported: number
    qtyProduced: number
    qtySold: number
    qtyTransferredIn: number
    qtyTransferredOut: number
    qtyAdjusted: number
}

export function formatStockBreakdown(
    breakdown: StockBreakdown,
    unitCode: string
): Array<{
    label: string
    value: number
    formattedValue: string
    type: 'INFLOW' | 'OUTFLOW'
    color: string
}> {
    return [
        {
            label: 'Nhập hàng',
            value: breakdown.qtyImported,
            formattedValue: `+${breakdown.qtyImported.toLocaleString()} ${unitCode}`,
            type: 'INFLOW',
            color: '#10B981'
        },
        {
            label: 'Sản xuất',
            value: breakdown.qtyProduced,
            formattedValue: `+${breakdown.qtyProduced.toLocaleString()} ${unitCode}`,
            type: 'INFLOW',
            color: '#3B82F6'
        },
        {
            label: 'Chuyển đến',
            value: breakdown.qtyTransferredIn,
            formattedValue: `+${breakdown.qtyTransferredIn.toLocaleString()} ${unitCode}`,
            type: 'INFLOW',
            color: '#8B5CF6'
        },
        {
            label: 'Bán hàng',
            value: Math.abs(breakdown.qtySold),
            formattedValue: `${breakdown.qtySold.toLocaleString()} ${unitCode}`,
            type: 'OUTFLOW',
            color: '#EF4444'
        },
        {
            label: 'Chuyển đi',
            value: Math.abs(breakdown.qtyTransferredOut),
            formattedValue: `${breakdown.qtyTransferredOut.toLocaleString()} ${unitCode}`,
            type: 'OUTFLOW',
            color: '#F59E0B'
        },
        {
            label: 'Điều chỉnh',
            value: breakdown.qtyAdjusted,
            formattedValue: `${breakdown.qtyAdjusted >= 0 ? '+' : ''}${breakdown.qtyAdjusted.toLocaleString()} ${unitCode}`,
            type: breakdown.qtyAdjusted >= 0 ? 'INFLOW' : 'OUTFLOW',
            color: '#6B7280'
        }
    ]
}
