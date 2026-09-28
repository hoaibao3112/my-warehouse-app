"use client"

import { Navbar, NavbarBackLink } from "konsta/react"
import { LucideIcon } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useRouter } from "next/navigation"
import { ReactNode } from "react"

interface KonstaPageHeaderProps {
    icon?: LucideIcon
    title: string
    subtitle?: string
    backUrl?: string
    rightContent?: ReactNode
    className?: string
    large?: boolean // iOS large title style
}

/**
 * KonstaPageHeader - Native iOS/Android style page header
 * Uses Konsta UI Navbar for native look and feel
 * Only renders on mobile devices
 */
export function KonstaPageHeader({
    icon: Icon,
    title,
    subtitle,
    backUrl,
    rightContent,
    className,
    large = false,
}: KonstaPageHeaderProps) {
    const isMobile = useMediaQuery("(max-width: 768px)")
    const router = useRouter()

    // Only show on mobile
    if (!isMobile) return null

    const handleBack = () => {
        if (backUrl) {
            router.push(backUrl)
        } else {
            router.back()
        }
    }

    return (
        <Navbar
            title={title}
            subtitle={subtitle}
            large={large}
            transparent={false}
            className={className}
            left={
                backUrl ? (
                    <NavbarBackLink onClick={handleBack} />
                ) : undefined
            }
            right={rightContent}
        />
    )
}

export default KonstaPageHeader
