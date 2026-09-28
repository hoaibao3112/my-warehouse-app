"use client"

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
    Dialog,
    DialogTrigger,
    DialogContent,
    DialogHeader,
    DialogFooter,
    DialogTitle,
    DialogDescription,
    DialogClose,
} from '@/components/ui/dialog'
import { Plus, Trash2, Edit, Package, Search, Layers, ArrowUpDown, Eye, Ruler } from 'lucide-react'
// Assuming this component exists or I need to check its path. It was imported in admin/units/page.tsx
import { ProductPackagesDialog } from '@/components/product-packages-dialog'
import { toast } from 'sonner'
import { MobilePageHeader } from '@/components/mobile/mobile-page-header'
import { mobileFetch } from "@/lib/mobile/api-client"
import { useAuth } from "@/hooks/use-auth"

interface Unit {
    id: string
    code: string
    name: string
    description?: string
    productCount?: number
    packageCount?: number
    conversionCount?: number
}

interface Product {
    id: string
    code: string
    name: string
    categoryName: string
    unitName: string
    category_id?: string
    unit_id?: string
}

interface Category {
    id: string
    name: string
}

export default function StoreUnitsPage() {
    const { user } = useAuth()
    const [activeTab, setActiveTab] = useState<'units' | 'conversions'>('units')

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        title: string
        description: string
        onConfirm: () => void
    }>({ open: false, title: '', description: '', onConfirm: () => { } })

    // Units tab state
    const [units, setUnits] = useState<Unit[]>([])
    const [unitsLoading, setUnitsLoading] = useState(false)
    const [unitsError, setUnitsError] = useState<string | null>(null)
    const [unitDialogOpen, setUnitDialogOpen] = useState(false)
    const [editingId, setEditingId] = useState<string | null>(null)
    const [unitName, setUnitName] = useState('')
    const [unitCode, setUnitCode] = useState('')
    const [unitDescription, setUnitDescription] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [deletingUnit, setDeletingUnit] = useState<string | null>(null)
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [unitDetailsDialogOpen, setUnitDetailsDialogOpen] = useState(false)
    const [unitConversions, setUnitConversions] = useState<any[]>([])
    const [conversionsLoading, setConversionsLoading] = useState(false)

    // Conversions tab state
    const [products, setProducts] = useState<Product[]>([])
    const [productsLoading, setProductsLoading] = useState(false)
    const [page, setPage] = useState(1)
    const [pageSize] = useState(20)
    const [total, setTotal] = useState(0)
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
    const [conversionDialogOpen, setConversionDialogOpen] = useState(false)

    // Filters
    const [categories, setCategories] = useState<Category[]>([])
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
    const [sortBy, setSortBy] = useState<'name' | 'code' | 'category'>('name')

    // Load units
    const loadUnits = async () => {
        setUnitsLoading(true)
        setUnitsError(null)
        try {
            const res = await mobileFetch('/api/product-units?enriched=true')
            const j = await res.json()
            if (!res.ok || !j?.success) throw new Error(j?.error || 'Failed to fetch units')
            setUnits(j.data || [])
        } catch (err: any) {
            setUnitsError(err?.message || String(err))
            setUnits([])
            toast.error('Lỗi tải đơn vị: ' + (err?.message || String(err)))
        } finally {
            setUnitsLoading(false)
        }
    }

    // Load categories for filter
    const loadCategories = async () => {
        try {
            const res = await mobileFetch('/api/categories')
            const json = await res.json()
            if (json.success) {
                setCategories(json.data || [])
            }
        } catch (error) {
            console.error('Failed to load categories')
        }
    }

    // Load products with proper mapping
    const loadProducts = async () => {
        try {
            setProductsLoading(true)
            const q = new URLSearchParams()
            q.set('page', String(page))
            q.set('pageSize', String(pageSize))
            if (searchTerm) q.set('search', searchTerm)
            if (selectedCategoryId) q.set('categoryId', selectedCategoryId)

            // Use store-scoped product fetch if needed, but standard /api/products usually works
            const res = await mobileFetch(`/api/products?${q.toString()}`)
            const json = await res.json()
            if (json.success) {
                // Map the response to ensure proper field names
                const mappedProducts = (json.data || []).map((p: any) => ({
                    id: p.id,
                    code: p.code,
                    name: p.name,
                    categoryName: p.category_name || 'Không có danh mục',
                    unitName: p.unit_name || 'Không có đơn vị',
                    category_id: p.category_id,
                    unit_id: p.unit_id
                }))
                setProducts(mappedProducts)
                setTotal(json.total || 0)
            } else {
                toast.error('Lỗi tải sản phẩm')
            }
        } catch (error: any) {
            toast.error('Lỗi: ' + error.message)
        } finally {
            setProductsLoading(false)
        }
    }

    useEffect(() => {
        if (activeTab === 'units') {
            loadUnits()
        } else {
            loadCategories()
            loadProducts()
        }
    }, [activeTab])

    useEffect(() => {
        if (activeTab === 'conversions') {
            loadProducts()
        }
    }, [page, pageSize, selectedCategoryId])

    const handleCreateUnit = async (e?: React.FormEvent) => {
        e?.preventDefault()
        setSubmitting(true)
        try {
            const finalCode = unitCode.trim() || unitName.trim().toUpperCase().replace(/\s+/g, '_')
            if (!finalCode || !unitName.trim()) {
                toast.error('Vui lòng nhập tên đơn vị')
                setSubmitting(false)
                return
            }

            const res = await mobileFetch('/api/product-units', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: finalCode,
                    name: unitName.trim(),
                    description: unitDescription.trim() || null
                })
            })
            const j = await res.json()
            if (!res.ok || !j?.success) throw new Error(j?.error || 'Tạo đơn vị thất bại')

            setUnitDialogOpen(false)
            resetUnitForm()
            toast.success('Đơn vị đã được tạo thành công')
            await loadUnits()
        } catch (err: any) {
            toast.error(err?.message || String(err))
        } finally {
            setSubmitting(false)
        }
    }

    const resetUnitForm = () => {
        setUnitName('')
        setUnitCode('')
        setUnitDescription('')
        setEditingId(null)
    }

    const handleEditUnit = (unit: Unit) => {
        setEditingId(unit.id)
        setUnitName(unit.name)
        setUnitCode(unit.code)
        setUnitDescription(unit.description || '')
        setUnitDialogOpen(true)
    }

    const handleDeleteUnit = async (unit: Unit) => {
        setConfirmDialog({
            open: true,
            title: "Xác nhận xóa đơn vị",
            description: `Bạn có chắc muốn xóa đơn vị "${unit.name}"?`,
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                setDeletingUnit(unit.id)
                try {
                    const res = await mobileFetch(`/api/product-units/${unit.id}`, { method: 'DELETE' })
                    const json = await res.json()
                    if (!res.ok || !json?.success) throw new Error(json?.error || 'Xóa thất bại')

                    toast.success('Đơn vị đã được xóa thành công')
                    await loadUnits()
                } catch (err: any) {
                    toast.error('Lỗi khi xóa: ' + (err?.message || String(err)))
                } finally {
                    setDeletingUnit(null)
                }
            }
        })
    }

    const handleViewUnitDetails = async (unit: Unit) => {
        setSelectedUnit(unit)
        setUnitDetailsDialogOpen(true)
        await loadUnitConversions(unit.id)
    }

    const loadUnitConversions = async (unitId: string) => {
        setConversionsLoading(true)
        try {
            // Reuse admin API but simplified if needed, usually secure enough if checking permissions
            const res = await mobileFetch(`/api/admin/product-packages?packageUnitId=${unitId}&pageSize=1000`)
            const json = await res.json()
            if (json.success) {
                setUnitConversions(json.data || [])
            } else {
                setUnitConversions([])
            }
        } catch (err) {
            console.error('Failed to load unit conversions:', err)
            setUnitConversions([])
        } finally {
            setConversionsLoading(false)
        }
    }

    const handleDeleteConversion = async (conversionId: string) => {
        setConfirmDialog({
            open: true,
            title: "Xác nhận xóa quy đổi",
            description: "Bạn có chắc muốn xóa quy đổi này?",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                try {
                    const res = await mobileFetch(`/api/admin/product-packages/${conversionId}`, {
                        method: 'DELETE'
                    })
                    const json = await res.json()
                    if (json.success) {
                        toast.success('Đã xóa quy đổi')
                        if (selectedUnit) {
                            await loadUnitConversions(selectedUnit.id)
                        }
                        await loadUnits()
                    } else {
                        toast.error(json.error || 'Xóa thất bại')
                    }
                } catch (err: any) {
                    toast.error('Lỗi: ' + err.message)
                }
            }
        })
    }

    const handleProductClick = (product: Product) => {
        setSelectedProduct(product)
        setConversionDialogOpen(true)
    }

    const handleSearchProducts = () => {
        setPage(1)
        loadProducts()
    }

    const handleResetFilters = () => {
        setSearchTerm('')
        setSelectedCategoryId('')
        setPage(1)
        loadProducts()
    }

    const sortedProducts = [...products].sort((a, b) => {
        switch (sortBy) {
            case 'name': return a.name.localeCompare(b.name)
            case 'code': return a.code.localeCompare(b.code)
            case 'category': return a.categoryName.localeCompare(b.categoryName)
            default: return 0
        }
    })

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Ruler}
                title="Đơn Vị & Quy Đổi"
                subtitle="Quản lý đơn vị đo"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="flex flex-col gap-4">
                    <div className="hidden md:block">
                        <h1 className="text-2xl md:text-3xl font-bold text-foreground">Quản Lý Đơn Vị & Quy Đổi</h1>
                        <p className="text-sm md:text-base text-muted-foreground mt-2">
                            Quản lý đơn vị đo và thiết lập quy đổi riêng cho cửa hàng
                        </p>
                    </div>

                    <div className="flex gap-1 md:gap-2 border-b border-border overflow-x-auto">
                        <button
                            onClick={() => setActiveTab('units')}
                            className={`px-3 md:px-4 py-2 text-sm md:text-base font-medium transition-colors relative whitespace-nowrap ${activeTab === 'units' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <div className="flex items-center gap-1 md:gap-2">
                                <Layers className="w-4 h-4" />
                                <span className="hidden sm:inline">Danh Sách </span>Đơn Vị
                            </div>
                            {activeTab === 'units' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                        </button>
                        <button
                            onClick={() => setActiveTab('conversions')}
                            className={`px-3 md:px-4 py-2 text-sm md:text-base font-medium transition-colors relative whitespace-nowrap ${activeTab === 'conversions' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                                }`}
                        >
                            <div className="flex items-center gap-1 md:gap-2">
                                <Package className="w-4 h-4" />
                                Quy Đổi<span className="hidden sm:inline"> Sản Phẩm</span>
                            </div>
                            {activeTab === 'conversions' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
                        </button>
                    </div>
                </div>

                {activeTab === 'units' && (
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <p className="text-sm text-muted-foreground">{units.length} đơn vị đo lường</p>
                            <Dialog open={unitDialogOpen} onOpenChange={(newOpen) => {
                                setUnitDialogOpen(newOpen)
                                if (!newOpen) resetUnitForm()
                            }}>
                                <DialogTrigger asChild>
                                    <Button className="gap-2">
                                        <Plus className="w-4 h-4" />
                                        Thêm Đơn Vị
                                    </Button>
                                </DialogTrigger>

                                <DialogContent>
                                    <DialogHeader>
                                        <DialogTitle>{editingId ? 'Chỉnh Sửa Đơn Vị' : 'Thêm Đơn Vị'}</DialogTitle>
                                        <DialogDescription>{editingId ? 'Cập nhật thông tin đơn vị' : 'Thêm một đơn vị đo mới'}</DialogDescription>
                                    </DialogHeader>

                                    <form onSubmit={handleCreateUnit} className="grid gap-4 pt-2">
                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium">Tên Đơn Vị <span className="text-red-500">*</span></label>
                                            <Input value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="VD: Thùng, Chai" required />
                                        </div>
                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium">Mã</label>
                                            <Input value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="VD: THUNG" />
                                        </div>
                                        <div className="grid gap-2">
                                            <label className="text-sm font-medium">Mô Tả</label>
                                            <Input value={unitDescription} onChange={(e) => setUnitDescription(e.target.value)} placeholder="Mô tả thêm" />
                                        </div>
                                        <DialogFooter>
                                            <DialogClose asChild><Button type="button" variant="ghost">Hủy</Button></DialogClose>
                                            <Button type="submit" disabled={submitting}>{submitting ? 'Đang lưu...' : editingId ? 'Cập Nhật' : 'Tạo'}</Button>
                                        </DialogFooter>
                                    </form>
                                </DialogContent>
                            </Dialog>
                        </div>

                        {unitsLoading ? (
                            <Card className="p-8 text-center text-muted-foreground">Đang tải...</Card>
                        ) : (
                            <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-muted/50">
                                        <tr>
                                            <th className="px-4 py-3 text-left">Tên</th>
                                            <th className="px-4 py-3 text-left">Mã</th>
                                            <th className="px-4 py-3 text-center">SL Sản Phẩm</th>
                                            <th className="px-4 py-3 text-center">SL Quy Đổi</th>
                                            <th className="px-4 py-3 text-right">Thao Tác</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {units.length === 0 ? (
                                            <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Chưa có dữ liệu</td></tr>
                                        ) : units.map((u) => (
                                            <tr key={u.id} className="hover:bg-muted/30">
                                                <td className="px-4 py-3 font-medium">{u.name}</td>
                                                <td className="px-4 py-3 font-mono text-muted-foreground">{u.code}</td>
                                                <td className="px-4 py-3 text-center"><Badge variant="secondary">{u.productCount || 0}</Badge></td>
                                                <td className="px-4 py-3 text-center"><Badge variant="outline">{u.packageCount || 0}</Badge></td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button variant="ghost" size="sm" onClick={() => handleViewUnitDetails(u)}><Eye className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleEditUnit(u)}><Edit className="w-4 h-4" /></Button>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteUnit(u)} className="text-red-600"><Trash2 className="w-4 h-4" /></Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}

                {/* Conversions Tab */}
                {activeTab === 'conversions' && (
                    <div className="space-y-4">
                        <Card className="p-4 flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                                <Input className="pl-9" placeholder="Tìm sản phẩm..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearchProducts()} />
                            </div>
                            <select className="border rounded px-3 py-2 text-sm" value={selectedCategoryId} onChange={e => { setSelectedCategoryId(e.target.value); setPage(1); }}>
                                <option value="">Tất cả danh mục</option>
                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                        </Card>

                        {/* List Products for Conversion */}
                        <div className="border rounded-lg overflow-hidden">
                            <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Mã</th>
                                        <th className="px-4 py-3 text-left">Tên Sản Phẩm</th>
                                        <th className="px-4 py-3 text-left">Danh Mục</th>
                                        <th className="px-4 py-3 text-left">ĐVT Gốc</th>
                                        <th className="px-4 py-3 text-right">Hành Động</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {sortedProducts.map(p => (
                                        <tr key={p.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => handleProductClick(p)}>
                                            <td className="px-4 py-3 font-mono">{p.code}</td>
                                            <td className="px-4 py-3 font-medium">{p.name}</td>
                                            <td className="px-4 py-3 text-muted-foreground">{p.categoryName}</td>
                                            <td className="px-4 py-3"><Badge variant="secondary">{p.unitName}</Badge></td>
                                            <td className="px-4 py-3 text-right">
                                                <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); handleProductClick(p); }}>
                                                    <Package className="w-4 h-4 mr-1" /> Quản Lý
                                                </Button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {selectedProduct && (
                    <ProductPackagesDialog
                        productId={selectedProduct.id}
                        productName={selectedProduct.name}
                        open={conversionDialogOpen}
                        onOpenChange={setConversionDialogOpen}
                    />
                )}

                {/* Helper Dialogs for Confirm would go here */}
                <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{confirmDialog.title}</DialogTitle>
                            <DialogDescription>{confirmDialog.description}</DialogDescription>
                        </DialogHeader>
                        <DialogFooter>
                            <Button variant="ghost" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
                            <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác Nhận</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>
        </div>
    )
}
