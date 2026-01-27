/**
 * Workflow Recipient Resolver
 * 
 * Dynamically resolves notification recipients based on:
 * - Workflow configuration
 * - Entity data
 * - Event payload
 * 
 * Design Principles:
 * - No hardcoded email addresses
 * - Recipients determined by resolver strategy
 * - Reusable across all entity types
 * - Returns multiple recipients per resolver
 * 
 * @module lib/workflow/workflow-recipient-resolver
 */

import connectDB from '../db/mongodb'
import { RecipientResolver, RECIPIENT_RESOLVERS, CustomRecipient } from '../models/WorkflowNotificationMapping'
import WorkflowConfiguration, { IWorkflowConfiguration } from '../models/WorkflowConfiguration'
import { WorkflowEventPayload, StageEventPayload } from './workflow-events'

// =============================================================================
// TYPES
// =============================================================================

/**
 * Resolved recipient with contact details
 */
export interface ResolvedRecipient {
  email: string
  name: string
  role: string
  userId?: string
  resolvedBy: RecipientResolver // Which resolver found this recipient
}

/**
 * Resolution context passed to resolvers
 */
export interface ResolutionContext {
  event: WorkflowEventPayload
  workflowConfig?: IWorkflowConfiguration | null
  customRecipients?: CustomRecipient[]
  excludeEmails?: string[] // Emails to exclude (e.g., action performer)
}

/**
 * Result of recipient resolution
 */
export interface ResolutionResult {
  recipients: ResolvedRecipient[]
  errors: string[]
  skipped: string[] // Reasons for skipped recipients
}

// =============================================================================
// RESOLVER FUNCTIONS
// =============================================================================

/**
 * Resolve requestor (original entity creator)
 */
async function resolveRequestor(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  const { entitySnapshot } = event
  
  if (entitySnapshot.createdByEmail && entitySnapshot.createdByName) {
    return [{
      email: entitySnapshot.createdByEmail,
      name: entitySnapshot.createdByName,
      role: 'REQUESTOR',
      userId: entitySnapshot.createdBy,
      resolvedBy: RECIPIENT_RESOLVERS.REQUESTOR,
    }]
  }
  
  // Try to look up from employee data
  if (entitySnapshot.createdBy) {
    const employee = await lookupEmployee(entitySnapshot.createdBy, event.companyId)
    if (employee) {
      return [{
        email: employee.email,
        name: employee.name,
        role: 'REQUESTOR',
        userId: employee.id,
        resolvedBy: RECIPIENT_RESOLVERS.REQUESTOR,
      }]
    }
  }
  
  return []
}

/**
 * Resolve entity owner
 */
async function resolveEntityOwner(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  // For most cases, owner = requestor
  // Override in entity-specific logic if needed
  return resolveRequestor(context)
}

/**
 * Resolve users with roles allowed at current stage
 */
async function resolveCurrentStageRole(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event, workflowConfig } = context
  
  if (!workflowConfig || !event.currentStage) {
    return []
  }
  
  const stage = workflowConfig.stages.find(s => s.stageKey === event.currentStage)
  if (!stage) {
    return []
  }
  
  return resolveUsersByRoles(stage.allowedRoles, event.companyId, event.entitySnapshot.locationId)
}

/**
 * Resolve users with roles allowed at next stage
 */
async function resolveNextStageRole(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event, workflowConfig } = context
  
  if (!workflowConfig) {
    return []
  }
  
  // For stage events, nextStageInfo is provided
  if ('nextStageInfo' in event && (event as StageEventPayload).nextStageInfo) {
    const nextStage = (event as StageEventPayload).nextStageInfo!
    return resolveUsersByRoles(nextStage.allowedRoles, event.companyId, event.entitySnapshot.locationId)
  }
  
  // Otherwise, calculate next stage from workflow
  if (!event.currentStage) {
    return []
  }
  
  const sortedStages = [...workflowConfig.stages].sort((a, b) => a.order - b.order)
  const currentIndex = sortedStages.findIndex(s => s.stageKey === event.currentStage)
  
  if (currentIndex < 0 || currentIndex >= sortedStages.length - 1) {
    return []
  }
  
  const nextStage = sortedStages[currentIndex + 1]
  return resolveUsersByRoles(nextStage.allowedRoles, event.companyId, event.entitySnapshot.locationId)
}

/**
 * Resolve users who acted at previous stage
 */
async function resolvePreviousStageRole(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event, workflowConfig } = context
  
  if (!workflowConfig || !event.previousStage) {
    return []
  }
  
  const prevStage = workflowConfig.stages.find(s => s.stageKey === event.previousStage)
  if (!prevStage) {
    return []
  }
  
  return resolveUsersByRoles(prevStage.allowedRoles, event.companyId, event.entitySnapshot.locationId)
}

/**
 * Resolve the user who performed the action
 */
