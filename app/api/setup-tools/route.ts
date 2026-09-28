import { NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken, isAdmin } from "@/lib/auth"

/**
 * POST /api/setup-tools
 *
 * Setup script to create the Tools/Equipment category
 * Only accessible to admin users
 *
 * Usage:
 * curl -X POST http://localhost:3000/api/setup-tools \
 *   -H "Cookie: auth-token=YOUR_TOKEN"
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate user - only admin can setup
    const token = getAuthToken(request)
    const user = token ? verifyToken(token) : null

    if (!user || !isAdmin(user)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized - Admin access required' } as ApiResponse<null>,
        { status: 401 }
      )
    }

    console.log('Starting Tools/Equipment category setup...')

    // 1. Create or find menu type
    const menuType = await prisma.menu_types.upsert({
      where: { name: 'Công Cụ & Dụng Cụ' },
      update: {},
      create: {
        name: 'Công Cụ & Dụng Cụ',
      },
    })

    console.log('✓ Menu Type created/found:', { id: menuType.id, name: menuType.name })

    // 2. Create or find category
    const category = await prisma.categories.upsert({
      where: { name: 'Công Cụ Dụng Cụ' },
      update: { menu_type_id: menuType.id },
      create: {
        name: 'Công Cụ Dụng Cụ',
        menu_type_id: menuType.id,
      },
    })

    console.log('✓ Category created/found:', { id: category.id, name: category.name })

    return NextResponse.json({
      success: true,
      data: {
        menuType: { id: menuType.id, name: menuType.name },
        category: { id: category.id, name: category.name },
      },
      message: 'Tools/Equipment category setup completed successfully!',
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error('Error setting up tools category:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to setup tools category' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}

/**
 * GET /api/setup-tools
 *
 * Check if tools category exists
 */
export async function GET() {
  try {
    const menuType = await prisma.menu_types.findUnique({
      where: { name: 'Công Cụ & Dụng Cụ' },
    })

    const category = await prisma.categories.findUnique({
      where: { name: 'Công Cụ Dụng Cụ' },
    })

    const exists = !!menuType && !!category

    return NextResponse.json({
      success: true,
      data: {
        exists,
        menuType: menuType ? { id: menuType.id, name: menuType.name } : null,
        category: category ? { id: category.id, name: category.name } : null,
      },
      message: exists ? 'Tools category is already set up' : 'Tools category needs to be set up',
    } as ApiResponse<any>)
  } catch (error: any) {
    console.error('Error checking tools category:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to check tools category' } as ApiResponse<null>,
      { status: 500 }
    )
  }
}
