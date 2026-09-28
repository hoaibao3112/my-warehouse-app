/**
 * Initialize uploads directory structure
 */

const fs = require('fs')
const path = require('path')

const UPLOAD_DIRS = [
    'uploads',
    'uploads/products',
    'uploads/avatars',
    'uploads/documents',
    'uploads/temp'
]

const publicDir = path.join(process.cwd(), 'public')

UPLOAD_DIRS.forEach(dir => {
    const fullPath = path.join(publicDir, dir)
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true })
        console.log(`Created directory: ${fullPath}`)
    } else {
        console.log(`Directory exists: ${fullPath}`)
    }
})

console.log('Upload directories initialized successfully')
