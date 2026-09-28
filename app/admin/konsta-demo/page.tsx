"use client"

import { KonstaProvider } from "@/components/mobile/konsta-provider"
import { KonstaAttendanceCard } from "@/components/mobile/konsta-attendance-card"
import { KonstaStatCard } from "@/components/mobile/konsta-components"
import {
    Page,
    Navbar,
    Block,
    BlockTitle,
    Segmented,
    SegmentedButton,
} from "konsta/react"
import { useState, useEffect } from "react"
import { Clock, Calendar, CheckCircle, XCircle } from "lucide-react"
import Link from "next/link"
import { Button } from "konsta/react"

export default function KonstaExamplePage() {
    const [currentTime, setCurrentTime] = useState(new Date())
    const [activeTab, setActiveTab] = useState(0)
    const [demoStatus, setDemoStatus] = useState<"not_started" | "checked_in" | "checked_out">("not_started")

    // Update time every second
    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    }

    const handleCheckIn = () => {
        setDemoStatus("checked_in")
    }

    const handleCheckOut = () => {
        setDemoStatus("checked_out")
    }

    return (
        <KonstaProvider theme="ios">
            <Page>
                <Navbar
                    title="Chấm Công Demo"
                    subtitle={formatTime(currentTime)}
                    className="top-0 sticky"
                />

                {/* Tab Switcher */}
                <Block className="!mt-0">
                    <Segmented strong>
                        <SegmentedButton
                            active={activeTab === 0}
                            onClick={() => setActiveTab(0)}
                        >
                            Chấm công
                        </SegmentedButton>
                        <SegmentedButton
                            active={activeTab === 1}
                            onClick={() => setActiveTab(1)}
                        >
                            Thống kê
                        </SegmentedButton>
                    </Segmented>
                </Block>

                {/* Attendance Tab */}
                {activeTab === 0 && (
                    <>
                        <BlockTitle>Chấm Công Hôm Nay</BlockTitle>

                        <KonstaAttendanceCard
                            shiftName="Ca Sáng"
                            shiftTime="06:00 - 14:00"
                            warehouseName="Express Cafe - Quận 1"
                            status={demoStatus}
                            checkInTime={demoStatus !== "not_started" ? "06:05" : undefined}
                            checkOutTime={demoStatus === "checked_out" ? "14:02" : undefined}
                            gpsEnabled={true}
                            isWithinRange={true}
                            distance="50m"
                            currentTime={formatTime(currentTime)}
                            onCheckIn={handleCheckIn}
                            onCheckOut={handleCheckOut}
                        />

                        {/* Reset button for demo */}
                        {demoStatus !== "not_started" && (
                            <Block>
                                <Button
                                    outline
                                    onClick={() => setDemoStatus("not_started")}
                                    className="w-full"
                                >
                                    Reset Demo
                                </Button>
                            </Block>
                        )}

                        <BlockTitle>Demo: Ngoài Phạm Vi GPS</BlockTitle>
                        <KonstaAttendanceCard
                            shiftName="Ca Chiều"
                            shiftTime="14:00 - 22:00"
                            warehouseName="Express Cafe - Quận 3"
                            status="not_started"
                            gpsEnabled={true}
                            isWithinRange={false}
                            distance="5.2km"
                            currentTime={formatTime(currentTime)}
                        />

                        <BlockTitle>Demo: Không Có Ca</BlockTitle>
                        <KonstaAttendanceCard
                            status="no_shift"
                            currentTime={formatTime(currentTime)}
                        />
                    </>
                )}

                {/* Statistics Tab */}
                {activeTab === 1 && (
                    <>
                        <BlockTitle>Thống Kê Tháng 12</BlockTitle>

                        <div className="grid grid-cols-2 gap-3 px-4">
                            <KonstaStatCard
                                title="Ngày Làm"
                                value="22/28"
                                icon={Calendar}
                                iconBgColor="bg-blue-100"
                                iconColor="text-blue-600"
                                subtitle="Còn 6 ngày"
                            />
                            <KonstaStatCard
                                title="Đúng Giờ"
                                value="20"
                                icon={CheckCircle}
                                iconBgColor="bg-green-100"
                                iconColor="text-green-600"
                                subtitle="90.9%"
                            />
                            <KonstaStatCard
                                title="Đi Trễ"
                                value="2"
                                icon={Clock}
                                iconBgColor="bg-orange-100"
                                iconColor="text-orange-600"
                                subtitle="9.1%"
                            />
                            <KonstaStatCard
                                title="Vắng Mặt"
                                value="0"
                                icon={XCircle}
                                iconBgColor="bg-red-100"
                                iconColor="text-red-600"
                                subtitle="0%"
                            />
                        </div>
                    </>
                )}

                <Block className="pb-8 mt-4">
                    <Link href="/admin/settings">
                        <Button outline className="w-full">
                            Quay lại Cài Đặt
                        </Button>
                    </Link>
                </Block>
            </Page>
        </KonstaProvider>
    )
}
