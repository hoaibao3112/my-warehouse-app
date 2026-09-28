/**
 * Temporary Invoice Number Generator for Offline Orders
 * Format: TEMP-{timestamp}-{random}
 * Example: TEMP-20250312143022-a7b3
 */

/**
 * Generate a temporary invoice number for offline orders
 * Ensures uniqueness across multiple devices
 */
export function generateTempInvoiceNumber(): string {
  const now = new Date()

  // Format: YYYYMMDDHHmmss
  const timestamp =
    now.getFullYear().toString() +
    (now.getMonth() + 1).toString().padStart(2, '0') +
    now.getDate().toString().padStart(2, '0') +
    now.getHours().toString().padStart(2, '0') +
    now.getMinutes().toString().padStart(2, '0') +
    now.getSeconds().toString().padStart(2, '0')

  // Add random 4-character suffix to prevent collisions
  // Uses base36 (0-9, a-z) for compact representation
  const random = Math.random().toString(36).substring(2, 6)

  return `TEMP-${timestamp}-${random}`
}

/**
 * Check if an invoice number is a temporary offline invoice
 */
export function isTempInvoice(invoiceNumber: string): boolean {
  return invoiceNumber.startsWith('TEMP-')
}

/**
 * Extract timestamp from temp invoice number
 */
export function extractTimestamp(tempInvoiceNumber: string): Date | null {
  if (!isTempInvoice(tempInvoiceNumber)) return null

  try {
    // TEMP-20250312143022-a7b3
    const parts = tempInvoiceNumber.split('-')
    if (parts.length !== 3) return null

    const timestampStr = parts[1]
    if (timestampStr.length !== 14) return null

    const year = parseInt(timestampStr.substring(0, 4))
    const month = parseInt(timestampStr.substring(4, 6)) - 1
    const day = parseInt(timestampStr.substring(6, 8))
    const hours = parseInt(timestampStr.substring(8, 10))
    const minutes = parseInt(timestampStr.substring(10, 12))
    const seconds = parseInt(timestampStr.substring(12, 14))

    return new Date(year, month, day, hours, minutes, seconds)
  } catch (error) {
    console.error('[InvoiceGenerator] Error extracting timestamp:', error)
    return null
  }
}
