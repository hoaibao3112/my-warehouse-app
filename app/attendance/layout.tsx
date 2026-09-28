import type React from "react"
import { AttendanceLayoutWrapper } from "@/components/attendance/attendance-layout-wrapper"

export default function AttendanceLayout({ children }: { children: React.ReactNode }) {
    return <AttendanceLayoutWrapper>{children}</AttendanceLayoutWrapper>
}
