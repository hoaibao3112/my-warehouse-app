/**
 * ESC/POS Command Generator
 * Generates ESC/POS commands for thermal printers (58mm/80mm)
 */

import type { PrinterType } from './print-service';

// ESC/POS Commands
const ESC = 0x1b;
const GS = 0x1d;
const LF = 0x0a;

export class ESCPOSGenerator {
  private commands: number[] = [];
  private printerType: PrinterType;
  private maxChars: number;

  constructor(printerType: PrinterType = 'thermal_80mm') {
    this.printerType = printerType;
    this.maxChars = printerType === 'thermal_58mm' ? 32 : 48;
  }

  /**
   * Initialize printer
   */
  initialize(): this {
    this.commands.push(ESC, 0x40);
    return this;
  }

  /**
   * Set text alignment
   */
  align(alignment: 'left' | 'center' | 'right'): this {
    const alignCode = alignment === 'left' ? 0x00 : alignment === 'center' ? 0x01 : 0x02;
    this.commands.push(ESC, 0x61, alignCode);
    return this;
  }

  /**
   * Set text size
   */
  textSize(width: 1 | 2, height: 1 | 2): this {
    const size = ((width - 1) << 4) | (height - 1);
    this.commands.push(ESC, 0x21, size * 0x10);
    return this;
  }

  /**
   * Set bold
   */
  bold(enabled: boolean = true): this {
    this.commands.push(ESC, 0x45, enabled ? 0x01 : 0x00);
    return this;
  }

  /**
   * Set underline
   */
  underline(mode: 0 | 1 | 2 = 1): this {
    this.commands.push(ESC, 0x2d, mode);
    return this;
  }

  /**
   * Add text
   */
  text(str: string): this {
    const bytes = this.stringToBytes(str);
    this.commands.push(...bytes);
    return this;
  }

  /**
   * Add line
   */
  line(str: string): this {
    return this.text(str + '\n');
  }

  /**
   * Add separator line
   */
  separator(char: string = '-'): this {
    return this.line(char.repeat(this.maxChars));
  }

  /**
   * Add double separator
   */
  doubleSeparator(): this {
    return this.line('='.repeat(this.maxChars));
  }

