'use client'

import { useEffect, useState } from 'react'
import { Loader2, ArrowRight } from 'lucide-react'
import { mobileFetch } from '@/lib/mobile/api-client'

interface ConversionPreviewProps {
    productId: string
    fromUnitId: string
    quantity: number
}

interface ConversionData {
    fromQuantity: number
    fromUnit: { id: string; code: string; name: string }
    baseQuantity: number
    baseUnit: { id: string; code: string; name: string }
    conversionFactor: number
    displayText: string
}

export function ConversionPreview({ productId, fromUnitId, quantity }: ConversionPreviewProps) {
    const [conversion, setConversion] = useState<ConversionData | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string>('')

    useEffect(() => {
        if (!productId || !fromUnitId || !quantity || quantity <= 0) {
            setConversion(null)
            return
        }

        const fetchConversion = async () => {
            setLoading(true)
            setError('')

            try {
                const res = await mobileFetch(
                    `/api/unit-conversion/preview?productId=${productId}&fromUnitId=${fromUnitId}&quantity=${quantity}`
                )
                const json = await res.json()

                if (json.success && json.data) {
                    setConversion(json.data)
                } else {
                    setError(json.error || 'Không thể tính toán quy đổi')
                }
            } catch (err: any) {
                console.error('Error fetching conversion:', err)
                setError('Lỗi khi tính toán quy đổi')
            } finally {
                setLoading(false)
            }
        }

        // Debounce the API call to avoid too many requests while typing
        const timeoutId = setTimeout(fetchConversion, 300)
        return () => clearTimeout(timeoutId)
    }, [productId, fromUnitId, quantity])

    if (!productId || !fromUnitId) {
        return null
    }

    if (loading) {
        return (
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900/50 rounded-md border border-slate-200 dark:border-slate-700">
                <Loader2 className="w-3 h-3 animate-spin text-slate-500" />
                <span className="text-xs text-slate-600 dark:text-slate-400">Đang tính...</span>
            </div>
        )
    }

    if (error) {
        return (
            <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-red-50 dark:bg-red-950/20 rounded-md border border-red-200 dark:border-red-900">
                <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-xs text-red-700 dark:text-red-400">{error}</span>
            </div>
        )
    }

    if (!conversion) {
        return null
    }

    // If fromUnit and baseUnit are the same, show base unit badge
    if (conversion.fromUnit.id === conversion.baseUnit.id) {
        return (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/20 rounded-md border border-emerald-200 dark:border-emerald-900">
                <svg className="w-3 h-3 text-emerald-600 dark:text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                    Đơn vị cơ sở: <span className="font-semibold">{conversion.baseUnit.code || conversion.baseUnit.name}</span>
                </span>
            </div>
        )
    }

    return (
        <div className="inline-flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-md border border-blue-200 dark:border-blue-900">
            {/* Icon */}
            <svg className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>

            {/* Conversion display - compact inline */}
            <div className="flex items-center gap-1.5 text-xs">
                <span className="font-bold text-blue-700 dark:text-blue-300">
                    {conversion.fromQuantity}
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400 uppercase text-[10px]">
                    {conversion.fromUnit.code || conversion.fromUnit.name}
                </span>
                <ArrowRight className="w-3 h-3 text-blue-500 dark:text-blue-400 flex-shrink-0" />
                <span className="font-bold text-indigo-700 dark:text-indigo-300">
                    {conversion.baseQuantity}
                </span>
                <span className="font-medium text-indigo-600 dark:to-indigo-400 uppercase text-[10px]">
                    {conversion.baseUnit.code || conversion.baseUnit.name}
                </span>
            </div>
        </div>
    )
}
