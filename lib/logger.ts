/**
 * Production Logger Service
 * Ghi log vào file .txt với rotation theo ngày
 * 
 * Usage:
 * import { logger } from '@/lib/logger'
 * logger.info('Something happened')
 * logger.error('Error occurred', error)
 */

import * as fs from 'fs'
import * as path from 'path'

// Log levels
type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR'

// Configuration
const LOG_DIR = process.env.LOG_DIR || 'logs'
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS || '7', 10)
const LOG_TO_CONSOLE = process.env.LOG_TO_CONSOLE === 'true' || process.env.NODE_ENV !== 'production'

class Logger {
    private logDir: string
    private initialized = false

    constructor() {
        this.logDir = path.resolve(process.cwd(), LOG_DIR)
    }

    private init() {
        if (this.initialized) return

        // Only initialize on server-side
        if (typeof window !== 'undefined') return

        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true })
            }
            this.initialized = true

            // Clean old logs on startup
            this.cleanOldLogs()
        } catch (error) {
            console.error('[Logger] Failed to create log directory:', error)
        }
    }

    private getLogFilePath(): string {
        const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
        return path.join(this.logDir, `app-${today}.txt`)
    }

    private formatTimestamp(): string {
        return new Date().toISOString()
    }

    private formatMessage(level: LogLevel, message: string, data?: any): string {
        const timestamp = this.formatTimestamp()
        let logLine = `[${timestamp}] [${level}] ${message}`

        if (data !== undefined) {
            if (data instanceof Error) {
                logLine += `\n  Error: ${data.message}\n  Stack: ${data.stack}`
            } else if (typeof data === 'object') {
                try {
                    logLine += `\n  Data: ${JSON.stringify(data, null, 2)}`
                } catch {
                    logLine += `\n  Data: [Circular or non-serializable object]`
                }
            } else {
                logLine += `\n  Data: ${data}`
            }
        }

        return logLine
    }

    private write(level: LogLevel, message: string, data?: any) {
        // Skip on client-side
        if (typeof window !== 'undefined') {
            if (LOG_TO_CONSOLE) {
                console[level.toLowerCase() as 'log' | 'error' | 'warn' | 'info'](message, data || '')
            }
            return
        }

        this.init()

        const logLine = this.formatMessage(level, message, data)
        const filePath = this.getLogFilePath()

        // Also output to console in development
        if (LOG_TO_CONSOLE) {
            const consoleMethod = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : 'log'
            console[consoleMethod](logLine)
        }

        // Write to file
        try {
            fs.appendFileSync(filePath, logLine + '\n', 'utf8')
        } catch (error) {
            console.error('[Logger] Failed to write log:', error)
        }
    }

    private cleanOldLogs() {
        if (typeof window !== 'undefined') return

        try {
            const files = fs.readdirSync(this.logDir)
            const now = Date.now()
            const maxAge = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000

            for (const file of files) {
                if (!file.startsWith('app-') || !file.endsWith('.txt')) continue

                const filePath = path.join(this.logDir, file)
                const stats = fs.statSync(filePath)

                if (now - stats.mtime.getTime() > maxAge) {
                    fs.unlinkSync(filePath)
                    console.log(`[Logger] Deleted old log file: ${file}`)
                }
            }
        } catch (error) {
            console.error('[Logger] Failed to clean old logs:', error)
        }
    }

    // Public methods
    debug(message: string, data?: any) {
        this.write('DEBUG', message, data)
    }

    info(message: string, data?: any) {
        this.write('INFO', message, data)
    }

    warn(message: string, data?: any) {
        this.write('WARN', message, data)
    }

    error(message: string, data?: any) {
        this.write('ERROR', message, data)
    }

    // Log API request (utility method)
    request(method: string, path: string, statusCode: number, durationMs: number, userId?: string) {
        const message = `${method} ${path} ${statusCode} ${durationMs}ms${userId ? ` user:${userId}` : ''}`
        this.info(message)
    }
}

// Export singleton instance
export const logger = new Logger()
