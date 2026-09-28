"use client"

import { cn } from "@/lib/utils"
import { LucideIcon, ArrowLeft } from "lucide-react"
import { useMediaQuery } from "@/hooks/use-media-query"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

interface MobilePageHeaderProps {
  icon?: LucideIcon
  headerIcon?: React.ReactNode
  title: string
  subtitle?: string
  children?: React.ReactNode
  className?: string
  backUrl?: string
  gradient?: "indigo" | "orange" | "blue" | "green" | "purple" | "brown"
}

export function MobilePageHeader({
  icon: Icon,
  headerIcon,
  title,
  subtitle,
  children,
  className,
  backUrl,
  gradient = "indigo",
}: MobilePageHeaderProps) {
  const isMobile = useMediaQuery("(max-width: 768px)")
  const router = useRouter()

  if (!isMobile) return null

  return (
    <div
      className={cn(
        "text-primary-foreground p-4 rounded-b-3xl transition-all duration-500",
        gradient === "indigo" && "bg-gradient-to-br from-indigo-600 to-violet-700",
        gradient === "orange" && "bg-gradient-to-br from-orange-500 to-amber-600",
        gradient === "blue" && "bg-gradient-to-br from-blue-600 to-cyan-700",
        gradient === "green" && "bg-gradient-to-br from-emerald-600 to-teal-700",
        gradient === "purple" && "bg-gradient-to-br from-purple-600 to-fuchsia-700",
        gradient === "brown" && "bg-gradient-to-br from-[#8B4513] via-[#704214] to-[#5C3317] shadow-lg",
        !gradient && "bg-primary",
        className
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {backUrl && (
            <Button
              variant="ghost"
              size="icon"
              className="text-primary-foreground hover:bg-primary-foreground/20 -ml-2"
              onClick={() => router.push(backUrl)}
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="w-10 h-10 rounded-full bg-primary-foreground/20 flex items-center justify-center">
            {headerIcon ? headerIcon : (Icon && <Icon className="w-5 h-5" />)}
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-sm font-medium opacity-100 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
