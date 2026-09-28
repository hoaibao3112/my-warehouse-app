"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

interface SignatureCanvasProps {
  onSign: (signatureData: string) => void
  onCancel?: () => void
  isLoading?: boolean
  width?: number
  height?: number
}

export function SignatureCanvas({
  onSign,
  onCancel,
  isLoading = false,
  width = 500,
  height = 300,
}: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  // Detect mobile/tablet on mount
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.matchMedia("(max-width: 768px)").matches
      setIsMobile(mobile)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Initialize canvas and setup resize handler
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const setupCanvas = () => {
      // Get the actual CSS-computed display size
      const rect = canvas.getBoundingClientRect()
      const displayWidth = Math.floor(rect.width)
      const displayHeight = Math.floor(rect.height)

      // Make sure we have valid dimensions
      if (displayWidth <= 0 || displayHeight <= 0) return

      const dpr = window.devicePixelRatio || 1

      // Set canvas internal resolution (for crisp drawing)
      canvas.width = displayWidth * dpr
      canvas.height = displayHeight * dpr

      // Scale context to account for DPR
      const ctx = canvas.getContext("2d")
      if (ctx) {
        ctx.scale(dpr, dpr)
        ctx.lineCap = "round"
        ctx.lineJoin = "round"
        ctx.lineWidth = 2
        ctx.strokeStyle = "#000000"
        ctx.fillStyle = "#ffffff"
        ctx.fillRect(0, 0, displayWidth, displayHeight)
      }
    }

    // Setup canvas with a small delay to ensure DOM is ready
    const timeoutId = setTimeout(setupCanvas, 100)
    window.addEventListener("resize", setupCanvas)

    return () => {
      clearTimeout(timeoutId)
      window.removeEventListener("resize", setupCanvas)
    }
  }, [isMobile])

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    setIsDrawing(true)
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // Position relative to canvas element (in display coordinates)
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    // Convert display coordinates to canvas drawing coordinates
    // canvas.width/height is internal resolution, rect.width/height is display size
    const canvasX = (offsetX / rect.width) * (canvas.width / dpr)
    const canvasY = (offsetY / rect.height) * (canvas.height / dpr)

    ctx.beginPath()
    ctx.moveTo(canvasX, canvasY)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return

    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const rect = canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    // Position relative to canvas element (in display coordinates)
    const offsetX = e.clientX - rect.left
    const offsetY = e.clientY - rect.top

    // Convert display coordinates to canvas drawing coordinates
    const canvasX = (offsetX / rect.width) * (canvas.width / dpr)
    const canvasY = (offsetY / rect.height) * (canvas.height / dpr)

    ctx.lineTo(canvasX, canvasY)
    ctx.stroke()

    if (!hasSignature) {
      setHasSignature(true)
    }
  }

  const handlePointerUp = () => {
    setIsDrawing(false)
  }

  const handleClear = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (ctx) {
      const dpr = window.devicePixelRatio || 1
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width / dpr, canvas.height / dpr)
    }
    setHasSignature(false)
  }

  const handleSubmit = () => {
    const canvas = canvasRef.current
    if (!canvas) return

    const signatureData = canvas.toDataURL("image/png")
    onSign(signatureData)
  }

  const canvasWidth = "100%"
  const canvasHeight = isMobile ? "200px" : `${height}px`

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 p-3 rounded">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        <span>Vui lòng ký tên của bạn trong khung bên dưới</span>
      </div>

      <div className="w-full border-2 border-gray-300 rounded-lg bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          style={{
            width: canvasWidth,
            height: canvasHeight,
            display: "block",
            touchAction: "none",
            cursor: "crosshair",
          }}
          className="bg-white w-full"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          onClick={handleClear}
          disabled={!hasSignature || isLoading}
        >
          Xóa
        </Button>
        {onCancel && (
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Hủy
          </Button>
        )}
        <Button
          onClick={handleSubmit}
          disabled={!hasSignature || isLoading}
        >
          {isLoading ? "Đang gửi..." : "Xác nhận ký"}
        </Button>
      </div>
    </div>
  )
}
