import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthToken } from "@/lib/auth-server";
import { verifyToken, isAdmin, hasPermission } from "@/lib/auth";

async function getUser(request: NextRequest) {
  const token = getAuthToken(request);

  if (!token) {
    return null;
  }

  try {
    const user = verifyToken(token);
    if (!user?.id) {
      return null;
    }

    // Refresh user from DB to get latest data
    const dbUser = await prisma.users.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) return null;

    // Map to User type
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      role: dbUser.role as any, // Cast to UserRole
      // phone: dbUser.phone, // Removed as it might not be in Prisma type
      // address: dbUser.address, // Removed as it might not be in Prisma type
      warehouseId: dbUser.warehouse_id || undefined, // Convert null to undefined
      isActive: dbUser.is_active ?? true, // Default to true if null
      createdAt: dbUser.created_at || new Date(),
      updatedAt: dbUser.updated_at || new Date(),
      permissions: dbUser.permissions ? JSON.parse(dbUser.permissions as string) : [],
    };
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}

/**
 * @swagger
 * /api/admin/warehouse-category-permissions:
 *   get:
 *     summary: get warehouse category permissions
 *     tags: [Admin - Warehouse Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: warehouseId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of permissions
 *   post:
 *     summary: Create/Update permission
 *     tags: [Admin - Warehouse Permissions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseId, categoryId]
 *             properties:
 *               warehouseId:
 *                 type: string
 *               categoryId:
 *                 type: string
 *               is_allowed:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Permission updated
 *   put:
 *     summary: Update multiple permissions
 *     tags: [Admin - Warehouse Permissions]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [warehouseId, permissions]
 *             properties:
 *               warehouseId:
 *                 type: string
 *               permissions:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     category_id:
 *                       type: string
 *                     is_allowed:
 *                       type: boolean
 *     responses:
 *       200:
 *         description: Permissions updated
 *   delete:
 *     summary: Delete permission
 *     tags: [Admin - Warehouse Permissions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Permission deleted
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user || !hasPermission(user, "category_management")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const warehouseId = searchParams.get("warehouseId");

    if (!warehouseId) {
      return NextResponse.json(
        { error: "warehouseId is required" },
        { status: 400 }
      );
    }

    // Get all permissions for this warehouse
    const permissions = await prisma.warehouse_category_permissions.findMany({
      where: { warehouse_id: warehouseId },
      include: {
        categories: {
          include: {
            menu_types: true,
          },
        },
      },
      orderBy: {
        categories: {
          name: "asc",
        },
      },
    });

    // Check target warehouse type for isolation logic
    const targetWarehouse = await prisma.warehouses.findUnique({
      where: { id: warehouseId },
      select: { type: true }
    });

    let categoryWhere = {};
    if (targetWarehouse?.type === 'STORE' || targetWarehouse?.type === 'PARTNER') {
      // Stores see only their own categories
      categoryWhere = { warehouse_id: warehouseId };
    } else {
      // Main warehouse or others see Global + Own
      categoryWhere = {
        OR: [
          { warehouse_id: null },
          { warehouse_id: warehouseId }
        ]
      };
    }

    // Get categories filtered by context
    const allCategories = await prisma.categories.findMany({
      where: categoryWhere,
      include: {
        menu_types: true,
        _count: {
          select: {
            products: true,
            product_recipes: true
          }
        }
      },
      orderBy: {
        name: "asc",
      },
    });

    // Map categories with permission status
    const categoriesWithPermissions = allCategories.map((category) => {
      const permission = permissions.find(
        (p) => p.category_id === category.id
      );
      return {
        ...category,
        _count: {
          products: (category._count?.products ?? 0) + (category._count?.product_recipes ?? 0)
        },
        is_allowed: permission ? permission.is_allowed : false,
        permission_id: permission?.id || null,
      };
    });

    // Group by menu_type
    const grouped = categoriesWithPermissions.reduce(
      (acc: any, cat: any) => {
        const menuTypeName = cat.menu_types?.name || "Không phân loại";
        if (!acc[menuTypeName]) {
          acc[menuTypeName] = [];
        }
        acc[menuTypeName].push(cat);
        return acc;
      },
      {}
    );

    return NextResponse.json({
      warehouseId,
      categories: categoriesWithPermissions,
      grouped,
    });
  } catch (error) {
    console.error("Error fetching warehouse category permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/warehouse-category-permissions
 * Create or update category permission for a warehouse
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user || !hasPermission(user, "category_management")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { warehouseId, categoryId, is_allowed } = await request.json();

    if (!warehouseId || !categoryId) {
      return NextResponse.json(
        { error: "warehouseId and categoryId are required" },
        { status: 400 }
      );
    }

    // Check if permission already exists
    const existing = await prisma.warehouse_category_permissions.findUnique({
      where: {
        warehouse_id_category_id: {
          warehouse_id: warehouseId,
          category_id: categoryId,
        },
      },
    });

    let permission;
    if (existing) {
      // Update existing
      permission = await prisma.warehouse_category_permissions.update({
        where: { id: existing.id },
        data: { is_allowed: is_allowed !== false },
      });
    } else {
      // Create new
      permission = await prisma.warehouse_category_permissions.create({
        data: {
          warehouse_id: warehouseId,
          category_id: categoryId,
          is_allowed: is_allowed !== false,
        },
      });
    }

    return NextResponse.json(permission);
  } catch (error) {
    console.error("Error creating/updating warehouse category permission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/warehouse-category-permissions
 * Update multiple permissions at once
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user || !hasPermission(user, "category_management")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { warehouseId, permissions } = await request.json();

    if (!warehouseId || !Array.isArray(permissions)) {
      return NextResponse.json(
        { error: "warehouseId and permissions array are required" },
        { status: 400 }
      );
    }

    // Use transaction to update multiple permissions
    const result = await prisma.$transaction(
      permissions.map((perm: any) =>
        prisma.warehouse_category_permissions.upsert({
          where: {
            warehouse_id_category_id: {
              warehouse_id: warehouseId,
              category_id: perm.category_id,
            },
          },
          create: {
            warehouse_id: warehouseId,
            category_id: perm.category_id,
            is_allowed: perm.is_allowed !== false,
          },
          update: {
            is_allowed: perm.is_allowed !== false,
          },
        })
      )
    );

    return NextResponse.json({
      message: "Permissions updated successfully",
      updatedCount: result.length,
    });
  } catch (error) {
    console.error("Error updating warehouse category permissions:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/warehouse-category-permissions
 * Delete a permission (revert to default)
 */
export async function DELETE(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user || !hasPermission(user, "category_management")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const permissionId = searchParams.get("id");

    if (!permissionId) {
      return NextResponse.json(
        { error: "permission id is required" },
        { status: 400 }
      );
    }

    await prisma.warehouse_category_permissions.delete({
      where: { id: permissionId },
    });

    return NextResponse.json({
      message: "Permission deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting warehouse category permission:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
