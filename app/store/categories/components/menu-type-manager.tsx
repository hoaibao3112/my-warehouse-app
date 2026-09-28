'use client'

import { useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { mobileFetch } from '@/lib/mobile/api-client'
import { Badge } from '@/components/ui/badge'

interface MenuType {
    id: string
    name: string
}

interface MenuTypeManagerProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    menuTypes: MenuType[]
    onSuccess: () => void
}

export function MenuTypeManager({ open, onOpenChange, menuTypes, onSuccess }: MenuTypeManagerProps) {
    const [newName, setNewName] = useState('')
    const [creating, setCreating] = useState(false)

    const handleCreate = async () => {
        if (!newName.trim()) {
            toast.error('Vui lòng nhập tên loại hàng')
            return
        }

        try {
            setCreating(true)
            const res = await mobileFetch('/api/menu-types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName.trim() })
            })

            const json = await res.json()

            if (!res.ok || !json.success) {
                throw new Error(json.error || 'Tạo loại hàng thất bại')
            }

            toast.success('Đã tạo loại hàng mới')
            setNewName('')
            onSuccess()
        } catch (error: any) {
            toast.error(error.message || 'Lỗi khi tạo loại hàng')
        } finally {
            setCreating(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Quản Lý Loại Hàng</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex gap-2">
                        <Input
                            placeholder="Tên loại hàng mới..."
                            value={newName}
                            onChange={(e) => setNewName(e.target.value)}
                            disabled={creating}
                        />
                        <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                        </Button>
                    </div>

                    <div className="border rounded-md p-4 max-h-[300px] overflow-y-auto">
                        <h4 className="text-sm font-medium mb-3 text-muted-foreground">Danh sách loại hàng hiện có ({menuTypes.length})</h4>
                        <div className="flex flex-wrap gap-2">
                            {menuTypes.map(type => (
                                <Badge key={type.id} variant="secondary" className="px-3 py-1">
                                    {type.name}
                                </Badge>
                            ))}
                            {menuTypes.length === 0 && (
                                <p className="text-sm text-muted-foreground italic">Chưa có loại hàng nào</p>
                            )}
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
