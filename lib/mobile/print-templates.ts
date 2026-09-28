/**
 * Print Templates for Different Document Types
 */

import { ESCPOSGenerator, formatCurrency, formatDate, padString } from './escpos-generator';
import type { PrinterType } from './print-service';

/**
 * Print Sales Invoice (Hóa đơn bán hàng)
 */
export function generateInvoicePrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);
  const width = printerType === 'thermal_58mm' ? 32 : 48;

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 2)
    .line('WAREHOUSE')
    .line('EXPRESS')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .line('HOA DON BAN HANG')
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ma HD:', data.invoiceNumber || 'N/A')
    .twoColumns('Ngay:', formatDate(data.date || new Date()))
    .twoColumns('NV:', data.employeeName || 'N/A')
    .separator()
    .newLine();

  // Products table header
  if (width >= 48) {
    printer.tableRow(['San pham', 'SL', 'Gia', 'Tong'], [24, 6, 10, 8]);
  } else {
    printer.line('San pham');
  }

  printer.separator();

  // Products
  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any) => {
      if (width >= 48) {
        const name = padString(item.productName || item.name || '', 24);
        const qty = padString(String(item.quantity || 0), 6, 'right');
        const price = padString(formatCurrency(item.unitPrice || item.price || 0).substring(0, 10), 10, 'right');
        const total = padString(formatCurrency(item.total || (item.quantity * item.unitPrice) || 0).substring(0, 8), 8, 'right');
        printer.line(name + qty + price + total);
      } else {
        // 58mm format
        printer
          .line(item.productName || item.name || '')
          .twoColumns(
            `  ${item.quantity}x ${formatCurrency(item.unitPrice || item.price || 0)}`,
            formatCurrency(item.total || (item.quantity * (item.unitPrice || item.price)) || 0)
          );
      }
    });
  }

  printer
    .separator()
    .newLine()
    .bold(true)
    .textSize(2, 2)
    .twoColumns('TONG:', formatCurrency(data.totalAmount || 0))
    .textSize(1, 1)
    .bold(false)
    .newLine();

  // Payment method
  if (data.paymentMethod) {
    printer.twoColumns('Thanh toan:', data.paymentMethod);
  }

  // QR Code for invoice (if invoice number exists)
  if (data.invoiceNumber) {
    printer
      .newLine()
      .align('center')
      .qrCode(data.invoiceNumber, 6)
      .newLine();
  }

  printer
    .align('center')
    .line('Cam on quy khach!')
    .line('Hen gap lai!')
    .newLine(2)
    .feed(3)
    .cut();

  return printer.getBytes();
}

/**
 * Print Transfer Voucher (Phiếu chuyển kho)
 */
export function generateTransferVoucherPrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 1)
    .line('PHIEU CHUYEN KHO')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ma phieu:', data.transferNumber || 'N/A')
    .twoColumns('Ngay:', formatDate(data.date || new Date()))
    .separator()
    .twoColumns('Tu kho:', data.fromWarehouse || 'N/A')
    .twoColumns('Den kho:', data.toWarehouse || 'N/A')
    .twoColumns('Nguoi xuat:', data.exporter || 'N/A')
    .twoColumns('Nguoi nhan:', data.receiver || 'N/A')
    .separator()
    .newLine();

  // Items
  printer.line('DANH SACH SAN PHAM:');
  printer.separator();

  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any, index: number) => {
      printer
        .line(`${index + 1}. ${item.productName || item.name}`)
        .twoColumns(`   SL: ${item.quantity} ${item.unit || ''}`, `Ghi chu: ${item.note || '-'}`);
    });
  }

  printer
    .separator()
    .newLine(2)
    .line('Nguoi xuat kho:')
    .newLine(3)
    .line('________________')
    .newLine(2)
    .line('Nguoi nhan kho:')
    .newLine(3)
    .line('________________')
    .newLine(2);

  // QR Code
  if (data.transferNumber) {
    printer
      .align('center')
      .qrCode(data.transferNumber, 6)
      .newLine();
  }

  printer.feed(3).cut();

  return printer.getBytes();
}

