import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { verifyAuth, isAdmin } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { InternalTransferListView } from "@/components/admin/internal-transfers/list-view"

// Force dynamic rendering since we use cookies for authentication
export const dynamic = 'force-dynamic'

async function getInternalTransferRequests() {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000"

  try {
    const response = await fetch(`${baseUrl}/api/internal-transfer-requests`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        "Cookie": (await cookies()).toString()
      },
      cache: "no-store"
    })

    if (!response.ok) {
      return []
    }

    const data = await response.json()
    return data.success ? data.data : []
  } catch (error) {
    console.error("Error fetching internal transfer requests:", error)
    return []
  }
}

async function getUnits() {
  try {
    const units = await prisma.product_units.findMany({
      select: {
        id: true,
        name: true,
        code: true
      },
      orderBy: { name: "asc" }
    })
    return units
  } catch (error) {
    console.error("Error fetching units:", error)
    return []
  }
}

export default async function AdminInternalTransfersPage() {
  const auth = await verifyAuth()

  if (!auth.isAuthenticated || !auth.user) {
    redirect("/login")
  }

  // Only ADMIN, AdminKhoTong and MANAGER (Main Warehouse) can access
  const userRole = String(auth.user.role)
  const allowedRoles = ["ADMIN", "MANAGER", "AdminKhoTong"]

  if (!allowedRoles.includes(userRole)) {
    console.log(`[AdminInternalTransfersPage] Access denied for user ${auth.user.email} with role: ${userRole}`)
    redirect("/admin")
  }

  const [requests, units] = await Promise.all([
    getInternalTransferRequests(),
    getUnits()
  ])

  return (
    <InternalTransferListView
      initialRequests={requests}
      units={units}
      currentUserRole={auth.user.role} // Pass original role type
    />
  )
}
