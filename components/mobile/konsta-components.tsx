"use client"

import { Button as KButton, Card as KCard } from "konsta/react"
import { forwardRef, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { LucideIcon, Loader2 } from "lucide-react"

// ========== Konsta Button ==========
interface KonstaButtonProps {
    children: ReactNode
    onClick?: () => void
    variant?: "primary" | "outline" | "tonal" | "clear"
    size?: "sm" | "md" | "lg"
    disabled?: boolean
    loading?: boolean
    icon?: LucideIcon
    iconPosition?: "left" | "right"
    className?: string
    fullWidth?: boolean
    rounded?: boolean
}

export const KonstaButton = forwardRef<HTMLButtonElement, KonstaButtonProps>(
    (
        {
            children,
            onClick,
            variant = "primary",
            size = "md",
            disabled = false,
            loading = false,
            icon: Icon,
            iconPosition = "left",
            className,
            fullWidth = false,
            rounded = false,
        },
        ref
    ) => {
        const isDisabled = disabled || loading

        return (
            <KButton
                ref={ref}
                onClick={onClick}
                disabled={isDisabled}
                outline={variant === "outline"}
                tonal={variant === "tonal"}
                clear={variant === "clear"}
                small={size === "sm"}
                large={size === "lg"}
                rounded={rounded}
                className={cn(fullWidth && "w-full", className)}
            >
                {loading ? (
                    <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {children}
                    </>
                ) : (
                    <>
                        {Icon && iconPosition === "left" && <Icon className="w-4 h-4 mr-2" />}
                        {children}
                        {Icon && iconPosition === "right" && <Icon className="w-4 h-4 ml-2" />}
                    </>
                )}
            </KButton>
        )
    }
)
KonstaButton.displayName = "KonstaButton"

// ========== Konsta Card ==========
interface KonstaCardProps {
    children: ReactNode
    className?: string
    raised?: boolean
    outline?: boolean
    header?: ReactNode
    footer?: ReactNode
}

export function KonstaCard({
    children,
    className,
    raised = true,
    outline = false,
    header,
    footer,
}: KonstaCardProps) {
    return (
        <KCard
            raised={raised}
            outline={outline}
            header={header}
            footer={footer}
            className={cn("mx-4 my-2", className)}
        >
            {children}
        </KCard>
    )
}

// ========== Konsta Stat Card ==========
interface KonstaStatCardProps {
    title: string
    value: string | number
    icon?: LucideIcon
    iconBgColor?: string
    iconColor?: string
    subtitle?: string
    trend?: "up" | "down" | "neutral"
    trendValue?: string
}

export function KonstaStatCard({
    title,
    value,
    icon: Icon,
    iconBgColor = "bg-primary/10",
    iconColor = "text-primary",
    subtitle,
}: KonstaStatCardProps) {
    return (
        <KCard raised className="mx-0">
            <div className="p-4">
                <div className="flex items-center gap-3">
                    {Icon && (
                        <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", iconBgColor)}>
                            <Icon className={cn("w-5 h-5", iconColor)} />
                        </div>
                    )}
                    <div className="flex-1">
                        <p className="text-xs text-gray-500 font-medium">{title}</p>
                        <p className="text-xl font-bold">{value}</p>
                        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
                    </div>
                </div>
            </div>
        </KCard>
    )
}

export default KonstaButton
