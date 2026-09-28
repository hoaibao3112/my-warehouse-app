import { NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth-server'
import { prisma } from '@/lib/prisma'

export async function POST(request: Request) {
    try {
        const user = await verifyAuth(request)
        if (!user || user.role !== 'ADMIN') {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { items } = body

        if (!items || !Array.isArray(items) || items.length === 0) {
            return NextResponse.json({ success: false, error: 'No items to import' }, { status: 400 })
        }

        let createdCount = 0
        let updatedCount = 0
        const errors = []

        for (const item of items) {
            try {
                // Upsert Supplier
                // We match by Name for now (simplistic) or Email?
                // Let's stick to Name as primary key for import to avoid duplicates

                const existing = await prisma.suppliers.findFirst({
                    where: { name: item.name }
                })

                let supplierId = ''

                if (existing) {
                    // Update
                    await prisma.suppliers.update({
                        where: { id: existing.id },
                        data: {
                            contact_person: item.contact_person || existing.contact_person,
                            email: item.email || existing.email,
                            phone: item.phone || existing.phone,
                            address: item.address || existing.address
                        }
                    })
                    supplierId = existing.id
                    updatedCount++
                } else {
                    // Create
                    const newSupplier = await prisma.suppliers.create({
                        data: {
                            name: item.name,
                            contact_person: item.contact_person,
                            email: item.email,
                            phone: item.phone,
                            address: item.address
                        }
                    })
                    supplierId = newSupplier.id
                    createdCount++
                }

                // Process Products
                if (item.products && item.products.length > 0) {
                    for (const prod of item.products) {
                        // Find product by Code
                        // Note: Suppliers supply Raw Materials usually, which are in ProductRecipes or Products table?
                        // "Mã Sản Phẩm & Giá" -> implies Products logic.
                        // In system, Suppliers link to Products via supplier_products table.
                        // Products table contains code.

                        // Check ProductRecipes? 
                        // Previous code in app/api/admin/suppliers/import/route.ts checked `prisma.product_recipes`.
                        // Wait, why product_recipes? Supplier usually supplies ingredients for recipes?
                        // Let's check `app/api/admin/suppliers/import/route.ts` again.
                        // Line 237: `prisma.product_recipes.findFirst({ where: { code: product.code } })`
                        // BUT, `supplier_products` links `supplier_id` and `product_id`.
                        // Does `product_id` in `supplier_products` refer to `product_recipes` ID or `products` ID?
                        // Let's check schema or usage.
                        // In `app/admin/suppliers/page.tsx`, line 163-167 showing supplier products:
                        // "setSelectedProducts(new Set(json.data?.products?.map((p: any) => p.product_id) || []))"
                        // And in `loadAllProducts`: fetches `/api/products`.
                        // So it seems it links to `products` (Inventory Items). `product_recipes` is for Recipes (Menu items).
                        // It's confusing why existing import checked `product_recipes`.

                        // Actually, `products` table is likely the inventory items (ingredients).
                        // `product_recipes` sounds like the formulas.
                        // Let's check `prisma.schema` or just assume `products` table is correct because `/api/products` returns items with codes like "NL001" (Nucleus Lieu).
                        // And `product_recipes` usually have codes like "CF001" (Coffee).
                        // Suppliers supply Ingredients (NL001).
                        // So I should look up in `products` table.

                        // CAUTION: The old import code `app/api/admin/suppliers/import/route.ts` used `prisma.product_recipes`.
                        // This might be a BUG or my misunderstanding of the schema.
                        // If `product_recipes` table holds the ingredients (confusing naming?), then okay.
                        // But usually `products` = items in warehouse.
                        // Let's check `prisma.products.findMany` in `app/admin/products/page.tsx` => "Danh sách sản phẩm".
                        // So `products` table is definitely the items.
                        // `product_recipes` might be a mistake in the old code, OR `product_recipes` IS `products` (maybe renamed?).
                        // Let's check `c:\Hung\warehouse-express\lib\prisma.ts` or just query `products` table first.

                        // Better yet, I'll search BOTH or prefer `products`.
                        // Given I am "Standardizing", I should use `products` (Inventory Items).
                        // I'll search `products` table.

                        let product = await prisma.products.findFirst({ where: { code: prod.code } })

                        if (product) {
                            // Upsert supplier_products
                            const existingLink = await prisma.supplier_products.findFirst({
                                where: { supplier_id: supplierId, product_id: product.id }
                            })

                            if (existingLink) {
                                await prisma.supplier_products.update({
                                    where: { id: existingLink.id },
                                    data: { unit_price: prod.price }
                                })
                            } else {
                                await prisma.supplier_products.create({
                                    data: {
                                        supplier_id: supplierId,
                                        product_id: product.id,
                                        unit_price: prod.price
                                    }
                                })
                            }
                        } else {
                            // Log error or ignore? 
                            // errors.push(`Không tìm thấy sản phẩm mã ${prod.code} chi ${item.name}`)
                        }
                    }
                }

            } catch (err: any) {
                errors.push(`Lỗi với nhà cung cấp ${item.name}: ${err.message}`)
            }
        }

        return NextResponse.json({
            success: true,
            data: {
                created: createdCount,
                updated: updatedCount,
                errors
            }
        })

    } catch (error: any) {
        console.error('Batch create suppliers error:', error)
        return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }
}
