/**
 * Size Distribution Analytics (Design-Driven)
 * STANDARD size orders only; MTM excluded. Sizes and ordering from design/Uniform master.
 */

import connectDB from './mongodb'
import Order from '../models/Order'
import Uniform from '../models/Uniform'
import Vendor from '../models/Vendor'
import Location from '../models/Location'

export interface SizeDistributionFilters {
  companyId: string
  garmentTypes?: string[]   // Uniform.category: shirt, pant, shoe, jacket, accessory
  designIds?: string[]      // uniformId
  vendorIds?: string[]
  orderCycleYear?: number   // e.g. 2025
  locationId?: string
  topN?: number             // top N sizes per design (default 5)
}

export interface SizeDistributionByGarment {
  garmentType: string
  designId: string
  designName: string
  sizeOrder: string[]      // from design master (Uniform.sizes)
  distribution: Array<{ size: string; count: number; percent: number }>
  totalDemand: number      // total order lines per design (all independent)
}

export interface VendorWiseSizeDistribution {
  garmentType: string
  designId: string
  designName: string
  sizeOrder: string[]
  byVendor: Array<{
    vendorId: string
    vendorName: string
    distribution: Array<{ size: string; count: number; percent: number }>
    totalDemand: number
  }>
}

export interface TopSizePerDesign {
  designId: string
  designName: string
  garmentType: string
  topSizes: Array<{ size: string; count: number; percent: number; rank: number }>
  totalDemand: number      // total order lines per design (all independent)
}

export interface SizeAnalyticsResult {
  sizeDistributionByGarment: SizeDistributionByGarment[]
  vendorWiseSizeDistribution: VendorWiseSizeDistribution[]
  topSizesPerDesign: TopSizePerDesign[]
  filtersApplied: SizeDistributionFilters
}

/** Get filter options: garment types, designs, vendors, years, locations for the company */
export async function getSizeDistributionFilterOptions(companyId: string): Promise<{
  garmentTypes: Array<{ value: string; label: string }>
  designs: Array<{ designId: string; designName: string; garmentType: string; sizeOrder: string[] }>
  vendors: Array<{ vendorId: string; vendorName: string }>
  orderCycleYears: number[]
  locations: Array<{ locationId: string; locationName: string }>
}> {
  await connectDB()

  const companyIdStr = String(companyId)

  // Delivered orders only (exclude cancelled); derive designs/vendors/years
  const orders = await Order.find({
    companyId: companyIdStr,
    status: 'Delivered',
    $or: [{ unified_status: { $ne: 'CANCELLED' } }, { unified_status: { $exists: false } }]
  })
    .select('items orderDate vendorId locationId')
    .lean()

  const uniformIds = new Set<string>()
  const vendorIds = new Set<string>()
  const years = new Set<number>()
  const locationIds = new Set<string>()

  for (const o of orders as any[]) {
    if (o.vendorId) vendorIds.add(o.vendorId)
    if (o.locationId) locationIds.add(o.locationId)
    if (o.orderDate) years.add(new Date(o.orderDate).getFullYear())
    if (o.items && Array.isArray(o.items)) {
      for (const it of o.items) {
        if (it.fit_type === 'MTM') continue
        if (it.uniformId) uniformIds.add(it.uniformId)
      }
    }
  }

  const uniforms = await Uniform.find({ id: { $in: Array.from(uniformIds) } })
    .select('id name category sizes')
    .lean()

  const garmentTypeSet = new Set<string>()
  const designs: Array<{ designId: string; designName: string; garmentType: string; sizeOrder: string[] }> = []
  for (const u of uniforms as any[]) {
    const cat = u.category || 'accessory'
    garmentTypeSet.add(cat)
    designs.push({
      designId: u.id,
      designName: u.name || u.id,
      garmentType: cat,
      sizeOrder: Array.isArray(u.sizes) ? u.sizes : []
    })
  }

  const vendors = await Vendor.find({ id: { $in: Array.from(vendorIds) } })
    .select('id name')
    .lean()

  const locations = await Location.find({ id: { $in: Array.from(locationIds) } })
    .select('id name')
    .lean()

  const categoryLabels: Record<string, string> = {
    shirt: 'Shirt',
    pant: 'Pant',
    shoe: 'Shoe',
    jacket: 'Jacket',
    accessory: 'Accessory'
  }

  return {
    garmentTypes: Array.from(garmentTypeSet).sort().map(c => ({
      value: c,
      label: categoryLabels[c] || c
    })),
    designs: designs.sort((a, b) => (a.designName || '').localeCompare(b.designName || '')),
    vendors: (vendors as any[]).map(v => ({ vendorId: v.id, vendorName: v.name || v.id })),
    orderCycleYears: Array.from(years).sort((a, b) => b - a),
    locations: (locations as any[]).map(l => ({ locationId: l.id, locationName: l.name || l.id }))
  }
}

