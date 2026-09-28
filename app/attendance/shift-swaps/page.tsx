"use client"

import { mobileFetch } from "@/lib/mobile/api-client"
import { cn } from "@/lib/utils"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { ShiftSwapDialog } from "@/components/shifts/shift-swap-dialog"
import { format } from "date-fns"
import { vi } from "date-fns/locale"
import { ArrowRightLeft, ArrowLeft, Check, X, Clock, User, Users, CalendarDays, AlertCircle } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { useAuth } from "@/hooks/use-auth"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { CalendarOff } from "lucide-react"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"

interface LeaveRequest {
    id: string
    user_id: string
    leave_date: string
    reason?: string
    status: string
    created_at: string
    users_requester?: {
        id: string
        full_name: string
        email: string
    }
    work_shifts?: {
        shift_name: string
    }
}

interface SwapRequest {
    id: string
    requester_user_id: string
    requester_date: string
    target_user_id?: string
    target_date?: string
    work_shift_id?: string
    target_work_shift_id?: string
    warehouse_id?: string
    status: string
    swap_type?: 'SWAP' | 'REPLACE'
    created_at: string
    requester_reason?: string
    rejection_reason?: string
    users_requester: {
        id: string
        full_name: string
        email: string
        avatar_url?: string
    }
    users_target?: {
        id: string
        full_name: string
        email: string
        avatar_url?: string
    }
    work_shifts?: {
        id: string
        shift_name: string
        shift_code: string
        start_time: string
        end_time: string
    }
    target_work_shifts?: {
        id: string
        shift_name: string
        shift_code: string
        start_time: string
        end_time: string
    }
    warehouses?: {
        id: string
        name: string
    }
}

interface UserAssignment {
    id: string
    date: string
    work_shift_id: string
    work_shifts: {
        id: string
        shift_name: string
        shift_code: string
        start_time: string
        end_time: string
    }
}

