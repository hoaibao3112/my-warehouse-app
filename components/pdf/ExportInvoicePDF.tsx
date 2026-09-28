import React from "react"
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer"

// Register Vietnamese-compatible font
Font.register({
    family: "Roboto",
    fonts: [
        {
            src: "https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Me5WZLCzYlKw.ttf",
            fontWeight: 400,
        },
        {
            src: "https://fonts.gstatic.com/s/roboto/v30/KFOlCnqEu92Fr1MmWUlvAx05IsDqlA.ttf",
            fontWeight: 700,
        },
    ],
})

// Define styles for PDF
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 10,
        fontFamily: "Roboto", // Changed from Helvetica to Roboto
    },
    header: {
        marginBottom: 20,
        textAlign: "center",
    },
    title: {
        fontSize: 18,
        fontWeight: "bold",
        marginBottom: 5,
    },
    exportNumber: {
        fontSize: 14,
        fontFamily: "Courier",
        marginBottom: 3,
    },
    date: {
        fontSize: 9,
        color: "#666",
    },
    section: {
        marginBottom: 15,
    },
    sectionTitle: {
        fontSize: 11,
        fontWeight: "bold",
        marginBottom: 8,
        borderBottom: "1 solid #000",
        paddingBottom: 3,
    },
    row: {
        flexDirection: "row",
        marginBottom: 4,
    },
    label: {
        width: "30%",
        fontWeight: "bold",
    },
    value: {
        width: "70%",
    },
    table: {
        width: "100%",
        marginTop: 10,
        marginBottom: 15,
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#f0f0f0",
        padding: 5,
        fontWeight: "bold",
        borderBottom: "1 solid #000",
    },
    tableRow: {
        flexDirection: "row",
        padding: 5,
        borderBottom: "0.5 solid #ddd",
    },
    col1: { width: "5%", textAlign: "center" },
    col2: { width: "15%" },
    col3: { width: "30%" },
    col4: { width: "12%", textAlign: "center" },
    col5: { width: "10%", textAlign: "right" },
    col6: { width: "13%", textAlign: "right" },
    col7: { width: "15%", textAlign: "right" },
    totalRow: {
        flexDirection: "row",
        padding: 8,
        backgroundColor: "#f9f9f9",
        fontWeight: "bold",
        borderTop: "2 solid #000",
    },
    totalLabel: {
        width: "70%",
        textAlign: "right",
        paddingRight: 10,
    },
    totalValue: {
        width: "30%",
        textAlign: "right",
        fontSize: 12,
    },
    signatures: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 40,
        paddingTop: 20,
        borderTop: "1 solid #ccc",
    },
    signature: {
        width: "30%",
        textAlign: "center",
    },
    signatureTitle: {
        fontWeight: "bold",
        marginBottom: 40,
    },
    signatureName: {
        fontSize: 9,
    },
    signatureDate: {
        fontSize: 8,
        color: "#666",
        marginTop: 2,
    },
    notes: {
        marginTop: 15,
        padding: 10,
        backgroundColor: "#f9f9f9",
        borderRadius: 3,
    },
    notesTitle: {
        fontWeight: "bold",
        marginBottom: 5,
    },
})

interface ExportInvoicePDFProps {
    data: {
        export_number: string
        created_at: string
        warehouse: {
            name: string
            code: string
            location?: string
        }
        customer?: { // Made optional
            name: string
            phone?: string
            address?: string
        }
        items: Array<{
            product: {
                code: string
                name: string
            }
            unit: {
                name: string
            }
            quantity: number
            unit_price: number
            line_total: number
        }>
        total_amount: number
        notes?: string
        created_by_user: {
            full_name: string
        }
        approved_by_user?: {
            full_name: string
        }
        approved_at?: string
    }
}

