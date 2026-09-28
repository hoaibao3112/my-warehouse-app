"use client"

import { useState, useEffect, lazy, Suspense } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Navigation, Loader2, Check, AlertCircle, Map } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/hooks/use-auth"
import { getCurrentPosition, formatDistance } from "@/lib/mobile/geolocation"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

// Lazy load map component to avoid SSR issues
const GpsMap = lazy(() => import("@/components/store/gps-map").then(mod => ({ default: mod.GpsMap })))

export default function GpsSettingsPage() {
    const { user } = useAuth()
    const [warehouse, setWarehouse] = useState<any>(null)
    const [latitude, setLatitude] = useState("")
    const [longitude, setLongitude] = useState("")
    const [radius, setRadius] = useState("3000")
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [gettingLocation, setGettingLocation] = useState(false)
    const [showMap, setShowMap] = useState(false)

    // Fetch warehouse info
    useEffect(() => {
        const fetchWarehouse = async () => {
            if (!user?.warehouseId) {
                setLoading(false)
                return
            }

            try {
                const res = await mobileFetch(`/api/warehouses/${user.warehouseId}/gps`)
                const json = await res.json()
                if (json.success && json.data) {
                    setWarehouse(json.data)
                    setLatitude(json.data.latitude?.toString() || "")
                    setLongitude(json.data.longitude?.toString() || "")
                    setRadius(json.data.checkin_radius_meters?.toString() || "3000")
                }
            } catch (error) {
                console.error("Error fetching warehouse:", error)
            } finally {
                setLoading(false)
            }
        }
        fetchWarehouse()
    }, [user?.warehouseId])

    const handleGetCurrentLocation = async () => {
        setGettingLocation(true)
        try {
            const position = await getCurrentPosition()
            setLatitude(position.latitude.toFixed(8))
            setLongitude(position.longitude.toFixed(8))
            toast.success(`Đã lấy vị trí - Độ chính xác: ${Math.round(position.accuracy)}m`)
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Lỗi không xác định")
        } finally {
            setGettingLocation(false)
        }
    }

    const handleMapLocationSelect = (lat: number, lng: number) => {
        setLatitude(lat.toFixed(8))
        setLongitude(lng.toFixed(8))
        toast.success(`Đã chọn vị trí: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
    }

    const handleSave = async () => {
        if (!latitude || !longitude) {
            toast.error("Vui lòng nhập đầy đủ tọa độ GPS")
            return
        }

        if (!user?.warehouseId || !warehouse) {
            toast.error("Không tìm thấy thông tin kho")
            return
        }

        setSaving(true)
        try {
            const res = await mobileFetch(`/api/warehouses/${user.warehouseId}/gps`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: parseFloat(latitude),
                    longitude: parseFloat(longitude),
                    checkin_radius_meters: parseInt(radius) || 3000,
                }),
            })

            const json = await res.json()

            if (res.ok && json.success) {
                setWarehouse(json.data?.warehouse || { ...warehouse, latitude, longitude, checkin_radius_meters: parseInt(radius) })
                toast.success("Cấu hình GPS đã được cập nhật")
            } else {
                throw new Error(json.error || "Không thể cập nhật")
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không thể lưu cấu hình")
        } finally {
            setSaving(false)
        }
    }

    const handleClearGps = async () => {
        if (!user?.warehouseId || !warehouse) return

        setSaving(true)
        try {
            const res = await mobileFetch(`/api/warehouses/${user.warehouseId}/gps`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: null,
                    longitude: null,
                }),
            })

            const json = await res.json()

            if (res.ok && json.success) {
                setLatitude("")
                setLongitude("")
                setWarehouse({ ...warehouse, latitude: null, longitude: null })
                toast.success("Đã tắt kiểm tra GPS khi chấm công")
            } else {
                throw new Error(json.error || "Không thể cập nhật")
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Không thể xóa cấu hình")
        } finally {
            setSaving(false)
        }
    }

    const hasGps = latitude && longitude
    const latNum = parseFloat(latitude) || null
    const lngNum = parseFloat(longitude) || null
    const radiusNum = parseInt(radius) || 3000

    if (loading) {
        return (
            <div className="p-4 md:p-8 flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        )
    }

    if (!user?.warehouseId) {
        return (
            <div className="p-4 md:p-8">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Navigation className="w-5 h-5" />
                            Cài đặt GPS
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-muted-foreground">Bạn chưa được gán kho hàng</p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            {/* Mobile Header */}
            <div className="md:hidden">
                <MobilePageHeader
                    icon={Navigation}
                    title="Cài đặt GPS"
                    subtitle={warehouse?.name || "Cấu hình vị trí chấm công"}
                    gradient="blue"
                />
            </div>

            <div className="p-4 md:p-8 space-y-6">
                {/* Desktop Header */}
                <div className="hidden md:flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold">Cài đặt GPS</h1>
                        <p className="text-muted-foreground">{warehouse?.name || "Cấu hình vị trí chấm công"}</p>
                    </div>
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                    {/* Left column: Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Navigation className="w-5 h-5" />
                                Cấu hình GPS chấm công
                            </CardTitle>
                            <CardDescription>
                                Cài đặt vị trí kho và bán kính cho phép chấm công. Nhân viên phải ở trong phạm vi này mới có thể vào/ra ca.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                                {hasGps ? (
                                    <>
                                        <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                                        <span className="text-sm">
                                            GPS đã được cấu hình - Bán kính: {formatDistance(radiusNum)}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                                        <span className="text-sm text-muted-foreground">
                                            Chưa cấu hình GPS - Nhân viên có thể chấm công từ mọi nơi
                                        </span>
                                    </>
                                )}
                            </div>

                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    onClick={handleGetCurrentLocation}
                                    disabled={gettingLocation}
                                    className="flex-1"
                                >
                                    {gettingLocation ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Đang lấy...
                                        </>
                                    ) : (
                                        <>
                                            <MapPin className="w-4 h-4 mr-2" />
                                            Lấy vị trí hiện tại
                                        </>
                                    )}
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowMap(!showMap)}
                                    className="lg:hidden"
                                >
                                    <Map className="w-4 h-4 mr-2" />
                                    {showMap ? "Ẩn bản đồ" : "Xem bản đồ"}
                                </Button>
                            </div>

                            <p className="text-xs text-muted-foreground text-center">
                                Hãy đứng tại vị trí kho hàng rồi bấm nút trên hoặc chọn trên bản đồ
                            </p>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="latitude">Vĩ độ (Latitude)</Label>
                                    <Input
                                        id="latitude"
                                        type="text"
                                        value={latitude}
                                        onChange={(e) => setLatitude(e.target.value)}
                                        placeholder="VD: 10.762622"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="longitude">Kinh độ (Longitude)</Label>
                                    <Input
                                        id="longitude"
                                        type="text"
                                        value={longitude}
                                        onChange={(e) => setLongitude(e.target.value)}
                                        placeholder="VD: 106.660172"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="radius">Bán kính cho phép (mét)</Label>
                                <Input
                                    id="radius"
                                    type="number"
                                    value={radius}
                                    onChange={(e) => setRadius(e.target.value)}
                                    placeholder="3000"
                                    min="100"
                                    max="50000"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Nhân viên phải ở trong bán kính {formatDistance(radiusNum)} từ kho mới có thể chấm công.
                                </p>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button onClick={handleSave} disabled={saving} className="flex-1">
                                    {saving ? (
                                        <>
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                            Đang lưu...
                                        </>
                                    ) : (
                                        "Lưu cấu hình GPS"
                                    )}
                                </Button>
                                {hasGps && (
                                    <Button variant="outline" onClick={handleClearGps} disabled={saving}>
                                        Tắt GPS
                                    </Button>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Right column: Map (visible on desktop, toggleable on mobile) */}
                    <Card className={showMap ? "block lg:block" : "hidden lg:block"}>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Map className="w-5 h-5" />
                                Bản đồ vị trí
                            </CardTitle>
                            <CardDescription>
                                Click trên bản đồ hoặc kéo marker để chọn vị trí. Vùng màu xanh là bán kính cho phép chấm công.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Suspense fallback={
                                <div className="w-full h-[300px] bg-muted rounded-lg flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            }>
                                <GpsMap
                                    latitude={latNum}
                                    longitude={lngNum}
                                    radius={radiusNum}
                                    onLocationSelect={handleMapLocationSelect}
                                />
                            </Suspense>
                            <p className="text-xs text-muted-foreground mt-2 text-center">
                                💡 Tip: Bạn có thể kéo marker hoặc click vào bản đồ để thay đổi vị trí
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Instructions */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Hướng dẫn</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm text-muted-foreground">
                        <p>1. Đứng tại vị trí kho hàng của bạn và bấm "Lấy vị trí hiện tại"</p>
                        <p>2. Hoặc chọn vị trí trực tiếp trên bản đồ bằng cách click hoặc kéo marker</p>
                        <p>3. Điều chỉnh bán kính cho phép nếu cần (mặc định 3km)</p>
                        <p>4. Bấm "Lưu cấu hình GPS" để hoàn tất</p>
                        <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg mt-4">
                            <p className="text-yellow-700 dark:text-yellow-400 flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                <span>Sau khi bật GPS, nhân viên sẽ không thể chấm công nếu không ở trong phạm vi kho.</span>
                            </p>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
