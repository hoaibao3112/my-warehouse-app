export interface InventoryCheckProduct {
    id: string
    productId?: string
    productCode: string
    productName: string
    productUnit?: string
    productUnitId?: string
    openingBalance: number
    imports: number
    exports: number
    systemBalance: number
    actualBalance: number
    difference: number
    differencePercentage: number
    // Unit selection fields (from API)
    inputUnitId?: string
    inputUnitCode?: string
    inputValue?: number | null
    // Unit selection fields (for local state)
    selectedUnitId?: string
    conversionMultiplier?: number
}

export interface InventoryCheck {
    id: string
    number: string
    warehouse: string
    period: string
    status: "COMPLETED" | "IN_PROGRESS"
    createdBy: string
    createdAt: string
    items: InventoryCheckProduct[]
    canDelete?: boolean
    deleteBlockedReason?: string
}

export interface PromotionInvoice {
    invoiceNumber: string
    totalAmount: number
    discountAmount: number
    giftValue?: number
    createdAt: string
    createdBy: string
    items?: any[]
    giftItems?: any[]
}

export interface PromotionReport {
    promotion: {
        id: string
        name: string
        discountType: string
        discountValue: number
        status: boolean
        startDate: string
        endDate: string
        affectedProducts: number
        invoiceCount: number
        totalDiscount: number
        grossRevenue: number
        netRevenue: number
        totalGiftValue: number
        createdAt: string
        promotionType: string
    }
    invoices: PromotionInvoice[]
}

export interface VoucherInvoice {
    invoiceNumber: string
    voucherCode: string
    totalAmount: number
    discountAmount: number
    giftValue?: number
    createdAt: string
    createdBy: string
    items?: any[]
    giftItems?: any[]
}

export interface VoucherReport {
    program: {
        id: string
        programName: string
        discountType: string
        discountValue: number
        status: boolean
        totalCodes: number
        usedCodes: number
        usageRate: number
        startDate: string
        endDate: string
        invoiceCount: number
        grossRevenue: number
        netRevenue: number
        totalValue: number
        totalGiftValue: number
        createdAt: string
    }
    invoices: VoucherInvoice[]
}
