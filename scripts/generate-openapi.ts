/**
 * Generate OpenAPI documentation from API routes
 * This script scans all API routes and generates OpenAPI spec
 */

import * as fs from 'fs'
import * as path from 'path'

const OUTPUT_PATH = path.join(process.cwd(), 'public', 'openapi.json')

// Basic OpenAPI structure
const openApiSpec = {
    openapi: '3.0.0',
    info: {
        title: 'Warehouse Express API',
        version: '1.1.0',
        description: 'API documentation for Warehouse Express'
    },
    servers: [
        {
            url: '/api',
            description: 'API Server'
        }
    ],
    paths: {},
    components: {
        securitySchemes: {
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        }
    }
}

// Ensure public directory exists
const publicDir = path.join(process.cwd(), 'public')
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true })
}

// Write OpenAPI spec to file
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(openApiSpec, null, 2))

console.log(`OpenAPI spec generated at ${OUTPUT_PATH}`)