async function resolveActionPerformer(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  const { triggeredBy } = event
  
  if (triggeredBy.userEmail) {
    return [{
      email: triggeredBy.userEmail,
      name: triggeredBy.userName,
      role: triggeredBy.userRole,
      userId: triggeredBy.userId,
      resolvedBy: RECIPIENT_RESOLVERS.ACTION_PERFORMER,
    }]
  }
  
  // Look up email if not provided
  const user = await lookupUser(triggeredBy.userId, event.companyId)
  if (user) {
    return [{
      email: user.email,
      name: user.name || triggeredBy.userName,
      role: triggeredBy.userRole,
      userId: triggeredBy.userId,
      resolvedBy: RECIPIENT_RESOLVERS.ACTION_PERFORMER,
    }]
  }
  
  return []
}

/**
 * Resolve company admins
 */
async function resolveCompanyAdmin(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  return resolveUsersByRoles(['COMPANY_ADMIN'], event.companyId)
}

/**
 * Resolve location admins for entity's location
 */
async function resolveLocationAdmin(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  const locationId = event.entitySnapshot.locationId
  
  if (!locationId) {
    // Fall back to all location admins for company
    return resolveUsersByRoles(['LOCATION_ADMIN', 'SITE_ADMIN'], event.companyId)
  }
  
  return resolveUsersByRoles(['LOCATION_ADMIN', 'SITE_ADMIN'], event.companyId, locationId)
}

/**
 * Resolve finance admins
 */
async function resolveFinanceAdmin(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  return resolveUsersByRoles(['FINANCE_ADMIN'], event.companyId)
}

/**
 * Resolve vendor contacts
 */
async function resolveVendor(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { event } = context
  const vendorId = event.entitySnapshot.vendorId
  
  if (!vendorId) {
    return []
  }
  
  const vendor = await lookupVendor(vendorId, event.companyId)
  if (vendor && vendor.email) {
    return [{
      email: vendor.email,
      name: vendor.name,
      role: 'VENDOR',
      userId: vendor.id,
      resolvedBy: RECIPIENT_RESOLVERS.VENDOR,
    }]
  }
  
  return []
}

/**
 * Resolve custom recipients
 */
