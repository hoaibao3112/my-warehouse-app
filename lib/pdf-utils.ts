import React from "react"
import { Capacitor } from "@capacitor/core"
import { Share } from "@capacitor/share"
import { Filesystem, Directory } from "@capacitor/filesystem"
import { pdf } from "@react-pdf/renderer"
import { ExportInvoicePDF } from "@/components/pdf/ExportInvoicePDF"

/**
 * Generate PDF and download (web) or share (mobile)
 */
export async function exportInvoiceToPDF(exportData: any, filename: string) {
    try {
        // Generate PDF blob using React-PDF
        const element = React.createElement(ExportInvoicePDF, { data: exportData })
        const blob = await pdf(element).toBlob()

        if (Capacitor.isNativePlatform()) {
            // Mobile: Save to filesystem and share
            return await handleMobilePDF(blob, filename)
        } else {
            // Web: Download directly
            return handleWebPDF(blob, filename)
        }
    } catch (error) {
        console.error("PDF generation error:", error)
        throw new Error("Không thể tạo PDF. Vui lòng thử lại.")
    }
}

/**
 * Handle PDF download for web browsers
 */
function handleWebPDF(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    return { success: true, method: "download" }
}

/**
 * Handle PDF for mobile using Capacitor
 */
async function handleMobilePDF(blob: Blob, filename: string) {
    try {
        // Convert blob to base64
        const reader = new FileReader()
        const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
                const base64 = reader.result as string
                // Remove data URL prefix
                const base64Data = base64.split(",")[1]
                resolve(base64Data)
            }
            reader.onerror = reject
        })
        reader.readAsDataURL(blob)
        const base64Data = await base64Promise

        // Save to device
        const savedFile = await Filesystem.writeFile({
            path: filename,
            data: base64Data,
            directory: Directory.Cache,
        })

        // Share the file (includes print option)
        await Share.share({
            title: "Xuất Phiếu PDF",
            text: `Phiếu xuất: ${filename}`,
            url: savedFile.uri,
            dialogTitle: "In hoặc chia sẻ phiếu xuất",
        })

        return { success: true, method: "share", uri: savedFile.uri }
    } catch (error) {
        console.error("Mobile PDF error:", error)
        throw new Error("Không thể lưu/chia sẻ PDF trên thiết bị")
    }
}

/**
 * Generate filename for export
 */
export function generatePDFFilename(exportNumber: string): string {
    const sanitized = exportNumber.replace(/[^a-zA-Z0-9-]/g, "_")
    const timestamp = new Date().getTime()
    return `Phieu_Xuat_${sanitized}_${timestamp}.pdf`
}
