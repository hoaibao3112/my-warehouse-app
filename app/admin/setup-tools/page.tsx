"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check, AlertCircle, Loader, Settings2 } from "lucide-react"
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function SetupToolsPage() {
  const [status, setStatus] = useState<'checking' | 'exists' | 'needs-setup' | 'setting-up' | 'success' | 'error'>('checking')
  const [message, setMessage] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [menuTypeId, setMenuTypeId] = useState<string>('')

  // Check if tools category exists
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await mobileFetch('/api/setup-tools')
        const json = await res.json()

        if (json?.data?.exists) {
          setStatus('exists')
          setMessage('✓ Danh mục Công Cụ Dụng Cụ đã tồn tại')
          if (json.data.category?.id) setCategoryId(json.data.category.id)
          if (json.data.menuType?.id) setMenuTypeId(json.data.menuType.id)
        } else {
          setStatus('needs-setup')
          setMessage('Cần thiết lập danh mục Công Cụ Dụng Cụ')
        }
      } catch (err) {
        setStatus('error')
        setMessage('Lỗi khi kiểm tra trạng thái')
      }
    }

    checkStatus()
  }, [])

  const handleSetup = async () => {
    setStatus('setting-up')
    try {
      const res = await mobileFetch('/api/setup-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const json = await res.json()

      if (res.ok && json?.success) {
        setStatus('success')
        setMessage('✓ Đã tạo danh mục Công Cụ Dụng Cụ thành công!')
        if (json.data?.category?.id) setCategoryId(json.data.category.id)
        if (json.data?.menuType?.id) setMenuTypeId(json.data.menuType.id)
      } else {
        setStatus('error')
        setMessage(json?.error || 'Lỗi khi tạo danh mục')
      }
    } catch (err: any) {
      setStatus('error')
      setMessage(err?.message || 'Lỗi khi kết nối tới server')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Settings2}
        title="Thiết Lập Công Cụ"
        subtitle="Cài đặt danh mục công cụ"
        gradient="cyan"
      />
      <div className="p-4 md:p-8 space-y-6">
      <div className="hidden md:block">
        <h1 className="text-3xl font-bold text-foreground">Thiết lập Công Cụ Dụng Cụ</h1>
        <p className="text-muted-foreground mt-2">Tạo danh mục Công Cụ Dụng Cụ để quản lý công cụ trong hệ thống</p>
      </div>

      <Card className="p-8">
        <div className="space-y-6">
          {/* Status Display */}
          <div className={`p-4 rounded-lg border-2 ${
            status === 'checking' ? 'bg-blue-50 border-blue-200' :
            status === 'exists' || status === 'success' ? 'bg-green-50 border-green-200' :
            status === 'error' || status === 'needs-setup' ? 'bg-yellow-50 border-yellow-200' :
            'bg-blue-50 border-blue-200'
          }`}>
            <div className="flex items-start gap-4">
              {(status === 'checking' || status === 'setting-up') && (
                <Loader className="w-5 h-5 mt-1 animate-spin text-blue-600" />
              )}
              {(status === 'exists' || status === 'success') && (
                <Check className="w-5 h-5 mt-1 text-green-600" />
              )}
              {(status === 'error' || status === 'needs-setup') && (
                <AlertCircle className="w-5 h-5 mt-1 text-yellow-600" />
              )}
              <div>
                <p className="font-semibold text-foreground">{message}</p>
                {(categoryId || menuTypeId) && (
                  <div className="mt-2 text-sm text-muted-foreground space-y-1">
                    {menuTypeId && <p>• Menu Type ID: {menuTypeId}</p>}
                    {categoryId && <p>• Category ID: {categoryId}</p>}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Information Section */}
          <div className="space-y-4">
            <h2 className="font-semibold text-lg text-foreground">Thông tin thiết lập</h2>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>
                Thiết lập này sẽ tạo:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li><strong>Menu Type:</strong> "Công Cụ & Dụng Cụ"</li>
                <li><strong>Category:</strong> "Công Cụ Dụng Cụ"</li>
              </ul>
              <p className="mt-4">
                Sau khi thiết lập, bạn có thể:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-2">
                <li>Thêm công cụ là sản phẩm với danh mục này</li>
                <li>Quản lý tồn kho công cụ</li>
                <li>Tạo yêu cầu nhập/xuất công cụ</li>
                <li>Xem báo cáo công cụ</li>
              </ul>
            </div>
          </div>

          {/* Action Button */}
          {status === 'needs-setup' && (
            <Button
              onClick={handleSetup}
              size="lg"
              className="w-full"
            >
              Tạo danh mục Công Cụ Dụng Cụ
            </Button>
          )}

          {(status === 'exists' || status === 'success') && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <p className="text-green-800 font-semibold mb-2">✓ Đã sẵn sàng!</p>
              <p className="text-green-700 text-sm">
                Danh mục Công Cụ Dụng Cụ đã được thiết lập. Bạn có thể bắt đầu thêm công cụ và quản lý chúng.
              </p>
            </div>
          )}

          {status === 'error' && (
            <Button
              onClick={handleSetup}
              variant="outline"
              className="w-full"
            >
              Thử lại
            </Button>
          )}

          {/* Next Steps */}
          {(status === 'exists' || status === 'success') && (
            <div className="border-t pt-6">
              <h3 className="font-semibold mb-3 text-foreground">Các bước tiếp theo</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                <li>Đến <strong>/admin/products</strong> để thêm công cụ mới</li>
                <li>Chọn danh mục "Công Cụ Dụng Cụ" khi tạo sản phẩm</li>
                <li>Đặt đơn vị, giá và thông tin khác cho công cụ</li>
                <li>Quản lý tồn kho tại <strong>/admin/tools-inventory</strong></li>
                <li>Tạo yêu cầu nhập/xuất tại <strong>/admin/tools-transfers</strong></li>
              </ol>
            </div>
          )}
        </div>
      </Card>
    </div>
    </div>
  )
}
