import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/utils/api-auth-context'
import { getProductSizeChart, upsertProductSizeChart } from '@/lib/db/data-access'

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'

const ALLOWED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'webp'] as const

function inferFromImageUrl(imageUrl: string): { imageType: 'jpg' | 'jpeg' | 'png' | 'webp'; fileName: string } {
  const pathPart = imageUrl.split('?')[0]
  const fileName = pathPart.split('/').pop() || `product-${pathPart}.jpg`
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase()
  const imageType = ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp' ? ext : 'jpg'
  return { imageType: imageType as 'jpg' | 'jpeg' | 'png' | 'webp', fileName }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { productId } = await params

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    // Validate product ID format (alphanumeric)
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(productId)) {
      return NextResponse.json(
        { error: 'Invalid product ID format. Must be alphanumeric (1-50 characters).' },
        { status: 400 }
      )
    }

    const sizeChart = await getProductSizeChart(productId)

    if (!sizeChart) {
      return NextResponse.json(
        { error: 'Size chart not found for this product' },
        { status: 404 }
      )
    }

    return NextResponse.json(sizeChart, { status: 200 })
  } catch (error) {
    const err = error as any
    console.error('Error fetching size chart:', err)
    const errorMessage = err?.message || err?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('Invalid JSON')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || 
        errorMessage.includes('Not found') || 
        errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 401 for authentication errors
    if (errorMessage.includes('Unauthorized') ||
        errorMessage.includes('authentication') ||
        errorMessage.includes('token')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 401 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

/** Create or update size chart for a product (Superadmin utility). Body: { imageUrl: string, imageType?, fileName?, fileSize? }. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ productId: string }> }
) {
  try {
    const ctx = await getAuthContext()
    if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { productId } = await params

    if (!productId) {
      return NextResponse.json(
        { error: 'Product ID is required' },
        { status: 400 }
      )
    }

    if (!/^[A-Za-z0-9_-]{1,50}$/.test(productId)) {
      return NextResponse.json(
        { error: 'Invalid product ID format. Must be alphanumeric (1-50 characters).' },
        { status: 400 }
      )
    }

    let body: { imageUrl?: string; imageType?: string; fileName?: string; fileSize?: number }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body. Expected { imageUrl: string }' },
        { status: 400 }
      )
    }

    const imageUrl = body?.imageUrl?.trim()
    if (!imageUrl) {
      return NextResponse.json(
        { error: 'imageUrl is required (e.g. /uploads/size-charts/product-200001.jpg)' },
        { status: 400 }
      )
    }

    const inferred = inferFromImageUrl(imageUrl)
    const imageType = (body.imageType?.toLowerCase() || inferred.imageType) as 'jpg' | 'jpeg' | 'png' | 'webp'
    if (!ALLOWED_IMAGE_TYPES.includes(imageType)) {
      return NextResponse.json(
        { error: `imageType must be one of: ${ALLOWED_IMAGE_TYPES.join(', ')}` },
        { status: 400 }
      )
    }
    const fileName = body.fileName?.trim() || inferred.fileName
    const fileSize = typeof body.fileSize === 'number' && body.fileSize >= 0 ? body.fileSize : 0

    const sizeChart = await upsertProductSizeChart(productId, imageUrl, imageType, fileName, fileSize)
    return NextResponse.json(sizeChart, { status: 200 })
  } catch (error: any) {
    console.error('Error upserting size chart:', error)
    const msg = error?.message || error?.toString() || 'Internal server error'
    if (msg.includes('not found')) {
      return NextResponse.json({ error: msg }, { status: 404 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
