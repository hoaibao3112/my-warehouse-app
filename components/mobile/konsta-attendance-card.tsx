"use client"

import { Card, Block, Button, Chip, Preloader } from "konsta/react"
import { LucideIcon, Clock, MapPin, CheckCircle, XCircle, AlertCircle, Fingerprint, Navigation } from "lucide-react"
import { cn } from "@/lib/utils"

interface KonstaAttendanceCardProps {
    // Shift info
    shiftName?: string
    shiftTime?: string
    warehouseName?: string

    // Status
    status: "not_started" | "checked_in" | "checked_out" | "absent" | "no_shift"
    checkInTime?: string
    checkOutTime?: string

    // GPS info
    gpsEnabled?: boolean
    isWithinRange?: boolean
    distance?: string

    // Actions
    onCheckIn?: () => void
    onCheckOut?: () => void
    checkingGps?: boolean
    submitting?: boolean

    // Current time display
    currentTime?: string
}

export function KonstaAttendanceCard({
    shiftName,
    shiftTime,
    warehouseName,
    status,
    checkInTime,
    checkOutTime,
    gpsEnabled = false,
    isWithinRange = true,
    distance,
    onCheckIn,
    onCheckOut,
    checkingGps = false,
    submitting = false,
    currentTime,
}: KonstaAttendanceCardProps) {
    // Determine status color and icon
    const getStatusInfo = () => {
        switch (status) {
            case "checked_in":
                return {
                    color: "bg-blue-500",
                    textColor: "text-blue-600",
                    icon: CheckCircle,
                    label: "Đang làm việc",
                    description: `Vào ca: ${checkInTime || "--:--"}`
                }
            case "checked_out":
                return {
                    color: "bg-green-500",
                    textColor: "text-green-600",
                    icon: CheckCircle,
                    label: "Hoàn thành",
                    description: `Ra ca: ${checkOutTime || "--:--"}`
                }
            case "absent":
                return {
                    color: "bg-red-500",
                    textColor: "text-red-600",
                    icon: XCircle,
                    label: "Vắng mặt",
                    description: "Chưa chấm công"
                }
            case "no_shift":
                return {
                    color: "bg-gray-400",
                    textColor: "text-gray-500",
                    icon: AlertCircle,
                    label: "Không có ca",
                    description: "Hôm nay bạn không có lịch làm việc"
                }
            default:
                return {
                    color: "bg-orange-500",
                    textColor: "text-orange-600",
                    icon: Clock,
                    label: "Chờ chấm công",
                    description: shiftTime ? `Ca: ${shiftTime}` : "Chưa vào ca"
                }
        }
    }

    const statusInfo = getStatusInfo()
    const StatusIcon = statusInfo.icon

    const canCheckIn = status === "not_started" && (!gpsEnabled || isWithinRange)
    const canCheckOut = status === "checked_in" && (!gpsEnabled || isWithinRange)

    return (
        <Card raised className="mx-4 my-2 overflow-hidden">
            {/* Header with status */}
            <div className={cn("px-4 py-3", statusInfo.color)}>
                <div className="flex items-center justify-between text-white">
                    <div className="flex items-center gap-2">
                        <StatusIcon className="w-5 h-5" />
                        <span className="font-medium">{statusInfo.label}</span>
                    </div>
                    {currentTime && (
                        <div className="flex items-center gap-1 text-sm opacity-90">
                            <Clock className="w-4 h-4" />
                            {currentTime}
                        </div>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-4">
                {/* Shift Info */}
                {shiftName && (
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Fingerprint className="w-5 h-5 text-primary" />
                        </div>
                        <div>
                            <p className="font-medium">{shiftName}</p>
                            {shiftTime && <p className="text-sm text-gray-500">{shiftTime}</p>}
                        </div>
                    </div>
                )}

                {/* Warehouse / Location */}
                {warehouseName && (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{warehouseName}</span>
                    </div>
                )}

                {/* GPS Status */}
                {gpsEnabled && (
                    <div className={cn(
                        "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
                        isWithinRange
                            ? "bg-green-50 text-green-700"
                            : "bg-red-50 text-red-700"
                    )}>
                        <Navigation className="w-4 h-4" />
                        {isWithinRange ? (
                            <span>Trong phạm vi cho phép {distance && `(${distance})`}</span>
                        ) : (
                            <span>Ngoài phạm vi {distance && `- cách ${distance}`}</span>
                        )}
                    </div>
                )}

                {/* Check-in/out times */}
                {(checkInTime || checkOutTime) && (
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500 mb-1">Vào ca</p>
                            <p className={cn("font-bold text-lg", checkInTime ? "text-blue-600" : "text-gray-300")}>
                                {checkInTime || "--:--"}
                            </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                            <p className="text-xs text-gray-500 mb-1">Ra ca</p>
                            <p className={cn("font-bold text-lg", checkOutTime ? "text-green-600" : "text-gray-300")}>
                                {checkOutTime || "--:--"}
                            </p>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                {status !== "no_shift" && status !== "checked_out" && (
                    <div className="pt-2">
                        {checkingGps ? (
                            <div className="flex items-center justify-center gap-2 py-3 text-gray-500">
                                <Preloader size="w-5 h-5" />
                                <span>Đang kiểm tra vị trí...</span>
                            </div>
                        ) : (
                            <>
                                {canCheckIn && (
                                    <Button
                                        large
                                        onClick={onCheckIn}
                                        disabled={submitting}
                                        className="w-full"
                                    >
                                        {submitting ? (
                                            <>
                                                <Preloader size="w-5 h-5" className="mr-2" />
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <Fingerprint className="w-5 h-5 mr-2" />
                                                Chấm Công Vào Ca
                                            </>
                                        )}
                                    </Button>
                                )}

                                {canCheckOut && (
                                    <Button
                                        large
                                        tonal
                                        onClick={onCheckOut}
                                        disabled={submitting}
                                        className="w-full"
                                    >
                                        {submitting ? (
                                            <>
                                                <Preloader size="w-5 h-5" className="mr-2" />
                                                Đang xử lý...
                                            </>
                                        ) : (
                                            <>
                                                <Fingerprint className="w-5 h-5 mr-2" />
                                                Chấm Công Ra Ca
                                            </>
                                        )}
                                    </Button>
                                )}

                                {!isWithinRange && gpsEnabled && (
                                    <div className="text-center text-sm text-red-500 mt-2">
                                        Bạn phải ở trong phạm vi kho để chấm công
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>
        </Card>
    )
}

export default KonstaAttendanceCard
