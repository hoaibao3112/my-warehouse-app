"use client"

import { useState } from "react"
import { Bell, User, Menu, Key, LogOut, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/hooks/use-auth"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { mobileFetch } from "@/lib/mobile/api-client"
import { NotificationDropdown } from "@/components/notifications/notification-dropdown"
import { useNotificationCount } from "@/hooks/use-notification-count"

interface AttendanceHeaderProps {
    onOpenMobileMenu?: () => void
}

export function AttendanceHeader({ onOpenMobileMenu }: AttendanceHeaderProps) {
    const { user, logout } = useAuth()
    const { unreadCount } = useNotificationCount()
    const [changePasswordOpen, setChangePasswordOpen] = useState(false)
    const [passwordForm, setPasswordForm] = useState({
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    })
    const [isSubmitting, setIsSubmitting] = useState(false)

    const handleChangePassword = async (e?: React.FormEvent) => {
        e?.preventDefault()

        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error("Mật khẩu mới không khớp")
            return
        }

        if (passwordForm.newPassword.length < 6) {
            toast.error("Mật khẩu mới phải có ít nhất 6 ký tự")
            return
        }

        setIsSubmitting(true)
        try {
            const response = await mobileFetch("/api/users/change-password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    currentPassword: passwordForm.currentPassword,
                    newPassword: passwordForm.newPassword,
                }),
            })
            const data = await response.json()

            if (data.success) {
                toast.success("Đổi mật khẩu thành công")
                setChangePasswordOpen(false)
                setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" })
            } else {
                toast.error(data.error || "Không thể đổi mật khẩu")
            }
        } catch (error) {
            toast.error("Không thể kết nối đến server")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <>
            <header className="bg-card border-b border-border px-4 md:px-8 py-3 md:py-4 flex items-center justify-between gap-4">
                <div className="md:hidden">
                    <Button variant="ghost" size="icon" onClick={onOpenMobileMenu}>
                        <Menu className="w-5 h-5" />
                    </Button>
                </div>

                <div className="flex-1 flex justify-center md:justify-start">
                    <div className="flex items-center gap-2 text-primary">
                        <Clock className="w-5 h-5" />
                        <span className="font-semibold text-lg">Chấm Công</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-4">
                    {/* Notification Bell */}
                    <NotificationDropdown>
                        <Button variant="ghost" size="icon" className="relative">
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && (
                                <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center font-medium">
                                    {unreadCount > 9 ? "9+" : unreadCount}
                                </span>
                            )}
                        </Button>
                    </NotificationDropdown>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="flex items-center gap-2 md:gap-3 px-2 md:px-3 py-2 rounded-md hover:bg-accent">
                                <User className="w-5 h-5" />
                                <span className="text-sm font-medium hidden md:block">{user?.fullName || "Người dùng"}</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <div className="px-2 py-1.5 text-sm font-medium">
                                {user?.fullName || "Người dùng"}
                            </div>
                            <div className="px-2 pb-1.5 text-xs text-muted-foreground">
                                {user?.email}
                            </div>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setChangePasswordOpen(true)}>
                                <Key className="mr-2 h-4 w-4" />
                                Đổi Mật Khẩu
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={logout} className="text-red-600">
                                <LogOut className="mr-2 h-4 w-4" />
                                Đăng Xuất
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </header>

            {/* Change Password Dialog */}
            <Dialog open={changePasswordOpen} onOpenChange={setChangePasswordOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Đổi Mật Khẩu</DialogTitle>
                        <DialogDescription>
                            Nhập mật khẩu hiện tại và mật khẩu mới để thay đổi
                        </DialogDescription>
                    </DialogHeader>
                    <div>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
                                <Input
                                    id="currentPassword"
                                    type="password"
                                    value={passwordForm.currentPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="newPassword">Mật khẩu mới</Label>
                                <Input
                                    id="newPassword"
                                    type="password"
                                    value={passwordForm.newPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={passwordForm.confirmPassword}
                                    onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setChangePasswordOpen(false)}>
                                Hủy
                            </Button>
                            <Button type="button" disabled={isSubmitting} onClick={() => handleChangePassword()}>
                                {isSubmitting ? "Đang xử lý..." : "Đổi Mật Khẩu"}
                            </Button>
                        </DialogFooter>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    )
}
