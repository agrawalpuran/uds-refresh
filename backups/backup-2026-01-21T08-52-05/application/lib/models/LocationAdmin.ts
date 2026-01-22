import mongoose, { Schema, Document } from 'mongoose'

/**
 * LocationAdmin Model
 * 
 * Represents the relationship between an Employee and a Location for Location Admin role.
 * Similar to CompanyAdmin, but scoped to a specific Location.
 * 
 * Rules:
 * - One employee can be admin of multiple locations (if needed)
 * - One location can have only one admin (enforced via Location.adminId)
 * - This table provides reverse lookup: find all locations for which an employee is admin
 */
export interface ILocationAdmin extends Document {
  locationId: string // String ID reference to Location (6-digit numeric string)
  employeeId: string // Employee ID (6-digit numeric string, e.g., "300001") - matches Employee.id format
  createdAt?: Date
  updatedAt?: Date
}

const LocationAdminSchema = new Schema<ILocationAdmin>(
  {
    locationId: {
      type: String,
      required: true,
      
    },
    employeeId: {
      type: String,
      required: true,
      index: true,
      // Employee ID is a 6-digit numeric string (e.g., "300001")
      
    },
  },
  {
    timestamps: true,
  }
)

// Ensure one employee can only be admin of a location once (though Location.adminId enforces one admin per location)
LocationAdminSchema.index({ locationId: 1, employeeId: 1 }, { unique: true })
// Note: locationId and employeeId already have index: true in schema definitions
// LocationAdminSchema.index({ locationId: 1 }) // REMOVED: Duplicate of locationId: { index: true }
// LocationAdminSchema.index({ employeeId: 1 }) // REMOVED: Duplicate of employeeId: { index: true }

const LocationAdmin = mongoose.models.LocationAdmin || mongoose.model<ILocationAdmin>('LocationAdmin', LocationAdminSchema)

export default LocationAdmin

