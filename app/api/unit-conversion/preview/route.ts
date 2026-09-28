import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'
import { unitConversionService } from '@/lib/services/unit-conversion-service'
import { prisma } from '@/lib/prisma'

/**
 * GET /api/unit-conversion/preview
 * 
 * Preview unit conversion for recipe ingredients
 * Returns the base unit quantity for display purposes
 * 
 * Query params:
 * - productId: Product/ingredient ID
 * - fromUnitId: Unit to convert from
 * - quantity: Quantity to convert
 */
export async function GET(request: NextRequest) {
    try {
        const user = await verifyAuth(request)
        if (!user) {
            return NextResponse.json(
                { success: false, error: 'Unauthorized' },
                { status: 401 }
            )
        }

        const { searchParams } = new URL(request.url)
        const productId = searchParams.get('productId')
        const fromUnitId = searchParams.get('fromUnitId')
        const quantityStr = searchParams.get('quantity')

        if (!productId || !fromUnitId || !quantityStr) {
            return NextResponse.json(
                { success: false, error: 'Missing required parameters' },
                { status: 400 }
            )
        }

        const quantity = parseFloat(quantityStr)
        if (isNaN(quantity) || quantity <= 0) {
            return NextResponse.json(
                { success: false, error: 'Invalid quantity' },
                { status: 400 }
            )
        }

        // Validate unit for product
        const isValidUnit = await unitConversionService.validateUnitForProduct(
            productId,
            fromUnitId
        )

        if (!isValidUnit) {
            return NextResponse.json(
                { success: false, error: 'Invalid unit for this product' },
                { status: 400 }
            )
        }

        // Get conversion result
        const conversion = await unitConversionService.convertToBaseUnit(
            productId,
            quantity,
            fromUnitId
        )

        // Get unit details for display
        const [fromUnit, baseUnit] = await Promise.all([
            prisma.product_units.findUnique({
                where: { id: fromUnitId },
                select: { id: true, code: true, name: true }
            }),
            prisma.product_units.findUnique({
                where: { id: conversion.baseUnitId },
                select: { id: true, code: true, name: true }
            })
        ])

        return NextResponse.json({
            success: true,
            data: {
                fromQuantity: quantity,
                fromUnit: fromUnit,
                baseQuantity: conversion.baseQuantity,
                baseUnit: baseUnit,
                conversionFactor: conversion.baseQuantity / quantity,
                displayText: `${quantity} ${fromUnit?.code || fromUnit?.name} = ${conversion.baseQuantity} ${baseUnit?.code || baseUnit?.name}`
            }
        })

    } catch (error: any) {
        console.error('Error in unit conversion preview:', error)
        return NextResponse.json(
            { success: false, error: error.message || 'Internal server error' },
            { status: 500 }
        )
    }
}
