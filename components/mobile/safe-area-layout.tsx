"use client"

/**
 * SafeAreaLayout applies safe area insets ONLY to page content
 * NOT to fixed positioned elements like sidebar/drawer which handle their own safe area
 * 
 * This is applied at the page level, not globally, to avoid interfering with
 * portaled elements (drawer, dialogs, etc.) that use document.body as parent
 */
export function SafeAreaContent({ 
  children,
  className = ""
}: { 
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
      }}
    >
      {children}
    </div>
  )
}
