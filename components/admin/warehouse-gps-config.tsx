"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MapPin, Navigation, Loader2, Check, AlertCircle } from "lucide-react"
import { toast } from "sonner"
import { getCurrentPosition, formatDistance } from "@/lib/mobile/geolocation"
import { mobileFetch } from "@/lib/mobile/api-client"

interface WarehouseGpsConfigProps {
  warehouseId: string
  currentLatitude?: number | null
  currentLongitude?: number | null
  currentRadius?: number | null
  onSaved?: () => void
}

export function WarehouseGpsConfig({
  warehouseId,
  currentLatitude,
  currentLongitude,
  currentRadius,
  onSaved,
}: WarehouseGpsConfigProps) {
  const [latitude, setLatitude] = useState(currentLatitude?.toString() || "")
  const [longitude, setLongitude] = useState(currentLongitude?.toString() || "")
  const [radius, setRadius] = useState(currentRadius?.toString() || "3000")
  const [saving, setSaving] = useState(false)
  const [gettingLocation, setGettingLocation] = useState(false)

  useEffect(() => {
    setLatitude(currentLatitude?.toString() || "")
    setLongitude(currentLongitude?.toString() || "")
    setRadius(currentRadius?.toString() || "3000")
  }, [currentLatitude, currentLongitude, currentRadius])

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

  const handleSave = async () => {
    if (!latitude || !longitude) {
      toast.error("Vui lòng nhập đầy đủ tọa độ GPS")
      return
    }

    setSaving(true)
    try {
      // First fetch current warehouse data to get required fields
      const getRes = await mobileFetch(`/api/warehouses/${warehouseId}`)
      const getJson = await getRes.json()

      if (!getRes.ok || !getJson.success) {
        throw new Error("Không thể tải thông tin kho")
      }

      const currentData = getJson.data

      const res = await mobileFetch(`/api/warehouses/${warehouseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentData.name, // Required field
          location: currentData.location,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          checkin_radius_meters: parseInt(radius) || 3000,
        }),
      })

      const json = await res.json()

      if (res.ok && json.success) {
        toast.success("Cấu hình GPS đã được cập nhật")
        onSaved?.()
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
    setSaving(true)
    try {
      const getRes = await mobileFetch(`/api/warehouses/${warehouseId}`)
      const getJson = await getRes.json()

      if (!getRes.ok || !getJson.success) {
        throw new Error("Không thể tải thông tin kho")
      }

      const currentData = getJson.data

      const res = await mobileFetch(`/api/warehouses/${warehouseId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: currentData.name,
          location: currentData.location,
          latitude: null,
          longitude: null,
        }),
      })

      const json = await res.json()

      if (res.ok && json.success) {
        setLatitude("")
        setLongitude("")
        toast.success("Đã tắt kiểm tra GPS khi chấm công")
        onSaved?.()
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

  return (
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
              <Check className="w-5 h-5 text-green-600" />
              <span className="text-sm">
                GPS đã được cấu hình - Bán kính: {formatDistance(parseInt(radius) || 3000)}
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-yellow-600" />
              <span className="text-sm text-muted-foreground">
                Chưa cấu hình GPS - Nhân viên có thể chấm công từ mọi nơi
              </span>
            </>
          )}
        </div>

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
            Nhân viên phải ở trong bán kính {formatDistance(parseInt(radius) || 3000)} từ kho mới có thể chấm công
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
  )
}