export const ExportInvoicePDF: React.FC<ExportInvoicePDFProps> = ({ data }) => {
    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("vi-VN").format(amount) + " đ"
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString("vi-VN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
        })
    }

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.title}>PHIẾU XUẤT BÁN HÀNG</Text>
                    <Text style={styles.exportNumber}>{data.export_number}</Text>
                    <Text style={styles.date}>Ngày: {formatDate(data.created_at)}</Text>
                </View>

                {/* Warehouse Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>BÊN GỬI (KHO)</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Tên kho:</Text>
                        <Text style={styles.value}>{data.warehouse.name}</Text>
                    </View>
                    <View style={styles.row}>
                        <Text style={styles.label}>Mã kho:</Text>
                        <Text style={styles.value}>{data.warehouse.code}</Text>
                    </View>
                    {data.warehouse.location && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Địa chỉ:</Text>
                            <Text style={styles.value}>{data.warehouse.location}</Text>
                        </View>
                    )}
                </View>

                {/* Customer Info */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>BÊN NHẬN (KHÁCH HÀNG)</Text>
                    <View style={styles.row}>
                        <Text style={styles.label}>Tên khách hàng:</Text>
                        <Text style={styles.value}>{data.customer?.name || "N/A"}</Text>
                    </View>
                    {data.customer?.phone && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Số điện thoại:</Text>
                            <Text style={styles.value}>{data.customer.phone}</Text>
                        </View>
                    )}
                    {data.customer?.address && (
                        <View style={styles.row}>
                            <Text style={styles.label}>Địa chỉ:</Text>
                            <Text style={styles.value}>{data.customer.address}</Text>
                        </View>
                    )}
                </View>

                {/* Items Table */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>CHI TIẾT SẢN PHẨM</Text>
                    <View style={styles.table}>
                        {/* Table Header */}
                        <View style={styles.tableHeader}>
                            <Text style={styles.col1}>STT</Text>
                            <Text style={styles.col2}>Mã SP</Text>
                            <Text style={styles.col3}>Tên Sản Phẩm</Text>
                            <Text style={styles.col4}>Đơn Vị</Text>
                            <Text style={styles.col5}>Số Lượng</Text>
                            <Text style={styles.col6}>Đơn Giá</Text>
                            <Text style={styles.col7}>Thành Tiền</Text>
                        </View>

                        {/* Table Rows */}
                        {data.items.map((item, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.col1}>{index + 1}</Text>
                                <Text style={styles.col2}>{item.product.code}</Text>
                                <Text style={styles.col3}>{item.product.name}</Text>
                                <Text style={styles.col4}>{item.unit.name}</Text>
                                <Text style={styles.col5}>{item.quantity}</Text>
                                <Text style={styles.col6}>{formatCurrency(item.unit_price)}</Text>
                                <Text style={styles.col7}>{formatCurrency(item.line_total)}</Text>
                            </View>
                        ))}

                        {/* Total Row */}
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>TỔNG TIỀN:</Text>
                            <Text style={styles.totalValue}>{formatCurrency(data.total_amount)}</Text>
                        </View>
                    </View>
                </View>

                {/* Notes */}
                {data.notes && (
                    <View style={styles.notes}>
                        <Text style={styles.notesTitle}>GHI CHÚ:</Text>
                        <Text>{data.notes}</Text>
                    </View>
                )}

                {/* Signatures */}
                <View style={styles.signatures}>
                    <View style={styles.signature}>
                        <Text style={styles.signatureTitle}>Người Tạo Phiếu</Text>
                        <Text style={styles.signatureName}>{data.created_by_user.full_name}</Text>
                        <Text style={styles.signatureDate}>{formatDate(data.created_at)}</Text>
                    </View>

                    <View style={styles.signature}>
                        <Text style={styles.signatureTitle}>Người Duyệt</Text>
                        {data.approved_by_user ? (
                            <>
                                <Text style={styles.signatureName}>{data.approved_by_user.full_name}</Text>
                                <Text style={styles.signatureDate}>{formatDate(data.approved_at!)}</Text>
                            </>
                        ) : (
                            <Text style={styles.signatureName}>(Ký và ghi rõ họ tên)</Text>
                        )}
                    </View>

                    <View style={styles.signature}>
                        <Text style={styles.signatureTitle}>Người Nhận</Text>
                        <Text style={styles.signatureName}>(Ký và ghi rõ họ tên)</Text>
                    </View>
                </View>
            </Page>
        </Document>
    )
}