/**
 * Print Supplier Intake Receipt (Phiếu nhập hàng từ NCC)
 */
export function generateSupplierIntakePrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 1)
    .line('PHIEU NHAP HANG')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ma phieu:', data.intakeNumber || 'N/A')
    .twoColumns('Ngay:', formatDate(data.date || new Date()))
    .separator()
    .twoColumns('NCC:', data.supplierName || 'N/A')
    .twoColumns('Kho:', data.warehouseName || 'N/A')
    .twoColumns('Nguoi nhap:', data.receiverName || 'N/A')
    .separator()
    .newLine();

  // Items
  printer.line('DANH SACH HANG:');
  printer.separator();

  let totalAmount = 0;

  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any, index: number) => {
      const itemTotal = (item.quantity || 0) * (item.unitPrice || 0);
      totalAmount += itemTotal;

      printer
        .line(`${index + 1}. ${item.productName || item.name}`)
        .twoColumns(
          `   ${item.quantity} ${item.unit || ''} x ${formatCurrency(item.unitPrice || 0)}`,
          formatCurrency(itemTotal)
        );
    });
  }

  printer
    .separator()
    .bold(true)
    .twoColumns('TONG TIEN:', formatCurrency(totalAmount))
    .bold(false)
    .newLine(2)
    .line('Nguoi giao hang:')
    .newLine(3)
    .line('________________')
    .newLine(2)
    .line('Nguoi nhan hang:')
    .newLine(3)
    .line('________________')
    .newLine(2);

  if (data.intakeNumber) {
    printer
      .align('center')
      .qrCode(data.intakeNumber, 6)
      .newLine();
  }

  printer.feed(3).cut();

  return printer.getBytes();
}

/**
 * Print Shift Summary (Báo cáo ca làm việc)
 */
export function generateShiftSummaryPrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 1)
    .line('BAO CAO CA LAM VIEC')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ma ca:', data.shiftId || 'N/A')
    .twoColumns('Nhan vien:', data.employeeName || 'N/A')
    .twoColumns('Bat dau:', formatDate(data.startTime || new Date()))
    .twoColumns('Ket thuc:', formatDate(data.endTime || new Date()))
    .separator()
    .newLine();

  // Sales summary
  printer
    .bold(true)
    .line('THONG KE BAN HANG:')
    .bold(false)
    .twoColumns('Tong don:', String(data.totalOrders || 0))
    .twoColumns('Doanh thu:', formatCurrency(data.totalRevenue || 0))
    .newLine();

  // Payment breakdown
  if (data.paymentBreakdown) {
    printer
      .bold(true)
      .line('THANH TOAN:')
      .bold(false)
      .twoColumns('Tien mat:', formatCurrency(data.paymentBreakdown.cash || 0))
      .twoColumns('The:', formatCurrency(data.paymentBreakdown.card || 0))
      .twoColumns('Chuyen khoan:', formatCurrency(data.paymentBreakdown.transfer || 0))
      .newLine();
  }

  // Cash management
  printer
    .bold(true)
    .line('QUAN LY TIEN MAT:')
    .bold(false)
    .twoColumns('Dau ca:', formatCurrency(data.openingCash || 0))
    .twoColumns('Cuoi ca:', formatCurrency(data.closingCash || 0))
    .twoColumns('Chenh lech:', formatCurrency((data.closingCash || 0) - (data.openingCash || 0)))
    .newLine();

  // Top products
  if (data.topProducts && data.topProducts.length > 0) {
    printer
      .bold(true)
      .line('SAN PHAM BAN CHAY:')
      .bold(false);

    data.topProducts.slice(0, 5).forEach((product: any, index: number) => {
      printer.twoColumns(
        `${index + 1}. ${product.name}`,
        `SL: ${product.quantity}`
      );
    });
    printer.newLine();
  }

  printer
    .separator()
    .align('center')
    .line('CHU KY NHAN VIEN')
    .newLine(3)
    .line('________________')
    .newLine(2)
    .feed(3)
    .cut();

  return printer.getBytes();
}

