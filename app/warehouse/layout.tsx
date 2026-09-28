import type React from "react"
import { WarehouseLayoutWrapper } from "@/components/warehouse/layout-wrapper"

export default function WarehouseLayout({ children }: { children: React.ReactNode }) {
    return <WarehouseLayoutWrapper>{children}</WarehouseLayoutWrapper>
}
