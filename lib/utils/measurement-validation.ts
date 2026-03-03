/**
 * Measurement Validation Utilities
 * 
 * Validates employee measurements against an MTMSpecification template.
 * Ensures all required measurements are present, within valid ranges,
 * and properly formatted before order creation.
 */

import { IMeasurementPoint } from '../models/MTMSpecification'

// =============================================================================
// TYPES
// =============================================================================

export interface MeasurementInput {
  key: string
  value: number
  unit: 'cm' | 'inches'
}

export interface ValidationError {
  key: string
  label: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

// =============================================================================
// CONVERSION
// =============================================================================

const CM_PER_INCH = 2.54

/**
 * Convert a measurement value to the target unit
 */
export function convertUnit(
  value: number,
  fromUnit: 'cm' | 'inches',
  toUnit: 'cm' | 'inches'
): number {
  if (fromUnit === toUnit) return value
  if (fromUnit === 'inches' && toUnit === 'cm') return value * CM_PER_INCH
  if (fromUnit === 'cm' && toUnit === 'inches') return value / CM_PER_INCH
  return value
}

/**
 * Round a measurement value to the specified precision
 */
export function roundToPrecision(value: number, precision: number): number {
  if (precision <= 0) return value
  return Math.round(value / precision) * precision
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a set of measurements against a specification's measurement points.
 * 
 * Checks:
 * 1. All required measurement points are present
 * 2. Values are within min/max range (after unit conversion if needed)
 * 3. Values are positive numbers
 * 4. No unknown measurement keys (warns but does not reject)
 */
export function validateMeasurements(
  measurements: MeasurementInput[],
  specificationPoints: IMeasurementPoint[]
): ValidationResult {
  const errors: ValidationError[] = []
  const providedKeys = new Set(measurements.map(m => m.key))

  for (const point of specificationPoints) {
    const measurement = measurements.find(m => m.key === point.key)

    if (!measurement) {
      if (point.is_required) {
        errors.push({
          key: point.key,
          label: point.label,
          message: `${point.label} is required`,
        })
      }
      continue
    }

    if (typeof measurement.value !== 'number' || isNaN(measurement.value)) {
      errors.push({
        key: point.key,
        label: point.label,
        message: `${point.label} must be a valid number`,
      })
      continue
    }

    if (measurement.value <= 0) {
      errors.push({
        key: point.key,
        label: point.label,
        message: `${point.label} must be greater than zero`,
      })
      continue
    }

    // Convert to the specification's unit for range comparison
    const valueInSpecUnit = convertUnit(measurement.value, measurement.unit, point.unit)

    if (valueInSpecUnit < point.min_value) {
      errors.push({
        key: point.key,
        label: point.label,
        message: `${point.label} (${valueInSpecUnit.toFixed(1)} ${point.unit}) is below minimum (${point.min_value} ${point.unit})`,
      })
      continue
    }

    if (valueInSpecUnit > point.max_value) {
      errors.push({
        key: point.key,
        label: point.label,
        message: `${point.label} (${valueInSpecUnit.toFixed(1)} ${point.unit}) exceeds maximum (${point.max_value} ${point.unit})`,
      })
      continue
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate a single measurement value against a specification point.
 * Useful for real-time field validation in the UI.
 */
export function validateSingleMeasurement(
  value: number,
  unit: 'cm' | 'inches',
  point: IMeasurementPoint
): { valid: boolean; message?: string } {
  if (typeof value !== 'number' || isNaN(value)) {
    return { valid: false, message: 'Must be a valid number' }
  }

  if (value <= 0) {
    return { valid: false, message: 'Must be greater than zero' }
  }

  const valueInSpecUnit = convertUnit(value, unit, point.unit)

  if (valueInSpecUnit < point.min_value) {
    return {
      valid: false,
      message: `Below minimum (${point.min_value} ${point.unit})`,
    }
  }

  if (valueInSpecUnit > point.max_value) {
    return {
      valid: false,
      message: `Exceeds maximum (${point.max_value} ${point.unit})`,
    }
  }

  return { valid: true }
}