/**
 * Print Loss Report (Báo cáo hao hụt)
 */
export function generateLossReportPrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 1)
    .line('BAO CAO HAO HUT')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ma BC:', data.reportNumber || 'N/A')
    .twoColumns('Ngay:', formatDate(data.date || new Date()))
    .twoColumns('Kho:', data.warehouseName || 'N/A')
    .twoColumns('Nguoi lap:', data.reporterName || 'N/A')
    .separator()
    .newLine();

  // Items
  printer.line('DANH SACH HAO HUT:');
  printer.separator();

  let totalLoss = 0;

  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any, index: number) => {
      const itemLoss = (item.quantity || 0) * (item.unitPrice || 0);
      totalLoss += itemLoss;

      printer
        .line(`${index + 1}. ${item.productName || item.name}`)
        .twoColumns(`   SL hao hut: ${item.quantity} ${item.unit || ''}`, formatCurrency(itemLoss))
        .line(`   Ly do: ${item.reason || 'N/A'}`);
    });
  }

  printer
    .separator()
    .bold(true)
    .twoColumns('TONG THIET HAI:', formatCurrency(totalLoss))
    .bold(false)
    .newLine(2)
    .line('Nguoi lap bao cao:')
    .newLine(3)
    .line('________________')
    .newLine(2)
    .line('Nguoi phe duyet:')
    .newLine(3)
    .line('________________')
    .newLine(2)
    .feed(3)
    .cut();

  return printer.getBytes();
}

/**
 * Print Inventory Report (Báo cáo tồn kho)
 */
export function generateInventoryReportPrint(data: any, printerType: PrinterType): Uint8Array {
  const printer = new ESCPOSGenerator(printerType);

  printer
    .initialize()
    .align('center')
    .bold(true)
    .textSize(2, 1)
    .line('BAO CAO TON KHO')
    .textSize(1, 1)
    .bold(false)
    .newLine()
    .align('left')
    .separator()
    .twoColumns('Ngay BC:', formatDate(data.reportDate || new Date()))
    .twoColumns('Kho:', data.warehouseName || 'All')
    .separator()
    .newLine();

  // Items
  printer.line('DANH SACH TON KHO:');
  printer.separator();

  if (data.items && Array.isArray(data.items)) {
    data.items.forEach((item: any, index: number) => {
      printer
        .line(`${index + 1}. ${item.productName || item.name}`)
        .twoColumns(`   Ton: ${item.quantity} ${item.unit || ''}`, `Gia tri: ${formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}`);
    });
  }

  printer
    .separator()
    .twoColumns('Tong SP:', String(data.items?.length || 0))
    .twoColumns('Tong gia tri:', formatCurrency(data.totalValue || 0))
    .newLine(2)
    .align('center')
    .line('Het bao cao')
    .newLine(2)
    .feed(3)
    .cut();

  return printer.getBytes();
}

/**
 * Main function to generate print data based on document type
 */
export function generatePrintData(
  documentType: string,
  data: any,
  printerType: PrinterType
): Uint8Array {
  switch (documentType) {
    case 'invoice':
      return generateInvoicePrint(data, printerType);
    case 'transfer_voucher':
      return generateTransferVoucherPrint(data, printerType);
    case 'supplier_intake':
      return generateSupplierIntakePrint(data, printerType);
    case 'shift_summary':
      return generateShiftSummaryPrint(data, printerType);
    case 'loss_report':
      return generateLossReportPrint(data, printerType);
    case 'inventory_report':
      return generateInventoryReportPrint(data, printerType);
    default:
      throw new Error(`Unknown document type: ${documentType}`);
  }
}
