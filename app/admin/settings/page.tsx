"use client"

import type React from "react"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, Settings } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"

export default function SettingsPage() {
  const [settings, setSettings] = useState({
    companyName: "Hệ Thống Quản Lý Hàng Tồn Kho",
    companyEmail: "admin@warehouse.com.vn",
    companyPhone: "+84 123 456 789",
    companyAddress: "123 Đường Chính, Hà Nội, Việt Nam",
    timezone: "Asia/Ho_Chi_Minh",
    currency: "VND",
    lowStockThreshold: "10",
    criticalStockThreshold: "5",
  })

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setSettings((prev) => ({ ...prev, [name]: value }))
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Settings}
        title="Cài Đặt"
        subtitle="Cấu hình hệ thống"
        gradient="indigo"
      />
      
      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-3xl font-bold text-foreground">Cài Đặt</h1>
          <p className="text-muted-foreground mt-2">Cấu hình cài đặt hệ thống và tùy chọn</p>
        </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Company Information */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Thông Tin Công Ty</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="companyName" className="text-foreground">
                Tên Công Ty
              </Label>
              <Input
                id="companyName"
                name="companyName"
                value={settings.companyName}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="companyEmail" className="text-foreground">
                Email
              </Label>
              <Input
                id="companyEmail"
                name="companyEmail"
                type="email"
                value={settings.companyEmail}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="companyPhone" className="text-foreground">
                Điện Thoại
              </Label>
              <Input
                id="companyPhone"
                name="companyPhone"
                value={settings.companyPhone}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="companyAddress" className="text-foreground">
                Địa Chỉ
              </Label>
              <Input
                id="companyAddress"
                name="companyAddress"
                value={settings.companyAddress}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
          </div>
        </Card>

        {/* System Settings */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-foreground mb-4">Cài Đặt Hệ Thống</h2>
          <div className="space-y-4">
            <div>
              <Label htmlFor="timezone" className="text-foreground">
                Múi Giờ
              </Label>
              <select
                id="timezone"
                name="timezone"
                value={settings.timezone}
                onChange={handleChange}
                className="mt-2 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="Asia/Ho_Chi_Minh">Châu Á/Hồ Chí Minh (UTC+7)</option>
                <option value="Asia/Bangkok">Châu Á/Bangkok (UTC+7)</option>
                <option value="Asia/Singapore">Châu Á/Singapore (UTC+8)</option>
                <option value="UTC">UTC</option>
              </select>
            </div>
            <div>
              <Label htmlFor="currency" className="text-foreground">
                Tiền Tệ
              </Label>
              <select
                id="currency"
                name="currency"
                value={settings.currency}
                onChange={handleChange}
                className="mt-2 w-full px-3 py-2 border border-input rounded-md bg-background text-foreground"
              >
                <option value="VND">Đồng Việt Nam (VND)</option>
                <option value="USD">Đô La Mỹ (USD)</option>
                <option value="EUR">Euro (EUR)</option>
              </select>
            </div>
            <div>
              <Label htmlFor="lowStockThreshold" className="text-foreground">
                Ngưỡng Hàng Tồn Kho Thấp
              </Label>
              <Input
                id="lowStockThreshold"
                name="lowStockThreshold"
                type="number"
                value={settings.lowStockThreshold}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
            <div>
              <Label htmlFor="criticalStockThreshold" className="text-foreground">
                Ngưỡng Hàng Tồn Kho Tới Hạn
              </Label>
              <Input
                id="criticalStockThreshold"
                name="criticalStockThreshold"
                type="number"
                value={settings.criticalStockThreshold}
                onChange={handleChange}
                className="mt-2"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button className="gap-2">
          <Save className="w-4 h-4" />
          Lưu Cài Đặt
        </Button>
      </div>
    </div>
    </div>
  )
}