/** Build flat rows: one per order line for STANDARD items only (all independent, no dedupe). Delivered orders only. */
async function getStandardDemandRows(filters: SizeDistributionFilters): Promise<Array<{
  employeeId: string
  uniformId: string
  size: string
  vendorId: string
  orderDate: Date
  cycleYear: number
}>> {
  await connectDB()

  const companyIdStr = String(filters.companyId)
  const cycleYear = filters.orderCycleYear

  const query: any = {
    companyId: companyIdStr,
    status: 'Delivered',
    $or: [{ unified_status: { $ne: 'CANCELLED' } }, { unified_status: { $exists: false } }]
  }
  if (filters.locationId) query.locationId = filters.locationId
  if (cycleYear) {
    const start = new Date(cycleYear, 0, 1)
    const end = new Date(cycleYear, 11, 31, 23, 59, 59)
    query.orderDate = { $gte: start, $lte: end }
  }
  if (filters.vendorIds && filters.vendorIds.length > 0) {
    query.vendorId = { $in: filters.vendorIds }
  }

  const orders = await Order.find(query)
    .select('id employeeId items orderDate vendorId')
    .sort({ orderDate: 1 })
    .lean()

  const rows: Array<{ employeeId: string; uniformId: string; size: string; vendorId: string; orderDate: Date; cycleYear: number }> = []
  for (const o of orders as any[]) {
    const orderDate = o.orderDate ? new Date(o.orderDate) : new Date()
    const year = orderDate.getFullYear()
    if (cycleYear && year !== cycleYear) continue
    const empId = o.employeeId || (o.employeeIdNum && String(o.employeeIdNum)) || ''
    const vendorId = o.vendorId || ''
    if (!o.items || !Array.isArray(o.items)) continue
    for (const it of o.items) {
      if (it.fit_type === 'MTM') continue
      const uniformId = it.uniformId || it.productId
      const size = (it.size && String(it.size).trim()) || ''
      if (!uniformId || !size) continue
      rows.push({ employeeId: empId, uniformId, size, vendorId, orderDate, cycleYear: year })
    }
  }
  return rows
}

