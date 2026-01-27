/**
 * Entity Repository Abstraction
 * 
 * Provides a unified interface for the workflow engine to interact
 * with different entity types (Order, GRN, Invoice, etc.)
 * 
 * This abstraction allows the workflow engine to be completely
 * entity-agnostic while supporting entity-specific operations.
 * 
 * @module lib/workflow/entity-repository
 */

import { WorkflowEntityType, WORKFLOW_ENTITY_TYPES } from '../models/WorkflowConfiguration'

// =============================================================================
// TYPES & INTERFACES
// =============================================================================

/**
 * Standardized entity representation for workflow operations
 */
export interface WorkflowEntity {
  // Identity
  id: string
  companyId: string
  entityType: WorkflowEntityType
  
  // Workflow state
  currentStage: string | null
  status: string
  workflowConfigId?: string
  workflowConfigVersion?: number
  
  // Common fields for audit
  createdAt?: Date
  updatedAt?: Date
  
  // Entity-specific data (for snapshots)
  _raw: Record<string, any>
}

/**
 * Update payload for entity workflow state
 */
export interface EntityWorkflowUpdate {
  status: string
  currentStage: string | null
  workflowConfigId?: string
  workflowConfigVersion?: number
  // Stage-specific approval fields
  stageApprovalFields?: Record<string, any>
}

/**
 * Entity repository interface - implemented per entity type
 */
export interface IEntityRepository {
  entityType: WorkflowEntityType
  
  /**
   * Find entity by ID
   */
  findById(entityId: string): Promise<WorkflowEntity | null>
  
  /**
   * Update entity workflow state
   */
  updateWorkflowState(
    entityId: string,
    update: EntityWorkflowUpdate
  ): Promise<WorkflowEntity | null>
  
  /**
   * Get entity snapshot for audit purposes
   */
  getEntitySnapshot(entity: WorkflowEntity): Record<string, any>
  
  /**
   * Map status from unified to entity-specific (if needed)
   */
  mapStatus(unifiedStatus: string): string
  
  /**
   * Get the field name used for current stage
   */
  getStageFieldName(): string
  
  /**
   * Get the field name used for status
   */
  getStatusFieldName(): string
}

// =============================================================================
// ORDER REPOSITORY
// =============================================================================

class OrderRepository implements IEntityRepository {
  entityType = WORKFLOW_ENTITY_TYPES.ORDER
  
  async findById(entityId: string): Promise<WorkflowEntity | null> {
    const Order = (await import('../models/Order')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    // First try exact match
    let order = await Order.findOne({ id: entityId }).lean()
    
    // If not found and ID looks like a parent order ID (no vendor suffix),
    // try to find a child order with this as parentOrderId
    if (!order && entityId && !entityId.match(/-\d{6}$/)) {
      // ID doesn't end with vendor suffix pattern like -100001
      // Try finding by parentOrderId (get first child order)
      order = await Order.findOne({ parentOrderId: entityId }).lean()
      console.log(`[OrderRepository] Entity ${entityId} not found by id, tried parentOrderId lookup: ${order ? 'found' : 'not found'}`)
    }
    
    if (!order) return null
    
    return this.toWorkflowEntity(order)
  }
  
  async updateWorkflowState(
    entityId: string,
    update: EntityWorkflowUpdate
  ): Promise<WorkflowEntity | null> {
    const Order = (await import('../models/Order')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    // Determine the query - either by id or parentOrderId
    let query: any = { id: entityId }
    
    // If ID doesn't look like a child order (no vendor suffix), try parentOrderId
    if (entityId && !entityId.match(/-\d{6}$/)) {
      const existing = await Order.findOne({ id: entityId }).lean()
      if (!existing) {
        // Use parentOrderId to find child orders
        query = { parentOrderId: entityId }
        console.log(`[OrderRepository] Updating by parentOrderId: ${entityId}`)
      }
    }
    
    const updateFields: Record<string, any> = {
      unified_pr_status: update.status,
      unified_pr_status_updated_at: new Date(),
    }
    
    // Handle stage field - we'll use a consistent field
    if (update.currentStage !== undefined) {
      updateFields.currentWorkflowStage = update.currentStage
    }
    
    if (update.workflowConfigId) {
      updateFields.workflowConfigId = update.workflowConfigId
    }
    
    if (update.workflowConfigVersion) {
      updateFields.workflowConfigVersion = update.workflowConfigVersion
    }
    
    // Apply stage-specific approval fields
    if (update.stageApprovalFields) {
      Object.assign(updateFields, update.stageApprovalFields)
    }
    
    // Also update legacy status for backward compatibility
    const legacyStatus = this.mapToLegacyStatus(update.status)
    if (legacyStatus) {
      updateFields.status = legacyStatus
    }
    
    const order = await Order.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true }
    ).lean()
    
    if (!order) return null
    return this.toWorkflowEntity(order)
  }
  
