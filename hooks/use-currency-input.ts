import { useCallback } from 'react'

/**
 * Hook for handling currency input formatting
 * Automatically formats numbers with thousand separators (e.g., 10000 -> 10.000)
 * Removes formatting when retrieving the numeric value
 */
export function useCurrencyInput() {
  /**
   * Format number to display with thousand separators
   * @param value The numeric value to format
   * @returns Formatted string with thousand separators
   */
  const formatDisplay = useCallback((value: number | string): string => {
    if (!value && value !== 0) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return num.toLocaleString('vi-VN')
  }, [])

  /**
   * Handle input change event and format the display
   * @param value The raw input value (can include dots from display formatting)
   * @returns Object with formatted display value and numeric value
   */
  const handleInputChange = useCallback((value: string): { display: string; numeric: number } => {
    // First, remove all dots (thousand separators) from display value
    // Only keep digits to extract the actual numeric value
    const cleanedValue = value.replace(/\./g, '')

    // Now extract only digits and optionally a decimal point
    // This removes any other characters the user might accidentally type
    const numericStr = cleanedValue.replace(/[^0-9]/g, '')

    // Convert to number
    const numeric = numericStr ? parseInt(numericStr, 10) : 0

    if (isNaN(numeric)) {
      return { display: '', numeric: 0 }
    }

    // Format for display with thousand separators
    const display = numeric.toLocaleString('vi-VN')

    return { display, numeric }
  }, [])

  /**
   * Get numeric value from formatted display string
   * @param displayValue The formatted display string (with thousand separators)
   * @returns The numeric value
   */
  const getNumericValue = useCallback((displayValue: string): number => {
    if (!displayValue) return 0
    // Remove all dots (thousand separators) from display string
    const cleanedValue = displayValue.replace(/\./g, '')
    // Extract only digits
    const numericStr = cleanedValue.replace(/[^0-9]/g, '')
    const numeric = numericStr ? parseInt(numericStr, 10) : 0
    return numeric
  }, [])

  return {
    formatDisplay,
    handleInputChange,
    getNumericValue,
  }
}
