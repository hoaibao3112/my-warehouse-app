/**
 * Web/Desktop Printing Support
 * Generates HTML for printing via Browser Print Dialog
 */

function formatCurrency(amount: any): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
}

function formatDate(date: any): string {
  if (!date) return '';
  return new Date(date).toLocaleString('vi-VN');
}

// CSS Styles for Thermal + A4
const PRINT_STYLES = `
  @media print {
    @page { margin: 0; }
    body { margin: 0; }
  }
  body {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #000;
    margin: 0;
    padding: 10px;
    font-size: 13px;
    line-height: 1.4;
  }
  .container {
    max-width: 100%;
    margin: 0 auto;
  }
  /* Specific override for receipt if needed, but 100% is best for browser dialog scaling */
  
  .header { text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 15px; }
  .brand { font-size: 18px; font-weight: bold; text-transform: uppercase; margin: 0; }
  .title { font-size: 16px; font-weight: bold; text-transform: uppercase; margin-top: 5px; }
  
  .info-group { margin-bottom: 15px; }
  .info-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .label { color: #666; }
  .value { font-weight: 500; }
  
  table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
  th { border-bottom: 1px solid #000; text-align: left; padding: 5px 2px; font-size: 12px; }
  td { border-bottom: 1px dashed #ddd; padding: 6px 2px; vertical-align: top; }
  
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .bold { font-weight: bold; }
  
  .total-section { 
    border-top: 1px solid #000; 
    padding-top: 10px; 
    margin-top: 10px; 
  }
  .total-row { 
    display: flex; 
    justify-content: space-between; 
    font-size: 15px; 
    font-weight: bold; 
    margin-bottom: 5px;
  }
  
  .footer { 
    text-align: center; 
    margin-top: 25px; 
    font-style: italic; 
    color: #666;
    font-size: 12px;
  }
`;

/**
 * Generate Invoice HTML
 */
function generateInvoiceHTML(data: any): string {
  const itemsHtml = (data.items || []).map((item: any) => `
    <tr>
      <td>
        <div class="bold">${item.productName || item.name || 'SP'}</div>
        ${item.unit ? `<div style="font-size: 11px; color:#666">${item.unit}</div>` : ''}
      </td>
      <td class="text-center">${item.quantity}</td>
      <td class="text-right">${formatCurrency(item.unitPrice || item.price)}</td>
      <td class="text-right bold">${formatCurrency(item.total || (item.quantity * (item.unitPrice || item.price)))}</td>
    </tr>
  `).join('');

  return `
    <div class="header">
      <div class="brand">WAREHOUSE EXPRESS</div>
      <div class="title">HÓA ĐƠN BÁN HÀNG</div>
    </div>
    
    <div class="info-group">
      <div class="info-row"><span class="label">Mã HD:</span> <span class="value">${data.invoiceNumber || '---'}</span></div>
      <div class="info-row"><span class="label">Ngày:</span> <span class="value">${formatDate(data.date)}</span></div>
      <div class="info-row"><span class="label">NV:</span> <span class="value">${data.employeeName || '---'}</span></div>
      ${data.customerName ? `<div class="info-row"><span class="label">KH:</span> <span class="value">${data.customerName}</span></div>` : ''}
    </div>

    <table>
      <thead>
        <tr>
          <th style="width: 40%">Tên SP</th>
          <th style="width: 15%" class="text-center">SL</th>
          <th style="width: 20%" class="text-right">Đơn giá</th>
          <th style="width: 25%" class="text-right">Thành tiền</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="total-section">
      <div class="total-row">
        <span>TỔNG CỘNG:</span>
        <span>${formatCurrency(data.totalAmount)}</span>
      </div>
      ${data.paymentMethod ? `
      <div class="info-row" style="font-size: 13px; font-weight: normal; margin-top: 5px;">
        <span>Thanh toán:</span>
        <span>${data.paymentMethod}</span>
      </div>` : ''}
    </div>

    <div class="footer">
      <p>Cảm ơn quý khách!</p>
      <p>Hẹn gặp lại!</p>
    </div>
  `;
}

