import { NextResponse } from 'next/server'
import { syncAllPendingShipments } from '@/lib/db/shipment-execution'
// Ensure models are registered
import '@/lib/models/Shipment'

/**
 * POST /api/shipments/sync
 * Sync all pending API shipments (background job endpoint)
 */

// Force dynamic rendering for serverless functions
export const dynamic = 'force-dynamic'
export async function POST() {
  try {
    const result = await syncAllPendingShipments()
    
    return NextResponse.json({
      success: true,
      synced: result.synced,
      errors: result.errors,
      message: `Synced ${result.synced} shipment(s), ${result.errors} error(s)`,
    })
  } catch (error: any) {
    console.error('API Error in /api/shipments/sync POST:', error)
    const errorMessage = error?.message || error?.toString() || 'Internal server error'
    
    // Return 400 for validation/input errors
    if (errorMessage.includes('required') ||
        errorMessage.includes('invalid') ||
        errorMessage.includes('missing') ||
        errorMessage.includes('not found')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      )
    }
    
    // Return 404 for not found errors
    if (errorMessage.includes('not found') || errorMessage.includes('Not found') || errorMessage.includes('does not exist')) {
      return NextResponse.json(
        { error: errorMessage },
        { status: 404 }
      )
    }
    
    // Return 500 for server errors
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
