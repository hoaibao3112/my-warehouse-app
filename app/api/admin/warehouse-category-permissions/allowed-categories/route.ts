import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAuthToken } from "@/lib/auth-server";
import { verifyToken } from "@/lib/auth";

async function getUser(request: NextRequest) {
  // Use getAuthToken which supports both Bearer token (mobile) and cookies (web)
  const token = getAuthToken(request);

  if (!token) {
    return null;
  }

  try {
    const user = verifyToken(token);
    if (!user?.id) {
      return null;
    }

    // Refresh user from DB to get latest data (permissions might have changed)
    const dbUser = await prisma.users.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) return null;

    // Map to User type
    return {
      id: dbUser.id,
      email: dbUser.email,
      fullName: dbUser.full_name,
      role: dbUser.role as any,
      // phone: dbUser.phone,
      // address: dbUser.address,
      warehouseId: dbUser.warehouse_id || undefined,
      isActive: dbUser.is_active ?? true,
      createdAt: dbUser.created_at,
      updatedAt: dbUser.updated_at,
      permissions: dbUser.permissions ? JSON.parse(dbUser.permissions as string) : [],
    };
  } catch (err) {
    console.error("Token verification failed:", err);
    return null;
  }
}

/**
 * @swagger
 * /api/admin/warehouse-category-permissions/allowed-categories:
 *   get:
 *     summary: Get Allowed Categories
 *     description: Get only categories that are allowed to be sold in a warehouse.
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
 *         description: List of allowed categories
 *       400:
 *         description: Missing warehouseId
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getUser(request);
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
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

    // Get warehouse type and check if any permissions exist
    const [warehouse, totalPermissions] = await Promise.all([
      prisma.warehouses.findUnique({
        where: { id: warehouseId },
        select: { type: true }
      }),
      prisma.warehouse_category_permissions.count({
        where: { warehouse_id: warehouseId }
      })
    ]);

    if (!warehouse) {
      return NextResponse.json(
        { error: "Warehouse not found" },
        { status: 404 }
      );
    }

    let whereClause: any = {};

    // Logic:
    // If permissions exist (totalPermissions > 0) -> Strict Mode (Whitelist)
    // If NO permissions exist -> Permissive Mode (Allow All)
    // This ensures existing stores (unconfigured) continue to work, 
    // while Franchises (configured) are restricted.

    if (totalPermissions > 0) {
      // Get all allowed category permissions for this warehouse
      const allowedPermissions = await prisma.warehouse_category_permissions.findMany({
        where: {
          warehouse_id: warehouseId,
          is_allowed: true,
        },
        select: {
          category_id: true,
        },
      });

      const allowedCategoryIds = allowedPermissions.map((p) => p.category_id);

      if (allowedCategoryIds.length > 0) {
        whereClause = { id: { in: allowedCategoryIds } };
      } else {
        // Configured but nothing allowed -> Deny All
        // Use a condition that is always false for IDs
        whereClause = { id: { in: [] } };
      }
    } else {
      // No permissions configured -> Apply Default Scope based on Warehouse Type
      // preventing Franchise from seeing Main Warehouse items by default.

      let orConditions: any[] = [];

      if (warehouse.type === 'PARTNER') {
        // STRICT ISOLATION: Partner sees ONLY Own items.
        // No Global items allowed unless explicitly permitted via whitelist.
        orConditions = [
          { warehouse_id: warehouseId }
        ];
      }
      else if (warehouse.type === "STORE") {
        // STORE: Own + Global + Main
        orConditions = [
          { warehouse_id: null },        // Global allowed
          { warehouse_id: warehouseId }  // Own allowed
        ];

        const mainWarehouse = await prisma.warehouses.findFirst({
          where: { type: "MAIN", is_active: true },
          select: { id: true }
        });

        if (mainWarehouse && mainWarehouse.id !== warehouseId) {
          orConditions.push({ warehouse_id: mainWarehouse.id });
        }
      }
      else {
        // MAIN, ADMIN, OTHERS: Own + Global
        orConditions = [
          { warehouse_id: null },
          { warehouse_id: warehouseId }
        ];
      }

      whereClause = { OR: orConditions };
    }

    const allowedCategories = await prisma.categories.findMany({
      where: whereClause,
      include: {
        menu_types: true,
        products: {
          select: { id: true },
        },
      },
      orderBy: {
        name: "asc",
      },
    });


    // Group by menu_type
    const grouped = allowedCategories.reduce(
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
      categories: allowedCategories,
      grouped,
      total: allowedCategories.length,
    });
  } catch (error) {
    console.error("Error fetching allowed categories:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
