"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit, Trash2, Tag, Gift, ChevronDown, Ticket } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PromotionWizardDialog } from "@/components/admin/promotions/promotion-wizard-dialog"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { formatDbDateToDisplay } from "@/lib/server-time"
import { mobileFetch } from "@/lib/mobile/api-client"

type VoucherProgram = {
  id: string
  name: string
  description: string | null
  discount_type: string
  discount_value: number
  min_amount: number | null
  total_codes: number
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
  usage?: {
    total: number
    used: number
    unused: number
  }
}

type VoucherCode = {
  id: string
  code: string
  is_used: boolean
  used_at: string | null
  created_at: string
}

type Promotion = {
  id: string
  name: string
  description: string | null
  discount_type: string
  discount_value: number
  min_amount: number | null
  promotion_type: string | null
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
}

export default function VouchersPromotionsPage() {
  const [activeTab, setActiveTab] = useState<"vouchers" | "promotions">("vouchers")
  const [programs, setPrograms] = useState<VoucherProgram[]>([])
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(false)

  // Confirm dialog state
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => {} })

  // Voucher program dialog states
  const [programDialogOpen, setProgramDialogOpen] = useState(false)
  const [editingProgram, setEditingProgram] = useState<VoucherProgram | null>(null)
  const [programForm, setProgramForm] = useState({
    name: "",
    description: "",
    codePrefix: "",
    total_codes: "",
    discountType: "PERCENTAGE",
    discountValue: "",
    minAmount: "",
    minQuantity: "",
    startDate: "",
    endDate: "",
    giftItems: [] as Array<{ item_type: string; item_id: string; quantity: number }>,
    productItems: [] as Array<{ item_type: string; item_id: string; quantity_required: number }>,
  })

  // Detail modal states
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [selectedProgram, setSelectedProgram] = useState<VoucherProgram | null>(null)
  const [programCodes, setProgramCodes] = useState<VoucherCode[]>([])
  const [codesLoading, setCodesLoading] = useState(false)
  const [codeFilter, setCodeFilter] = useState<"all" | "used" | "unused">("all")

  // Promotion wizard dialog state
  const [promotionWizardOpen, setPromotionWizardOpen] = useState(false)
  const [editingPromotion, setEditingPromotion] = useState<Promotion | null>(null)

  // Product/Recipe selection state
  const [recipes, setRecipes] = useState<any[]>([])
  const [loadingRecipes, setLoadingRecipes] = useState(false)
  const [recipeSearch, setRecipeSearch] = useState("")
  const [giftRecipeSearch, setGiftRecipeSearch] = useState("")
  const [productRecipeSearch, setProductRecipeSearch] = useState("")

  useEffect(() => {
    loadData()
    loadRecipes()
  }, [activeTab])

  async function loadRecipes() {
    try {
      setLoadingRecipes(true)
      const res = await mobileFetch('/api/product-recipes', {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      if (!res.ok) {
        console.error('[loadRecipes] Failed to load recipes:', res.status, res.statusText)
        // Try alternative endpoint if primary fails
        const altRes = await mobileFetch('/api/recipes', {
          credentials: 'include'
        })
        if (altRes.ok) {
          const json = await altRes.json()
          setRecipes(json.data || json || [])
          return
        }
      }
      const json = await res.json()
      if (json.success) {
        setRecipes(json.data || [])
      } else {
        setRecipes(json.data || json || [])
      }
    } catch (err) {
      console.error('Error loading recipes:', err)
      setRecipes([])
    } finally {
      setLoadingRecipes(false)
    }
  }

  const getFilteredRecipes = (search: string) => {
    if (!search.trim()) return recipes
    return recipes.filter(r => r.name?.toLowerCase().includes(search.toLowerCase()))
  }

  // Helper function to get status based on is_active, start_date, end_date
  const getStatus = (item: VoucherProgram | Promotion) => {
    if (!item.is_active) {
      return { status: "tạm_ngưng", label: "Tạm ngưng", color: "bg-gray-100 text-gray-800" }
    }

    const now = new Date()
    const startDate = item.start_date ? new Date(item.start_date) : null
    const endDate = item.end_date ? new Date(item.end_date) : null

    // Check if expired
    if (endDate && endDate < now) {
      return { status: "hết_hạn", label: "Hết hạn", color: "bg-red-100 text-red-800" }
    }

    // Check if not started
    if (startDate && startDate > now) {
      return { status: "chưa_bắt_đầu", label: "Chưa bắt đầu", color: "bg-yellow-100 text-yellow-800" }
    }

    // Active and within date range
    return { status: "hoạt_động", label: "Hoạt động", color: "bg-green-100 text-green-800" }
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === "vouchers") {
        const res = await mobileFetch("/api/voucher-programs?page=1&pageSize=100&includeExpired=true")
        const json = await res.json()
        if (json.success) {
          setPrograms(json.data || [])
        }
      } else {
        const res = await mobileFetch("/api/promotions?page=1&pageSize=100&includeExpired=true")
        const json = await res.json()
        if (json.success) {
          setPromotions(json.data || [])
        }
      }
    } catch (err: any) {
      toast.error("Lỗi tải dữ liệu", { description: err.message })
    } finally {
      setLoading(false)
    }
  }

  const loadProgramCodes = async (programId: string, filterValue?: string) => {
    setCodesLoading(true)
    try {
      const filterParam = filterValue || codeFilter
      const filterQuery = filterParam === "all" ? "" : `&filter=${filterParam}`
      const res = await mobileFetch(`/api/voucher-programs/${programId}?page=1&pageSize=1000${filterQuery}`)
      const json = await res.json()
      if (json.success && json.data?.codes) {
        setProgramCodes(json.data.codes)
      }
    } catch (err: any) {
      toast.error("Lỗi tải mã voucher", { description: err.message })
    } finally {
      setCodesLoading(false)
    }
  }

  const handleCreateProgram = async () => {
    try {
      const totalCodes = Number(programForm.total_codes)
      if (!totalCodes || totalCodes <= 0 || totalCodes > 1000) {
        toast.error("Số lượng mã phải từ 1 đến 1000")
        return
      }

      // Validate required fields based on discount type
      if (!programForm.name) {
        toast.error("Vui lòng nhập tên chương trình")
        return
      }

      if (programForm.discountType === "GIFT") {
        if (!programForm.minAmount && !programForm.minQuantity) {
          toast.error("Voucher quà tặng cần có điều kiện tối thiểu (số tiền hoặc số lượng)")
          return
        }
        if (programForm.giftItems.length === 0) {
          toast.error("Vui lòng thêm ít nhất một món quà")
          return
        }
        // Validate all gift items have product selected
        const hasEmptyGift = programForm.giftItems.some(item => !item.item_id)
        if (hasEmptyGift) {
          toast.error("Vui lòng chọn sản phẩm cho tất cả các món quà")
          return
        }
      } else if (programForm.discountType === "PRODUCT_DISCOUNT") {
        if (!programForm.discountValue) {
          toast.error("Vui lòng nhập giá trị giảm giá")
          return
        }
        if (programForm.productItems.length === 0) {
          toast.error("Vui lòng thêm ít nhất một sản phẩm áp dụng")
          return
        }
        // Validate all product items have product selected
        const hasEmptyProduct = programForm.productItems.some(item => !item.item_id)
        if (hasEmptyProduct) {
          toast.error("Vui lòng chọn sản phẩm cho tất cả các mục")
          return
        }
      } else if (programForm.discountType === "PERCENTAGE" || programForm.discountType === "FIXED_AMOUNT") {
        if (!programForm.discountValue) {
          toast.error("Vui lòng nhập giá trị giảm giá")
          return
        }
      }

      const res = await mobileFetch("/api/voucher-programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: programForm.name,
          description: programForm.description || null,
          code_prefix: programForm.codePrefix || null,
          total_codes: totalCodes,
          discount_type: programForm.discountType,
          discount_value: programForm.discountValue ? Number(programForm.discountValue) : null,
          min_amount: programForm.minAmount ? Number(programForm.minAmount) : null,
          min_quantity: programForm.minQuantity ? Number(programForm.minQuantity) : null,
          start_date: programForm.startDate || null,
          end_date: programForm.endDate || null,
          is_active: true,
          gift_items: programForm.giftItems.length > 0 ? programForm.giftItems : null,
          product_items: programForm.productItems.length > 0 ? programForm.productItems : null,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Lỗi tạo chương trình voucher")
      }

      toast.success(`Đã tạo ${totalCodes} mã voucher cho chương trình "${programForm.name}"`)
      setProgramDialogOpen(false)
      resetProgramForm()
      loadData()
    } catch (err: any) {
      toast.error("Lỗi tạo chương trình voucher", { description: err.message })
    }
  }

  const handleUpdateProgram = async () => {
    if (!editingProgram) return

    try {
      const res = await mobileFetch(`/api/voucher-programs/${editingProgram.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: programForm.name,
          description: programForm.description || null,
          is_active: editingProgram.is_active,
          start_date: programForm.startDate || null,
          end_date: programForm.endDate || null,
        }),
      })

      const json = await res.json()
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Lỗi cập nhật chương trình")
      }

      toast.success("Chương trình voucher đã được cập nhật")
      setProgramDialogOpen(false)
      setEditingProgram(null)
      resetProgramForm()
      loadData()
    } catch (err: any) {
      toast.error("Lỗi cập nhật chương trình", { description: err.message })
    }
  }

  const handleDeleteProgram = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa chương trình",
      description: "Bạn có chắc muốn xóa chương trình voucher và tất cả mã của nó?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/voucher-programs/${id}`, { method: "DELETE" })
          const json = await res.json()
          if (!res.ok || !json.success) {
            throw new Error(json.error || "Lỗi xóa chương trình")
          }

          toast.success("Chương trình voucher đã được xóa")
          loadData()
        } catch (err: any) {
          toast.error("Lỗi xóa chương trình", { description: err.message })
        }
      }
    })
  }

  const handleDeletePromotion = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa chương trình",
      description: "Bạn có chắc muốn xóa chương trình này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        try {
          const res = await mobileFetch(`/api/promotions/${id}`, { method: "DELETE" })
          const json = await res.json()
          if (!res.ok || !json.success) {
            throw new Error(json.error || "Lỗi xóa")
          }

          toast.success("Chương trình đã được xóa")
          loadData()
        } catch (err: any) {
          toast.error("Lỗi xóa", { description: err.message })
        }
      }
    })
  }

  const resetProgramForm = () => {
    setProgramForm({
      name: "",
      description: "",
      codePrefix: "",
      total_codes: "",
      discountType: "PERCENTAGE",
      discountValue: "",
      minAmount: "",
      minQuantity: "",
      startDate: "",
      endDate: "",
      giftItems: [],
      productItems: [],
    })
  }

  const openEditProgram = (program: VoucherProgram) => {
    setEditingProgram(program)
    setProgramForm({
      name: program.name,
      description: program.description || "",
      codePrefix: "",
      total_codes: "",
      discountType: program.discount_type,
      discountValue: String(program.discount_value),
      minAmount: program.min_amount ? String(program.min_amount) : "",
      minQuantity: "",
      startDate: program.start_date ? new Date(program.start_date).toISOString().slice(0, 16) : "",
      endDate: program.end_date ? new Date(program.end_date).toISOString().slice(0, 16) : "",
      giftItems: [],
      productItems: [],
    })
    setProgramDialogOpen(true)
  }

  const openDetailModal = (program: VoucherProgram) => {
    setSelectedProgram(program)
    setCodeFilter("all") // Reset filter to "all" when opening
    setDetailModalOpen(true)
    loadProgramCodes(program.id, "all")
  }

  const handleEditPromotion = async (promotionId: string) => {
    try {
      const res = await mobileFetch(`/api/promotions/${promotionId}`)
      const json = await res.json()
      if (json.success) {
        setEditingPromotion(json.data)
        setPromotionWizardOpen(true)
      } else {
        toast.error("Lỗi tải thông tin khuyến mãi")
      }
    } catch (err) {
      toast.error("Lỗi tải thông tin khuyến mãi")
    }
  }

  const handlePromotionSaved = () => {
    setEditingPromotion(null)
    setPromotionWizardOpen(false)
    loadData()
  }

  const formatDiscount = (type: string, value: number) => {
    if (type === "PERCENTAGE") {
      return `${value}%`
    }
    return `${Number(value).toLocaleString("vi-VN")} ₫`
  }

  const formatPromotionType = (type: string | null) => {
    switch (type) {
      case "GIFT":
        return "Quà tặng"
      case "DISCOUNT":
      default:
        return "Giảm giá"
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Ticket}
        title="Voucher & Khuyến Mãi"
        subtitle="Quản lý chương trình khuyến mãi"
        gradient="rose"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Voucher & Khuyến Mãi</h1>
          <p className="text-muted-foreground mt-2">Quản lý chương trình voucher và khuyến mãi</p>
        </div>

      {/* Tabs */}
      <div className="flex gap-1 md:gap-2 border-b overflow-x-auto">
        <button
          onClick={() => setActiveTab("vouchers")}
          className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors flex items-center gap-1 md:gap-2 whitespace-nowrap ${
            activeTab === "vouchers"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Tag className="w-4 h-4" />
          <span className="hidden sm:inline">Mã </span>Giảm Giá
        </button>
        <button
          onClick={() => setActiveTab("promotions")}
          className={`px-3 md:px-6 py-2 md:py-3 text-sm md:text-base font-medium border-b-2 transition-colors flex items-center gap-1 md:gap-2 whitespace-nowrap ${
            activeTab === "promotions"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Gift className="w-4 h-4" />
          Khuyến Mãi
        </button>
      </div>

      {/* Vouchers Tab */}
      {activeTab === "vouchers" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => {
                setEditingProgram(null)
                resetProgramForm()
                setProgramDialogOpen(true)
              }}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Tạo Chương Trình Voucher
            </Button>
          </div>

          <Card className="p-6">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Tên Chương Trình</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Loại Giảm Giá</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Tối Thiểu</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Số Mã</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Đã Dùng</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Ngày Tạo</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      Đang tải...
                    </td>
                  </tr>
                ) : programs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-muted-foreground">
                      Chưa có chương trình voucher nào
                    </td>
                  </tr>
                ) : (
                  programs.map((program) => (
                    <tr key={program.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-semibold">{program.name}</td>
                      <td className="py-3 px-4 text-center">
                        {program.discount_type === "PERCENTAGE" ? "Phần Trăm (%)" : program.discount_type === "FIXED" ? "Cố Định (₫)" : "Quà Tặng"}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {program.min_amount ? `${Number(program.min_amount).toLocaleString("vi-VN")} ₫` : "-"}
                      </td>
                      <td className="py-3 px-4 text-center">{program.total_codes}</td>
                      <td className="py-3 px-4 text-center">
                        <div className="text-sm">
                          <span className="font-semibold">{program.used_count}</span>
                          <span className="text-muted-foreground">/{program.total_codes}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const { label, color } = getStatus(program)
                          return <Badge className={color}>{label}</Badge>
                        })()}
                      </td>
                      <td className="py-3 px-4 text-center text-sm text-muted-foreground">
                        {formatDbDateToDisplay(program.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                            title="Xem mã"
                            onClick={() => openDetailModal(program)}
                          >
                            <ChevronDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => openEditProgram(program)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                            onClick={() => handleDeleteProgram(program.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </div>
      )}

      {/* Promotions Tab */}
      {activeTab === "promotions" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button
              onClick={() => setPromotionWizardOpen(true)}
              className="gap-2"
            >
              <Plus className="w-4 h-4" />
              Tạo Khuyến Mãi
            </Button>
          </div>

          <Card className="p-6">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Tên Chương Trình</th>
                  <th className="text-left py-3 px-4 font-semibold text-foreground">Mô Tả</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Loại chương trình</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Thời Gian</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Trạng Thái</th>
                  <th className="text-center py-3 px-4 font-semibold text-foreground">Hành Động</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Đang tải...
                    </td>
                  </tr>
                ) : promotions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-muted-foreground">
                      Chưa có chương trình nào
                    </td>
                  </tr>
                ) : (
                  promotions.map((promotion) => (
                    <tr key={promotion.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 font-semibold">{promotion.name}</td>
                      <td className="py-3 px-4">{promotion.description || "-"}</td>
                      <td className="py-3 px-4 text-center">
                        <Badge className={promotion.promotion_type === "GIFT" ? "bg-pink-100 text-pink-800" : "bg-blue-100 text-blue-800"}>
                          {formatPromotionType(promotion.promotion_type)}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-center text-sm">
                        {promotion.start_date && promotion.end_date ? (
                          <>
                            {formatDbDateToDisplay(promotion.start_date)}
                            {" - "}
                            {formatDbDateToDisplay(promotion.end_date)}
                          </>
                        ) : (
                          "Không giới hạn"
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {(() => {
                          const { label, color } = getStatus(promotion)
                          return <Badge className={color}>{label}</Badge>
                        })()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-center gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-blue-50 dark:hover:bg-blue-950 hover:text-blue-600 dark:hover:text-blue-400"
                            onClick={() => handleEditPromotion(promotion.id)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 dark:hover:text-red-400"
                            onClick={() => handleDeletePromotion(promotion.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </Card>
        </div>
      )}

      {/* Program Dialog */}
      <Dialog open={programDialogOpen} onOpenChange={(open) => {
        setProgramDialogOpen(open)
        if (!open) {
          setEditingProgram(null)
          resetProgramForm()
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{editingProgram ? "Chỉnh Sửa Chương Trình" : "Tạo Chương Trình Voucher Mới"}</DialogTitle>
            <DialogDescription>
              {editingProgram ? "Cập nhật thông tin chương trình voucher" : "Tạo chương trình voucher mới với mã tự động"}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto flex-1 pr-4">
            <div>
              <Label className="mb-2 block">Tên Chương Trình *</Label>
              <Input
                placeholder="VD: Giảm giá mùa hè 2025"
                value={programForm.name}
                onChange={(e) => setProgramForm({ ...programForm, name: e.target.value })}
              />
            </div>

            <div>
              <Label className="mb-2 block">Mô Tả</Label>
              <Input
                placeholder="Mô tả chi tiết về chương trình"
                value={programForm.description}
                onChange={(e) => setProgramForm({ ...programForm, description: e.target.value })}
              />
            </div>

            {!editingProgram && (
              <>
                <div>
                  <Label className="mb-2 block">Tiền Tố Mã Voucher</Label>
                  <Input
                    placeholder="VD: SALE, VIP, NEW (tối đa 6 ký tự)"
                    value={programForm.codePrefix}
                    maxLength={6}
                    onChange={(e) => setProgramForm({ ...programForm, codePrefix: e.target.value.toUpperCase() })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Nếu để trống, hệ thống sẽ lấy 4 ký tự đầu từ tên chương trình
                  </p>
                </div>

                <div>
                  <Label className="mb-2 block">Số Lượng Mã *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="1000"
                    placeholder="VD: 100"
                    value={programForm.total_codes}
                    onChange={(e) => setProgramForm({ ...programForm, total_codes: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Mã sẽ có dạng: {programForm.codePrefix || "XXXX"}-XXXXXXXX (phần sau tự động random)
                  </p>
                </div>
              </>
            )}

            <div>
              <Label className="mb-2 block">Loại Chương Trình *</Label>
              <Select
                value={programForm.discountType}
                onValueChange={(value) => setProgramForm({ ...programForm, discountType: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PERCENTAGE">Giảm Giá Phần Trăm (%)</SelectItem>
                  <SelectItem value="FIXED_AMOUNT">Giảm Giá Cố Định (₫)</SelectItem>
                  <SelectItem value="GIFT">Quà Tặng</SelectItem>
                  <SelectItem value="PRODUCT_DISCOUNT">Giảm Giá Sản Phẩm Cụ Thể</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Conditional fields based on voucher type */}
            {programForm.discountType === "GIFT" ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="mb-2 block">Đơn Hàng Tối Thiểu (₫)</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={programForm.minAmount}
                      onChange={(e) => setProgramForm({ ...programForm, minAmount: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Để trống nếu áp dụng theo số lượng</p>
                  </div>
                  <div>
                    <Label className="mb-2 block">Số Lượng Sản Phẩm Tối Thiểu</Label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={programForm.minQuantity}
                      onChange={(e) => setProgramForm({ ...programForm, minQuantity: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Để trống nếu áp dụng theo giá trị</p>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="mb-2 block">Quà Tặng *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProgramForm({
                          ...programForm,
                          giftItems: [
                            ...programForm.giftItems,
                            { item_type: 'RECIPE', item_id: '', quantity: 1 }
                          ]
                        })
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Thêm Quà
                    </Button>
                  </div>

                  {programForm.giftItems.length === 0 ? (
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">
                        Chưa có quà tặng nào. Nhấn "Thêm Quà" để bắt đầu.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-2">
                      {programForm.giftItems.map((gift, index) => (
                        <div key={index} className="flex gap-2 items-center p-2 bg-muted rounded">
                          <Select
                            value={gift.item_id}
                            onValueChange={(value) => {
                              const updated = [...programForm.giftItems]
                              updated[index].item_id = value
                              setProgramForm({ ...programForm, giftItems: updated })
                            }}
                          >
                            <SelectTrigger className="h-8 flex-1">
                              <SelectValue placeholder="Sản phẩm" />
                            </SelectTrigger>
                            <SelectContent>
                              {recipes.length === 0 ? (
                                <div className="p-2 text-xs text-muted-foreground">Đang tải sản phẩm...</div>
                              ) : (
                                recipes.map((recipe) => (
                                  <SelectItem key={recipe.id} value={recipe.id} className="text-sm">
                                    {recipe.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="1"
                            max="999"
                            placeholder="SL"
                            className="h-8 w-16 text-center"
                            value={gift.quantity}
                            onChange={(e) => {
                              const updated = [...programForm.giftItems]
                              updated[index].quantity = parseInt(e.target.value) || 1
                              setProgramForm({ ...programForm, giftItems: updated })
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setProgramForm({
                                ...programForm,
                                giftItems: programForm.giftItems.filter((_, i) => i !== index)
                              })
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : programForm.discountType === "PRODUCT_DISCOUNT" ? (
              <>
                <div>
                  <Label className="mb-2 block">Giá Trị Giảm (%) *</Label>
                  <Input
                    type="number"
                    placeholder="10"
                    value={programForm.discountValue}
                    onChange={(e) => setProgramForm({ ...programForm, discountValue: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Phần trăm giảm giá cho sản phẩm được chọn</p>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="mb-2 block">Sản Phẩm Áp Dụng *</Label>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setProgramForm({
                          ...programForm,
                          productItems: [
                            ...programForm.productItems,
                            { item_type: 'RECIPE', item_id: '', quantity_required: 1 }
                          ]
                        })
                      }}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Thêm Sản Phẩm
                    </Button>
                  </div>

                  {programForm.productItems.length === 0 ? (
                    <div className="bg-muted p-4 rounded-lg text-center">
                      <p className="text-sm text-muted-foreground">
                        Chưa có sản phẩm nào. Nhấn "Thêm Sản Phẩm" để bắt đầu.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto border rounded-lg p-2">
                      {programForm.productItems.map((product, index) => (
                        <div key={index} className="flex gap-2 items-center p-2 bg-muted rounded">
                          <Select
                            value={product.item_id}
                            onValueChange={(value) => {
                              const updated = [...programForm.productItems]
                              updated[index].item_id = value
                              setProgramForm({ ...programForm, productItems: updated })
                            }}
                          >
                            <SelectTrigger className="h-8 flex-1">
                              <SelectValue placeholder="Sản phẩm" />
                            </SelectTrigger>
                            <SelectContent>
                              {recipes.length === 0 ? (
                                <div className="p-2 text-xs text-muted-foreground">Đang tải sản phẩm...</div>
                              ) : (
                                recipes.map((recipe) => (
                                  <SelectItem key={recipe.id} value={recipe.id} className="text-sm">
                                    {recipe.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <Input
                            type="number"
                            min="1"
                            max="999"
                            placeholder="SL tối thiểu"
                            className="h-8 w-20 text-center text-xs"
                            value={product.quantity_required}
                            onChange={(e) => {
                              const updated = [...programForm.productItems]
                              updated[index].quantity_required = parseInt(e.target.value) || 1
                              setProgramForm({ ...programForm, productItems: updated })
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            onClick={() => {
                              setProgramForm({
                                ...programForm,
                                productItems: programForm.productItems.filter((_, i) => i !== index)
                              })
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="mb-2 block">Giá Trị Giảm *</Label>
                  <Input
                    type="number"
                    placeholder={programForm.discountType === "PERCENTAGE" ? "10" : "50000"}
                    value={programForm.discountValue}
                    onChange={(e) => setProgramForm({ ...programForm, discountValue: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="mb-2 block">Đơn Hàng Tối Thiểu (₫)</Label>
                  <Input
                    type="number"
                    placeholder="0"
                    value={programForm.minAmount}
                    onChange={(e) => setProgramForm({ ...programForm, minAmount: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="mb-2 block">Ngày Bắt Đầu</Label>
                <Input
                  type="datetime-local"
                  value={programForm.startDate}
                  onChange={(e) => setProgramForm({ ...programForm, startDate: e.target.value })}
                />
              </div>
              <div>
                <Label className="mb-2 block">Ngày Kết Thúc</Label>
                <Input
                  type="datetime-local"
                  value={programForm.endDate}
                  onChange={(e) => setProgramForm({ ...programForm, endDate: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setProgramDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              onClick={editingProgram ? handleUpdateProgram : handleCreateProgram}
              disabled={
                editingProgram
                  ? !programForm.name
                  : !programForm.name || !programForm.total_codes
              }
            >
              {editingProgram ? "Cập Nhật" : "Tạo Chương Trình"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Modal */}
      <Dialog open={detailModalOpen} onOpenChange={(open) => {
        setDetailModalOpen(open)
        if (!open) {
          setSelectedProgram(null)
          setProgramCodes([])
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Chi Tiết Chương Trình: {selectedProgram?.name}</DialogTitle>
              {selectedProgram && (() => {
                const { label, color } = getStatus(selectedProgram)
                return <Badge className={color}>{label}</Badge>
              })()}
            </div>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto">
            {/* Program Stats */}
            {selectedProgram && (
              <div className="grid grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold">{selectedProgram.total_codes}</div>
                  <div className="text-sm text-muted-foreground">Tổng Mã</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{selectedProgram.usage?.used || 0}</div>
                  <div className="text-sm text-muted-foreground">Đã Dùng</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{selectedProgram.usage?.unused || 0}</div>
                  <div className="text-sm text-muted-foreground">Chưa Dùng</div>
                </div>
              </div>
            )}

            {/* Filter */}
            <div className="flex gap-2">
              <Label className="text-sm font-medium pt-2">Lọc:</Label>
              <Select value={codeFilter} onValueChange={(value) => {
                const newFilter = value as "all" | "used" | "unused"
                setCodeFilter(newFilter)
                if (selectedProgram) {
                  loadProgramCodes(selectedProgram.id, newFilter)
                }
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất Cả Mã</SelectItem>
                  <SelectItem value="used">Đã Dùng</SelectItem>
                  <SelectItem value="unused">Chưa Dùng</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Codes Table */}
            <div className="max-h-[400px] overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted border-b sticky top-0 z-10">
                  <tr>
                    <th className="text-left py-3 px-4 bg-muted">Mã Voucher</th>
                    <th className="text-center py-3 px-4 bg-muted">Trạng Thái</th>
                    <th className="text-center py-3 px-4 bg-muted">Ngày Tạo</th>
                    <th className="text-center py-3 px-4 bg-muted">Ngày Dùng</th>
                  </tr>
                </thead>
                <tbody>
                  {codesLoading ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        Đang tải mã...
                      </td>
                    </tr>
                  ) : programCodes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center py-8 text-muted-foreground">
                        Không có mã voucher
                      </td>
                    </tr>
                  ) : (
                    programCodes.map((code) => (
                      <tr key={code.id} className="border-b hover:bg-muted/50">
                        <td className="py-3 px-4 font-mono font-bold">{code.code}</td>
                        <td className="py-3 px-4 text-center">
                          <Badge className={code.is_used ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}>
                            {code.is_used ? "Đã Dùng" : "Chưa Dùng"}
                          </Badge>
                        </td>
                        <td className="py-3 px-4 text-center text-sm text-muted-foreground">
                          {formatDbDateToDisplay(code.created_at)}
                        </td>
                        <td className="py-3 px-4 text-center text-sm text-muted-foreground">
                          {code.used_at ? formatDbDateToDisplay(code.used_at) : "-"}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailModalOpen(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Promotion Wizard Dialog */}
      <PromotionWizardDialog
        open={promotionWizardOpen}
        onOpenChange={(open) => {
          setPromotionWizardOpen(open)
          if (!open) {
            setEditingPromotion(null)
          }
        }}
        onSuccess={handlePromotionSaved}
        editData={editingPromotion}
      />

      {/* Confirm Dialog */}
      <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="max-w-[340px] rounded-lg">
          <DialogHeader>
            <DialogTitle>{confirmDialog.title}</DialogTitle>
            <DialogDescription>{confirmDialog.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>
              Hủy
            </Button>
            <Button variant="destructive" onClick={confirmDialog.onConfirm}>
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </div>
  )
}
