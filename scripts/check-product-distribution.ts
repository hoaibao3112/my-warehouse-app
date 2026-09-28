
import { prisma } from '@/lib/prisma';

async function check() {
    const total = await prisma.products.count();
    const withWarehouse = await prisma.products.count({
        where: { warehouse_id: { not: null } }
    });
    const withoutWarehouse = await prisma.products.count({
        where: { warehouse_id: null }
    });

    console.log(`Total Products: ${total}`);
    console.log(`With Warehouse ID: ${withWarehouse}`);
    console.log(`Global (No Warehouse ID): ${withoutWarehouse}`);

    if (withWarehouse > 0) {
        const sample = await prisma.products.findFirst({
            where: { warehouse_id: { not: null } },
            select: { name: true, warehouse_id: true }
        });
        console.log(`Sample private product: ${sample?.name} (${sample?.warehouse_id})`);
    }
}

check().catch(console.error);