  getEntitySnapshot(entity: WorkflowEntity): Record<string, any> {
    const raw = entity._raw
    return {
      employeeId: raw.employeeId,
      employeeName: raw.employeeName,
      pr_number: raw.pr_number,
      totalAmount: raw.total,
      itemCount: raw.items?.length || 0,
      vendorId: raw.vendorId,
      vendorName: raw.vendorName,
      orderDate: raw.orderDate,
      createdAt: raw.createdAt,
    }
  }
  
  mapStatus(unifiedStatus: string): string {
    // Order uses unified_pr_status directly
    return unifiedStatus
  }
  
  mapToLegacyStatus(unifiedStatus: string): string | null {
    const mapping: Record<string, string> = {
      'PENDING_LOCATION_APPROVAL': 'Awaiting approval',
      'PENDING_COMPANY_APPROVAL': 'Awaiting approval',
      'APPROVED': 'Awaiting fulfilment',
      'REJECTED': 'Awaiting approval',
      'IN_FULFILMENT': 'Awaiting fulfilment',
      'DISPATCHED': 'Dispatched',
      'DELIVERED': 'Delivered',
    }
    return mapping[unifiedStatus] || null
  }
  
  getStageFieldName(): string {
    return 'currentWorkflowStage'
  }
  
  getStatusFieldName(): string {
    return 'unified_pr_status'
  }
  
  private toWorkflowEntity(order: any): WorkflowEntity {
    return {
      id: order.id,
      companyId: order.companyId,
      entityType: WORKFLOW_ENTITY_TYPES.ORDER,
      currentStage: order.currentWorkflowStage || null,
      status: order.unified_pr_status || order.status || 'UNKNOWN',
      workflowConfigId: order.workflowConfigId,
      workflowConfigVersion: order.workflowConfigVersion,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      _raw: order,
    }
  }
}

// =============================================================================
// GRN REPOSITORY
// =============================================================================

class GRNRepository implements IEntityRepository {
  entityType = WORKFLOW_ENTITY_TYPES.GRN
  
