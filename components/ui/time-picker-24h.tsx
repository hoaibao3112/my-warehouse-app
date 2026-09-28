"use client"

import * as React from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"

interface TimePicker24hProps {
  value: string // Format: "HH:MM"
  onChange: (value: string) => void
  className?: string
  disabled?: boolean
}

export function TimePicker24h({ value, onChange, className, disabled }: TimePicker24hProps) {
  // Parse current value
  const [hours, minutes] = React.useMemo(() => {
    if (!value) return ["00", "00"]
    const parts = value.split(":")
    return [parts[0] || "00", parts[1] || "00"]
  }, [value])

  // Generate hours (00-23)
  const hourOptions = React.useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, "0"))
  }, [])

  // Generate minutes (00, 05, 10, ..., 55) - 5 minute intervals
  const minuteOptions = React.useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, "0"))
  }, [])

  const handleHourChange = (newHour: string) => {
    onChange(`${newHour}:${minutes}`)
  }

  const handleMinuteChange = (newMinute: string) => {
    onChange(`${hours}:${newMinute}`)
  }

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Select value={hours} onValueChange={handleHourChange} disabled={disabled}>
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder="Giờ" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {hourOptions.map((hour) => (
            <SelectItem key={hour} value={hour}>
              {hour}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-lg font-medium">:</span>
      <Select value={minutes} onValueChange={handleMinuteChange} disabled={disabled}>
        <SelectTrigger className="w-[70px]">
          <SelectValue placeholder="Phút" />
        </SelectTrigger>
        <SelectContent className="max-h-[200px]">
          {minuteOptions.map((minute) => (
            <SelectItem key={minute} value={minute}>
              {minute}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
