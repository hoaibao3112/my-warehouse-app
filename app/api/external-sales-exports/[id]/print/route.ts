import { type NextRequest, NextResponse } from "next/server"
import type { ApiResponse } from "@/lib/types"
import { prisma } from "@/lib/prisma"
import { getAuthToken } from "@/lib/auth-server"
import { verifyToken } from "@/lib/auth"
import { translateError } from "@/lib/error-translator"

/**
 * @swagger
 * /api/external-sales-exports/{id}/print:
 *   get:
 *     summary: Get Print Data for External Sales Export
 *     description: Returns complete data formatted for printing
 *     tags: [External Sales Exports]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Print data with all details
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const token = getAuthToken(request)
        const payload = token ? verifyToken(token) : null

        if (!payload) {
            return NextResponse.json(
                { success: false, error: "Unauthorized" } as ApiResponse<null>,
                { status: 401 }
            )
        }

        const { id } = await params

        const exportRecord = await prisma.external_sales_exports.findUnique({
            where: { id },
            include: {
                customer: true,
                warehouse: {
                    select: {
                        id: true,
                        code: true,
                        name: true,
                        location: true,
                    },
                },
                created_by_user: {
                    select: {
                        id: true,
                        full_name: true,
                        employee_code: true,
                    },
                },
                approved_by_user: {
                    select: {
                        id: true,
                        full_name: true,
                    },
                },
                items: {
                    include: {
                        product: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                            },
                        },
                        unit: {
                            select: {
                                id: true,
                                code: true,
                                name: true,
                            },
                        },
                    },
                    orderBy: {
                        created_at: "asc",
                    },
                },
            },
        })

        if (!exportRecord) {
            return NextResponse.json(
                { success: false, error: "Không tìm thấy phiếu xuất" } as ApiResponse<null>,
                { status: 404 }
            )
        }

        // Format data for printing
        const printData = {
            exportNumber: exportRecord.export_number,
            exportDate: exportRecord.created_at,
            status: exportRecord.status,

            // Sender (Warehouse)
            sender: {
                name: exportRecord.warehouse.name,
                code: exportRecord.warehouse.code,
                address: exportRecord.warehouse.location || "",
            },

            // Recipient (Customer)
            recipient: {
                name: exportRecord.customer.name,
                address: exportRecord.customer.address || "",
                phone: exportRecord.customer.phone || "",
            },

            // Items
            items: exportRecord.items.map((item, index) => ({
                no: index + 1,
                productCode: item.product.code,
                productName: item.product.name,
                unit: item.unit.name,
                unitCode: item.unit.code,
                quantity: item.quantity,
                unitPrice: item.unit_price ? Number(item.unit_price) : 0,
                lineTotal: item.line_total ? Number(item.line_total) : 0,
            })),

            // Summary
            totalQuantity: exportRecord.items.reduce((sum, item) => sum + item.quantity, 0),
            totalAmount: exportRecord.total_amount ? Number(exportRecord.total_amount) : 0,
            totalAmountInWords: numberToVietnameseWords(
                exportRecord.total_amount ? Number(exportRecord.total_amount) : 0
            ),

            // Signatures
            createdBy: {
                name: exportRecord.created_by_user.full_name,
                employeeCode: exportRecord.created_by_user.employee_code,
                date: exportRecord.created_at,
            },
            approvedBy: exportRecord.approved_by_user
                ? {
                    name: exportRecord.approved_by_user.full_name,
                    date: exportRecord.approved_at,
                }
                : null,

            // Notes
            notes: exportRecord.notes || "",

            // QR Code data (can be used for tracking)
            qrData: JSON.stringify({
                type: "EXTERNAL_SALES_EXPORT",
                id: exportRecord.id,
                number: exportRecord.export_number,
                date: exportRecord.created_at,
            }),
        }

        return NextResponse.json({
            success: true,
            data: printData,
        } as ApiResponse<typeof printData>)
    } catch (error: any) {
        console.error("GET /api/external-sales-exports/[id]/print error:", error)
        return NextResponse.json(
            { success: false, error: translateError(error) } as ApiResponse<null>,
            { status: 500 }
        )
    }
}

/**
 * Convert number to Vietnamese words
 * Example: 123456 => "một trăm hai mươi ba nghìn bốn trăm năm mươi sáu"
 */
function numberToVietnameseWords(num: number): string {
    if (num === 0) return "không đồng"

    const units = ["", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"]
    const levels = ["", "nghìn", "triệu", "tỷ"]

    function readThreeDigits(n: number): string {
        const hundred = Math.floor(n / 100)
        const ten = Math.floor((n % 100) / 10)
        const unit = n % 10

        let result = ""

        if (hundred > 0) {
            result += units[hundred] + " trăm"
            if (ten === 0 && unit > 0) {
                result += " lẻ"
            }
        }

        if (ten > 1) {
            result += (result ? " " : "") + units[ten] + " mươi"
        } else if (ten === 1) {
            result += (result ? " " : "") + "mười"
        }

        if (unit > 0) {
            if (ten > 1 && unit === 1) {
                result += " mốt"
            } else if (ten > 0 && unit === 5) {
                result += " lăm"
            } else {
                result += (result ? " " : "") + units[unit]
            }
        }

        return result.trim()
    }

    let intNum = Math.floor(num)
    let result = ""
    let levelIndex = 0

    while (intNum > 0 && levelIndex < levels.length) {
        const threeDigits = intNum % 1000
        if (threeDigits > 0) {
            const digitWords = readThreeDigits(threeDigits)
            result = digitWords + (levels[levelIndex] ? " " + levels[levelIndex] : "") + (result ? " " + result : "")
        }
        intNum = Math.floor(intNum / 1000)
        levelIndex++
    }

    return (result + " đồng").trim()
}
