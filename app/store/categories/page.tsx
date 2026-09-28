"use client"

import { useState, useEffect } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Search, Plus, Trash2, Edit2, ChevronDown, ChevronRight, Layers, Eye, EyeOff } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import { useAuthContext } from "@/components/auth-provider"
import { Switch } from "@/components/ui/switch"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"

interface Category {
    id: string
    name: string
    menu_type_id?: string
    created_at: string
    _count?: {
        products: number
    }
    is_allowed?: boolean // From permissions API
}

interface MenuType {
    id: string
    name: string
    // categories?: Category[] // We will group categories manually from the flat list returned by permissions API
    created_at: string
}

type DialogMode = "menu-type" | "category" | null
type DialogAction = "create" | "edit"

export default function StoreCategoriesPage() {
    const { user } = useAuthContext()
    const [menuTypes, setMenuTypes] = useState<MenuType[]>([])
    const [categories, setCategories] = useState<Category[]>([])
    const [loading, setLoading] = useState(true)
    const [searchFilter, setSearchFilter] = useState("")
    const [expandedMenuTypes, setExpandedMenuTypes] = useState<Set<string>>(new Set())

    // Dialog state
    const [showDialog, setShowDialog] = useState(false)
    const [dialogMode, setDialogMode] = useState<DialogMode>(null)
    const [dialogAction, setDialogAction] = useState<DialogAction>("create")
    const [editingId, setEditingId] = useState<string | null>(null)
    const [formName, setFormName] = useState("")
    const [formMenuTypeId, setFormMenuTypeId] = useState<string>("")
    const [isSaving, setIsSaving] = useState(false)

    // Delete confirmation
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
    const [deleteConfirmType, setDeleteConfirmType] = useState<"menu-type" | "category" | null>(null)
    const [deleting, setDeleting] = useState(false)

    // Load data on mount
    useEffect(() => {
        if (user?.warehouseId) {
            fetchMenuTypes()
            fetchCategories()
        }
    }, [user?.warehouseId])

    const fetchMenuTypes = async () => {
        try {
            const response = await mobileFetch("/api/menu-types")
            const result = await response.json()
            if (result.success) {
                setMenuTypes(result.data || [])
            }
        } catch (error) {
            console.error("Error fetching menu types:", error)
            toast.error("Lỗi tải loại hàng")
        }
    }

    const fetchCategories = async () => {
        if (!user?.warehouseId) return

        try {
            setLoading(true)
            // Use permissions API to get categories + permission status
            const response = await mobileFetch(`/api/admin/warehouse-category-permissions?warehouseId=${user.warehouseId}`)
            const result = await response.json()

            if (result.categories) {
                setCategories(result.categories)
            } else if (result.error) {
                toast.error(result.error)
            }
        } catch (error) {
            console.error("Error fetching categories:", error)
            toast.error("Lỗi tải nhóm hàng")
        } finally {
            setLoading(false)
        }
    }

    const toggleMenuType = (menuTypeId: string) => {
        const newExpanded = new Set(expandedMenuTypes)
        if (newExpanded.has(menuTypeId)) {
            newExpanded.delete(menuTypeId)
        } else {
            newExpanded.add(menuTypeId)
        }
        setExpandedMenuTypes(newExpanded)
    }

    const handleTogglePermission = async (category: Category) => {
        if (!user?.warehouseId) return

        const newStatus = !category.is_allowed

        // Optimistic update
        setCategories(prev => prev.map(c =>
            c.id === category.id ? { ...c, is_allowed: newStatus } : c
        ))

        try {
            const response = await mobileFetch("/api/admin/warehouse-category-permissions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    warehouseId: user.warehouseId,
                    categoryId: category.id,
                    is_allowed: newStatus
                })
            })

            const result = await response.json()
            if (!response.ok) {
                // Revert on error
                setCategories(prev => prev.map(c =>
                    c.id === category.id ? { ...c, is_allowed: !newStatus } : c
                ))
                toast.error("Lỗi cập nhật quyền hiển thị")
            } else {
                toast.success(newStatus ? "Đã bật hiển thị bán hàng" : "Đã tắt hiển thị bán hàng")
            }
        } catch (error) {
            console.error("Error toggling permission:", error)
            // Revert on error
            setCategories(prev => prev.map(c =>
                c.id === category.id ? { ...c, is_allowed: !newStatus } : c
            ))
            toast.error("Lỗi kết nối")
        }
    }

    const openMenuTypeDialog = (menuType?: MenuType) => {
        if (menuType) {
            setDialogAction("edit")
            setEditingId(menuType.id)
            setFormName(menuType.name)
        } else {
            setDialogAction("create")
            setEditingId(null)
            setFormName("")
        }
        setDialogMode("menu-type")
        setShowDialog(true)
    }

    const openCategoryDialog = (menuTypeId: string, category?: Category) => {
        if (category) {
            setDialogAction("edit")
            setEditingId(category.id)
            setFormName(category.name)
            setFormMenuTypeId(category.menu_type_id || "")
        } else {
            setDialogAction("create")
            setEditingId(null)
            setFormName("")
            setFormMenuTypeId(menuTypeId)
        }
        setDialogMode("category")
        setShowDialog(true)
    }

    const handleSave = async () => {
        if (!formName.trim()) {
            toast.error("Vui lòng nhập tên")
            return
        }

        if (dialogMode === "category" && !formMenuTypeId) {
            toast.error("Vui lòng chọn loại hàng")
            return
        }

        try {
            setIsSaving(true)

            let savedItemId: string | null = null

            if (dialogMode === "menu-type") {
                if (dialogAction === "edit") {
                    const response = await mobileFetch(`/api/menu-types/${editingId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: formName.trim() }),
                    })
                    const result = await response.json()
                    if (result.success) {
                        toast.success("Cập nhật loại hàng thành công")
                        await fetchMenuTypes()
                    } else {
                        toast.error(result.error || "Lỗi cập nhật loại hàng")
                    }
                } else {
                    // Create new Menu Type
                    const response = await mobileFetch("/api/menu-types", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: formName.trim() }),
                    })
                    const result = await response.json()
                    if (result.success) {
                        toast.success("Tạo loại hàng thành công")
                        await fetchMenuTypes()
                    } else {
                        toast.error(result.error || "Lỗi tạo loại hàng")
                    }
                }
            } else if (dialogMode === "category") {
                if (dialogAction === "edit") {
                    const response = await mobileFetch(`/api/categories/${editingId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: formName.trim(), menu_type_id: formMenuTypeId }),
                    })
                    const result = await response.json()
                    if (result.success) {
                        toast.success("Cập nhật nhóm hàng thành công")
                        await fetchCategories()
                    } else {
                        toast.error(result.error || "Lỗi cập nhật nhóm hàng")
                    }
                } else {
                    // Create new Category
                    const response = await mobileFetch("/api/categories", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ name: formName.trim(), menu_type_id: formMenuTypeId }),
                    })
                    const result = await response.json()
                    if (result.success) {
                        savedItemId = result.data.id
                        toast.success("Tạo nhóm hàng thành công")

                        // Auto grant permission for self
                        if (user?.warehouseId && savedItemId) {
                            try {
                                await mobileFetch("/api/admin/warehouse-category-permissions", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                        warehouseId: user.warehouseId,
                                        categoryId: savedItemId,
                                        is_allowed: true
                                    })
                                })
                                // Silent success for permission
                            } catch (permError) {
                                console.error("Error auto-granting permission:", permError)
                                toast.warning("Đã tạo nhóm hàng nhưng chưa tự động cấp quyền bán. Vui lòng liên hệ Admin.")
                            }
                        }

                        await fetchCategories()
                    } else {
                        toast.error(result.error || "Lỗi tạo nhóm hàng")
                    }
                }
            }

            setShowDialog(false)
            setDialogMode(null)
            setFormName("")
            setFormMenuTypeId("")
            setEditingId(null)
        } catch (error) {
            console.error("Error saving:", error)
            toast.error("Lỗi lưu dữ liệu")
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteConfirmId) return

        try {
            setDeleting(true)

            if (deleteConfirmType === "menu-type") {
                const response = await mobileFetch(`/api/menu-types/${deleteConfirmId}`, {
                    method: "DELETE",
                })
                const result = await response.json()

                if (result.success) {
                    toast.success("Xóa loại hàng thành công")
                    await fetchMenuTypes()
                } else {
                    toast.error(result.error || "Lỗi xóa loại hàng")
                }
            } else if (deleteConfirmType === "category") {
                const response = await mobileFetch(`/api/categories/${deleteConfirmId}`, {
                    method: "DELETE",
                })
                const result = await response.json()

                if (result.success) {
                    toast.success("Xóa nhóm hàng thành công")
                    await fetchCategories()
                } else {
                    toast.error(result.error || "Lỗi xóa nhóm hàng")
                }
            }

            setDeleteConfirmId(null)
            setDeleteConfirmType(null)
        } catch (error) {
            console.error("Error deleting:", error)
            toast.error("Lỗi xóa dữ liệu")
        } finally {
            setDeleting(false)
        }
    }

    const getCategoriesForMenuType = (menuTypeId: string) => {
        return categories.filter((cat) => cat.menu_type_id === menuTypeId)
    }

    const filteredMenuTypes = menuTypes.filter((mt) =>
        mt.name.toLowerCase().includes(searchFilter.toLowerCase())
    )

    const filteredCategories = categories.filter((cat) =>
        cat.name.toLowerCase().includes(searchFilter.toLowerCase())
    )

    // Separate categories with menu_type_id and without
    const categoriesWithMenuType = filteredCategories.filter((cat) => cat.menu_type_id)
    const categoriesWithoutMenuType = filteredCategories.filter((cat) => !cat.menu_type_id)

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Layers}
                title="Loại & Nhóm Hàng"
                subtitle="Quản lý phân cấp hàng hóa"
            // Gradient prop removed to fix lint error
            />
            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold text-foreground">Loại & Nhóm Hàng</h1>
                        <p className="text-muted-foreground mt-2">Quản lý phân cấp loại hàng và nhóm hàng</p>
                    </div>
                    <Button className="gap-2" onClick={() => openMenuTypeDialog()}>
                        <Plus className="w-4 h-4" />
                        Thêm Loại Hàng
                    </Button>
                </div>
                <div className="md:hidden flex justify-end">
                    <Button className="gap-2" onClick={() => openMenuTypeDialog()}>
                        <Plus className="w-4 h-4" />
                        Thêm Loại Hàng
                    </Button>
                </div>

                <Card className="p-6">
                    <div className="mb-6 flex gap-4 items-center">
                        <div className="flex-1 relative max-w-md">
                            <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Tìm kiếm loại hàng hoặc nhóm hàng..."
                                className="pl-10"
                                value={searchFilter}
                                onChange={(e) => setSearchFilter(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Đang tải dữ liệu...</div>
                        ) : filteredMenuTypes.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                Chưa có loại hàng nào
                            </div>
                        ) : (
                            filteredMenuTypes.map((menuType) => {
                                const isExpanded = expandedMenuTypes.has(menuType.id)
                                const menuCategories = getCategoriesForMenuType(menuType.id)
                                const matchesFilter = menuType.name.toLowerCase().includes(searchFilter.toLowerCase())
                                const hasMatchingCategories = filteredCategories.some((cat) => cat.menu_type_id === menuType.id)

                                // Show menu type if it matches or has matching categories
                                if (!matchesFilter && !hasMatchingCategories) return null

                                return (
                                    <div key={menuType.id} className="border border-border rounded-lg">
                                        <div className="flex items-center gap-4 p-4 bg-muted/50 hover:bg-muted">
                                            <button
                                                onClick={() => toggleMenuType(menuType.id)}
                                                className="p-1 hover:bg-muted-foreground/20 rounded transition-colors"
                                            >
                                                {isExpanded ? (
                                                    <ChevronDown className="w-5 h-5" />
                                                ) : (
                                                    <ChevronRight className="w-5 h-5" />
                                                )}
                                            </button>

                                            <div className="flex-1">
                                                <h3 className="font-semibold text-foreground">{menuType.name}</h3>
                                                <p className="text-sm text-muted-foreground">
                                                    {menuCategories.length} nhóm hàng
                                                </p>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => openMenuTypeDialog(menuType)}
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => {
                                                        setDeleteConfirmId(menuType.id)
                                                        setDeleteConfirmType("menu-type")
                                                    }}
                                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="border-t border-border">
                                                <div className="p-4 space-y-2 bg-background">
                                                    {menuCategories.length === 0 ? (
                                                        <p className="text-sm text-muted-foreground text-center py-4">
                                                            Chưa có nhóm hàng nào trong loại hàng này
                                                        </p>
                                                    ) : (
                                                        menuCategories.map((category) => (
                                                            <div
                                                                key={category.id}
                                                                className="flex items-center gap-4 p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                                                            >
                                                                <div className="w-5" /> {/* Indent for category */}
                                                                <div className="flex-1">
                                                                    <div className="flex items-center gap-2">
                                                                        <h4 className="font-medium text-foreground">{category.name}</h4>
                                                                        {category.is_allowed ? (
                                                                            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Hiển thị bán hàng</Badge>
                                                                        ) : (
                                                                            <Badge variant="outline" className="text-muted-foreground">Ẩn bán hàng</Badge>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-xs text-muted-foreground mt-1">
                                                                        {category._count?.products || 0} sản phẩm
                                                                    </p>
                                                                </div>

                                                                <div className="flex items-center gap-4">
                                                                    <div className="flex items-center gap-2 mr-2">
                                                                        <Switch
                                                                            checked={!!category.is_allowed}
                                                                            onCheckedChange={() => handleTogglePermission(category)}
                                                                        />
                                                                        <span className="text-sm text-muted-foreground hidden sm:inline">
                                                                            {category.is_allowed ? "Hiện" : "Ẩn"}
                                                                        </span>
                                                                    </div>

                                                                    <div className="flex gap-1">
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => openCategoryDialog(menuType.id, category)}
                                                                        >
                                                                            <Edit2 className="w-4 h-4" />
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            variant="ghost"
                                                                            onClick={() => {
                                                                                setDeleteConfirmId(category.id)
                                                                                setDeleteConfirmType("category")
                                                                            }}
                                                                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                                                        >
                                                                            <Trash2 className="w-4 h-4" />
                                                                        </Button>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}

                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="w-full mt-2"
                                                        onClick={() => openCategoryDialog(menuType.id)}
                                                    >
                                                        <Plus className="w-4 h-4 mr-2" />
                                                        Thêm Nhóm Hàng
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </Card>

                {/* Uncategorized Categories Section */}
                {categoriesWithoutMenuType.length > 0 && (
                    <Card className="p-6">
                        <div className="mb-6">
                            <h2 className="text-xl font-bold text-foreground">Nhóm Hàng Chưa Phân Loại</h2>
                            <p className="text-sm text-muted-foreground mt-2">
                                Những nhóm hàng chưa được gán vào loại hàng
                            </p>
                        </div>

                        <div className="space-y-2">
                            {categoriesWithoutMenuType.map((category) => (
                                <div
                                    key={category.id}
                                    className="flex items-center gap-4 p-4 border border-border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium text-foreground">{category.name}</h3>
                                            {category.is_allowed ? (
                                                <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 border-green-200">Hiển thị bán hàng</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-muted-foreground">Ẩn bán hàng</Badge>
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {category._count?.products || 0} sản phẩm
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className="flex items-center gap-2 mr-2">
                                            <Switch
                                                checked={!!category.is_allowed}
                                                onCheckedChange={() => handleTogglePermission(category)}
                                            />
                                            <span className="text-sm text-muted-foreground hidden sm:inline">
                                                {category.is_allowed ? "Hiện" : "Ẩn"}
                                            </span>
                                        </div>

                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => openCategoryDialog("", category)}
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setDeleteConfirmId(category.id)
                                                    setDeleteConfirmType("category")
                                                }}
                                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                )}

                {/* Dialog */}
                <Dialog open={showDialog} onOpenChange={setShowDialog}>
                    <DialogContent className="max-w-md">
                        <DialogHeader>
                            <DialogTitle>
                                {dialogMode === "menu-type"
                                    ? dialogAction === "create"
                                        ? "Thêm Loại Hàng"
                                        : "Sửa Loại Hàng"
                                    : dialogAction === "create"
                                        ? "Thêm Nhóm Hàng"
                                        : "Sửa Nhóm Hàng"}
                            </DialogTitle>
                        </DialogHeader>

                        <div className="space-y-4">
                            {dialogMode === "category" && (
                                <div>
                                    <label className="text-sm font-medium text-foreground">Loại Hàng</label>
                                    <select
                                        value={formMenuTypeId}
                                        onChange={(e) => setFormMenuTypeId(e.target.value)}
                                        disabled={isSaving}
                                        className="w-full px-3 py-2 border border-input rounded-md text-sm mt-2 disabled:bg-muted disabled:cursor-not-allowed"
                                    >
                                        <option value="">-- Chọn Loại Hàng --</option>
                                        {menuTypes.map((mt) => (
                                            <option key={mt.id} value={mt.id}>
                                                {mt.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="text-sm font-medium text-foreground">
                                    {dialogMode === "menu-type" ? "Tên Loại Hàng" : "Tên Nhóm Hàng"}
                                </label>
                                <Input
                                    placeholder={
                                        dialogMode === "menu-type" ? "Ví dụ: Đồ ăn, Đồ uống..." : "Ví dụ: Cơm, Mì..."
                                    }
                                    value={formName}
                                    onChange={(e) => setFormName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter") handleSave()
                                    }}
                                    disabled={isSaving}
                                    className="mt-2"
                                />
                            </div>

                            <div className="flex gap-3 justify-end">
                                <DialogClose asChild>
                                    <Button variant="outline">Hủy</Button>
                                </DialogClose>
                                <Button
                                    onClick={handleSave}
                                    disabled={isSaving || !formName.trim() || (dialogMode === "category" && !formMenuTypeId)}
                                >
                                    {isSaving ? "Đang lưu..." : dialogAction === "create" ? "Thêm" : "Cập Nhật"}
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {deleteConfirmType === "menu-type" ? "Xóa loại hàng" : "Xóa nhóm hàng"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {deleteConfirmType === "menu-type"
                                    ? `Bạn có chắc muốn xóa loại hàng này? Hành động này không thể hoàn tác.`
                                    : `Bạn có chắc muốn xóa nhóm hàng này? Hành động này không thể hoàn tác.`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <div className="flex gap-3 justify-end">
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleDelete}
                                disabled={deleting}
                                className="bg-red-600 hover:bg-red-700"
                            >
                                {deleting ? "Đang xóa..." : "Xóa"}
                            </AlertDialogAction>
                        </div>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    )
}