export default function AttendanceShiftSwapPage() {
    const { user } = useAuth()
    const [swapDialogOpen, setSwapDialogOpen] = useState(false)
    const [myShifts, setMyShifts] = useState<any[]>([])
    const [sentRequests, setSentRequests] = useState<SwapRequest[]>([])
    const [acceptedRequests, setAcceptedRequests] = useState<SwapRequest[]>([])
    const [availableSwapRequests, setAvailableSwapRequests] = useState<SwapRequest[]>([])
    const [availableReplaceRequests, setAvailableReplaceRequests] = useState<SwapRequest[]>([])
    const [userAssignments, setUserAssignments] = useState<UserAssignment[]>([])
    const [pendingLeaveRequests, setPendingLeaveRequests] = useState<LeaveRequest[]>([])
    const [loading, setLoading] = useState(true)
    const [activeTab, setActiveTab] = useState("swap")

    // Accept dialog state
    const [acceptDialog, setAcceptDialog] = useState<{
        open: boolean
        request: SwapRequest | null
    }>({ open: false, request: null })
    const [selectedAssignment, setSelectedAssignment] = useState("")

    // Leave approval dialog
    const [leaveApprovalDialog, setLeaveApprovalDialog] = useState<{
        open: boolean
        request: LeaveRequest | null
        action: "approve" | "reject"
    }>({ open: false, request: null, action: "approve" })

    // Confirm dialog state
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean
        title: string
        description: string
        onConfirm: () => void
    }>({ open: false, title: '', description: '', onConfirm: () => { } })

    const isManager = user?.role === "WAREHOUSE_MANAGER" || user?.role === "QuanLyKhoCon"

    const fetchMyShifts = async () => {
        try {
            const now = new Date()
            const year = now.getFullYear()
            const month = now.getMonth() + 1

            const res = await mobileFetch(`/api/shifts/my-schedule?year=${year}&month=${month}`)
            const json = await res.json()

            if (json.success) {
                setMyShifts(json.data.assignments)
            }
        } catch (error) {
            console.error("Error fetching shifts:", error)
            toast.error("Không thể tải danh sách ca làm việc")
        }
    }

    const fetchSwapRequests = async () => {
        try {
            setLoading(true)

            const requests = [
                mobileFetch("/api/shifts/swap?type=sent"),
                mobileFetch("/api/shifts/swap?type=available"),
                mobileFetch("/api/shifts/swap"), // Get all requests related to user (including accepted)
            ]

            const responses = await Promise.all(requests)
            const [sentJson, availableJson, allJson] = await Promise.all(responses.map(r => r.json()))

            if (sentJson.success) setSentRequests(sentJson.data)
            if (availableJson.success) {
                const allAvailable = availableJson.data || []
                // Tách riêng SWAP và REPLACE
                setAvailableSwapRequests(allAvailable.filter((r: SwapRequest) => r.swap_type !== 'REPLACE'))
                setAvailableReplaceRequests(allAvailable.filter((r: SwapRequest) => r.swap_type === 'REPLACE'))
                setUserAssignments(availableJson.userAssignments || [])
            }
            if (allJson.success) {
                // Filter requests where current user is the target (accepted by me)
                const currentUserId = user?.id
                const accepted = (allJson.data || []).filter((r: SwapRequest) =>
                    r.target_user_id === currentUserId && r.requester_user_id !== currentUserId
                )
                setAcceptedRequests(accepted)
            }
        } catch (error) {
            console.error("Error fetching swap requests:", error)
            toast.error("Không thể tải danh sách yêu cầu đổi ca")
        } finally {
            setLoading(false)
        }
    }

    // Fetch pending leave requests for managers (only if manager access this, but likely restricted)
    const fetchPendingLeaveRequests = async () => {
        if (!isManager) return

        try {
            const res = await mobileFetch("/api/shifts/leave?for_approval=true")
            const json = await res.json()

            if (json.success) {
                setPendingLeaveRequests(json.data?.requests || [])
            }
        } catch (error) {
            console.error("Error fetching leave requests:", error)
            toast.error("Không thể tải danh sách yêu cầu nghỉ phép")
        }
    }

    useEffect(() => {
        if (!user?.id) return // Wait for user to be loaded

        fetchMyShifts()
        fetchSwapRequests()
        fetchPendingLeaveRequests()
    }, [user?.id, isManager])

    const handleSwapRequest = async (data: any) => {
        try {
            const res = await mobileFetch("/api/shifts/swap", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    requester_date: format(data.requesterDate, "yyyy-MM-dd"),
                    work_shift_id: data.workShiftId,
                    target_date: format(data.targetDate, "yyyy-MM-dd"),
                    target_work_shift_id: data.targetWorkShiftId,
                    requester_reason: data.reason,
                    swap_type: data.swapType, // Add this!
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || "Đã tạo yêu cầu đổi ca")
                fetchSwapRequests()
            } else {
                throw new Error(json.error)
            }
        } catch (error: any) {
            throw error
        }
    }

    const handleCancelRequest = async (requestId: string) => {
        setConfirmDialog({
            open: true,
            title: "Xác nhận hủy yêu cầu",
            description: "Bạn có chắc muốn hủy yêu cầu này?",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                try {
                    const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "cancel" }),
                    })

                    const json = await res.json()

                    if (json.success) {
                        toast.success("Đã hủy yêu cầu đổi ca")
                        fetchSwapRequests()
                    } else {
                        toast.error(json.error || "Không thể hủy yêu cầu")
                    }
                } catch (error) {
                    toast.error("Không thể hủy yêu cầu")
                }
            }
        })
    }

    // Handle deleting a swap request permanently
    const handleDeleteRequest = async (requestId: string) => {
        setConfirmDialog({
            open: true,
            title: "Xác nhận xóa yêu cầu",
            description: "Bạn có chắc muốn xóa yêu cầu này vĩnh viễn?",
            onConfirm: async () => {
                setConfirmDialog(prev => ({ ...prev, open: false }))
                try {
                    const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
                        method: "DELETE",
                    })

                    const json = await res.json()

                    if (json.success) {
                        toast.success("Đã xóa yêu cầu đổi ca")
                        fetchSwapRequests()
                    } else {
                        toast.error(json.error || "Không thể xóa yêu cầu")
                    }
                } catch (error) {
                    toast.error("Không thể xóa yêu cầu")
                }
            }
        })
    }

    // Handle accepting a swap request
    const handleAcceptSwap = async () => {
        const { request } = acceptDialog
        if (!request || !selectedAssignment) {
            toast.error("Vui lòng chọn ca của bạn để đổi")
            return
        }

        try {
            const res = await mobileFetch(`/api/shifts/swap/${request.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "accept",
                    target_shift_assignment_id: selectedAssignment,
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || "Đã gửi yêu cầu! Đang chờ quản lý phê duyệt.")
                setAcceptDialog({ open: false, request: null })
                setSelectedAssignment("")
                await fetchSwapRequests()
                setActiveTab("accepted")
            } else {
                toast.error(json.error || "Không thể chấp nhận đổi ca")
            }
        } catch (error) {
            toast.error("Không thể chấp nhận đổi ca")
        }
    }

    // Handle accepting a REPLACE request (no shift needed)
    const handleAcceptReplace = async (requestId: string) => {
        setConfirmDialog(prev => ({ ...prev, open: false }))

        try {
            const res = await mobileFetch(`/api/shifts/swap/${requestId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "accept",
                }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || "Đã gửi yêu cầu! Đang chờ quản lý phê duyệt.")
                await fetchSwapRequests()
                setActiveTab("accepted")
            } else {
                toast.error(json.error || "Không thể nhận ca thay")
            }
        } catch (error) {
            toast.error("Không thể nhận ca thay")
        }
    }

    // Handle leave approval/rejection
    const handleLeaveApproval = async () => {
        const { request, action } = leaveApprovalDialog
        if (!request) return

        try {
            const res = await mobileFetch(`/api/shifts/leave/${request.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            })

            const json = await res.json()

            if (json.success) {
                toast.success(json.message || (action === "approve" ? "Đã duyệt nghỉ phép" : "Đã từ chối nghỉ phép"))
                setLeaveApprovalDialog({ open: false, request: null, action: "approve" })
                fetchPendingLeaveRequests()
            } else {
                toast.error(json.error || "Không thể xử lý yêu cầu")
            }
        } catch (error) {
            toast.error("Không thể xử lý yêu cầu")
        }
    }

    const getStatusBadge = (status: string) => {
        const variants: Record<string, any> = {
            PENDING: { variant: "secondary", label: "Đang chờ", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100" },
            APPROVED: { variant: "default", label: "Đã đổi", className: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100" },
            REJECTED: { variant: "destructive", label: "Từ chối" },
            CANCELLED: { variant: "outline", label: "Đã hủy", className: "text-muted-foreground" },
            EXPIRED: { variant: "outline", label: "Hết hạn", className: "bg-gray-100 text-gray-600 dark:bg-gray-900 dark:text-gray-400" },
        }
        const config = variants[status] || variants.PENDING
        return <Badge variant={config.variant} className={config.className}>{config.label}</Badge>
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={ArrowRightLeft}
                title="Đổi Ca Làm Việc"
                subtitle="Yêu cầu đổi ca với đồng nghiệp"
                backUrl="/attendance"
            />

            <div className="p-4 md:p-6 space-y-4 md:space-y-6">
                <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div className="hidden md:flex md:items-center md:gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            onClick={() => window.location.href = '/attendance'}
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold">Đổi ca làm việc</h1>
                            <p className="text-muted-foreground">Quản lý yêu cầu đổi ca với đồng nghiệp</p>
                        </div>
                    </div>
                    <Button onClick={() => setSwapDialogOpen(true)} className="w-full md:w-auto">
                        <ArrowRightLeft className="mr-2 h-4 w-4" />
                        Yêu cầu đổi ca
                    </Button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="flex-wrap h-auto">
                        <TabsTrigger value="swap">
                            <ArrowRightLeft className="w-4 h-4 mr-1" />
                            Đổi ca
                            {availableSwapRequests.length > 0 && (
                                <Badge variant="destructive" className="ml-2">
                                    {availableSwapRequests.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="replace">
                            <Users className="w-4 h-4 mr-1" />
                            Làm thay
                            {availableReplaceRequests.length > 0 && (
                                <Badge variant="destructive" className="ml-2">
                                    {availableReplaceRequests.length}
                                </Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="sent">
                            <CalendarDays className="w-4 h-4 mr-1" />
                            Đã gửi ({sentRequests.length})
                        </TabsTrigger>
                        <TabsTrigger value="accepted">
                            <Check className="w-4 h-4 mr-1" />
                            Đã nhận ({acceptedRequests.length})
                        </TabsTrigger>
                        {isManager && (
                            <TabsTrigger value="leave-approval">
                                <CalendarOff className="w-4 h-4 mr-1" />
                                Nghỉ phép
                                {pendingLeaveRequests.length > 0 && (
                                    <Badge variant="destructive" className="ml-2">
                                        {pendingLeaveRequests.length}
                                    </Badge>
                                )}
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* Available SWAP requests (mutual swap) */}
                    <TabsContent value="swap" className="space-y-4">
                        {availableSwapRequests.length === 0 ? (
                            <Card>
                                <CardContent className="p-6 text-center text-muted-foreground">
                                    <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Không có yêu cầu đổi ca nào</p>
                                    <p className="text-sm mt-1">Khi có ai đó muốn đổi ca, bạn sẽ thấy ở đây.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            availableSwapRequests.map((request) => (
                                <Card key={request.id} className="overflow-hidden">
                                    <CardHeader className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950/30 dark:to-purple-950/30">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                                                    <User className="h-5 w-5 text-primary" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-lg">
                                                        {request.users_requester.full_name}
                                                    </CardTitle>
                                                    <CardDescription>muốn đổi ca</CardDescription>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
                                                <Clock className="w-3 h-3 mr-1" />
                                                Đang chờ
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4 pt-4">
                                        {/* Ca muốn đổi đi */}
                                        <div className="p-3 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-900">
                                            <div className="text-xs font-medium text-orange-700 dark:text-orange-300 mb-1">
                                                Ca muốn đổi đi
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <CalendarDays className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                                                <div>
                                                    <div className="font-medium">
                                                        {format(new Date(request.requester_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                    </div>
                                                    {request.work_shifts && (
                                                        <div className="text-sm text-muted-foreground">
                                                            {request.work_shifts.shift_name} ({request.work_shifts.start_time?.substring(0, 5)} - {request.work_shifts.end_time?.substring(0, 5)})
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Ca muốn nhận */}
                                        {request.target_date && request.target_work_shifts && (
                                            <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                                                <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                                                    Ca muốn nhận
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <CalendarDays className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                    <div>
                                                        <div className="font-medium">
                                                            {format(new Date(request.target_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                        </div>
                                                        <div className="text-sm text-muted-foreground">
                                                            {request.target_work_shifts.shift_name} ({request.target_work_shifts.start_time?.substring(0, 5)} - {request.target_work_shifts.end_time?.substring(0, 5)})
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {request.requester_reason && (
                                            <div className="text-sm">
                                                <span className="font-medium">Lý do:</span>{" "}
                                                <span className="text-muted-foreground">{request.requester_reason}</span>
                                            </div>
                                        )}

                                        {/* SWAP type: Need to have matching shift to swap */}
                                        {request.target_date && request.target_work_shift_id && (() => {
                                            // Check if user has a matching assignment for this swap request
                                            const targetDateStr = request.target_date.split('T')[0]
                                            const hasMatchingAssignment = myShifts.some(shift => {
                                                const shiftDateStr = shift.assigned_date?.split('T')[0]
                                                return shiftDateStr === targetDateStr && shift.work_shift_id === request.target_work_shift_id
                                            })

                                            if (!hasMatchingAssignment) {
                                                return (
                                                    <div className="p-3 bg-muted rounded-lg text-sm text-center text-muted-foreground">
                                                        <AlertCircle className="h-4 w-4 mx-auto mb-1" />
                                                        Bạn không có ca phù hợp để đổi
                                                        <p className="text-xs mt-1">Cần có ca {request.target_work_shifts?.shift_name} vào {format(new Date(request.target_date), "dd/MM/yyyy", { locale: vi })}</p>
                                                    </div>
                                                )
                                            }

                                            return (
                                                <Button
                                                    className="w-full"
                                                    onClick={() => setAcceptDialog({ open: true, request })}
                                                >
                                                    <ArrowRightLeft className="mr-2 h-4 w-4" />
                                                    Chấp nhận đổi ca
                                                </Button>
                                            )
                                        })()}
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </TabsContent>

                    {/* Available REPLACE requests (work replacement) */}
                    <TabsContent value="replace" className="space-y-4">
                        {availableReplaceRequests.length === 0 ? (
                            <Card>
                                <CardContent className="p-6 text-center text-muted-foreground">
                                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Không có yêu cầu làm thay ca nào</p>
                                    <p className="text-sm mt-1">Khi có ai đó cần người làm thay, bạn sẽ thấy ở đây.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            availableReplaceRequests.map((request) => (
                                <Card key={request.id} className="overflow-hidden border-purple-200 dark:border-purple-900">
                                    <CardHeader className="bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                                    <User className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                                </div>
                                                <div>
                                                    <CardTitle className="text-lg">
                                                        {request.users_requester.full_name}
                                                    </CardTitle>
                                                    <CardDescription>cần người làm thay</CardDescription>
                                                </div>
                                            </div>
                                            <Badge variant="secondary" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100">
                                                <Clock className="w-3 h-3 mr-1" />
                                                Cần người
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4 pt-4">
                                        {/* Ca cần người làm thay */}
                                        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-900">
                                            <div className="text-xs font-medium text-purple-700 dark:text-purple-300 mb-1">
                                                Ca cần người làm thay
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <CalendarDays className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                                <div>
                                                    <div className="font-medium">
                                                        {format(new Date(request.requester_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                    </div>
                                                    {request.work_shifts && (
                                                        <div className="text-sm text-muted-foreground">
                                                            {request.work_shifts.shift_name} ({request.work_shifts.start_time?.substring(0, 5)} - {request.work_shifts.end_time?.substring(0, 5)})
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {request.requester_reason && (
                                            <div className="text-sm">
                                                <span className="font-medium">Lý do:</span>{" "}
                                                <span className="text-muted-foreground">{request.requester_reason}</span>
                                            </div>
                                        )}

                                        {/* Accept button for REPLACE */}
                                        <Button
                                            className="w-full bg-purple-600 hover:bg-purple-700"
                                            onClick={() => {
                                                setConfirmDialog({
                                                    open: true,
                                                    title: 'Xác nhận làm thay ca',
                                                    description: `Bạn đồng ý làm ca ${request.work_shifts?.shift_name || ''} vào ${format(new Date(request.requester_date), "EEEE, dd/MM/yyyy", { locale: vi })} thay cho ${request.users_requester.full_name}? Yêu cầu sẽ được gửi đến quản lý để phê duyệt.`,
                                                    onConfirm: () => handleAcceptReplace(request.id)
                                                })
                                            }}
                                        >
                                            <Check className="mr-2 h-4 w-4" />
                                            Tôi làm thay ca này
                                        </Button>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </TabsContent>

                    {/* Sent requests */}
                    <TabsContent value="sent" className="space-y-4">
                        {sentRequests.length === 0 ? (
                            <Card>
                                <CardContent className="p-6 text-center text-muted-foreground">
                                    <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Bạn chưa gửi yêu cầu đổi ca nào</p>
                                </CardContent>
                            </Card>
                        ) : (
                            sentRequests.map((request) => {
                                const isReplace = request.swap_type === 'REPLACE'

                                return (
                                    <Card key={request.id} className={cn(
                                        "overflow-hidden",
                                        isReplace && "border-purple-200 dark:border-purple-800"
                                    )}>
                                        <CardHeader className={cn(
                                            isReplace
                                                ? "bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30"
                                                : "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30"
                                        )}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    {isReplace ? (
                                                        <div className="h-10 w-10 rounded-full bg-purple-500/10 flex items-center justify-center">
                                                            <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                                                        </div>
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-blue-500/10 flex items-center justify-center">
                                                            <ArrowRightLeft className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <CardTitle className="text-base">
                                                            {isReplace ? "Yêu cầu làm thay ca" : "Yêu cầu đổi ca"}
                                                        </CardTitle>
                                                        <CardDescription className="text-xs">
                                                            Tạo lúc {format(new Date(request.created_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {getStatusBadge(request.status)}
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px]",
                                                        isReplace
                                                            ? "border-purple-500 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/30"
                                                            : "border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30"
                                                    )}>
                                                        {isReplace ? "🔄 Làm thay" : "↔️ Đổi ca"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3">
                                            {/* Ca muốn đổi đi hoặc Ca cần người làm thay */}
                                            <div className={cn(
                                                "p-3 rounded-lg border",
                                                isReplace
                                                    ? "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900"
                                                    : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900"
                                            )}>
                                                <div className={cn(
                                                    "text-xs font-medium mb-1",
                                                    isReplace
                                                        ? "text-purple-700 dark:text-purple-300"
                                                        : "text-orange-700 dark:text-orange-300"
                                                )}>
                                                    {isReplace ? "Ca cần người làm thay" : "Ca đổi đi"}
                                                </div>
                                                <div className="font-medium text-sm">
                                                    {format(new Date(request.requester_date), "EEEE, dd/MM", { locale: vi })}
                                                </div>
                                                {request.work_shifts && (
                                                    <div className="text-xs text-muted-foreground">
                                                        {request.work_shifts.shift_name} ({request.work_shifts.start_time?.substring(0, 5)} - {request.work_shifts.end_time?.substring(0, 5)})
                                                    </div>
                                                )}
                                            </div>

                                            {/* Ca muốn nhận - chỉ hiển thị cho SWAP type */}
                                            {!isReplace && request.target_date && request.target_work_shifts && (
                                                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                                                    <div className="text-xs font-medium text-green-700 dark:text-green-300 mb-1">
                                                        Ca muốn nhận
                                                    </div>
                                                    <div className="font-medium text-sm">
                                                        {format(new Date(request.target_date), "EEEE, dd/MM", { locale: vi })}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {request.target_work_shifts.shift_name} ({request.target_work_shifts.start_time?.substring(0, 5)} - {request.target_work_shifts.end_time?.substring(0, 5)})
                                                    </div>
                                                </div>
                                            )}

                                            {request.requester_reason && (
                                                <div className="text-sm">
                                                    <span className="font-medium">Lý do:</span>{" "}
                                                    <span className="text-muted-foreground">{request.requester_reason}</span>
                                                </div>
                                            )}

                                            {request.status === "APPROVED" && request.users_target && (
                                                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                                                    <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                                                        <Check className="h-4 w-4" />
                                                        <span className="font-medium">Đã đổi với {request.users_target.full_name}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {request.status === "PENDING" && !request.target_user_id && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Clock className="h-4 w-4" />
                                                        Đang chờ
                                                    </div>
                                                    <Button variant="outline" size="sm" onClick={() => handleCancelRequest(request.id)}>
                                                        <X className="h-4 w-4 mr-1" />
                                                        Hủy yêu cầu
                                                    </Button>
                                                </div>
                                            )}

                                            {request.status === "CANCELLED" && (
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        Đã hủy
                                                    </div>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRequest(request.id)}>
                                                        <X className="h-4 w-4 mr-1" />
                                                        Xóa
                                                    </Button>
                                                </div>
                                            )}

                                            {request.status === "EXPIRED" && (
                                                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-gray-50 to-slate-50 dark:from-gray-950/30 dark:to-slate-950/30 rounded-xl border-l-4 border-gray-400">
                                                    <div className="h-10 w-10 rounded-full bg-gray-400/20 flex items-center justify-center flex-shrink-0">
                                                        <AlertCircle className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                                            Yêu cầu hết hạn
                                                        </div>
                                                        <div className="text-xs text-gray-600 dark:text-gray-400">
                                                            Đã đến ngày ca mà chưa có người nhận
                                                        </div>
                                                    </div>
                                                    <Button variant="ghost" size="sm" onClick={() => handleDeleteRequest(request.id)}>
                                                        <X className="h-4 w-4 mr-1" />
                                                        Xóa
                                                    </Button>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })
                        )}
                    </TabsContent>

                    {/* Accepted Requests Tab - Requests I've accepted */}
                    <TabsContent value="accepted" className="space-y-4">
                        {acceptedRequests.length === 0 ? (
                            <Card className="border-dashed">
                                <CardContent className="p-8 md:p-12 text-center">
                                    <div className="flex flex-col items-center gap-4">
                                        <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                                            <Check className="h-8 w-8 text-primary/50" />
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-lg mb-1">Chưa có yêu cầu nào</h3>
                                            <p className="text-sm text-muted-foreground max-w-md">
                                                Các yêu cầu đổi ca hoặc làm thay ca mà bạn đã chấp nhận sẽ hiển thị ở đây.
                                            </p>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ) : (
                            acceptedRequests.map((request) => {
                                const isReplace = request.swap_type === 'REPLACE'

                                return (
                                    <Card key={request.id} className={cn(
                                        "overflow-hidden",
                                        isReplace && "border-purple-200 dark:border-purple-800"
                                    )}>
                                        <CardHeader className={cn(
                                            isReplace
                                                ? "bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30"
                                                : "bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30"
                                        )}>
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    {isReplace ? (
                                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
                                                            <Users className="h-5 w-5 text-white" />
                                                        </div>
                                                    ) : (
                                                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
                                                            <ArrowRightLeft className="h-5 w-5 text-white" />
                                                        </div>
                                                    )}
                                                    <div>
                                                        <CardTitle className="text-base flex items-center gap-2">
                                                            {isReplace ? (
                                                                <>
                                                                    <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                                                                    Làm thay ca cho {request.users_requester.full_name}
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <ArrowRightLeft className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                                    Đổi ca với {request.users_requester.full_name}
                                                                </>
                                                            )}
                                                        </CardTitle>
                                                        <CardDescription className="text-xs flex items-center gap-1 mt-1">
                                                            <Clock className="h-3 w-3" />
                                                            {format(new Date(request.created_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                                                        </CardDescription>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    {getStatusBadge(request.status)}
                                                </div>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-3 pt-4">
                                            {/* Ca của người yêu cầu (ca mà tôi sẽ làm thay hoặc nhận) */}
                                            <div className={cn(
                                                "p-4 rounded-xl border-2",
                                                isReplace
                                                    ? "bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30 border-purple-200 dark:border-purple-800"
                                                    : "bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800"
                                            )}>
                                                <div className="flex items-center gap-2 mb-2">
                                                    <CalendarDays className={cn(
                                                        "h-4 w-4",
                                                        isReplace ? "text-purple-600 dark:text-purple-400" : "text-blue-600 dark:text-blue-400"
                                                    )} />
                                                    <div className={cn(
                                                        "text-xs font-semibold uppercase tracking-wide",
                                                        isReplace
                                                            ? "text-purple-700 dark:text-purple-300"
                                                            : "text-blue-700 dark:text-blue-300"
                                                    )}>
                                                        {isReplace ? "Ca tôi sẽ làm thay" : "Ca tôi sẽ nhận"}
                                                    </div>
                                                </div>
                                                <div className="font-semibold text-base mb-1">
                                                    {format(new Date(request.requester_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                </div>
                                                {request.work_shifts && (
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        <span className="font-medium">{request.work_shifts.shift_name}</span>
                                                        <span>•</span>
                                                        <span>{request.work_shifts.start_time?.substring(0, 5)} - {request.work_shifts.end_time?.substring(0, 5)}</span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Ca của tôi (chỉ hiển thị cho SWAP type) */}
                                            {!isReplace && request.target_date && request.target_work_shifts && (
                                                <div className="p-4 bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/30 dark:to-red-950/30 rounded-xl border-2 border-orange-200 dark:border-orange-800">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <CalendarDays className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                                                        <div className="text-xs font-semibold uppercase tracking-wide text-orange-700 dark:text-orange-300">
                                                            Ca tôi sẽ đổi đi
                                                        </div>
                                                    </div>
                                                    <div className="font-semibold text-base mb-1">
                                                        {format(new Date(request.target_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                        <Clock className="h-3.5 w-3.5" />
                                                        <span className="font-medium">{request.target_work_shifts.shift_name}</span>
                                                        <span>•</span>
                                                        <span>{request.target_work_shifts.start_time?.substring(0, 5)} - {request.target_work_shifts.end_time?.substring(0, 5)}</span>
                                                    </div>
                                                </div>
                                            )}

                                            {request.requester_reason && (
                                                <div className="p-3 bg-muted/50 rounded-lg">
                                                    <div className="flex items-start gap-2 text-sm">
                                                        <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                                                        <div>
                                                            <span className="font-semibold">Lý do:</span>{" "}
                                                            <span className="text-muted-foreground">{request.requester_reason}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {request.status === "PENDING" && (
                                                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/30 dark:to-amber-950/30 rounded-xl border-l-4 border-yellow-500">
                                                    <div className="h-10 w-10 rounded-full bg-yellow-500/20 flex items-center justify-center flex-shrink-0">
                                                        <Clock className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                                                            Đang chờ phê duyệt
                                                        </div>
                                                        <div className="text-xs text-yellow-700 dark:text-yellow-300">
                                                            Quản lý sẽ xem xét yêu cầu của bạn
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {request.status === "APPROVED" && (
                                                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-950/30 dark:to-emerald-950/30 rounded-xl border-l-4 border-green-500">
                                                    <div className="h-10 w-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                                        <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-green-900 dark:text-green-100">
                                                            {isReplace ? "Đã được duyệt! Bạn sẽ làm ca này." : "Đã được duyệt! Ca đã được đổi."}
                                                        </div>
                                                        <div className="text-xs text-green-700 dark:text-green-300">
                                                            Kiểm tra lịch của bạn để xem ca mới
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {request.status === "REJECTED" && (
                                                <div className="flex items-center gap-3 p-4 bg-gradient-to-r from-red-50 to-rose-50 dark:from-red-950/30 dark:to-rose-950/30 rounded-xl border-l-4 border-red-500">
                                                    <div className="h-10 w-10 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                                        <X className="h-5 w-5 text-red-600 dark:text-red-400" />
                                                    </div>
                                                    <div>
                                                        <div className="text-sm font-semibold text-red-900 dark:text-red-100">
                                                            Yêu cầu bị từ chối
                                                        </div>
                                                        {request.rejection_reason && (
                                                            <div className="text-xs text-red-700 dark:text-red-300 mt-1">
                                                                {request.rejection_reason}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })
                        )}
                    </TabsContent>

                    {/* Leave Approval Tab - Manager Only */}
                    {isManager && (
                        <TabsContent value="leave-approval" className="space-y-4">
                            {pendingLeaveRequests.length === 0 ? (
                                <Card>
                                    <CardContent className="p-6 text-center text-muted-foreground">
                                        Không có yêu cầu nghỉ phép nào cần phê duyệt
                                    </CardContent>
                                </Card>
                            ) : (
                                pendingLeaveRequests.map((request) => (
                                    <Card key={request.id}>
                                        <CardHeader>
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <CardTitle className="text-lg flex items-center gap-2">
                                                        <CalendarOff className="h-4 w-4 text-orange-500" />
                                                        Yêu cầu nghỉ phép
                                                    </CardTitle>
                                                    <CardDescription>
                                                        Tạo lúc {format(new Date(request.created_at), "dd/MM/yyyy HH:mm", { locale: vi })}
                                                    </CardDescription>
                                                </div>
                                                <Badge variant="secondary">Chờ duyệt</Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg space-y-2">
                                                <div className="flex items-center gap-2 font-medium">
                                                    <User className="h-4 w-4" />
                                                    {request.users_requester?.full_name || "Nhân viên"}
                                                </div>
                                                <div className="text-sm text-muted-foreground">
                                                    {request.users_requester?.email}
                                                </div>
                                                <div className="text-sm font-medium">
                                                    Ngày nghỉ: {format(new Date(request.leave_date), "EEEE, dd/MM/yyyy", { locale: vi })}
                                                </div>
                                                {request.reason && (
                                                    <div className="text-sm">
                                                        <span className="font-medium">Lý do:</span> {request.reason}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    variant="default"
                                                    className="flex-1"
                                                    onClick={() => setLeaveApprovalDialog({ open: true, request, action: "approve" })}
                                                >
                                                    <Check className="mr-2 h-4 w-4" />
                                                    Duyệt
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    onClick={() => setLeaveApprovalDialog({ open: true, request, action: "reject" })}
                                                >
                                                    <X className="mr-2 h-4 w-4" />
                                                    Từ chối
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))
                            )}
                        </TabsContent>
                    )}
                </Tabs>

                <ShiftSwapDialog
                    open={swapDialogOpen}
                    onOpenChange={setSwapDialogOpen}
                    myShifts={myShifts}
                    onSwapRequest={handleSwapRequest}
                />

                {/* Accept Swap Dialog */}
                <AlertDialog
                    open={acceptDialog.open}
                    onOpenChange={(open) => {
                        if (!open) {
                            setAcceptDialog({ open: false, request: null })
                            setSelectedAssignment("")
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle className="flex items-center gap-2">
                                <ArrowRightLeft className="h-5 w-5" />
                                Đổi ca với {acceptDialog.request?.users_requester.full_name}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                Chọn ca của bạn để đổi lấy ca vào ngày{" "}
                                {acceptDialog.request && format(new Date(acceptDialog.request.requester_date), "dd/MM/yyyy")}
                                {acceptDialog.request?.work_shifts && (
                                    <> ({acceptDialog.request.work_shifts.shift_name})</>
                                )}
                            </AlertDialogDescription>
                        </AlertDialogHeader>

                        <div className="space-y-3 py-2">
                            <Label>Chọn ca của bạn để đổi *</Label>
                            <Select value={selectedAssignment} onValueChange={setSelectedAssignment}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Chọn ca làm việc của bạn" />
                                </SelectTrigger>
                                <SelectContent>
                                    {/* Chỉ hiển thị ca khớp với yêu cầu: cùng ngày + cùng loại ca mà người yêu cầu muốn nhận */}
                                    {userAssignments
                                        .filter((assignment) => {
                                            if (!acceptDialog.request?.target_date || !acceptDialog.request?.target_work_shift_id) return false
                                            const requestTargetDateStr = acceptDialog.request.target_date.split('T')[0]
                                            const assignmentDateStr = assignment.date?.split('T')[0]
                                            return assignmentDateStr === requestTargetDateStr && assignment.work_shift_id === acceptDialog.request.target_work_shift_id
                                        })
                                        .map((assignment) => (
                                            <SelectItem key={assignment.id} value={assignment.id}>
                                                {format(new Date(assignment.date), "dd/MM/yyyy")} - {assignment.work_shifts?.shift_name} (
                                                {assignment.work_shifts?.start_time?.substring(0, 5)} - {assignment.work_shifts?.end_time?.substring(0, 5)})
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>

                            {selectedAssignment && (
                                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm">
                                    <p className="font-medium text-blue-800 dark:text-blue-200">Sau khi đổi:</p>
                                    <p className="text-blue-700 dark:text-blue-300 mt-1">
                                        • Bạn sẽ làm ca của {acceptDialog.request?.users_requester.full_name.split(' ').pop()}
                                    </p>
                                    <p className="text-blue-700 dark:text-blue-300">
                                        • {acceptDialog.request?.users_requester.full_name.split(' ').pop()} sẽ làm ca của bạn
                                    </p>
                                </div>
                            )}
                        </div>

                        <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={handleAcceptSwap}
                                disabled={!selectedAssignment}
                            >
                                Xác nhận đổi ca
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Leave Approval Dialog */}
                <AlertDialog
                    open={leaveApprovalDialog.open}
                    onOpenChange={(open) => {
                        if (!open) {
                            setLeaveApprovalDialog({ open: false, request: null, action: "approve" })
                        }
                    }}
                >
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>
                                {leaveApprovalDialog.action === "approve" ? "Duyệt nghỉ phép" : "Từ chối nghỉ phép"}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                                {leaveApprovalDialog.action === "approve"
                                    ? `Xác nhận cho phép ${leaveApprovalDialog.request?.users_requester?.full_name || "nhân viên"} nghỉ phép vào ngày ${leaveApprovalDialog.request ? format(new Date(leaveApprovalDialog.request.leave_date), "dd/MM/yyyy") : ""}?`
                                    : `Bạn có chắc muốn từ chối yêu cầu nghỉ phép của ${leaveApprovalDialog.request?.users_requester?.full_name || "nhân viên"}?`}
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction onClick={handleLeaveApproval}>
                                {leaveApprovalDialog.action === "approve" ? "Duyệt" : "Từ chối"}
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                {/* Confirm Dialog */}
                <AlertDialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>{confirmDialog.title}</AlertDialogTitle>
                            <AlertDialogDescription>{confirmDialog.description}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Hủy</AlertDialogCancel>
                            <AlertDialogAction onClick={confirmDialog.onConfirm}>Xác nhận</AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </div>
    )
}
