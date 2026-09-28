import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { verifyAuth } from "@/lib/auth-server"
import { validateCsvUpload } from "@/lib/file-validation"

/**
 * @swagger
 * /api/admin/suppliers/import:
 *   post:
 *     summary: Import Suppliers
 *     description: Import suppliers from a CSV file.
 *     tags: [Admin - Suppliers]
 *     security:
 *       - BearerAuth: []
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
 *         description: Import successful
 *       400:
 *         description: Bad request (invalid file)
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request)
    if (!user || user.role !== "ADMIN") {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      )
    }

    const formData = await request.formData()
    const file = formData.get("file") as File

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      )
    }

    // SECURITY: Validate file before processing
    const validation = await validateCsvUpload(file)
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      )
    }

    const buffer = await file.arrayBuffer()
    const text = Buffer.from(buffer).toString("utf-8")

    // Parse CSV content
    const lines = text.split("\n").filter((line) => line.trim())
    const suppliers: Array<{
      name: string
      contact_person?: string
      email?: string
      phone?: string
      address?: string
      products?: Array<{ code: string; price: number }>
    }> = []

    // Find the header row
    let headerIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.includes("Tên Nhà Cung Cấp") && line.includes("Người Liên Hệ")) {
        headerIndex = i
        break
      }
    }

    if (headerIndex === -1) {
      return NextResponse.json(
        {
          success: false,
          error: "File không có header hợp lệ. Vui lòng tải template mới",
        },
        { status: 400 }
      )
    }

    // Parse data rows after header
    for (let i = headerIndex + 1; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue

      // Skip instruction and section header lines
      if (
        line.startsWith("===") ||
        line.startsWith("-") ||
        line.includes("HƯỚNG DẪN") ||
        line.includes("BƯỚC") ||
        line.includes("DANH SÁCH") ||
        line.includes("NHẬP DỮ LIỆU") ||
        line.includes("Mã Sản Phẩm") ||
        line.includes("Định dạng") ||
        line.includes("Cách") ||
        line.includes("Ví dụ") ||
        line.includes("Múa nhau")
      ) {
        continue
      }

      const parts = line.split(",").map((p) => p.trim())

      if (parts.length >= 1 && parts[0]) {
        const name = parts[0]

        // Skip if looks like header or example marker
        if (
          name === "Tên Nhà Cung Cấp" ||
          name === "Công Ty ABC" ||
          name === "Nhà Cung Cấp XYZ" ||
          name === "Nhà cung cấp Z"
        ) {
          continue
        }

        const products: Array<{ code: string; price: number }> = []

        // Parse products from column 6 onwards (index 5+)
        if (parts.length > 5 && parts[5]) {
          const productStr = parts[5]
          const productPairs = productStr.split(";")

          for (const pair of productPairs) {
            const [code, price] = pair.split(":").map((p) => p.trim())
            if (code && price && !isNaN(Number(price))) {
              products.push({
                code: code,
                price: Number(price),
              })
            }
          }
        }

        suppliers.push({
          name,
          contact_person: parts[1] && parts[1].length > 0 ? parts[1] : undefined,
          email: parts[2] && parts[2].length > 0 ? parts[2] : undefined,
          phone: parts[3] && parts[3].length > 0 ? parts[3] : undefined,
          address: parts[4] && parts[4].length > 0 ? parts[4] : undefined,
          products: products.length > 0 ? products : undefined,
        })
      }
    }

    if (suppliers.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "File không chứa dữ liệu nhà cung cấp hợp lệ",
        },
        { status: 400 }
      )
    }

    // OPTIMIZED BATCH PROCESSING
    const startTime = Date.now()

    // STEP 1: Pre-fetch all existing suppliers
    const existingSuppliers = await prisma.suppliers.findMany({
      select: { id: true, name: true, contact_person: true, email: true, phone: true, address: true }
    })
    const existingSupplierMap = new Map(
      existingSuppliers.map(s => [s.name.toLowerCase(), s])
    )

    // STEP 2: Pre-fetch all product_recipes for product matching
    const allProductRecipes = await prisma.product_recipes.findMany({
      select: { id: true, code: true }
    })
    const productRecipeMap = new Map(
      allProductRecipes.map(p => [p.code?.toLowerCase() || '', p])
    )

    // Validate and create suppliers with products
    const created = []
    const errors = []
    let productsAdded = 0

    const newSuppliers: any[] = []
    const suppliersToUpdate: any[] = []
    const allSupplierProducts: any[] = []

    for (const supplier of suppliers) {
      try {
        // Validate
        if (!supplier.name || supplier.name.length === 0) {
          errors.push(`Tên nhà cung cấp không được để trống`)
          continue
        }

        if (supplier.email && !isValidEmail(supplier.email)) {
          errors.push(`Email không hợp lệ: ${supplier.email}`)
          continue
        }

        if (supplier.phone && !isValidPhone(supplier.phone)) {
          errors.push(`Số điện thoại không hợp lệ: ${supplier.phone}`)
          continue
        }

        // Check if supplier already exists
        const existing = existingSupplierMap.get(supplier.name.toLowerCase())

        if (existing) {
          // Mark for update
          suppliersToUpdate.push({
            id: existing.id,
            data: {
              contact_person: supplier.contact_person || existing.contact_person,
              email: supplier.email || existing.email,
              phone: supplier.phone || existing.phone,
              address: supplier.address || existing.address,
            },
            originalSupplier: supplier,
            supplierId: existing.id
          })
        } else {
          // Add to bulk create list
          newSuppliers.push({
            name: supplier.name,
            contact_person: supplier.contact_person || null,
            email: supplier.email || null,
            phone: supplier.phone || null,
            address: supplier.address || null,
            originalSupplier: supplier
          })
        }
      } catch (err: any) {
        errors.push(`Lỗi tạo nhà cung cấp "${supplier.name}": ${err.message}`)
      }
    }

    // STEP 3: Bulk create new suppliers
    let createdSupplierIds: Map<string, string> = new Map()
    if (newSuppliers.length > 0) {
      console.log(`Creating ${newSuppliers.length} suppliers in bulk...`)
      const suppliersData = newSuppliers.map(s => ({
        name: s.name,
        contact_person: s.contact_person,
        email: s.email,
        phone: s.phone,
        address: s.address
      }))

      const createdSuppliersResult = await prisma.suppliers.createManyAndReturn({
        data: suppliersData
      })

      created.push(...createdSuppliersResult)

      // Map created suppliers to original data
      createdSuppliersResult.forEach((createdSupplier, index) => {
        createdSupplierIds.set(newSuppliers[index].name.toLowerCase(), createdSupplier.id)
      })
    }

    // STEP 4: Update existing suppliers (if needed - sequential is OK since typically few)
    for (const updateItem of suppliersToUpdate) {
      try {
        await prisma.suppliers.update({
          where: { id: updateItem.id },
          data: updateItem.data
        })
      } catch (err: any) {
        errors.push(`Lỗi cập nhật nhà cung cấp "${updateItem.originalSupplier.name}": ${err.message}`)
      }
    }

    // STEP 5: Prepare all supplier_products for bulk insert
    // Combine created and updated suppliers
    for (const newSup of newSuppliers) {
      const supplierId = createdSupplierIds.get(newSup.name.toLowerCase())
      if (supplierId && newSup.originalSupplier.products && newSup.originalSupplier.products.length > 0) {
        for (const product of newSup.originalSupplier.products) {
          const foundProduct = productRecipeMap.get(product.code.toLowerCase())
          if (foundProduct) {
            allSupplierProducts.push({
              supplier_id: supplierId,
              product_id: foundProduct.id,
              unit_price: product.price
            })
          } else {
            errors.push(`Sản phẩm "${product.code}" không tìm thấy cho nhà cung cấp "${newSup.name}"`)
          }
        }
      }
    }

    for (const updateItem of suppliersToUpdate) {
      if (updateItem.originalSupplier.products && updateItem.originalSupplier.products.length > 0) {
        for (const product of updateItem.originalSupplier.products) {
          const foundProduct = productRecipeMap.get(product.code.toLowerCase())
          if (foundProduct) {
            allSupplierProducts.push({
              supplier_id: updateItem.supplierId,
              product_id: foundProduct.id,
              unit_price: product.price
            })
          } else {
            errors.push(`Sản phẩm "${product.code}" không tìm thấy cho nhà cung cấp "${updateItem.originalSupplier.name}"`)
          }
        }
      }
    }

    // STEP 6: Bulk upsert supplier_products (using createMany with skipDuplicates)
    if (allSupplierProducts.length > 0) {
      console.log(`Upserting ${allSupplierProducts.length} supplier products in bulk...`)

      // First, delete existing to avoid duplicates (for updates)
      const supplierIds = [...new Set(allSupplierProducts.map(sp => sp.supplier_id))]
      await prisma.supplier_products.deleteMany({
        where: {
          supplier_id: { in: supplierIds }
        }
      })

      // Then bulk create all
      const result = await prisma.supplier_products.createMany({
        data: allSupplierProducts,
        skipDuplicates: true
      })
      productsAdded = result.count
    }

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      data: {
        imported: created.length,
        total: suppliers.length,
        productsAdded,
        errors: errors.length > 0 ? errors : undefined,
        performance: {
          total_suppliers: suppliers.length,
          new_suppliers: newSuppliers.length,
          updated_suppliers: suppliersToUpdate.length,
          total_products: allSupplierProducts.length,
          duration_ms: duration,
          throughput: suppliers.length > 0 ? `${Math.round(suppliers.length / (duration / 1000))} suppliers/sec` : 'N/A'
        }
      },
    })
  } catch (error: any) {
    console.error("Import suppliers error:", error)
    return NextResponse.json(
      { success: false, error: error.message || "Internal server error" },
      { status: 500 }
    )
  }
}

function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email)
}

function isValidPhone(phone: string): boolean {
  // Basic phone validation: should contain only digits and optionally +, -, (, )
  const phoneRegex = /^[0-9\+\-\(\)\s]+$/
  return phoneRegex.test(phone) && phone.replace(/\D/g, "").length >= 10
}