  async findById(entityId: string): Promise<WorkflowEntity | null> {
    const GRN = (await import('../models/GRN')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    const grn = await GRN.findOne({ id: entityId }).lean()
    if (!grn) return null
    
    return this.toWorkflowEntity(grn)
  }
  
  async updateWorkflowState(
    entityId: string,
    update: EntityWorkflowUpdate
  ): Promise<WorkflowEntity | null> {
    const GRN = (await import('../models/GRN')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    const updateFields: Record<string, any> = {
      unified_grn_status: update.status,
      unified_grn_status_updated_at: new Date(),
    }
    
    if (update.currentStage !== undefined) {
      updateFields.currentWorkflowStage = update.currentStage
    }
    
    if (update.workflowConfigId) {
      updateFields.workflowConfigId = update.workflowConfigId
    }
    
    if (update.workflowConfigVersion) {
      updateFields.workflowConfigVersion = update.workflowConfigVersion
    }
    
    // Apply stage-specific approval fields
    if (update.stageApprovalFields) {
      Object.assign(updateFields, update.stageApprovalFields)
    }
    
    // Update legacy fields
    const legacyStatus = this.mapToLegacyStatus(update.status)
    if (legacyStatus) {
      updateFields.status = legacyStatus.status
      updateFields.grnStatus = legacyStatus.grnStatus
    }
    
    const grn = await GRN.findOneAndUpdate(
      { id: entityId },
      { $set: updateFields },
      { new: true }
    ).lean()
    
    if (!grn) return null
    return this.toWorkflowEntity(grn)
  }
  
  getEntitySnapshot(entity: WorkflowEntity): Record<string, any> {
    const raw = entity._raw
    return {
      grnNumber: raw.grnNumber,
      poNumber: raw.poNumber,
      vendorId: raw.vendorId,
      itemCount: raw.items?.length || 0,
      createdBy: raw.createdBy,
      createdAt: raw.createdAt,
    }
  }
  
  mapStatus(unifiedStatus: string): string {
    return unifiedStatus
  }
  
  mapToLegacyStatus(unifiedStatus: string): { status: string, grnStatus: string } | null {
    const mapping: Record<string, { status: string, grnStatus: string }> = {
      'RAISED': { status: 'CREATED', grnStatus: 'RAISED' },
      'PENDING_APPROVAL': { status: 'CREATED', grnStatus: 'RAISED' },
      'APPROVED': { status: 'ACKNOWLEDGED', grnStatus: 'APPROVED' },
      'REJECTED': { status: 'CREATED', grnStatus: 'RAISED' },
      'INVOICED': { status: 'INVOICED', grnStatus: 'APPROVED' },
      'CLOSED': { status: 'CLOSED', grnStatus: 'APPROVED' },
    }
    return mapping[unifiedStatus] || null
  }
  
  getStageFieldName(): string {
    return 'currentWorkflowStage'
  }
  
  getStatusFieldName(): string {
    return 'unified_grn_status'
  }
  
  private toWorkflowEntity(grn: any): WorkflowEntity {
    return {
      id: grn.id,
      companyId: grn.companyId,
      entityType: WORKFLOW_ENTITY_TYPES.GRN,
      currentStage: grn.currentWorkflowStage || null,
      status: grn.unified_grn_status || grn.grnStatus || grn.status || 'UNKNOWN',
      workflowConfigId: grn.workflowConfigId,
      workflowConfigVersion: grn.workflowConfigVersion,
      createdAt: grn.createdAt,
      updatedAt: grn.updatedAt,
      _raw: grn,
    }
  }
}

// =============================================================================
// INVOICE REPOSITORY
// =============================================================================

class InvoiceRepository implements IEntityRepository {
  entityType = WORKFLOW_ENTITY_TYPES.INVOICE
  
  async findById(entityId: string): Promise<WorkflowEntity | null> {
    const Invoice = (await import('../models/Invoice')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    // First try exact match by id (numeric string)
    let invoice = await Invoice.findOne({ id: entityId }).lean()
    
    // If not found, try by invoiceNumber (display format like INV-GRN...)
    if (!invoice && entityId) {
      invoice = await Invoice.findOne({ invoiceNumber: entityId }).lean()
      if (invoice) {
        console.log(`[InvoiceRepository] Entity ${entityId} not found by id, found by invoiceNumber`)
      }
    }
    
    if (!invoice) return null
    
    return this.toWorkflowEntity(invoice)
  }
  
  async updateWorkflowState(
    entityId: string,
    update: EntityWorkflowUpdate
  ): Promise<WorkflowEntity | null> {
    const Invoice = (await import('../models/Invoice')).default
    const connectDB = (await import('../db/mongodb')).default
    await connectDB()
    
    // Determine the query - try by id first, then by invoiceNumber
    let query: any = { id: entityId }
    
    // Check if entity exists by id, if not try invoiceNumber
    const existing = await Invoice.findOne({ id: entityId }).lean()
    if (!existing && entityId) {
      const byInvoiceNumber = await Invoice.findOne({ invoiceNumber: entityId }).lean()
      if (byInvoiceNumber) {
        query = { invoiceNumber: entityId }
        console.log(`[InvoiceRepository] Updating by invoiceNumber: ${entityId}`)
      }
    }
    
    const updateFields: Record<string, any> = {
      unified_invoice_status: update.status,
      unified_invoice_status_updated_at: new Date(),
    }
    
    if (update.currentStage !== undefined) {
      updateFields.currentWorkflowStage = update.currentStage
    }
    
    if (update.workflowConfigId) {
      updateFields.workflowConfigId = update.workflowConfigId
    }
    
    if (update.workflowConfigVersion) {
      updateFields.workflowConfigVersion = update.workflowConfigVersion
    }
    
    // Apply stage-specific approval fields
    if (update.stageApprovalFields) {
      Object.assign(updateFields, update.stageApprovalFields)
    }
    
    // Update legacy status
    const legacyStatus = this.mapToLegacyStatus(update.status)
    if (legacyStatus) {
      updateFields.invoiceStatus = legacyStatus
    }
    
    const invoice = await Invoice.findOneAndUpdate(
      query,
      { $set: updateFields },
      { new: true }
    ).lean()
    
    if (!invoice) return null
    return this.toWorkflowEntity(invoice)
  }
  
  getEntitySnapshot(entity: WorkflowEntity): Record<string, any> {
    const raw = entity._raw
    return {
      invoiceNumber: raw.invoiceNumber,
      vendorInvoiceNumber: raw.vendorInvoiceNumber,
      invoiceAmount: raw.invoiceAmount,
      vendorId: raw.vendorId,
      grnId: raw.grnId,
      poNumber: raw.poNumber,
      createdAt: raw.createdAt,
    }
  }
  
  mapStatus(unifiedStatus: string): string {
    return unifiedStatus
  }
  
  mapToLegacyStatus(unifiedStatus: string): string | null {
    const mapping: Record<string, string> = {
      'RAISED': 'RAISED',
      'PENDING_APPROVAL': 'RAISED',
      'APPROVED': 'APPROVED',
      'REJECTED': 'REJECTED',  // Keep REJECTED status visible in legacy field
      'PAID': 'APPROVED',
    }
    return mapping[unifiedStatus] || null
  }
  
  getStageFieldName(): string {
    return 'currentWorkflowStage'
  }
  
  getStatusFieldName(): string {
    return 'unified_invoice_status'
  }
  
  private toWorkflowEntity(invoice: any): WorkflowEntity {
    return {
      id: invoice.id,
      companyId: invoice.companyId,
      entityType: WORKFLOW_ENTITY_TYPES.INVOICE,
      currentStage: invoice.currentWorkflowStage || null,
      status: invoice.unified_invoice_status || invoice.invoiceStatus || 'UNKNOWN',
      workflowConfigId: invoice.workflowConfigId,
      workflowConfigVersion: invoice.workflowConfigVersion,
      createdAt: invoice.createdAt,
      updatedAt: invoice.updatedAt,
      _raw: invoice,
    }
  }
}

// =============================================================================
// REPOSITORY FACTORY
// =============================================================================

const repositories: Map<WorkflowEntityType, IEntityRepository> = new Map()

/**
 * Get repository for an entity type
 */
export function getEntityRepository(entityType: WorkflowEntityType): IEntityRepository {
  // Initialize repositories lazily
  if (!repositories.has(WORKFLOW_ENTITY_TYPES.ORDER)) {
    repositories.set(WORKFLOW_ENTITY_TYPES.ORDER, new OrderRepository())
  }
  if (!repositories.has(WORKFLOW_ENTITY_TYPES.GRN)) {
    repositories.set(WORKFLOW_ENTITY_TYPES.GRN, new GRNRepository())
  }
  if (!repositories.has(WORKFLOW_ENTITY_TYPES.INVOICE)) {
    repositories.set(WORKFLOW_ENTITY_TYPES.INVOICE, new InvoiceRepository())
  }
  
  const repository = repositories.get(entityType)
  if (!repository) {
    throw new Error(`No repository registered for entity type: ${entityType}`)
  }
  
  return repository
}

/**
 * Register a custom repository (for future entity types)
 */
export function registerEntityRepository(
  entityType: WorkflowEntityType,
  repository: IEntityRepository
): void {
  repositories.set(entityType, repository)
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  OrderRepository,
  GRNRepository,
  InvoiceRepository,
}