/** Get size distribution analytics for the three widgets */
export async function getSizeDistributionAnalytics(filters: SizeDistributionFilters): Promise<SizeAnalyticsResult> {
  const rows = await getStandardDemandRows(filters)

  const uniformIds = [...new Set(rows.map(r => r.uniformId))]
  const uniforms = await Uniform.find({ id: { $in: uniformIds } })
    .select('id name category sizes')
    .lean()
  const uniformMap = new Map<string, any>()
  for (const u of uniforms as any[]) {
    uniformMap.set(u.id, u)
  }

  // Apply design/garment filters
  const filterRow = (r: { uniformId: string }) => {
    if (filters.designIds && filters.designIds.length > 0 && !filters.designIds.includes(r.uniformId)) return false
    if (filters.garmentTypes && filters.garmentTypes.length > 0) {
      const u = uniformMap.get(r.uniformId)
      const cat = u?.category || 'accessory'
      if (!filters.garmentTypes.includes(cat)) return false
    }
    return true
  }
  const filteredRows = rows.filter(filterRow)

  const byDesign = new Map<string, typeof filteredRows>()
  for (const r of filteredRows) {
    if (!byDesign.has(r.uniformId)) byDesign.set(r.uniformId, [])
    byDesign.get(r.uniformId)!.push(r)
  }

  const sizeDistributionByGarment: SizeDistributionByGarment[] = []
  const vendorWiseSizeDistribution: VendorWiseSizeDistribution[] = []
  const topSizesPerDesign: TopSizePerDesign[] = []

  const topN = 5

  for (const [designId, designRows] of byDesign.entries()) {
    const u = uniformMap.get(designId)
    const designName = u?.name || designId
    const garmentType = u?.category || 'accessory'
    const sizeOrder: string[] = Array.isArray(u?.sizes) ? u.sizes : []

    const sizeCounts = new Map<string, number>()
    for (const r of designRows) {
      sizeCounts.set(r.size, (sizeCounts.get(r.size) || 0) + 1)
    }
    const totalDemand = designRows.length
    const sortedSizes = Array.from(sizeCounts.entries())
      .sort((a, b) => {
        const ai = sizeOrder.indexOf(a[0])
        const bi = sizeOrder.indexOf(b[0])
        if (ai !== -1 && bi !== -1) return ai - bi
        if (ai !== -1) return -1
        if (bi !== -1) return 1
        return a[0].localeCompare(b[0])
      })
    const distribution = sortedSizes.map(([size, count]) => ({
      size,
      count,
      percent: totalDemand > 0 ? (count / totalDemand) * 100 : 0
    }))

    sizeDistributionByGarment.push({
      garmentType,
      designId,
      designName,
      sizeOrder,
      distribution,
      totalDemand
    })

    const byVendor = new Map<string, typeof designRows>()
    for (const r of designRows) {
      const v = r.vendorId || 'Unknown'
      if (!byVendor.has(v)) byVendor.set(v, [])
      byVendor.get(v)!.push(r)
    }

    const vendorIdsList = await Vendor.find({ id: { $in: Array.from(byVendor.keys()).filter(Boolean) } })
      .select('id name')
      .lean()
    const vendorNameMap = new Map((vendorIdsList as any[]).map(v => [v.id, v.name || v.id]))

    const byVendorList: VendorWiseSizeDistribution['byVendor'] = []
    for (const [vendorId, vRows] of byVendor.entries()) {
      const vSizeCounts = new Map<string, number>()
      for (const r of vRows) {
        vSizeCounts.set(r.size, (vSizeCounts.get(r.size) || 0) + 1)
      }
      const vTotal = vRows.length
      const vSorted = Array.from(vSizeCounts.entries())
        .sort((a, b) => {
          const ai = sizeOrder.indexOf(a[0])
          const bi = sizeOrder.indexOf(b[0])
          if (ai !== -1 && bi !== -1) return ai - bi
          if (ai !== -1) return -1
          if (bi !== -1) return 1
          return a[0].localeCompare(b[0])
        })
      byVendorList.push({
        vendorId,
        vendorName: vendorNameMap.get(vendorId) || vendorId,
        distribution: vSorted.map(([size, count]) => ({
          size,
          count,
          percent: vTotal > 0 ? (count / vTotal) * 100 : 0
        })),
        totalDemand: vTotal
      })
    }

    vendorWiseSizeDistribution.push({
      garmentType,
      designId,
      designName,
      sizeOrder,
      byVendor: byVendorList
    })

    const n = Math.min(filters.topN ?? 5, distribution.length)
    const topSizes = distribution
      .slice(0, n)
      .map((d, i) => ({ ...d, rank: i + 1 }))
    topSizesPerDesign.push({
      designId,
      designName,
      garmentType,
      topSizes,
      totalDemand
    })
  }

  return {
    sizeDistributionByGarment,
    vendorWiseSizeDistribution,
    topSizesPerDesign,
    filtersApplied: filters
  }
}
