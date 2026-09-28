'use client'

import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { mobileFetch } from "@/lib/mobile/api-client"

interface ProduceDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    recipe?: any | null
    onClose: () => void
    onSuccess: () => void
}

export default function ProduceDialog({
    open,
    onOpenChange,
    recipe,
    onClose,
    onSuccess,
}: ProduceDialogProps) {
    const [quantity, setQuantity] = useState('1')
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [warning, setWarning] = useState('')
    const [stock, setStock] = useState<any>({})
    const [checkingStock, setCheckingStock] = useState(false)

    useEffect(() => {
        if (open && recipe) {
            setQuantity('1')
            setError('')
            setWarning('')
            checkStock()
        }
    }, [open, recipe])

    async function checkStock() {
        if (!recipe) return

        try {
            setCheckingStock(true)

            // Fetch stock for all ingredients
            const stockData: any = {}
            for (const ing of recipe.recipe_ingredients) {
                const response = await mobileFetch(`/api/warehouse-stock?warehouseId=${recipe.warehouse_id}&productId=${ing.ingredient_id}`,
                    {
                        credentials: 'include', // Include cookies in the request
                    }
                )
                if (response.ok) {
                    const data = await response.json()
                    stockData[ing.ingredient_id] = data.data?.[0] || { quantity: 0 }
                }
            }
            setStock(stockData)
        } catch (err) {
            console.error('Error:', err)
            toast.error("Không thể kiểm tra tồn kho nguyên liệu")
        } finally {
            setCheckingStock(false)
        }
    }

    function validateProduction(qtyToProduce: number): boolean {
        const insufficientIngredients: string[] = []

        for (const ing of recipe.recipe_ingredients) {
            const quantityNeeded = ing.quantity_required * qtyToProduce
            const available = stock[ing.ingredient_id]?.quantity || 0

            if (available < quantityNeeded) {
                insufficientIngredients.push(
                    `${ing.products.name}: cần ${quantityNeeded} ${ing.product_units.code}, có ${available}`
                )
            }
        }

        if (insufficientIngredients.length > 0) {
            setWarning(
                '⚠️ Cảnh báo: Không đủ nguyên liệu:\n' + insufficientIngredients.join('\n') + '\n\nBạn vẫn có thể tiếp tục sản xuất'
            )
            return true // Allow production to continue despite warnings
        }

        setWarning('')
        return true
    }

    async function handleProduce(e: React.FormEvent) {
        e.preventDefault()
        setError('')
        setLoading(true)

        try {
            const qtyToProduce = parseInt(quantity)

            if (!qtyToProduce || qtyToProduce <= 0) {
                setError('Vui lòng nhập số lượng hợp lệ')
                setLoading(false)
                return
            }

            validateProduction(qtyToProduce) // Check for warnings but don't block

            const response = await mobileFetch(`/api/product-recipes/${recipe.id}/produce`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include', // Include cookies in the request
                body: JSON.stringify({ quantity_to_produce: qtyToProduce }),
            })

            if (!response.ok) {
                const data = await response.json()
                throw new Error(data.error || 'Failed to produce recipe')
            }

            onSuccess()
            onOpenChange(false)
        } catch (err: any) {
            console.error('Error:', err)
            setError(err.message || 'Failed to produce recipe')
            toast.error("Lỗi sản xuất", { description: err.message })
        } finally {
            setLoading(false)
        }
    }

    if (!recipe) return null

    const qtyToProduce = parseInt(quantity) || 0
    const producedQty = recipe.output_quantity * qtyToProduce

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="border-b border-border px-6 py-4 flex-shrink-0">
                    <DialogTitle>Sản xuất sản phẩm</DialogTitle>
                    <DialogDescription>
                        Công thức: {recipe.name} {recipe.products && `(${recipe.products.name})`}
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto"><div className="px-6 py-4 space-y-4">
                    <form onSubmit={handleProduce} className="space-y-6">
                        {error && (
                            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
                                {error}
                            </div>
                        )}

                        {warning && (
                            <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm flex gap-2">
                                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                                <div className="whitespace-pre-line">{warning}</div>
                            </div>
                        )}

                        {/* Input Quantity */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Số lượng sản xuất</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="qty">
                                        Số lần lặp công thức (1 lần = {recipe.output_quantity}{' '}
                                        {recipe.product_units.code})
                                    </Label>
                                    <Input
                                        id="qty"
                                        type="number"
                                        min="1"
                                        value={quantity}
                                        onChange={e => setQuantity(e.target.value)}
                                        placeholder="1"
                                    />
                                </div>

                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                    <p className="text-sm font-semibold text-blue-900">
                                        Sẽ sản xuất được: {producedQty} {recipe.product_units.code}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Ingredients Required */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-base">Nguyên liệu cần dùng</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Nguyên liệu</TableHead>
                                                <TableHead className="text-right">Cần</TableHead>
                                                <TableHead className="text-right">Có</TableHead>
                                                <TableHead className="text-right">Trạng thái</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {recipe.recipe_ingredients.map((ing: any) => {
                                                const needed = ing.quantity_required * qtyToProduce
                                                const available = stock[ing.ingredient_id]?.quantity || 0
                                                const isEnough = available >= needed

                                                return (
                                                    <TableRow key={ing.id}>
                                                        <TableCell>
                                                            <div>
                                                                <p className="font-semibold">
                                                                    {ing.products.name}
                                                                </p>
                                                                <p className="text-sm text-gray-500">
                                                                    {ing.products.code}
                                                                </p>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {needed} {ing.product_units.code}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {available} {ing.product_units.code}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            {isEnough ? (
                                                                <Badge className="bg-green-100 text-green-800">
                                                                    Đủ
                                                                </Badge>
                                                            ) : (
                                                                <Badge className="bg-red-100 text-red-800">
                                                                    Thiếu {needed - available}
                                                                </Badge>
                                                            )}
                                                        </TableCell>
                                                    </TableRow>
                                                )
                                            })}
                                        </TableBody>
                                    </Table>
                                </div>
                            </CardContent>
                        </Card>

                    </form>
                </div></div>

                <div className="border-t border-border px-6 py-4 flex-shrink-0 bg-background flex gap-2 justify-end">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            onClose()
                            onOpenChange(false)
                        }}
                    >
                        Hủy
                    </Button>
                    <Button
                        type="submit"
                        form="produce-form"
                        disabled={loading || checkingStock || !!warning}
                        onClick={handleProduce}
                    >
                        {loading ? 'Đang sản xuất...' : 'Sản xuất'}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
