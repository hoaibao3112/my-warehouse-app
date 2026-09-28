"use client"

import { useAuth } from "@/hooks/use-auth"
import { useEffect, useState } from "react"
import { isAdmin, isWarehouseManager, isStaff } from "@/lib/auth-helpers"

export default function DebugPage() {
  const { user, isLoading } = useAuth()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className="p-8 bg-slate-900 text-white min-h-screen font-mono text-sm">
      <h1 className="text-3xl font-bold mb-8">🔍 Debug Auth Info</h1>

      <div className="space-y-4 bg-slate-800 p-6 rounded-lg">
        <div>
          <span className="text-yellow-400">Loading:</span> {String(isLoading)}
        </div>
        <div>
          <span className="text-yellow-400">User Object:</span>
          <pre className="bg-slate-900 p-4 mt-2 rounded overflow-auto text-cyan-400">
            {user ? JSON.stringify(user, null, 2) : "null"}
          </pre>
        </div>

        {user && (
          <>
            <div className="border-t border-slate-700 pt-4 mt-4">
              <span className="text-yellow-400">Role Checks:</span>
              <div className="mt-2 space-y-2 pl-4">
                <div>
                  <span className="text-green-400">isAdmin():</span> {String(isAdmin(user))} {user.role === "ADMIN" || user.role === "AdminKhoTong" ? "✓" : "✗"}
                </div>
                <div>
                  <span className="text-green-400">isWarehouseManager():</span> {String(isWarehouseManager(user))} {user.role === "WAREHOUSE_MANAGER" || user.role === "QuanLyKhoCon" ? "✓" : "✗"}
                </div>
                <div>
                  <span className="text-green-400">isStaff():</span> {String(isStaff(user))} {user.role === "STAFF" ? "✓" : "✗"}
                </div>
              </div>
            </div>

            <div className="border-t border-slate-700 pt-4 mt-4">
              <span className="text-yellow-400">Expected Navigation:</span>
              <div className="mt-2 pl-4">
                {isAdmin(user) && <div className="text-green-400">→ Should go to /admin</div>}
                {isWarehouseManager(user) && <div className="text-green-400">→ Should go to /store</div>}
                {isStaff(user) && <div className="text-green-400">→ Should go to /store</div>}
                {!isAdmin(user) && !isWarehouseManager(user) && !isStaff(user) && (
                  <div className="text-red-400">⚠️ No matching role! User won't be allowed anywhere</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="mt-8 p-4 bg-blue-900 rounded text-blue-100">
        💡 This page helps debug authentication issues. Check the role value and role check results above.
      </div>
    </div>
  )
}
