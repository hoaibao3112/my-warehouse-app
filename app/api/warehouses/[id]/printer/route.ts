import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-server';

/**
 * GET /api/warehouses/[id]/printer
 * Get printer configuration for warehouse
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    const warehouses = await query(
      `SELECT id, name, default_printer_id, require_printer
       FROM warehouses
       WHERE id = ?`,
      [id]
    );

    if (!warehouses || warehouses.length === 0) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: warehouses[0],
    });
  } catch (error) {
    console.error('Error fetching warehouse printer config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/warehouses/[id]/printer
 * Update printer configuration for warehouse
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = verifyToken(token);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;

    // Check if user is admin or warehouse manager
    const warehouses = await query(
      `SELECT manager_id FROM warehouses WHERE id = ?`,
      [id]
    );

    if (!warehouses || warehouses.length === 0) {
      return NextResponse.json(
        { error: 'Warehouse not found' },
        { status: 404 }
      );
    }

    const warehouse = warehouses[0];
    const isManager = warehouse.manager_id === user.id;
    const isAdmin = user.role === 'ADMIN' || user.role === 'SUPER_ADMIN';

    if (!isAdmin && !isManager) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { default_printer_id, require_printer } = body;

    await query(
      `UPDATE warehouses
       SET default_printer_id = ?,
           require_printer = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [default_printer_id || null, require_printer ?? false, id]
    );

    // Fetch updated warehouse
    const updated = await query(
      `SELECT id, name, default_printer_id, require_printer
       FROM warehouses
       WHERE id = ?`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: updated[0],
    });
  } catch (error) {
    console.error('Error updating warehouse printer config:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
