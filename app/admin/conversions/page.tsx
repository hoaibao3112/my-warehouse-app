"use client"

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Repeat } from 'lucide-react'
import { MobilePageHeader } from "@/components/mobile/mobile-page-header"
import { mobileFetch } from "@/lib/mobile/api-client"

export default function ConversionsAdminPage() {
  const [products, setProducts] = useState<any[]>([])
  const [units, setUnits] = useState<any[]>([])
  const [selectedProduct, setSelectedProduct] = useState<string>('')
  const [fromUnit, setFromUnit] = useState<string>('')
  const [toUnit, setToUnit] = useState<string>('')
  const [multiplier, setMultiplier] = useState<number>(1)
  const [conversions, setConversions] = useState<any[]>([])
  const [productUnits, setProductUnits] = useState<any[]>([]) // units with multiplier relative to base
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean
    title: string
    description: string
    onConfirm: () => void
  }>({ open: false, title: '', description: '', onConfirm: () => { } })

  const load = async () => {
    try {
      const [pRes, uRes] = await Promise.all([mobileFetch('/api/products?page=1&pageSize=1000'), mobileFetch('/api/product-units')])
      const pJson = await pRes.json()
      const uJson = await uRes.json()
      setProducts(pJson.data || [])
      setUnits(uJson.data || [])
    } catch (e) {
      setProducts([])
      setUnits([])
    }
  }

  useEffect(() => { load() }, [])

  // load conversions stored in DB (these are multipliers relative to base unit)
  // load global relations and compute per-product unit multipliers relative to product base
  const loadConversions = async (productId?: string) => {
    try {
      const [relsRes, unitsRes] = await Promise.all([
        mobileFetch('/api/product-unit-conversions'),
        mobileFetch('/api/product-units'),
      ])
      const relJson = await relsRes.json()
      const unitsJson = await unitsRes.json()
      const rels = relJson.data || []
      const allUnits = unitsJson.data || []
      setConversions(rels)
      // if product selected, compute multipliers to its base unit
      if (!productId) {
        setProductUnits([])
        return
      }
      const pRes = await mobileFetch(`/api/products/${productId}`)
      const pJson = await pRes.json()
      const baseUnitId = pJson?.data?.unit_id

      // build adjacency map
      const adj: Record<string, Array<{ to: string; m: number }>> = {}
      for (const r of rels) {
        adj[r.fromUnitId] = adj[r.fromUnitId] || []
        adj[r.fromUnitId].push({ to: r.toUnitId, m: Number(r.multiplier) })
      }

      const findMul = (start: string, target: string): number | null => {
        if (start === target) return 1
        const q: Array<{ node: string; mul: number }> = [{ node: start, mul: 1 }]
        const seen = new Set<string>([start])
        while (q.length) {
          const cur = q.shift()!
          const edges = adj[cur.node] || []
          for (const e of edges) {
            if (seen.has(e.to)) continue
            const nextMul = cur.mul * e.m
            if (e.to === target) return nextMul
            seen.add(e.to)
            q.push({ node: e.to, mul: nextMul })
          }
        }
        return null
      }

      const pus: any[] = []
      for (const u of allUnits) {
        if (u.id === baseUnitId) {
          pus.push({ ...u, multiplier: 1, isBase: true })
          continue
        }
        const m = findMul(u.id, baseUnitId)
        if (m !== null) pus.push({ ...u, multiplier: Number(m), isBase: false })
        else {
          const mr = findMul(baseUnitId, u.id)
          if (mr !== null) pus.push({ ...u, multiplier: 1 / Number(mr), isBase: false })
          else pus.push({ ...u, multiplier: null, isBase: false })
        }
      }
      setProductUnits(pus)
    } catch (e) {
      setConversions([])
      setProductUnits([])
    }
  }

  useEffect(() => { loadConversions(selectedProduct) }, [selectedProduct])
  const multiplierRef = useRef<HTMLInputElement | null>(null)

  // focus multiplier input when unit selection changes
  useEffect(() => {
    if ((fromUnit || toUnit) && multiplierRef.current) {
      multiplierRef.current.focus()
    }
  }, [fromUnit, toUnit])

  const handleCreate = async () => {
    if (!fromUnit || !toUnit || !multiplier) {
      toast.error('Vui lòng chọn đơn vị from/to và nhập multiplier.')
      return
    }
    setSaving(true)
    try {
      const res = await mobileFetch('/api/product-unit-conversions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fromUnitId: fromUnit, toUnitId: toUnit, multiplier }) })
      const j = await res.json()
      if (res.ok && j.success) {
        toast.success('Quy đổi đã được lưu.')
        loadConversions(selectedProduct)
      } else toast.error(j.error || 'Không thể lưu quy đổi')
    } catch (e) { toast.error(String(e)) } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setConfirmDialog({
      open: true,
      title: "Xác nhận xóa",
      description: "Xóa quy đổi này?",
      onConfirm: async () => {
        setConfirmDialog(prev => ({ ...prev, open: false }))
        setDeleting(id)
        try {
          const res = await mobileFetch('/api/product-unit-conversions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
          const j = await res.json()
          if (res.ok && j.success) {
            toast.success('Quy đổi đã được xóa.')
            loadConversions(selectedProduct)
          } else toast.error(j.error || 'Không thể xóa')
        } catch (e) { toast.error(String(e)) } finally {
          setDeleting(null)
        }
      }
    })
  }

  // compute derived pairwise conversions between any two units using multiplier relative to base
  const derivedPairs = () => {
    const list = productUnits || []
    const pairs: { from: any; to: any; multiplier: number }[] = []
    for (const a of list) {
      for (const b of list) {
        if (a.id === b.id) continue
        // multiplier: how many of 'to' units in one 'from' unit
        // a.multiplier = how many base units in 1 a
        // b.multiplier = how many base units in 1 b
        // 1 a = (a.multiplier / b.multiplier) b ? Wait: if a=24 base, b=1 base -> 1 a = 24 b
        const mA = Number(a.multiplier || 1)
        const mB = Number(b.multiplier || 1)
        const m = mA / mB
        pairs.push({ from: a, to: b, multiplier: m })
      }
    }
    return pairs
  }

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        icon={Repeat}
        title="Quy Đổi Đơn Vị"
        subtitle="Thiết lập quy đổi sản phẩm"
        gradient="amber"
      />
      <div className="p-4 md:p-8 space-y-6">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">Quy Đổi Đơn Vị Sản Phẩm</h1>
          <p className="text-muted-foreground">Thiết lập quy đổi (ví dụ 1 thùng = 24). Nhập multiplier một lần cho mỗi đơn vị so với đơn vị cơ sở; các quan hệ giữa các đơn vị sẽ được tính tự động.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2 space-y-4">
            <div>
              <Label>Chọn sản phẩm</Label>
              <select className="w-full p-2 border rounded" value={selectedProduct} onChange={(e) => setSelectedProduct(e.target.value)}>
                <option value="">-- Chọn sản phẩm --</option>
                {products.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
              </select>
            </div>

            <div>
              <Label>Quy đổi lưu trong hệ thống (relative to base)</Label>
              <div className="space-y-2 mt-2">
                {productUnits.length > 0 ? (
                  productUnits.map((u: any) => (
                    <div key={u.id} className="p-3 border rounded flex justify-between items-center">
                      <div>
                        <div className="font-medium">{u.code} — {u.name} {u.isBase ? '(Đơn vị cơ sở)' : ''}</div>
                        <div className="text-sm text-muted-foreground">Multiplier (so với cơ sở): x{u.multiplier}</div>
                      </div>
                      {/* show delete button for conversions where applicable */}
                      {!u.isBase && (
                        <div><button className="text-red-600" onClick={() => {
                          // find conversion row matching this unit to delete if exists in conversions
                          const row = conversions.find((c: any) => c.unitId === u.id)
                          if (row) handleDelete(row.id)
                          else {
                            setConfirmDialog({
                              open: true,
                              title: "Thông báo",
                              description: "Không tìm thấy bản ghi conversion riêng; bạn có thể xóa bằng SQL nếu cần.",
                              onConfirm: () => setConfirmDialog(prev => ({ ...prev, open: false }))
                            })
                          }
                        }}>Xóa</button></div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-muted-foreground">Chưa có quy đổi.</div>
                )}
              </div>
            </div>

            <div>
              <Label>Quan hệ giữa các đơn vị (tính tự động)</Label>
              <div className="mt-2 space-y-2">
                {derivedPairs().length === 0 && <div className="text-sm text-muted-foreground">Chọn sản phẩm để xem quan hệ giữa các đơn vị.</div>}
                {derivedPairs().map((p, idx) => (
                  <div key={idx} className="p-2 border rounded flex justify-between items-center">
                    <div className="text-sm">1 {p.from.code || p.from.name} = <span className="font-medium">{Number(p.multiplier)}</span> {p.to.code || p.to.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 border rounded-md">
            <div className="space-y-2">
              <Label>From đơn vị</Label>
              <select className="w-full p-2 border rounded" value={fromUnit} onChange={(e) => setFromUnit(e.target.value)}>
                <option value="">-- Chọn đơn vị --</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>

              <Label>To đơn vị</Label>
              <select className="w-full p-2 border rounded" value={toUnit} onChange={(e) => setToUnit(e.target.value)}>
                <option value="">-- Chọn đơn vị --</option>
                {units.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name}</option>)}
              </select>

              <Label>Số lượng tương ứng (multiplier)</Label>
              <Input ref={multiplierRef} type="number" value={multiplier} onChange={(e) => setMultiplier(Number((e.target as HTMLInputElement).value))} />

              <div className="flex justify-end">
                <Button onClick={handleCreate} disabled={saving || !!deleting} className="disabled:opacity-50 disabled:cursor-not-allowed">
                  {saving ? 'Đang lưu...' : 'Thêm/Update Quy Đổi'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Confirm Dialog */}
        <Dialog open={confirmDialog.open} onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{confirmDialog.title}</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">{confirmDialog.description}</p>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setConfirmDialog(prev => ({ ...prev, open: false }))}>Hủy</Button>
              <Button variant="destructive" onClick={confirmDialog.onConfirm}>Xác nhận</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
