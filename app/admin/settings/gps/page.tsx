"use client"

import { useState, useEffect, lazy, Suspense } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { Navigation, MapPin, Loader2, Check, AlertCircle, Settings, Map } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"
import { toast } from "sonner"

// Lazy load map component to avoid SSR issues
const GpsMap = lazy(() => import("@/components/store/gps-map").then(mod => ({ default: mod.GpsMap })))

interface Warehouse {
    id: string
    code: string
    name: string
    type: "MAIN" | "STORE"
    latitude?: number | null
    longitude?: number | null
    checkin_radius_meters?: number | null
}

export default function AdminGpsSettingsPage() {
    const [warehouses, setWarehouses] = useState<Warehouse[]>([])
    const [loading, setLoading] = useState(true)
    const [selectedWarehouse, setSelectedWarehouse] = useState<Warehouse | null>(null)
    const [dialogOpen, setDialogOpen] = useState(false)

    // GPS form state
    const [gpsLatitude, setGpsLatitude] = useState("")
    const [gpsLongitude, setGpsLongitude] = useState("")
    const [gpsRadius, setGpsRadius] = useState("3000")
    const [gpsSaving, setGpsSaving] = useState(false)
    const [gettingLocation, setGettingLocation] = useState(false)

    // Fetch all warehouses
    useEffect(() => {
        const fetchWarehouses = async () => {
            try {
                const res = await mobileFetch("/api/warehouses?page=1&pageSize=100")
                const json = await res.json()
                if (json.success) {
                    setWarehouses(json.data || [])
                }
            } catch (error) {
                console.error("Error fetching warehouses:", error)
                toast.error("Lỗi tải danh sách kho")
            } finally {
                setLoading(false)
            }
        }
        fetchWarehouses()
    }, [])

    const openGpsDialog = (warehouse: Warehouse) => {
        setSelectedWarehouse(warehouse)
        setGpsLatitude(warehouse.latitude?.toString() || "")
        setGpsLongitude(warehouse.longitude?.toString() || "")
        setGpsRadius(warehouse.checkin_radius_meters?.toString() || "3000")
        setDialogOpen(true)
    }

    const handleGetCurrentLocation = () => {
        setGettingLocation(true)
        if (!navigator.geolocation) {
            toast.error("Trình duyệt không hỗ trợ GPS")
            setGettingLocation(false)
            return
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setGpsLatitude(position.coords.latitude.toFixed(8))
                setGpsLongitude(position.coords.longitude.toFixed(8))
                toast.success(`Đã lấy vị trí (độ chính xác: ${Math.round(position.coords.accuracy)}m)`)
                setGettingLocation(false)
            },
            (error) => {
                toast.error("Không thể lấy vị trí: " + error.message)
                setGettingLocation(false)
            },
            { enableHighAccuracy: true, timeout: 10000 }
        )
    }

    const handleSaveGps = async () => {
        if (!selectedWarehouse) return

        if (!gpsLatitude || !gpsLongitude) {
            toast.error("Vui lòng nhập đầy đủ tọa độ GPS")
            return
        }

        setGpsSaving(true)
        try {
            const res = await mobileFetch(`/api/warehouses/${selectedWarehouse.id}/gps`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    latitude: parseFloat(gpsLatitude),
                    longitude: parseFloat(gpsLongitude),
                    checkin_radius_meters: parseInt(gpsRadius) || 3000,
                }),
            })
            const json = await res.json()
            if (res.ok && json.success) {
                toast.success("Đã lưu cấu hình GPS")
                // Update local state
                setWarehouses(prev => prev.map(w =>
                    w.id === selectedWarehouse.id
                        ? { ...w, latitude: parseFloat(gpsLatitude), longitude: parseFloat(gpsLongitude), checkin_radius_meters: parseInt(gpsRadius) || 3000 }
                        : w
                ))
                setDialogOpen(false)
            } else {
                throw new Error(json.error || "Không thể cập nhật")
            }
        } catch (err: any) {
            toast.error(err.message || "Lỗi khi lưu cấu hình")
        } finally {
            setGpsSaving(false)
        }
    }

    const handleClearGps = async () => {
        if (!selectedWarehouse) return

        setGpsSaving(true)
        try {
            const res = await mobileFetch(`/api/warehouses/${selectedWarehouse.id}/gps`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latitude: null, longitude: null }),
            })
            const json = await res.json()
            if (res.ok && json.success) {
                toast.success("Đã tắt kiểm tra GPS")
                // Update local state
                setWarehouses(prev => prev.map(w =>
                    w.id === selectedWarehouse.id
                        ? { ...w, latitude: null, longitude: null }
                        : w
                ))
                setGpsLatitude("")
                setGpsLongitude("")
                setDialogOpen(false)
            } else {
                throw new Error(json.error || "Không thể cập nhật")
            }
        } catch (err: any) {
            toast.error(err.message || "Lỗi khi xóa cấu hình")
        } finally {
            setGpsSaving(false)
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <MobilePageHeader
                    icon={Navigation}
                    title="Cài Đặt GPS"
                    subtitle="Cấu hình vị trí chấm công cho các kho"
                />
                <div className="p-8 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background">
            <MobilePageHeader
                icon={Navigation}
                title="Cài Đặt GPS"
                subtitle="Cấu hình vị trí chấm công cho các kho"
            />

            <div className="p-4 md:p-8 space-y-6">
                <div className="hidden md:block">
                    <h1 className="text-2xl font-bold">Cài Đặt GPS Chấm Công</h1>
                    <p className="text-muted-foreground mt-1">
                        Cấu hình vị trí GPS và bán kính cho phép chấm công của từng kho
                    </p>
                </div>

                {/* Info Card */}
                <Card className="p-4 bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800">
                    <div className="flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-700 dark:text-blue-300">
                            <p className="font-medium">Về GPS chấm công:</p>
                            <p>Khi bật GPS cho kho, nhân viên chỉ có thể chấm công khi ở trong phạm vi bán kính đã cấu hình.</p>
                        </div>
                    </div>
                </Card>

                {/* Warehouse List */}
                <div className="grid gap-4">
                    {warehouses.map((warehouse) => {
                        const hasGps = warehouse.latitude && warehouse.longitude
                        return (
                            <Card key={warehouse.id} className="p-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium truncate">{warehouse.name}</h3>
                                            <Badge variant={warehouse.type === "MAIN" ? "default" : "secondary"}>
                                                {warehouse.type === "MAIN" ? "Kho Tổng" : "Kho Cửa Hàng"}
                                            </Badge>
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">Mã: {warehouse.code}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            {hasGps ? (
                                                <>
                                                    <Check className="w-4 h-4 text-green-600" />
                                                    <span className="text-sm text-green-600">
                                                        GPS đã bật - Bán kính: {(warehouse.checkin_radius_meters || 3000).toLocaleString()}m
                                                    </span>
                                                </>
                                            ) : (
                                                <>
                                                    <AlertCircle className="w-4 h-4 text-yellow-600" />
                                                    <span className="text-sm text-yellow-600">Chưa cấu hình GPS</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => openGpsDialog(warehouse)}
                                        className="flex-shrink-0"
                                    >
                                        <Settings className="w-4 h-4 mr-2" />
                                        Cấu hình
                                    </Button>
                                </div>
                            </Card>
                        )
                    })}
                </div>
            </div>

            {/* GPS Configuration Dialog */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Navigation className="w-5 h-5" />
                            Cài Đặt GPS - {selectedWarehouse?.name}
                        </DialogTitle>
                        <DialogDescription>
                            Cấu hình vị trí GPS và bán kính cho phép chấm công
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
                        {/* GPS Status */}
                        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
                            {gpsLatitude && gpsLongitude ? (
                                <>
                                    <Check className="w-5 h-5 text-green-600 flex-shrink-0" />
                                    <span className="text-sm">
                                        GPS đã được cấu hình - Bán kính: {parseInt(gpsRadius || "3000").toLocaleString()}m
                                    </span>
                                </>
                            ) : (
                                <>
                                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                                    <span className="text-sm text-muted-foreground">
                                        Chưa cấu hình GPS
                                    </span>
                                </>
                            )}
                        </div>

                        {/* Get Current Location */}
                        <Button
                            variant="outline"
                            onClick={handleGetCurrentLocation}
                            disabled={gettingLocation}
                            className="w-full"
                        >
                            {gettingLocation ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Đang lấy vị trí...
                                </>
                            ) : (
                                <>
                                    <MapPin className="w-4 h-4 mr-2" />
                                    Lấy vị trí hiện tại
                                </>
                            )}
                        </Button>

                        {/* Map */}
                        <div className="space-y-2">
                            <Label className="flex items-center gap-2">
                                <Map className="w-4 h-4" />
                                Bản đồ - Click hoặc kéo marker để chọn vị trí
                            </Label>
                            <Suspense fallback={
                                <div className="w-full h-[250px] bg-muted rounded-lg flex items-center justify-center">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            }>
                                <GpsMap
                                    latitude={gpsLatitude ? parseFloat(gpsLatitude) : null}
                                    longitude={gpsLongitude ? parseFloat(gpsLongitude) : null}
                                    radius={parseInt(gpsRadius) || 3000}
                                    onLocationSelect={(lat, lng) => {
                                        setGpsLatitude(lat.toFixed(8))
                                        setGpsLongitude(lng.toFixed(8))
                                        toast.success(`Đã chọn vị trí: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
                                    }}
                                />
                            </Suspense>
                            <p className="text-xs text-muted-foreground text-center">
                                Vùng màu xanh là bán kính cho phép chấm công
                            </p>
                        </div>

                        {/* Coordinates */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="lat">Vĩ độ</Label>
                                <Input
                                    id="lat"
                                    type="text"
                                    value={gpsLatitude}
                                    onChange={(e) => setGpsLatitude(e.target.value)}
                                    placeholder="10.762622"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="lng">Kinh độ</Label>
                                <Input
                                    id="lng"
                                    type="text"
                                    value={gpsLongitude}
                                    onChange={(e) => setGpsLongitude(e.target.value)}
                                    placeholder="106.660172"
                                />
                            </div>
                        </div>

                        {/* Radius */}
                        <div className="space-y-2">
                            <Label htmlFor="radius">Bán kính cho phép (mét)</Label>
                            <Input
                                id="radius"
                                type="number"
                                value={gpsRadius}
                                onChange={(e) => setGpsRadius(e.target.value)}
                                placeholder="3000"
                                min="100"
                                max="50000"
                            />
                            <p className="text-xs text-muted-foreground">
                                Nhân viên phải ở trong bán kính này mới có thể chấm công.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        {gpsLatitude && gpsLongitude && (
                            <Button
                                variant="outline"
                                onClick={handleClearGps}
                                disabled={gpsSaving}
                            >
                                Tắt GPS
                            </Button>
                        )}
                        <Button onClick={handleSaveGps} disabled={gpsSaving}>
                            {gpsSaving ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Đang lưu...
                                </>
                            ) : (
                                "Lưu cấu hình"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
