/**
 * Inventory Management Services
 * 
 * New architecture with specialized services for each operation type
 * All services use:
 * - Unit conversion and validation
 * - Base unit storage in warehouse_stock_realtime
 * - Atomic updates with optimistic locking
 * - Comprehensive error handling
 */

export { unitConversionService, UnitConversionService } from './unit-conversion-service'
export type { ConversionResult, DisplayUnitOption } from './unit-conversion-service'

export { inventoryService, InventoryService, StockOperation } from './inventory-service'
export type { StockUpdateData, StockInfo } from './inventory-service'

export { importService, ImportService } from './import-service'
export type { ImportData, ImportItemData } from './import-service'

export { deductionService, DeductionService } from './deduction-service'
export type { RecipeDeductionData } from './deduction-service'

export { productionService, ProductionService } from './production-service'
export type { ProductionData } from './production-service'

export { adjustmentService, AdjustmentService } from './adjustment-service'
export type { AdjustmentData, AdjustmentItemData } from './adjustment-service'

export { transferService, TransferService } from './transfer-service'
export type { TransferRequestData, TransferItemData, TransferExportData, TransferReceiveData } from './transfer-service'

export { externalSalesService, ExternalSalesService } from './external-sales-service'
export type { ExternalSaleData, ExternalSaleItemData } from './external-sales-service'

export { inventoryCheckService, InventoryCheckService } from './inventory-check-service'
export type { InventoryCheckData, InventoryCheckItemData, InventoryCheckCompletionData } from './inventory-check-service'

export { recipeService, RecipeService } from './recipe-service'
export type { RecipeData, RecipeIngredientData } from './recipe-service'

export { packageUnitService, PackageUnitService } from './package-unit-service'
export type { PackageUnitData } from './package-unit-service'
