import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { fileTypeFromBuffer } from 'file-type'

const UPLOAD_DIR = 'uploads/recipes'

// GET /api/recipe-images/[filename] - Serve image files
export async function GET(
    request: NextRequest,
    context: { params: Promise<{ filename: string }> }
) {
    try {
        const params = await context.params
        const filename = params.filename
        console.log('📷 [GET Image] Requested filename:', filename)
        console.log('📷 [GET Image] Full URL:', request.url)

        if (!filename) {
            console.error('❌ [GET Image] No filename provided')
            return NextResponse.json({ error: 'Filename required' }, { status: 400 })
        }

        // Validate filename (prevent directory traversal)
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            console.error('❌ [GET Image] Invalid filename (directory traversal attempt):', filename)
            return NextResponse.json({ error: 'Invalid filename' }, { status: 400 })
        }

        // Build file path
        const uploadPath = path.join(process.cwd(), UPLOAD_DIR)
        const filePath = path.join(uploadPath, filename)
        console.log('📂 [GET Image] File path:', filePath)

        // Check if file exists
        if (!existsSync(filePath)) {
            console.error('❌ [GET Image] File not found:', filePath)
            return NextResponse.json({ error: 'Image not found' }, { status: 404 })
        }

        console.log('✅ [GET Image] File found, reading...')
        // Read file
        const fileBuffer = await readFile(filePath)

        // Detect MIME type
        const fileType = await fileTypeFromBuffer(fileBuffer)
        const mimeType = fileType?.mime || 'image/jpeg'
        console.log('✅ [GET Image] Serving image, MIME type:', mimeType, 'Size:', fileBuffer.length, 'bytes')

        // Return image with appropriate headers
        return new NextResponse(fileBuffer, {
            headers: {
                'Content-Type': mimeType,
                'Cache-Control': 'public, max-age=31536000, immutable',
                'Access-Control-Allow-Origin': '*',
                'Cross-Origin-Resource-Policy': 'cross-origin',
            },
        })
    } catch (error: any) {
        console.error('Error serving image:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to serve image' },
            { status: 500 }
        )
    }
}
