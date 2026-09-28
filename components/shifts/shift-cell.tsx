import { cn } from "@/lib/utils"
import {
    AttendanceStatus,
    determineAttendanceStatus,
    getStatusColor,
    formatTime,
} from "@/lib/shift-status"
import { Clock, Loader2, XCircle, Banknote, Plus } from "lucide-react"

interface ShiftCellProps {
    assignment: any | null  // Single assignment (legacy)
    assignments?: any[]  // Multiple assignments (new)
    shiftSession: any | null  // Single session (legacy)
    shiftSessions?: any[]  // Multiple sessions (new)
    shiftTemplate: any | null
    pendingRequest?: any | null  // New prop for pending registration
    onClick?: () => void
    readOnly?: boolean
    className?: string
    compact?: boolean  // Compact mode for 30-day view
    currentTime?: Date // CRITICAL: Server time for accurate status determination
    // Add interaction handlers explicitly
    onAdd?: () => void
    onEdit?: (assignment: any) => void
}

export function ShiftCell(props: ShiftCellProps) {
    const {
        assignment,
        assignments,
        shiftSession,
        shiftSessions,
        shiftTemplate,
        pendingRequest,
        onClick,
        onAdd,
        onEdit,
        readOnly = false,
        className,
        compact = false,
        currentTime = new Date(),
    } = props

    // Normalize assignments
    const allAssignments = assignments || (assignment ? [assignment] : [])
    const allSessions = shiftSessions || (shiftSession ? [shiftSession] : [])

    // --- Render Pending Request (Special Case) ---
    if (pendingRequest && allAssignments.length === 0) {
        const isPending = pendingRequest.status === "PENDING"
        const isRejected = pendingRequest.status === "REJECTED"
        const shiftCode = pendingRequest.work_shifts?.shift_code
        const startTime = pendingRequest.work_shifts?.start_time
        const endTime = pendingRequest.work_shifts?.end_time

        if (compact) {
            return (
                <div
                    onClick={!readOnly ? onClick : undefined}
                    title={`${shiftCode} - ${isPending ? "Chờ duyệt" : "Bị từ chối"}`}
                    className={cn(
                        "h-7 flex items-center justify-center rounded border transition-all text-[10px] font-bold",
                        isPending && "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700",
                        isRejected && "bg-red-50 text-red-400 border-red-200 opacity-60 line-through",
                        !readOnly && "cursor-pointer hover:opacity-90",
                        className
                    )}
                >
                    {shiftCode}
                </div>
            )
        }

        return (
            <div className={cn("min-h-[70px] p-1 space-y-1", className)}>
                <div
                    onClick={!readOnly ? onClick : undefined}
                    className={cn(
                        "p-2 rounded-lg border transition-all",
                        isPending && "bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-700",
                        isRejected && "bg-red-50 text-red-400 border-red-200 opacity-60 line-through",
                        !readOnly && "cursor-pointer hover:opacity-90 hover:shadow-md",
                        readOnly && "cursor-default"
                    )}
                >
                    <div className="space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                            <span className={cn("font-bold text-xs leading-tight", isRejected && "line-through")}>{shiftCode}</span>
                            {isPending && <Loader2 className="h-3 w-3 flex-shrink-0 animate-spin" />}
                            {isRejected && <XCircle className="h-3 w-3 flex-shrink-0" />}
                        </div>
                        <div className={cn("text-[10px] leading-tight opacity-90", isRejected && "line-through")}>
                            ({formatTime(startTime)} - {formatTime(endTime)})
                        </div>
                        <div className="text-[10px] font-medium mt-1">
                            {isPending ? "Chờ duyệt" : "Bị từ chối"}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    // --- Compact Mode (30 Days) ---
    if (compact) {
        if (allAssignments.length > 0) {
            return (
                <div
                    className={cn(
                        "h-7 flex items-center justify-center gap-0.5 p-0.5 rounded border transition-all relative",
                        className
                    )}
                >
                    {allAssignments.map((assign) => {
                        const session = allSessions.find(s => {
                            if (s.shift_assignment_id) return s.shift_assignment_id === assign.id
                            return s.work_shift_id === assign.work_shift_id
                        })
                        const status = determineAttendanceStatus(assign, session, assign.work_shifts, currentTime)
                        const colorClass = getStatusColor(status)
                        const shiftCode = assign.work_shifts?.shift_code

                        return (
                            <div
                                key={assign.id}
                                onClick={(e) => {
                                    if (!readOnly) {
                                        e.stopPropagation()
                                        if (onEdit) onEdit(assign)
                                        else if (onClick) onClick()
                                    }
                                }}
                                title={`${assign.work_shifts?.shift_name} (${formatTime(assign.work_shifts?.start_time)} - ${formatTime(assign.work_shifts?.end_time)})`}
                                className={cn(
                                    "flex-1 h-full flex items-center justify-center rounded text-[9px] font-bold",
                                    colorClass,
                                    !readOnly && "cursor-pointer hover:opacity-90"
                                )}
                            >
                                {shiftCode}
                            </div>
                        )
                    })}
                    {/* Add button for compact mode */}
                    {!readOnly && (
                        <div
                            onClick={(e) => {
                                e.stopPropagation()
                                if (onAdd) onAdd()
                                else if (onClick) onClick()
                            }}
                            className="w-5 h-full flex items-center justify-center rounded bg-gray-100 hover:bg-primary/10 cursor-pointer transition-colors"
                            title="Thêm ca làm việc"
                        >
                            <Plus className="h-3 w-3 text-gray-400" />
                        </div>
                    )}
                </div>
            )
        }
        // Empty compact cell
        return (
            <div
                onClick={(e) => {
                    if (!readOnly) {
                        e.stopPropagation()
                        if (onAdd) onAdd()
                        else if (onClick) onClick()
                    }
                }}
                className={cn(
                    "h-7 flex items-center justify-center rounded border transition-all text-[10px] font-bold relative bg-background hover:bg-muted",
                    !readOnly && "cursor-pointer",
                    className
                )}
            >
                <span className="text-gray-300">—</span>
            </div>
        )
    }

    // --- Normal Mode (Weekly View) ---

    // Special Case: No Assignments (Empty State) - RESTORED LEGACY UI
    if (allAssignments.length === 0) {
        return (
            <div
                onClick={(e) => {
                    if (!readOnly) {
                        e.stopPropagation()
                        if (onAdd) onAdd()
                        else if (onClick) onClick()
                    }
                }}
                className={cn(
                    "min-h-[100px] p-2 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 hover:bg-gray-100/50 transition-all flex items-center justify-center",
                    !readOnly && "cursor-pointer hover:border-primary/50",
                    readOnly && "cursor-default",
                    className
                )}
            >
                {!readOnly && (
                    <Plus className="h-6 w-6 text-gray-300 font-light" />
                )}
            </div>
        )
    }

    // Default to rendering a list of blocks + Add button for MULTIPLE shifts
    return (
        <div className={cn("flex flex-col gap-2 p-2 min-h-[100px]", className)}>
            {/* 1. Render Assigned Shifts */}
            {allAssignments.map((assign) => {
                const session = allSessions.find(s => {
                    if (s.shift_assignment_id) return s.shift_assignment_id === assign.id
                    return s.work_shift_id === assign.work_shift_id
                })
                const status = determineAttendanceStatus(assign, session, assign.work_shifts, currentTime)
                let colorClass = getStatusColor(status)

                // Force Green if completed check-in/out exists, regardless of status calculation (e.g. Pending/Late)
                if (status === AttendanceStatus.SCHEDULED_PENDING && session?.check_in_time && session?.check_out_time) {
                    colorClass = "bg-green-100 text-green-800 border-green-300"
                }
                const shiftCode = assign.work_shifts?.shift_code
                const startTime = assign.work_shifts?.start_time
                const endTime = assign.work_shifts?.end_time

                return (
                    <div
                        key={assign.id}
                        onClick={(e) => {
                            if (!readOnly) {
                                e.stopPropagation()
                                if (onEdit) onEdit(assign)
                                else if (onClick) onClick()
                            }
                        }}
                        className={cn(
                            "p-2 rounded-lg border transition-all relative shadow-sm",
                            colorClass,
                            !readOnly && "cursor-pointer hover:opacity-90 hover:shadow-md",
                            readOnly && "cursor-default"
                        )}
                    >
                        <div className="space-y-0.5">
                            <div className="flex items-center justify-between gap-1">
                                <span className="font-bold text-xs leading-tight">{shiftCode}</span>
                                {(session?.check_in_time || session?.check_out_time) && (
                                    <Clock className="h-3 w-3 flex-shrink-0" />
                                )}
                            </div>
                            <div className="text-[10px] leading-tight opacity-90">
                                ({formatTime(startTime)} - {formatTime(endTime)})
                            </div>

                            {/* Status Text Logic */}
                            {status === AttendanceStatus.ABSENT && (
                                <div className="text-[10px] font-medium text-red-600 mt-0.5">
                                    Vắng
                                </div>
                            )}
                            {status === AttendanceStatus.INCOMPLETE && (
                                <div className="text-[10px] font-medium text-amber-700 mt-0.5">
                                    {!session?.check_in_time && session?.check_out_time
                                        ? "Chưa vào ca"
                                        : session?.check_in_time && !session?.check_out_time
                                            ? "Chưa ra ca"
                                            : "Chưa chấm công"}
                                </div>
                            )}

                            {/* Check-in/out Times */}
                            {(session?.check_in_time || session?.check_out_time) && (
                                <div className="text-[10px] leading-tight border-t border-current/20 pt-0.5 mt-0.5">
                                    <div className="flex items-center gap-1 font-medium">
                                        <Clock className="h-2.5 w-2.5" />
                                        <span>
                                            {session?.check_in_time ? formatTime(session.check_in_time) : '—'}
                                            {' - '}
                                            {session?.check_out_time ? formatTime(session.check_out_time) : '—'}
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Cash Indicators */}
                            {(session?.opening_cash_user || session?.closing_cash_user) && (
                                <div className="absolute bottom-1 right-1 flex items-center gap-1">
                                    {session?.opening_cash_user && (
                                        <div className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-0.5 rounded" title={`Tiền đầu ca: ${session.opening_cash_user.full_name}`}>
                                            <Banknote className="h-3 w-3" />
                                        </div>
                                    )}
                                    {session?.closing_cash_user && (
                                        <div className="text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 p-0.5 rounded" title={`Tiền cuối ca: ${session.closing_cash_user.full_name}`}>
                                            <Banknote className="h-3 w-3" />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}

            {/* 2. Render Add Button (Always visible unless ReadOnly) */}
            {!readOnly && (
                <div
                    onClick={(e) => {
                        e.stopPropagation()
                        if (onAdd) onAdd()
                        else if (onClick) onClick()
                    }}
                    className="flex-1 min-h-[40px] flex items-center justify-center rounded-lg border border-dashed border-gray-300 hover:border-primary hover:bg-primary/5 cursor-pointer text-gray-400 hover:text-primary transition-colors"
                    title="Thêm ca làm việc"
                >
                    <Plus className="h-5 w-5" />
                </div>
            )}
        </div>
    )
}
