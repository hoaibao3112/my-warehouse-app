import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { getAuthToken } from '@/lib/auth-server';

// Document types that can have printer assignments
export const DOCUMENT_TYPES = [
  { value: 'invoice', label: 'Hóa đơn bán hàng' },
  { value: 'transfer_voucher', label: 'Phiếu chuyển kho' },
  { value: 'supplier_intake', label: 'Phiếu nhập NCC' },
  { value: 'shift_summary', label: 'Báo cáo ca' },
  { value: 'loss_report', label: 'Phiếu báo hao hụt' },
  { value: 'inventory_report', label: 'Báo cáo tồn kho' },
] as const;

export const PRINTER_FUNCTIONS = [
  { value: 'BILL', label: 'In hóa đơn (Bill)' },
  { value: 'KITCHEN', label: 'In lệnh bếp (Food/Kitchen)' },
  { value: 'LABEL', label: 'In tem nhãn (Drinks/Labels)' },
] as const;

/**
 * GET /api/warehouses/[id]/printer-configs
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const awaitedParams = await params;
    const currentWarehouseId = awaitedParams.id;

    // Get all printer configs
    const configs = await (prisma as any).warehouse_printer_configs.findMany({
      where: { warehouse_id: currentWarehouseId },
      include: {
        category_mappings: {
          select: {
            category_id: true,
            category: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { created_at: 'asc' }
    });

    // Get categories
    const categories = await (prisma as any).categories.findMany({
      where: {
        OR: [{ warehouse_id: currentWarehouseId }, { warehouse_id: null }]
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' }
    });

    return NextResponse.json({
      success: true,
      data: configs || [],
      metadata: {
        documentTypes: DOCUMENT_TYPES,
        printerFunctions: PRINTER_FUNCTIONS,
        categories
      }
    });
  } catch (error) {
    console.error('Error fetching printer configs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/warehouses/[id]/printer-configs
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const awaitedParams = await params;
    const warehouseIdFromParams = awaitedParams.id;

    const warehouse = await (prisma as any).warehouses.findUnique({
      where: { id: warehouseIdFromParams },
      select: { manager_id: true }
    });

    if (!warehouse) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });

    const isManager = warehouse.manager_id === user.id;
    const isAdmin = user.role === 'ADMIN';

    if (!isAdmin && !isManager) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });

    const body = await request.json();
    const {
      id: configId,
      printer_id,
      printer_name,
      printer_type = 'thermal_80mm',
      connection_type = 'bluetooth',
      ip_address,
      port,
      document_type,
      printer_function,
      category_ids = [],
      is_default = false,
    } = body;

    const result = await (prisma as any).$transaction(async (tx: any) => {
      let config;
      const data = {
        printer_id: printer_id || (ip_address ? `net:${ip_address}:${port || 9100}` : `gen:${Date.now()}`),
        printer_name: printer_name || (ip_address ? `Printer ${ip_address}` : 'Máy in mới'),
        printer_type,
        connection_type,
        ip_address: ip_address || null,
        port: port ? parseInt(port.toString()) : null,
        document_type: document_type || null,
        printer_function: printer_function || null,
        is_default,
      };

      if (configId) {
        config = await tx.warehouse_printer_configs.update({
          where: { id: configId },
          data: { ...data, updated_at: new Date() }
        });
        await tx.printer_category_mappings.deleteMany({ where: { printer_config_id: configId } });
      } else {
        // If it's a functional role, check if one already exists to avoid duplicates
        if (printer_function) {
          const existing = await tx.warehouse_printer_configs.findFirst({
            where: {
              warehouse_id: warehouseIdFromParams,
              printer_function: printer_function
            }
          });

          if (existing) {
            config = await tx.warehouse_printer_configs.update({
              where: { id: existing.id },
              data: { ...data, updated_at: new Date() }
            });
            await tx.printer_category_mappings.deleteMany({ where: { printer_config_id: existing.id } });
          } else {
            config = await tx.warehouse_printer_configs.create({
              data: { ...data, warehouse_id: warehouseIdFromParams }
            });
          }
        } else {
          config = await tx.warehouse_printer_configs.create({
            data: { ...data, warehouse_id: warehouseIdFromParams }
          });
        }
      }

      if (category_ids.length > 0 && (printer_function === 'KITCHEN' || printer_function === 'LABEL')) {
        await tx.printer_category_mappings.createMany({
          data: category_ids.map((catId: string) => ({ printer_config_id: config.id, category_id: catId }))
        });
      }

      return await tx.warehouse_printer_configs.findUnique({
        where: { id: config.id },
        include: { category_mappings: { include: { category: true } } }
      });
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error saving printer config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/warehouses/[id]/printer-configs
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = getAuthToken(request);
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const awaitedParams = await params;
    const whId = awaitedParams.id;

    const { id: delTargetId } = await request.json().catch(() => ({}));
    const { searchParams } = new URL(request.url);
    const docType = searchParams.get('document_type');
    const finalDeleteId = delTargetId || searchParams.get('id');

    const warehouse = await (prisma as any).warehouses.findUnique({
      where: { id: whId },
      select: { manager_id: true }
    });

    if (!warehouse) return NextResponse.json({ error: 'Warehouse not found' }, { status: 404 });

    if (user.role !== 'ADMIN' && warehouse.manager_id !== user.id) {
      return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    }

    if (finalDeleteId) {
      await (prisma as any).warehouse_printer_configs.delete({ where: { id: finalDeleteId } });
    } else if (docType) {
      await (prisma as any).warehouse_printer_configs.deleteMany({
        where: { warehouse_id: whId, document_type: docType }
      });
    }

    return NextResponse.json({ success: true, message: 'Deleted successfully' });
  } catch (error) {
    console.error('Error deleting printer config:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
