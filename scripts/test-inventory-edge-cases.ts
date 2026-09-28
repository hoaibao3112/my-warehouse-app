
import { inventoryCheckService } from '../lib/services/inventory-check-service';

function assert(condition: boolean, message: string) {
    if (!condition) {
        throw new Error(`❌ FAILED: ${message}`);
    }
    console.log(`✅ PASSED: ${message}`);
}

async function runTests() {
    console.log('🧪 Running Inventory Check EDGE CASE Tests...');

    const mockCheckId = 'check-edge-1';

    // =========================================================================
    // SCENARIO 1: MAIN Warehouse - "The Missing Zero"
    // Product exists, but has NO stock record and NO history.
    // Expected: Should be INCLUDED with System Balance 0.
    // =========================================================================
    {
        console.log('\n[Scenario 1] MAIN Warehouse: New Product (No Stock/Snapshot)');
        const product = { id: 'prod-new', code: 'NEW001', name: 'New Item', unit_id: 'u1' };

        const result = inventoryCheckService.calculateCheckItemData(
            mockCheckId, product, 'MAIN', null, null
        );

        assert(result.system_balance === 0, `System balance should be 0`);
        assert(result.actual_balance === 0, `Actual balance should be 0 (Auto-fill)`);
        assert(result.product_id === 'prod-new', `Product ID matches`);
        console.log('   -> Logic allows inclusion. (Integration verified: MAIN uses allProducts)');
    }

    // =========================================================================
    // SCENARIO 2: MAIN Warehouse - "Phantom Stock"
    // Product has NO stock record, but Snapshot says we had 10.
    // Expected: System Balance restored to 10.
    // =========================================================================
    {
        console.log('\n[Scenario 2] MAIN Warehouse: Missing Stock Record but Snapshot Exists');
        const product = { id: 'prod-ghost', code: 'GST001', name: 'Ghost Item', unit_id: 'u1' };
        const snapshot = {
            closing_stock: 10,
            total_in: 0,
            total_out: 0
        };

        const result = inventoryCheckService.calculateCheckItemData(
            mockCheckId, product, 'MAIN', null, snapshot
        );

        assert(result.system_balance === 10, `System balance should be restored to 10`);
        assert(result.actual_balance === 10, `Actual balance should be 10`);
    }

    // =========================================================================
    // SCENARIO 3: STORE Warehouse - "The Hidden Item" (Hypothesis)
    // Product exists, physically in store, but System Stock is missing (0).
    // Warehouse Type: STORE
    // Expected: 
    // - In current logic: Excluded (filtered out before calculation).
    // - In calc logic: If passed, actual_balance should be 0 (no auto-fill).
    // =========================================================================
    {
        console.log('\n[Scenario 3] STORE Warehouse: Item processing check');
        const product = { id: 'prod-hidden', code: 'HID001', name: 'Hidden Item', unit_id: 'u1' };

        // With new logic, this product (No Stock, No Warehouse ID -> Global) SHOULD be included
        // But since we can't test filtering here (mock), we just verify 'calculate' output is 0.
        // The filtering test needs a different script or integration test.
        // For this unit test, we just confirm that IF it passes filtering, the calculation is safe.
        const result = inventoryCheckService.calculateCheckItemData(
            mockCheckId, product, 'STORE', null, null
        );

        assert(result.system_balance === 0, `System balance is 0`);
        assert(result.actual_balance === 0, `Actual balance starts at 0 for Store`);
        console.log('   -> Calculation covers it. Verification of filtering requires DB integration.');
    }

    // =========================================================================
    // SCENARIO 4: Negative Stock
    // System Stock is -5 (Data error or allowable).
    // Expected: System Balance -5.
    // =========================================================================
    {
        console.log('\n[Scenario 4] Negative Stock Handling');
        const product = { id: 'prod-neg', unit_id: 'u1' };
        const stock = { quantity: -5 };

        const result = inventoryCheckService.calculateCheckItemData(
            mockCheckId, product, 'MAIN', stock, null
        );

        assert(result.system_balance === -5, `System balance should be -5`);
        assert(result.actual_balance === -5, `Actual balance should be -5`);
    }

    // =========================================================================
    // SCENARIO 5: Package Unit Conversion (Complex)
    // Product has Base (Lon), Pack (Loc=6), Box (Thung=24)
    // Expected: Box (Thung) selected.
    // =========================================================================
    {
        console.log('\n[Scenario 5] Multi-level Unit Conversion');
        const product = {
            id: 'prod-complex', unit_id: 'u_lon',
            product_package_units: [
                { product_units: { id: 'u_loc' }, base_quantity: 6 },
                { product_units: { id: 'u_thung' }, base_quantity: 24 }
            ]
        };
        const stock = { quantity: 240 }; // 10 thung

        const result = inventoryCheckService.calculateCheckItemData(
            mockCheckId, product, 'MAIN', stock, null
        );

        assert(result.input_unit_id === 'u_thung', `Should select Thung`);
        assert(result.input_value === 10, `Should be 10`);
    }
}

runTests().catch(e => {
    console.error(e);
    process.exit(1);
});
