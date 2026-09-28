/**
 * usePrint Hook
 * Hybrid printing hook that works on both web and mobile
 */

import { useState } from 'react';
import { toast } from 'sonner';
import { isNativePlatform } from '@/lib/mobile/platform';
import { printDocument, type DocumentType } from '@/lib/mobile/print-service';
import { formatDbDateToDisplay } from '@/lib/server-time';

interface UsePrintOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
}

export function usePrint(options?: UsePrintOptions) {
  const [isPrinting, setIsPrinting] = useState(false);
  const isMobile = isNativePlatform();

  /**
   * Print on web using window.print()
   */
  const printWeb = (htmlContent: string, title: string = 'Print') => {
    const printWindow = window.open('', '', 'height=600,width=800');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
      printWindow.print();
      return true;
    }
    return false;
  };

  /**
   * Print on mobile using Bluetooth printer
   */
  const printMobile = async (documentType: DocumentType, data: any, printerId?: string, warehouseId?: string) => {
    try {
      await printDocument(documentType, data, printerId, warehouseId);
      return true;
    } catch (error) {
      console.error('Mobile print error:', error);
      throw error;
    }
  };

  /**
   * Print invoice (hybrid)
   */
  const printInvoice = async (invoice: any, warehouseId?: string) => {
    setIsPrinting(true);

    try {
      if (isMobile) {
        // Mobile: Use Bluetooth printer with warehouse-specific configuration
        await printMobile('invoice', {
          invoiceNumber: invoice.invoice_number,
          date: invoice.created_at,
          employeeName: invoice.created_by,
          items: invoice.items?.map((item: any) => ({
            productName: item.product_recipes?.name || item.name || 'N/A',
            quantity: item.quantity,
            unitPrice: item.unit_price,
            total: item.line_total
          })) || [],
          totalAmount: invoice.total_amount,
          vatAmount: invoice.vat_amount || 0,
          hasVat: invoice.has_vat || false,
          paymentMethod: invoice.payment_method || 'Tiền mặt'
        }, undefined, warehouseId);

        toast.success('In hóa đơn thành công!');
        options?.onSuccess?.();
      } else {
        // Web: Use window.print()
        const htmlContent = generateInvoiceHTML(invoice);
        const success = printWeb(htmlContent, `Hóa đơn ${invoice.invoice_number}`);

        if (success) {
          options?.onSuccess?.();
        } else {
          throw new Error('Không thể mở cửa sổ in');
        }
      }
    } catch (error) {
      console.error('Print error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Lỗi khi in hóa đơn';
      toast.error(errorMessage);
      options?.onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsPrinting(false);
    }
  };

  /**
   * Print transfer voucher (hybrid)
   */
  const printTransferVoucher = async (voucher: any, warehouseId?: string) => {
    setIsPrinting(true);

    try {
      if (isMobile) {
        await printMobile('transfer_voucher', {
          transferNumber: voucher.transfer_number || voucher.id,
          date: voucher.created_at,
          fromWarehouse: voucher.from_warehouse?.name || 'N/A',
          toWarehouse: voucher.to_warehouse?.name || 'N/A',
          exporter: voucher.exporter_name || 'N/A',
          receiver: voucher.receiver_name || 'N/A',
          items: voucher.items?.map((item: any) => ({
            productName: item.product?.name || item.name || 'N/A',
            quantity: item.quantity,
            unit: item.unit || 'cái',
            note: item.note || ''
          })) || []
        }, undefined, warehouseId);

        toast.success('In phiếu chuyển kho thành công!');
        options?.onSuccess?.();
      } else {
        // Web: Fallback to existing PDF download or window.print
        toast.info('Tính năng in phiếu chuyển kho chỉ khả dụng trên mobile');
      }
    } catch (error) {
      console.error('Print error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Lỗi khi in phiếu';
      toast.error(errorMessage);
      options?.onError?.(error instanceof Error ? error : new Error(errorMessage));
    } finally {
      setIsPrinting(false);
    }
  };

  /**
   * Print shift summary
   */
  const printShiftSummary = async (shift: any, warehouseId?: string) => {
    setIsPrinting(true);

    try {
      if (isMobile) {
        await printMobile('shift_summary', {
          shiftId: shift.id,
          employeeName: shift.employee_name,
          startTime: shift.start_time,
          endTime: shift.end_time,
          totalOrders: shift.total_orders || 0,
          totalRevenue: shift.total_revenue || 0,
          paymentBreakdown: shift.payment_breakdown || {},
          openingCash: shift.opening_cash || 0,
          closingCash: shift.closing_cash || 0,
          topProducts: shift.top_products || []
        }, undefined, warehouseId);

        toast.success('In báo cáo ca thành công!');
        options?.onSuccess?.();
      } else {
        toast.info('Tính năng in báo cáo ca chỉ khả dụng trên mobile');
      }
    } catch (error) {
      console.error('Print error:', error);
      toast.error(error instanceof Error ? error.message : 'Lỗi khi in báo cáo');
      options?.onError?.(error instanceof Error ? error : new Error('Print failed'));
    } finally {
      setIsPrinting(false);
    }
  };

  /**
   * Generic print function
   */
  const print = async (documentType: DocumentType, data: any) => {
    setIsPrinting(true);

    try {
      if (isMobile) {
        await printMobile(documentType, data);
        toast.success('In thành công!');
        options?.onSuccess?.();
      } else {
        toast.info('Tính năng in chỉ khả dụng trên mobile');
      }
    } catch (error) {
      console.error('Print error:', error);
      toast.error(error instanceof Error ? error.message : 'Lỗi khi in');
      options?.onError?.(error instanceof Error ? error : new Error('Print failed'));
    } finally {
      setIsPrinting(false);
    }
  };

  return {
    isPrinting,
    isMobile,
    printInvoice,
    printTransferVoucher,
    printShiftSummary,
    print
  };
}

/**
 * Generate HTML for invoice (web fallback)
 */
function generateInvoiceHTML(invoice: any): string {
  return `
    <html>
      <head>
        <title>Hóa Đơn ${invoice.invoice_number}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; margin-bottom: 30px; }
          .invoice-info { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin: 20px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; text-align: right; margin-top: 20px; }
          .vat { font-size: 14px; text-align: right; margin-top: 5px; color: #666; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>HÓA ĐƠN BÁN HÀNG</h1>
          <p>Số: ${invoice.invoice_number}</p>
        </div>

        <div class="invoice-info">
          <p><strong>Ngày:</strong> ${formatDbDateToDisplay(invoice.created_at)}</p>
          <p><strong>Nhân viên:</strong> ${invoice.created_by}</p>
        </div>

        <table>
          <thead>
            <tr>
              <th>Sản phẩm</th>
              <th>Số lượng</th>
              <th>Giá</th>
              <th>Thành tiền</th>
            </tr>
          </thead>
          <tbody>
            ${invoice.items
      ?.map(
        (item: any) => `
              <tr>
                <td>${item.product_recipes?.name || item.name || 'N/A'}</td>
                <td>${item.quantity}</td>
                <td>${Number(item.unit_price || 0).toLocaleString('vi-VN')}đ</td>
                <td>${Number(item.line_total || 0).toLocaleString('vi-VN')}đ</td>
              </tr>
            `
      )
      .join('') || ''}
          </tbody>
        </table>

        ${invoice.has_vat || (invoice.vat_amount && invoice.vat_amount > 0) ? `
          <div class="vat">
            VAT (8%): ${Number(invoice.vat_amount || 0).toLocaleString('vi-VN')}đ
          </div>
        ` : ''}

        <div class="total">
          Tổng tiền: ${Number(invoice.total_amount || 0).toLocaleString('vi-VN')}đ
        </div>
      </body>
    </html>
  `;
}