  /**
   * Add empty line
   */
  newLine(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.commands.push(LF);
    }
    return this;
  }

  /**
   * Add two-column text (left and right aligned)
   */
  twoColumns(left: string, right: string): this {
    const totalChars = this.maxChars;
    const rightLen = right.length;
    const leftLen = totalChars - rightLen;
    const paddedLeft = left.substring(0, leftLen).padEnd(leftLen, ' ');
    return this.line(paddedLeft + right);
  }

  /**
   * Add table row
   */
  tableRow(columns: string[], widths?: number[]): this {
    if (!widths) {
      // Equal width for all columns
      const colWidth = Math.floor(this.maxChars / columns.length);
      widths = Array(columns.length).fill(colWidth);
    }

    let row = '';
    columns.forEach((col, i) => {
      const width = widths![i];
      row += col.substring(0, width).padEnd(width, ' ');
    });

    return this.line(row);
  }

  /**
   * Add barcode (Code128)
   */
  barcode(data: string, type: number = 73): this {
    this.commands.push(GS, 0x48, 0x02); // Print barcode text below
    this.commands.push(GS, 0x68, 0x50); // Barcode height
    this.commands.push(GS, 0x77, 0x02); // Barcode width
    this.commands.push(GS, 0x6b, type, data.length, ...this.stringToBytes(data));
    return this;
  }

  /**
   * Add QR code
   */
  qrCode(data: string, size: number = 6): this {
    const bytes = this.stringToBytes(data);
    const pL = bytes.length % 256;
    const pH = Math.floor(bytes.length / 256);

    // QR Code model
    this.commands.push(GS, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00);
    // QR Code size
    this.commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, size);
    // QR Code error correction
    this.commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x30);
    // Store QR Code data
    this.commands.push(GS, 0x28, 0x6b, pL + 3, pH, 0x31, 0x50, 0x30, ...bytes);
    // Print QR Code
    this.commands.push(GS, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);

    return this;
  }

  /**
   * Feed paper
   */
  feed(lines: number = 1): this {
    this.commands.push(ESC, 0x64, lines);
    return this;
  }

  /**
   * Cut paper
   */
  cut(partial: boolean = false): this {
    this.commands.push(GS, 0x56, partial ? 0x01 : 0x00);
    return this;
  }

  /**
   * Open cash drawer
   */
  openDrawer(): this {
    this.commands.push(ESC, 0x70, 0x00, 0x19, 0xfa);
    return this;
  }

  /**
   * Get byte array
   */
  getBytes(): Uint8Array {
    return new Uint8Array(this.commands);
  }

  /**
   * Reset commands
   */
  reset(): this {
    this.commands = [];
    return this;
  }

  /**
   * Convert string to byte array
   */
  private stringToBytes(str: string): number[] {
    const bytes: number[] = [];
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      // Handle Vietnamese characters (convert to closest ASCII or use UTF-8)
      if (char > 127) {
        // For simplicity, replace with closest ASCII
        bytes.push(this.vietnameseToASCII(char));
      } else {
        bytes.push(char);
      }
    }
    return bytes;
  }

  /**
   * Convert Vietnamese characters to ASCII approximation
   */
  private vietnameseToASCII(char: number): number {
    // Basic Vietnamese to ASCII mapping
    const mapping: Record<number, number> = {
      // á à ả ã ạ
      225: 97, 224: 97, 7843: 97, 227: 97, 7841: 97,
      // Á À Ả Ã Ạ
      193: 65, 192: 65, 7842: 65, 195: 65, 7840: 65,
      // é è ẻ ẽ ẹ
      233: 101, 232: 101, 7867: 101, 7869: 101, 7865: 101,
      // É È Ẻ Ẽ Ẹ
      201: 69, 200: 69, 7866: 69, 7868: 69, 7864: 69,
      // ó ò ỏ õ ọ
      243: 111, 242: 111, 7887: 111, 245: 111, 7885: 111,
      // Ó Ò Ỏ Õ Ọ
      211: 79, 210: 79, 7886: 79, 213: 79, 7884: 79,
      // ú ù ủ ũ ụ
      250: 117, 249: 117, 7911: 117, 361: 117, 7909: 117,
      // Ú Ù Ủ Ũ Ụ
      218: 85, 217: 85, 7910: 85, 360: 85, 7908: 85,
      // í ì ỉ ĩ ị
      237: 105, 236: 105, 7881: 105, 297: 105, 7883: 105,
      // Í Ì Ỉ Ĩ Ị
      205: 73, 204: 73, 7880: 73, 296: 73, 7882: 73,
      // ý ỳ ỷ ỹ ỵ
      253: 121, 7923: 121, 7927: 121, 7929: 121, 7925: 121,
      // Ý Ỳ Ỷ Ỹ Ỵ
      221: 89, 7922: 89, 7926: 89, 7928: 89, 7924: 89,
      // đ Đ
      273: 100, 272: 68
    };

    return mapping[char] || 63; // 63 = '?'
  }
}

/**
 * Format currency (Vietnamese Dong)
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND'
  }).format(amount);
}

/**
 * Format date (Vietnamese format)
 * Uses UTC components since database stores Vietnam time as UTC
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // Database stores Vietnam time as UTC, so use UTC components
  const day = d.getUTCDate().toString().padStart(2, '0');
  const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = d.getUTCFullYear();
  const hours = d.getUTCHours().toString().padStart(2, '0');
  const minutes = d.getUTCMinutes().toString().padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

/**
 * Pad string to width
 */
export function padString(str: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
  if (str.length >= width) {
    return str.substring(0, width);
  }

  if (align === 'left') {
    return str.padEnd(width, ' ');
  } else if (align === 'right') {
    return str.padStart(width, ' ');
  } else {
    const totalPad = width - str.length;
    const leftPad = Math.floor(totalPad / 2);
    const rightPad = totalPad - leftPad;
    return ' '.repeat(leftPad) + str + ' '.repeat(rightPad);
  }
}
