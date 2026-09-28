import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import { getAuthToken } from '@/lib/auth-server'
import { verifyToken } from '@/lib/auth'
import { fileTypeFromBuffer } from 'file-type'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'gif'] // Whitelist extensions
const UPLOAD_DIR = 'uploads/recipes' // Outside public folder for production compatibility

// Map MIME types to safe file extensions
const MIME_TO_EXT: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif'
}

export async function POST(request: NextRequest) {
    try {
        // Authenticate
        const token = getAuthToken(request)
        if (!token) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }
        const user = verifyToken(token)
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const formData = await request.formData()
        const file = formData.get('file') as File | null

        if (!file) {
            return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
        }

        // SECURITY: Validate file extension from whitelist
        const fileExt = file.name.split('.').pop()?.toLowerCase()
        if (!fileExt || !ALLOWED_EXTENSIONS.includes(fileExt)) {
            return NextResponse.json(
                { error: 'Invalid file extension. Allowed: jpg, jpeg, png, webp, gif' },
                { status: 400 }
            )
        }

        // Validate file size
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: 'File too large. Maximum size: 5MB' },
                { status: 400 }
            )
        }

        // SECURITY: Read file and validate magic bytes (file signature)
        const bytes = await file.arrayBuffer()
        const buffer = Buffer.from(bytes)

        const detectedType = await fileTypeFromBuffer(buffer)

        // Validate that file content matches declared MIME type
        if (!detectedType || !ALLOWED_TYPES.includes(detectedType.mime)) {
            return NextResponse.json(
                { error: 'Invalid file content. File must be a valid image.' },
                { status: 400 }
            )
        }

        // SECURITY: Use extension based on detected MIME type, not user input
        // This prevents attacks like uploading shell.php.jpg
        const safeExt = MIME_TO_EXT[detectedType.mime] || 'jpg'

        // Generate unique filename with SAFE extension
        const timestamp = Date.now()
        const randomStr = Math.random().toString(36).substring(2, 8)
        const filename = `recipe_${timestamp}_${randomStr}.${safeExt}`

        // Ensure upload directory exists
        const uploadPath = path.join(process.cwd(), UPLOAD_DIR)
        if (!existsSync(uploadPath)) {
            await mkdir(uploadPath, { recursive: true })
        }

        // Save file
        const filePath = path.join(uploadPath, filename)
        await writeFile(filePath, buffer)

        // Return URL (serve via API route)
        const imageUrl = `/api/recipe-images/${filename}`

        return NextResponse.json({
            success: true,
            data: { url: imageUrl }
        })
    } catch (error: any) {
        console.error('Error uploading image:', error)
        return NextResponse.json(
            { error: error.message || 'Failed to upload image' },
            { status: 500 }
        )
    }
}
