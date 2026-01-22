import mongoose, { Schema, Document } from 'mongoose'

export interface IShipmentPackage extends Document {
  packageId: string
  packageName: string
  lengthCm: number
  breadthCm: number
  heightCm: number
  deadWeightKg?: number // Dead weight in kg (optional, for chargeable weight calculation)
  volumetricDivisor: number // Default: 5000
  isActive: boolean
  createdBy?: string
  updatedBy?: string
  createdAt: Date
  updatedAt: Date
}

const ShipmentPackageSchema = new Schema<IShipmentPackage>(
  {
    packageId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      maxlength: 15,
    },
    packageName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lengthCm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    breadthCm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    heightCm: {
      type: Number,
      required: true,
      min: 0.1,
    },
    deadWeightKg: {
      type: Number,
      required: false,
      min: 0,
    },
    volumetricDivisor: {
      type: Number,
      required: true,
      default: 5000,
      min: 1,
    },
    isActive: {
      type: Boolean,
      required: true,
      default: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: false,
      trim: true,
    },
    updatedBy: {
      type: String,
      required: false,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
)

// Virtual for calculated volumetric weight
ShipmentPackageSchema.virtual('volumetricWeightKg').get(function () {
  return (this.lengthCm * this.breadthCm * this.heightCm) / this.volumetricDivisor
})

// Ensure virtuals are included in JSON
ShipmentPackageSchema.set('toJSON', { virtuals: true })
ShipmentPackageSchema.set('toObject', { virtuals: true })

// Delete model if it exists to avoid recompilation issues
if (mongoose.models.ShipmentPackage) {
  delete mongoose.models.ShipmentPackage
}

const ShipmentPackage = mongoose.model<IShipmentPackage>('ShipmentPackage', ShipmentPackageSchema)

export default ShipmentPackage

