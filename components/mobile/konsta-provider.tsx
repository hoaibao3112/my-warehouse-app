"use client"

import { App } from "konsta/react"
import { ReactNode } from "react"

interface KonstaProviderProps {
    children: ReactNode
    theme?: "ios" | "material"
}

/**
 * KonstaProvider - Wrapper component for Konsta UI
 * Provides iOS/Material design theming and safe area handling
 * 
 * Usage:
 * Wrap mobile-first layouts or pages with this provider:
 * 
 * <KonstaProvider theme="ios">
 *   <Page>...</Page>
 * </KonstaProvider>
 */
export function KonstaProvider({ children, theme = "ios" }: KonstaProviderProps) {
    return (
        <App
            theme={theme}
            safeAreas
            dark={false}
            className="k-app"
        >
            {children}
        </App>
    )
}

export default KonstaProvider