async function resolveCustom(context: ResolutionContext): Promise<ResolvedRecipient[]> {
  const { customRecipients } = context
  
  if (!customRecipients || customRecipients.length === 0) {
    return []
  }
  
  return customRecipients.map(r => ({
    email: r.email,
    name: r.name || 'Custom Recipient',
    role: r.role || 'CUSTOM',
    resolvedBy: RECIPIENT_RESOLVERS.CUSTOM,
  }))
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Look up users by role(s) and optionally location
 */
async function resolveUsersByRoles(
  roles: string[],
  companyId: string,
  locationId?: string
): Promise<ResolvedRecipient[]> {
  await connectDB()
  
  try {
    // Dynamic import to avoid circular dependencies
    const UserModel = (await import('../models/User')).default
    
    const query: any = {
      companyId,
      role: { $in: roles },
      isActive: true,
    }
    
    // If locationId provided, filter by location
    if (locationId) {
      query.$or = [
        { locationId },
        { locationIds: locationId },
        { role: 'COMPANY_ADMIN' }, // Company admins get notified for all locations
      ]
    }
    
    const users = await UserModel.find(query)
      .select('id name email role')
      .lean()
    
    return users.map((user: any) => ({
      email: user.email,
      name: user.name,
      role: user.role,
      userId: user.id,
      resolvedBy: RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE,
    }))
  } catch (error) {
    console.error('[RecipientResolver] Error resolving users by role:', error)
    return []
  }
}

/**
 * Look up employee by ID
 */
async function lookupEmployee(employeeId: string, companyId: string): Promise<{
  id: string
  name: string
  email: string
} | null> {
  await connectDB()
  
  try {
    const EmployeeModel = (await import('../models/Employee')).default
    const employee = await EmployeeModel.findOne({
      $or: [{ id: employeeId }, { employeeId }],
      companyId,
    }).select('id employeeId name email').lean()
    
    if (employee) {
      return {
        id: (employee as any).id || (employee as any).employeeId,
        name: (employee as any).name,
        email: (employee as any).email,
      }
    }
    return null
  } catch (error) {
    console.error('[RecipientResolver] Error looking up employee:', error)
    return null
  }
}

/**
 * Look up user by ID
 */
async function lookupUser(userId: string, companyId: string): Promise<{
  id: string
  name: string
  email: string
} | null> {
  await connectDB()
  
  try {
    const UserModel = (await import('../models/User')).default
    const user = await UserModel.findOne({
      $or: [{ id: userId }, { _id: userId }],
      companyId,
    }).select('id name email').lean()
    
    if (user) {
      return {
        id: (user as any).id || (user as any)._id?.toString(),
        name: (user as any).name,
        email: (user as any).email,
      }
    }
    return null
  } catch (error) {
    console.error('[RecipientResolver] Error looking up user:', error)
    return null
  }
}

/**
 * Look up vendor by ID
 */
async function lookupVendor(vendorId: string, companyId: string): Promise<{
  id: string
  name: string
  email: string
} | null> {
  await connectDB()
  
  try {
    const VendorModel = (await import('../models/Vendor')).default
    const vendor = await VendorModel.findOne({
      $or: [{ id: vendorId }, { vendorId }],
      companyId,
    }).select('id vendorId name email contactEmail').lean()
    
    if (vendor) {
      return {
        id: (vendor as any).id || (vendor as any).vendorId,
        name: (vendor as any).name,
        email: (vendor as any).email || (vendor as any).contactEmail,
      }
    }
    return null
  } catch (error) {
    console.error('[RecipientResolver] Error looking up vendor:', error)
    return null
  }
}

// =============================================================================
// MAIN RESOLVER
// =============================================================================

/**
 * Resolver function map
 */
const RESOLVER_FUNCTIONS: Record<RecipientResolver, (context: ResolutionContext) => Promise<ResolvedRecipient[]>> = {
  [RECIPIENT_RESOLVERS.REQUESTOR]: resolveRequestor,
  [RECIPIENT_RESOLVERS.ENTITY_OWNER]: resolveEntityOwner,
  [RECIPIENT_RESOLVERS.CURRENT_STAGE_ROLE]: resolveCurrentStageRole,
  [RECIPIENT_RESOLVERS.PREVIOUS_STAGE_ROLE]: resolvePreviousStageRole,
  [RECIPIENT_RESOLVERS.NEXT_STAGE_ROLE]: resolveNextStageRole,
  [RECIPIENT_RESOLVERS.ACTION_PERFORMER]: resolveActionPerformer,
  [RECIPIENT_RESOLVERS.COMPANY_ADMIN]: resolveCompanyAdmin,
  [RECIPIENT_RESOLVERS.LOCATION_ADMIN]: resolveLocationAdmin,
  [RECIPIENT_RESOLVERS.FINANCE_ADMIN]: resolveFinanceAdmin,
  [RECIPIENT_RESOLVERS.VENDOR]: resolveVendor,
  [RECIPIENT_RESOLVERS.CUSTOM]: resolveCustom,
}

/**
 * Resolve recipients for a workflow event
 * 
 * @param resolvers - Array of resolver strategies to use
 * @param context - Resolution context with event data
 * @returns Resolution result with recipients, errors, and skipped reasons
 */
export async function resolveWorkflowRecipients(
  resolvers: RecipientResolver[],
  context: ResolutionContext
): Promise<ResolutionResult> {
  const result: ResolutionResult = {
    recipients: [],
    errors: [],
    skipped: [],
  }
  
  const seenEmails = new Set<string>()
  const excludeEmails = new Set(context.excludeEmails?.map(e => e.toLowerCase()) || [])
  
  // Load workflow config if not provided
  if (!context.workflowConfig) {
    context.workflowConfig = await WorkflowConfiguration.findOne({
      companyId: context.event.companyId,
      entityType: context.event.entityType,
      isActive: true,
    }).lean()
  }
  
  for (const resolver of resolvers) {
    const resolverFn = RESOLVER_FUNCTIONS[resolver]
    
    if (!resolverFn) {
      result.errors.push(`Unknown resolver: ${resolver}`)
      continue
    }
    
    try {
      const resolved = await resolverFn(context)
      
      for (const recipient of resolved) {
        const emailLower = recipient.email.toLowerCase()
        
        // Skip duplicates
        if (seenEmails.has(emailLower)) {
          result.skipped.push(`Duplicate email skipped: ${recipient.email}`)
          continue
        }
        
        // Skip excluded emails
        if (excludeEmails.has(emailLower)) {
          result.skipped.push(`Excluded email skipped: ${recipient.email} (action performer)`)
          continue
        }
        
        // Validate email format
        if (!isValidEmail(recipient.email)) {
          result.errors.push(`Invalid email format: ${recipient.email}`)
          continue
        }
        
        seenEmails.add(emailLower)
        result.recipients.push({
          ...recipient,
          email: emailLower, // Normalize to lowercase
        })
      }
    } catch (error: any) {
      result.errors.push(`Resolver ${resolver} failed: ${error.message}`)
    }
  }
  
  return result
}

/**
 * Simple email validation
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  resolveRequestor,
  resolveEntityOwner,
  resolveCurrentStageRole,
  resolveNextStageRole,
  resolvePreviousStageRole,
  resolveActionPerformer,
  resolveCompanyAdmin,
  resolveLocationAdmin,
  resolveFinanceAdmin,
  resolveVendor,
  resolveCustom,
  resolveUsersByRoles,
  lookupEmployee,
  lookupUser,
  lookupVendor,
}
