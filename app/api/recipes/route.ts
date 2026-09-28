import { NextRequest, NextResponse } from 'next/server'

/**
 * Alias endpoint for /api/product-recipes
 * Redirects to product-recipes endpoint
 */
export async function GET(request: NextRequest) {
  try {
    // Get the query parameters from the original request
    const searchParams = request.nextUrl.searchParams

    // Call the product-recipes endpoint
    const productRecipesUrl = new URL('/api/product-recipes', request.nextUrl.origin)

    // Copy all search params
    searchParams.forEach((value, key) => {
      productRecipesUrl.searchParams.append(key, value)
    })

    const res = await fetch(productRecipesUrl.toString(), {
      headers: request.headers,
      credentials: 'include'
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (error: any) {
    console.error('[GET /api/recipes] Error:', error)
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch recipes' },
      { status: 500 }
    )
  }
}
