// Re-export reports page from admin
// The admin reports page already handles role-based tab filtering:
// - WAREHOUSE_STAFF only sees "Kiểm Kê" tab
// - Other roles see all tabs including "Khuyến Mãi" and "Phiếu Giảm Giá"
export { default } from "@/app/admin/reports/page"
