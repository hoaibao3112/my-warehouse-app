'use client'

import { ReactNode, useState } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ChevronRight, MoreVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface TableColumn<T> {
  key: string
  label: string | ReactNode
  render?: (item: T) => ReactNode
  className?: string
  mobileHidden?: boolean // Ẩn trên mobile
  mobilePrimary?: boolean // Hiển thị nổi bật trên mobile
  align?: 'left' | 'center' | 'right'
}

export interface TableAction<T> {
  label: string
  icon?: ReactNode
  onClick: (item: T) => void
  variant?: 'default' | 'destructive' | 'ghost'
  show?: (item: T) => boolean
  disabled?: (item: T) => boolean
  className?: string
}

interface ResponsiveTableProps<T> {
  data: T[]
  columns: TableColumn<T>[]
  actions?: TableAction<T>[]
  keyExtractor: (item: T) => string | number
  emptyMessage?: string
  onRowClick?: (item: T) => void
  loading?: boolean
  // Mobile specific props
  mobileCardTitle?: (item: T) => ReactNode
  mobileCardSubtitle?: (item: T) => ReactNode
  mobileCardBadge?: (item: T) => ReactNode
  mobileCardMeta?: (item: T) => ReactNode[]
}

export function ResponsiveTable<T>({
  data,
  columns,
  actions = [],
  keyExtractor,
  emptyMessage = 'Không có dữ liệu',
  onRowClick,
  loading = false,
  mobileCardTitle,
  mobileCardSubtitle,
  mobileCardBadge,
  mobileCardMeta,
}: ResponsiveTableProps<T>) {
  const isMobile = useIsMobile()

  if (loading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <div className="flex items-center justify-center gap-2">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Đang tải...
        </div>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {emptyMessage}
      </div>
    )
  }

  if (isMobile) {
    return (
      <div className="space-y-3">
        {data.map((item) => {
          const visibleActions = actions.filter(
            (action) => !action.show || action.show(item)
          )

          return (
            <Card
              key={keyExtractor(item)}
              className="p-4 hover:shadow-md transition-shadow"
              onClick={() => onRowClick?.(item)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  {/* Title */}
                  {mobileCardTitle && (
                    <h3 className="font-semibold text-base mb-1 truncate">
                      {mobileCardTitle(item)}
                    </h3>
                  )}

                  {/* Subtitle */}
                  {mobileCardSubtitle && (
                    <p className="text-sm text-muted-foreground mb-2">
                      {mobileCardSubtitle(item)}
                    </p>
                  )}

                  {/* Meta info */}
                  {mobileCardMeta && (
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
                      {mobileCardMeta(item).map((meta, idx) => (
                        <span key={idx}>{meta}</span>
                      ))}
                    </div>
                  )}

                  {/* Badge */}
                  {mobileCardBadge && (
                    <div className="mt-2">{mobileCardBadge(item)}</div>
                  )}

                  {/* Primary columns for mobile */}
                  {columns
                    .filter((col) => col.mobilePrimary && !col.mobileHidden)
                    .map((col) => (
                      <div key={col.key} className="mt-2 text-sm">
                        <span className="text-muted-foreground">
                          {col.label}:{' '}
                        </span>
                        <span className="font-medium">
                          {col.render
                            ? col.render(item)
                            : (item as any)[col.key]}
                        </span>
                      </div>
                    ))}
                </div>

                {/* Actions */}
                {visibleActions.length > 0 && (
                  <div className="flex-shrink-0">
                    {visibleActions.length === 1 ? (
                      <Button
                        size="sm"
                        variant={visibleActions[0].variant || 'ghost'}
                        onClick={(e) => {
                          e.stopPropagation()
                          visibleActions[0].onClick(item)
                        }}
                        disabled={
                          visibleActions[0].disabled
                            ? visibleActions[0].disabled(item)
                            : false
                        }
                        className="gap-2"
                      >
                        {visibleActions[0].icon}
                        <span className="text-sm">{visibleActions[0].label}</span>
                      </Button>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button size="sm" variant="ghost">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {visibleActions.map((action, idx) => (
                            <DropdownMenuItem
                              key={idx}
                              onClick={(e) => {
                                e.stopPropagation()
                                action.onClick(item)
                              }}
                              disabled={
                                action.disabled ? action.disabled(item) : false
                              }
                              className={
                                action.variant === 'destructive'
                                  ? 'text-destructive focus:text-destructive'
                                  : ''
                              }
                            >
                              {action.icon && (
                                <span className="mr-2">{action.icon}</span>
                              )}
                              {action.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                )}

                {onRowClick && !visibleActions.length && (
                  <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                )}
              </div>
            </Card>
          )
        })}
      </div>
    )
  }

  // Desktop table view
  return (
    <div className="overflow-x-auto" data-scroll-container data-table-container>
      <table className="w-full">
        <thead>
          <tr className="border-b border-border">
            {columns
              .filter((col) => !col.mobileHidden)
              .map((col) => (
                <th
                  key={col.key}
                  className={`py-3 px-4 font-semibold text-foreground ${col.className || ''} text-${col.align || 'left'}`}
                >
                  {col.label}
                </th>
              ))}
            {actions.length > 0 && (
              <th className="text-left py-3 px-4 font-semibold text-foreground">
                Hành Động
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((item) => {
            const visibleActions = actions.filter(
              (action) => !action.show || action.show(item)
            )

            return (
              <tr
                key={keyExtractor(item)}
                className={`border-b border-border hover:bg-muted/50 ${onRowClick ? 'cursor-pointer' : ''
                  }`}
                onClick={() => onRowClick?.(item)}
              >
                {columns
                  .filter((col) => !col.mobileHidden)
                  .map((col) => (
                    <td
                      key={col.key}
                      className={`py-3 px-4 ${col.className || ''} text-${col.align || 'left'}`}
                    >
                      {col.render
                        ? col.render(item)
                        : (item as any)[col.key]}
                    </td>
                  ))}
                {actions.length > 0 && (
                  <td className="py-3 px-4">
                    <div className="flex gap-2">
                      {visibleActions.map((action, idx) => (
                        <Button
                          key={idx}
                          size="sm"
                          variant={action.variant || 'ghost'}
                          onClick={(e) => {
                            e.stopPropagation()
                            action.onClick(item)
                          }}
                          disabled={
                            action.disabled ? action.disabled(item) : false
                          }
                          title={action.label}
                        >
                          {action.icon}
                        </Button>
                      ))}
                    </div>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
