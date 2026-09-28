/**
 * File Upload Validation Utility
 * Validates uploaded files to prevent malware and malicious content
 * 
 * Features:
 * - File extension whitelist
 * - MIME type validation
 * - File size limits
 * - Magic bytes (file signature) verification
 * - Content sanitization hints
 */

// Allowed file types configuration
export const ALLOWED_FILE_TYPES = {
    excel: {
        extensions: ['.xlsx', '.xls'],
        mimeTypes: [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
            'application/vnd.ms-excel', // .xls
            'application/octet-stream', // Generic binary (some browsers)
        ],
        // Magic bytes for different Excel formats
        magicBytes: [
            [0x50, 0x4B, 0x03, 0x04], // .xlsx (ZIP-based, starts with PK)
            [0x50, 0x4B, 0x05, 0x06], // .xlsx (empty ZIP)
            [0x50, 0x4B, 0x07, 0x08], // .xlsx (spanned ZIP)
            [0xD0, 0xCF, 0x11, 0xE0], // .xls (OLE2 Compound Document)
        ],
        maxSizeMB: 10,
    },
    csv: {
        extensions: ['.csv', '.txt'],
        mimeTypes: [
            'text/csv',
            'text/plain',
            'application/csv',
            'application/octet-stream',
        ],
        // CSV doesn't have specific magic bytes, validate by content
        magicBytes: null,
        maxSizeMB: 5,
    },
}

export interface FileValidationOptions {
    allowedTypes: ('excel' | 'csv')[]
    maxSizeMB?: number
    checkMagicBytes?: boolean
}

export interface FileValidationResult {
    valid: boolean
    error?: string
    detectedType?: string
    fileSize?: number
    fileName?: string
}

/**
 * Validate an uploaded file
 */
export async function validateUploadedFile(
    file: File | null | undefined,
    options: FileValidationOptions
): Promise<FileValidationResult> {
    // Check if file exists
    if (!file) {
        return { valid: false, error: 'Không có file được upload' }
    }

    const fileName = file.name || 'unknown'
    const fileSize = file.size

    // Check file name for suspicious patterns
    const suspiciousPatterns = [
        /\.exe$/i, /\.dll$/i, /\.bat$/i, /\.cmd$/i, /\.ps1$/i,
        /\.sh$/i, /\.php$/i, /\.jsp$/i, /\.asp$/i, /\.js$/i,
        /\.vbs$/i, /\.jar$/i, /\.scr$/i, /\.msi$/i,
        /\.\./,  // Path traversal
        /[\x00-\x1f]/, // Control characters
    ]

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(fileName)) {
            return {
                valid: false,
                error: `Tên file không hợp lệ hoặc chứa ký tự nguy hiểm: ${fileName}`,
                fileName,
                fileSize
            }
        }
    }

    // Get file extension
    const ext = '.' + fileName.split('.').pop()?.toLowerCase()

    // Check allowed extensions
    const allowedExtensions: string[] = []
    const allowedMimeTypes: string[] = []
    let maxSizeMB = options.maxSizeMB || 10
    let allowedMagicBytes: number[][] = []

    for (const type of options.allowedTypes) {
        const config = ALLOWED_FILE_TYPES[type]
        allowedExtensions.push(...config.extensions)
        allowedMimeTypes.push(...config.mimeTypes)
        if (config.magicBytes) {
            allowedMagicBytes.push(...config.magicBytes)
        }
        if (config.maxSizeMB < maxSizeMB) {
            maxSizeMB = config.maxSizeMB
        }
    }

    // Validate extension
    if (!allowedExtensions.includes(ext)) {
        return {
            valid: false,
            error: `File extension không được phép: ${ext}. Chỉ chấp nhận: ${allowedExtensions.join(', ')}`,
            fileName,
            fileSize
        }
    }

    // Validate MIME type (with flexibility for browser inconsistencies)
    if (file.type && !allowedMimeTypes.includes(file.type)) {
        // Some browsers report different MIME types, so we're lenient here
        // but log for monitoring
        console.warn(`[FileValidation] Unexpected MIME type: ${file.type} for file: ${fileName}`)
    }

    // Validate file size
    const fileSizeMB = fileSize / (1024 * 1024)
    if (fileSizeMB > maxSizeMB) {
        return {
            valid: false,
            error: `File quá lớn: ${fileSizeMB.toFixed(2)}MB. Giới hạn: ${maxSizeMB}MB`,
            fileName,
            fileSize
        }
    }

    // Check for empty files
    if (fileSize === 0) {
        return {
            valid: false,
            error: 'File rỗng, không có dữ liệu',
            fileName,
            fileSize
        }
    }

    // Validate magic bytes (file signature)
    if (options.checkMagicBytes !== false && allowedMagicBytes.length > 0) {
        try {
            const buffer = await file.slice(0, 8).arrayBuffer()
            const bytes = new Uint8Array(buffer)

            const matchesMagicBytes = allowedMagicBytes.some(magic => {
                if (bytes.length < magic.length) return false
                return magic.every((byte, index) => bytes[index] === byte)
            })

            if (!matchesMagicBytes) {
                return {
                    valid: false,
                    error: 'File không đúng định dạng. Signature không hợp lệ. Có thể file đã bị thay đổi hoặc giả mạo.',
                    fileName,
                    fileSize
                }
            }
        } catch (error) {
            console.error('[FileValidation] Error reading file bytes:', error)
            // Allow to proceed if we can't read bytes (browser limitation)
        }
    }

    // Additional check for CSV: validate content doesn't contain suspicious patterns
    if (options.allowedTypes.includes('csv') && (ext === '.csv' || ext === '.txt')) {
        try {
            const textContent = await file.slice(0, 1024).text()

            // Check for script injection patterns
            const dangerousPatterns = [
                /<script/i,
                /javascript:/i,
                /data:text\/html/i,
                /vbscript:/i,
                /on\w+\s*=/i, // onclick=, onerror=, etc.
            ]

            for (const pattern of dangerousPatterns) {
                if (pattern.test(textContent)) {
                    return {
                        valid: false,
                        error: 'File chứa nội dung không an toàn',
                        fileName,
                        fileSize
                    }
                }
            }
        } catch (error) {
            // Ignore read errors for binary files
        }
    }

    return {
        valid: true,
        detectedType: options.allowedTypes[0],
        fileName,
        fileSize
    }
}

/**
 * Sanitize filename for safe storage
 */
export function sanitizeFileName(fileName: string): string {
    return fileName
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars
        .replace(/\.{2,}/g, '.') // Remove multiple dots
        .replace(/^\./, '') // Remove leading dot
        .slice(0, 255) // Limit length
}

/**
 * Quick validation for product/recipe imports
 */
export async function validateExcelUpload(file: File | null): Promise<FileValidationResult> {
    return validateUploadedFile(file, {
        allowedTypes: ['excel'],
        maxSizeMB: 10,
        checkMagicBytes: true
    })
}

/**
 * Quick validation for CSV imports
 */
export async function validateCsvUpload(file: File | null): Promise<FileValidationResult> {
    return validateUploadedFile(file, {
        allowedTypes: ['csv', 'excel'],
        maxSizeMB: 5,
        checkMagicBytes: true
    })
}
