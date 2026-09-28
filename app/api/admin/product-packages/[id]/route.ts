import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { verifyToken, isAdmin, hasPermission } from "@/lib/auth"
import { getAuthToken } from "@/lib/auth-server"
import { prisma, getVietnamTime } from "@/lib/prisma"

/**
 * @swagger
 * /api/admin/product-packages/{id}:
 *   put:
 *     summary: Update Product Package
 *     description: Update a product package unit.
 *     tags: [Admin - Product Packages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               baseQuantity:
 *                 type: number
 *               packageName:
 *                 type: string
 *               isDefault:
 *                 type: boolean
 *               isSellable:
 *                 type: boolean
 *               isPurchasable:
 *                 type: boolean
 *               isTransferable:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Package updated
 *       404:
 *         description: Not found
 *   delete:
 *     summary: Delete Product Package
 *     description: Delete a product package unit.
 *     tags: [Admin - Product Packages]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Package deleted
 *       404:
 *         description: Not found
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Product management access required" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    const body = await request.json()
    const {
      baseQuantity,
      packageName,
      isDefault,
      isSellable,
      isPurchasable,
      isTransferable
    } = body

    // Verify package exists (handle missing table)
    let existingPackage = null
    try {
      existingPackage = await prisma.product_package_units.findUnique({
        where: { id }
      })
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        return NextResponse.json(
          { success: false, error: "Table product_package_units does not exist. Please run migration first." } as ApiResponse<null>,
          { status: 500 }
        )
      }
      throw err
    }

    if (!existingPackage) {
      return NextResponse.json(
        { success: false, error: "Package not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Validate baseQuantity if provided
    if (baseQuantity !== undefined) {
      const baseQty = Number(baseQuantity)
      if (baseQty <= 0) {
        return NextResponse.json(
          { success: false, error: "baseQuantity must be greater than 0" } as ApiResponse<null>,
          { status: 400 }
        )
      }
    }

    // If marking as default, unset other defaults for this product
    if (isDefault === true) {
      await prisma.product_package_units.updateMany({
        where: {
          product_id: existingPackage.product_id,
          id: { not: id }
        },
        data: { is_default: false }
      })
    }

    // Update the package
    const updateData: any = {
      updated_at: getVietnamTime()
    }

    if (baseQuantity !== undefined) {
      updateData.base_quantity = Number(baseQuantity).toString()
    }
    if (packageName !== undefined) {
      updateData.package_name = packageName.trim()
    }
    if (isDefault !== undefined) {
      updateData.is_default = isDefault
    }
    if (isSellable !== undefined) {
      updateData.is_sellable = isSellable
    }
    if (isPurchasable !== undefined) {
      updateData.is_purchasable = isPurchasable
    }
    if (isTransferable !== undefined) {
      updateData.is_transferable = isTransferable
    }

    const updatedPackage = await prisma.product_package_units.update({
      where: { id },
      data: updateData,
      include: {
        products: { select: { id: true, name: true, code: true } },
        product_units: { select: { id: true, name: true, code: true } }
      }
    })

    return NextResponse.json(
      {
        success: true,
        message: "Package updated successfully",
        data: {
          id: updatedPackage.id,
          productId: updatedPackage.product_id,
          productName: updatedPackage.products.name,
          packageUnitId: updatedPackage.package_unit_id,
          packageUnitName: updatedPackage.product_units.name,
          baseQuantity: Number(updatedPackage.base_quantity),
          packageName: updatedPackage.package_name,
          isDefault: updatedPackage.is_default,
          isSellable: updatedPackage.is_sellable,
          isPurchasable: updatedPackage.is_purchasable,
          isTransferable: updatedPackage.is_transferable
        }
      } as ApiResponse<any>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Product Packages] PUT error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/product-packages/[id]
 * Delete a product package unit
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !hasPermission(user, "product_management")) {
      return NextResponse.json(
        { success: false, error: "Unauthorized: Product management access required" } as ApiResponse<null>,
        { status: 403 }
      )
    }

    // Verify package exists (handle missing table)
    let existingPackage = null
    try {
      existingPackage = await prisma.product_package_units.findUnique({
        where: { id }
      })
    } catch (err: any) {
      if (err?.message?.includes('does not exist')) {
        return NextResponse.json(
          { success: false, error: "Table product_package_units does not exist. Please run migration first." } as ApiResponse<null>,
          { status: 500 }
        )
      }
      throw err
    }

    if (!existingPackage) {
      return NextResponse.json(
        { success: false, error: "Package not found" } as ApiResponse<null>,
        { status: 404 }
      )
    }

    // Delete the package
    await prisma.product_package_units.delete({
      where: { id }
    })

    // If this was the default package, set the first remaining package as default
    if (existingPackage.is_default) {
      const remainingPackages = await prisma.product_package_units.findMany({
        where: { product_id: existingPackage.product_id },
        orderBy: { created_at: 'asc' },
        take: 1
      })

      if (remainingPackages.length > 0) {
        await prisma.product_package_units.update({
          where: { id: remainingPackages[0].id },
          data: { is_default: true, updated_at: getVietnamTime() }
        })
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "Package deleted successfully"
      } as ApiResponse<null>,
      { status: 200 }
    )
  } catch (error: any) {
    console.error("[Product Packages] DELETE error:", error)
    return NextResponse.json(
      { success: false, error: error?.message || String(error) } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