/**
 * Generate Transfer Voucher HTML (A4 style)
 */
function generateTransferVoucherHTML(data: any): string {
  const itemsHtml = (data.items || []).map((item: any, index: number) => `
    <tr>
      <td class="text-center">${index + 1}</td>
      <td>
        <div class="bold">${item.productName || item.name}</div>
        ${item.note ? `<div style="font-size: 11px; font-style: italic;">${item.note}</div>` : ''}
      </td>
      <td class="text-center">${item.unit || 'Cái'}</td>
      <td class="text-center bold">${item.quantity}</td>
    </tr>
  `).join('');

  return `
    <div class="header">
      <div class="brand">WAREHOUSE EXPRESS</div>
      <div class="title">PHIẾU CHUYỂN KHO</div>
      <div style="font-size: 11px; margin-top: 5px;">${data.transferNumber}</div>
    </div>
    
    <div class="info-group" style="border: 1px solid #ddd; padding: 10px; margin-bottom: 20px;">
      <div class="info-row"><span class="label">Ngày tạo:</span> <span class="value">${formatDate(data.date)}</span></div>
      <div class="info-row"><span class="label">Kho xuất:</span> <span class="value">${data.fromWarehouse}</span></div>
      <div class="info-row"><span class="label">Kho nhập:</span> <span class="value">${data.toWarehouse}</span></div>
      ${data.creator ? `<div class="info-row"><span class="label">Người lập:</span> <span class="value">${data.creator}</span></div>` : ''}
    </div>

    <table>
      <thead>
        <tr style="background-color: #f5f5f5;">
          <th style="width: 5%" class="text-center">STT</th>
          <th style="width: 55%">Tên hàng hóa</th>
          <th style="width: 20%" class="text-center">ĐVT</th>
          <th style="width: 20%" class="text-center">Số lượng</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <div class="footer" style="display: flex; justify-content: space-between; margin-top: 40px; text-align: center;">
      <div style="width: 30%;">
        <div class="bold">Người lập phiếu</div>
        <div style="font-size: 11px; font-style: italic;">(Ký, họ tên)</div>
      </div>
      <div style="width: 30%;">
        <div class="bold">Người giao hàng</div>
        <div style="font-size: 11px; font-style: italic;">(Ký, họ tên)</div>
      </div>
      <div style="width: 30%;">
        <div class="bold">Người nhận hàng</div>
        <div style="font-size: 11px; font-style: italic;">(Ký, họ tên)</div>
      </div>
    </div>
  `;
}

/**
 * Main print function for Web
 */
export async function printWebDocument(
  documentType: string,
  data: any
): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  let contentHtml = '';

  try {
    switch (documentType) {
      case 'invoice':
        contentHtml = generateInvoiceHTML(data);
        break;
      case 'transfer_voucher':
        contentHtml = generateTransferVoucherHTML(data);
        break;
      // Add other cases later via injection
      default:
        console.warn(`Web print template not implemented for: ${documentType}`);
        contentHtml = `<div class="text-center"><h3>Document: ${documentType}</h3><pre>${JSON.stringify(data, null, 2)}</pre></div>`;
    }
  } catch (error) {
    console.error('Error generating HTML:', error);
    return false;
  }

  // Create full HTML document
  const fullHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Print Preview</title>
      <style>${PRINT_STYLES}</style>
    </head>
    <body>
      <div class="container">
        ${contentHtml}
      </div>
    </body>
    </html>
  `;

  // Printing via hidden iframe
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.top = '0';
  iframe.style.left = '-9999px';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = 'none';

  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (doc) {
    doc.open();
    doc.write(fullHtml);
    doc.close();

    // Wait for content to load slightly
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();

      // Cleanup after print dialog usage (approximate)
      // Browsers don't give "afterprint" callback reliably for iframes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 5000);
    }, 500);

    return true;
  }

  return false;
}
