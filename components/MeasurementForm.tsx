'use client'

import { useState, useEffect } from 'react'
import { X, Ruler, Check, AlertCircle, Printer } from 'lucide-react'
import { validateSingleMeasurement } from '@/lib/utils/measurement-validation'

function MeasurementIllustration({ measurementKey, color = '#f76b1c' }: { measurementKey: string; color?: string }) {
  const body = (highlight: React.ReactNode) => (
    <svg viewBox="0 0 80 120" width="56" height="84" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Head */}
      <circle cx="40" cy="14" r="8" stroke="#d1d5db" strokeWidth="1.5" />
      {/* Neck */}
      <line x1="40" y1="22" x2="40" y2="28" stroke="#d1d5db" strokeWidth="1.5" />
      {/* Torso */}
      <path d="M26 28 L22 32 L20 60 L28 62 L40 64 L52 62 L60 60 L58 32 L54 28" stroke="#d1d5db" strokeWidth="1.5" strokeLinejoin="round" fill="#f9fafb" />
      {/* Left arm */}
      <path d="M22 32 L12 50 L10 72" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
      {/* Right arm */}
      <path d="M58 32 L68 50 L70 72" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
      {/* Left leg */}
      <path d="M28 62 L24 90 L22 114" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
      {/* Right leg */}
      <path d="M52 62 L56 90 L58 114" stroke="#d1d5db" strokeWidth="1.5" strokeLinecap="round" />
      {/* Measurement highlight */}
      {highlight}
    </svg>
  )

  const illustrations: Record<string, React.ReactNode> = {
    chest_girth: body(
      <g>
        <ellipse cx="40" cy="40" rx="20" ry="6" stroke={color} strokeWidth="2" strokeDasharray="4 2" fill="none" />
        <circle cx="60" cy="40" r="2.5" fill={color} />
      </g>
    ),
    shoulder_width: body(
      <g>
        <line x1="23" y1="30" x2="57" y2="30" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="23" y1="27" x2="23" y2="33" stroke={color} strokeWidth="2" />
        <line x1="57" y1="27" x2="57" y2="33" stroke={color} strokeWidth="2" />
      </g>
    ),
    arm_length: body(
      <g>
        <line x1="58" y1="32" x2="70" y2="72" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="55" y1="31" x2="61" y2="33" stroke={color} strokeWidth="2" />
        <line x1="67" y1="71" x2="73" y2="73" stroke={color} strokeWidth="2" />
      </g>
    ),
    neck_girth: body(
      <g>
        <ellipse cx="40" cy="25" rx="7" ry="3.5" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" />
        <circle cx="47" cy="25" r="2.5" fill={color} />
      </g>
    ),
    back_length: body(
      <g>
        <line x1="40" y1="22" x2="40" y2="60" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="37" y1="22" x2="43" y2="22" stroke={color} strokeWidth="2" />
        <line x1="37" y1="60" x2="43" y2="60" stroke={color} strokeWidth="2" />
      </g>
    ),
    bicep_girth: body(
      <g>
        <ellipse cx="64" cy="44" rx="5" ry="3.5" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" transform="rotate(-20 64 44)" />
        <circle cx="68" cy="42" r="2.5" fill={color} />
      </g>
    ),
    waist_girth: body(
      <g>
        <ellipse cx="40" cy="58" rx="18" ry="5" stroke={color} strokeWidth="2" strokeDasharray="4 2" fill="none" />
        <circle cx="58" cy="58" r="2.5" fill={color} />
      </g>
    ),
    hip_girth: body(
      <g>
        <ellipse cx="40" cy="66" rx="17" ry="5" stroke={color} strokeWidth="2" strokeDasharray="4 2" fill="none" />
        <circle cx="57" cy="66" r="2.5" fill={color} />
      </g>
    ),
    inseam_length: body(
      <g>
        <line x1="40" y1="64" x2="24" y2="90" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="24" y1="90" x2="22" y2="114" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="37" y1="64" x2="43" y2="64" stroke={color} strokeWidth="2" />
        <line x1="19" y1="114" x2="25" y2="114" stroke={color} strokeWidth="2" />
      </g>
    ),
    outseam_length: body(
      <g>
        <line x1="52" y1="60" x2="56" y2="90" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="56" y1="90" x2="58" y2="114" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="49" y1="60" x2="55" y2="60" stroke={color} strokeWidth="2" />
        <line x1="55" y1="114" x2="61" y2="114" stroke={color} strokeWidth="2" />
      </g>
    ),
    thigh_girth: body(
      <g>
        <ellipse cx="30" cy="74" rx="8" ry="4" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" transform="rotate(-5 30 74)" />
        <circle cx="38" cy="74" r="2.5" fill={color} />
      </g>
    ),
    knee_girth: body(
      <g>
        <ellipse cx="26" cy="90" rx="7" ry="3.5" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" transform="rotate(-3 26 90)" />
        <circle cx="33" cy="90" r="2.5" fill={color} />
      </g>
    ),
    calf_girth: body(
      <g>
        <ellipse cx="24" cy="100" rx="6" ry="3" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" transform="rotate(-2 24 100)" />
        <circle cx="30" cy="100" r="2.5" fill={color} />
      </g>
    ),
    bottom_width: body(
      <g>
        <line x1="18" y1="113" x2="28" y2="113" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="18" y1="110" x2="18" y2="116" stroke={color} strokeWidth="2" />
        <line x1="28" y1="110" x2="28" y2="116" stroke={color} strokeWidth="2" />
      </g>
    ),
    bottom_girth: body(
      <g>
        <ellipse cx="23" cy="112" rx="5" ry="2.5" stroke={color} strokeWidth="2" strokeDasharray="3 2" fill="none" />
        <circle cx="28" cy="112" r="2.5" fill={color} />
      </g>
    ),
    front_rise: body(
      <g>
        <line x1="40" y1="58" x2="40" y2="66" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="37" y1="58" x2="43" y2="58" stroke={color} strokeWidth="2" />
        <line x1="37" y1="66" x2="43" y2="66" stroke={color} strokeWidth="2" />
      </g>
    ),
    rise: body(
      <g>
        <line x1="40" y1="58" x2="40" y2="66" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="37" y1="58" x2="43" y2="58" stroke={color} strokeWidth="2" />
        <line x1="37" y1="66" x2="43" y2="66" stroke={color} strokeWidth="2" />
      </g>
    ),
  }

  const highlight = illustrations[measurementKey]
  if (highlight) return <>{highlight}</>

  // Fallback: generic ruler icon
  return (
    <svg viewBox="0 0 56 84" width="56" height="84" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="16" y="12" width="24" height="60" rx="3" stroke="#d1d5db" strokeWidth="1.5" fill="#f9fafb" />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line key={i} x1="16" y1={20 + i * 9} x2={i % 2 === 0 ? 28 : 24} y2={20 + i * 9} stroke={i === 2 ? color : '#d1d5db'} strokeWidth={i === 2 ? 2 : 1} />
      ))}
      <line x1="28" y1="38" x2="28" y2="38" stroke={color} strokeWidth="2" />
    </svg>
  )
}

function getMeasurementSvgString(key: string, color: string): string {
  const bodyStart = `<svg viewBox="0 0 80 120" width="48" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="40" cy="14" r="8" stroke="#d1d5db" stroke-width="1.5"/>
    <line x1="40" y1="22" x2="40" y2="28" stroke="#d1d5db" stroke-width="1.5"/>
    <path d="M26 28 L22 32 L20 60 L28 62 L40 64 L52 62 L60 60 L58 32 L54 28" stroke="#d1d5db" stroke-width="1.5" stroke-linejoin="round" fill="#f9fafb"/>
    <path d="M22 32 L12 50 L10 72" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M58 32 L68 50 L70 72" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M28 62 L24 90 L22 114" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M52 62 L56 90 L58 114" stroke="#d1d5db" stroke-width="1.5" stroke-linecap="round"/>`
  const bodyEnd = `</svg>`

  const highlights: Record<string, string> = {
    chest_girth: `<ellipse cx="40" cy="40" rx="20" ry="6" stroke="${color}" stroke-width="2" stroke-dasharray="4 2" fill="none"/><circle cx="60" cy="40" r="2.5" fill="${color}"/>`,
    shoulder_width: `<line x1="23" y1="30" x2="57" y2="30" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="23" y1="27" x2="23" y2="33" stroke="${color}" stroke-width="2"/><line x1="57" y1="27" x2="57" y2="33" stroke="${color}" stroke-width="2"/>`,
    arm_length: `<line x1="58" y1="32" x2="70" y2="72" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="55" y1="31" x2="61" y2="33" stroke="${color}" stroke-width="2"/><line x1="67" y1="71" x2="73" y2="73" stroke="${color}" stroke-width="2"/>`,
    neck_girth: `<ellipse cx="40" cy="25" rx="7" ry="3.5" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none"/><circle cx="47" cy="25" r="2.5" fill="${color}"/>`,
    back_length: `<line x1="40" y1="22" x2="40" y2="60" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="37" y1="22" x2="43" y2="22" stroke="${color}" stroke-width="2"/><line x1="37" y1="60" x2="43" y2="60" stroke="${color}" stroke-width="2"/>`,
    bicep_girth: `<ellipse cx="64" cy="44" rx="5" ry="3.5" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none" transform="rotate(-20 64 44)"/><circle cx="68" cy="42" r="2.5" fill="${color}"/>`,
    waist_girth: `<ellipse cx="40" cy="58" rx="18" ry="5" stroke="${color}" stroke-width="2" stroke-dasharray="4 2" fill="none"/><circle cx="58" cy="58" r="2.5" fill="${color}"/>`,
    hip_girth: `<ellipse cx="40" cy="66" rx="17" ry="5" stroke="${color}" stroke-width="2" stroke-dasharray="4 2" fill="none"/><circle cx="57" cy="66" r="2.5" fill="${color}"/>`,
    inseam_length: `<line x1="40" y1="64" x2="24" y2="90" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="24" y1="90" x2="22" y2="114" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="37" y1="64" x2="43" y2="64" stroke="${color}" stroke-width="2"/><line x1="19" y1="114" x2="25" y2="114" stroke="${color}" stroke-width="2"/>`,
    outseam_length: `<line x1="52" y1="60" x2="56" y2="90" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="56" y1="90" x2="58" y2="114" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="49" y1="60" x2="55" y2="60" stroke="${color}" stroke-width="2"/><line x1="55" y1="114" x2="61" y2="114" stroke="${color}" stroke-width="2"/>`,
    thigh_girth: `<ellipse cx="30" cy="74" rx="8" ry="4" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none" transform="rotate(-5 30 74)"/><circle cx="38" cy="74" r="2.5" fill="${color}"/>`,
    knee_girth: `<ellipse cx="26" cy="90" rx="7" ry="3.5" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none" transform="rotate(-3 26 90)"/><circle cx="33" cy="90" r="2.5" fill="${color}"/>`,
    calf_girth: `<ellipse cx="24" cy="100" rx="6" ry="3" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none" transform="rotate(-2 24 100)"/><circle cx="30" cy="100" r="2.5" fill="${color}"/>`,
    bottom_width: `<line x1="18" y1="113" x2="28" y2="113" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="18" y1="110" x2="18" y2="116" stroke="${color}" stroke-width="2"/><line x1="28" y1="110" x2="28" y2="116" stroke="${color}" stroke-width="2"/>`,
    bottom_girth: `<ellipse cx="23" cy="112" rx="5" ry="2.5" stroke="${color}" stroke-width="2" stroke-dasharray="3 2" fill="none"/><circle cx="28" cy="112" r="2.5" fill="${color}"/>`,
    front_rise: `<line x1="40" y1="58" x2="40" y2="66" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="37" y1="58" x2="43" y2="58" stroke="${color}" stroke-width="2"/><line x1="37" y1="66" x2="43" y2="66" stroke="${color}" stroke-width="2"/>`,
    rise: `<line x1="40" y1="58" x2="40" y2="66" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/><line x1="37" y1="58" x2="43" y2="58" stroke="${color}" stroke-width="2"/><line x1="37" y1="66" x2="43" y2="66" stroke="${color}" stroke-width="2"/>`,
  }

  const hl = highlights[key]
  if (hl) return `${bodyStart}${hl}${bodyEnd}`

  return `<svg viewBox="0 0 56 84" width="48" height="72" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="16" y="12" width="24" height="60" rx="3" stroke="#d1d5db" stroke-width="1.5" fill="#f9fafb"/>
    <line x1="16" y1="20" x2="28" y2="20" stroke="#d1d5db" stroke-width="1"/><line x1="16" y1="29" x2="24" y2="29" stroke="#d1d5db" stroke-width="1"/>
    <line x1="16" y1="38" x2="28" y2="38" stroke="${color}" stroke-width="2"/><line x1="16" y1="47" x2="24" y2="47" stroke="#d1d5db" stroke-width="1"/>
    <line x1="16" y1="56" x2="28" y2="56" stroke="#d1d5db" stroke-width="1"/><line x1="16" y1="65" x2="24" y2="65" stroke="#d1d5db" stroke-width="1"/>
  </svg>`
}

interface MeasurementPoint {
  key: string
  label: string
  description: string
  iso_reference?: string
  unit: 'cm' | 'inches'
  min_value: number
  max_value: number
  precision: number
  is_required: boolean
  display_order: number
}

interface MeasurementValue {
  value: number
  unit: 'cm' | 'inches'
}

interface MeasurementFormProps {
  isOpen: boolean
  onClose: () => void
  onSave: (measurements: Record<string, MeasurementValue>, instructions: string) => void
  measurementPoints: MeasurementPoint[]
  productName: string
  existingMeasurements?: Record<string, MeasurementValue>
  existingInstructions?: string
  primaryColor?: string
}

export default function MeasurementForm({
  isOpen,
  onClose,
  onSave,
  measurementPoints,
  productName,
  existingMeasurements,
  existingInstructions,
  primaryColor = '#f76b1c',
}: MeasurementFormProps) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [instructions, setInstructions] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (isOpen) {
      if (existingMeasurements) {
        const initial: Record<string, string> = {}
        Object.entries(existingMeasurements).forEach(([key, val]) => {
          initial[key] = val.value.toString()
        })
        setValues(initial)
      } else {
        setValues({})
      }
      setInstructions(existingInstructions || '')
      setErrors({})
      setTouched({})
    }
  }, [isOpen, existingMeasurements, existingInstructions])

  if (!isOpen) return null

  const sortedPoints = [...measurementPoints].sort((a, b) => a.display_order - b.display_order)

  const handleChange = (key: string, rawValue: string) => {
    setValues(prev => ({ ...prev, [key]: rawValue }))
    setTouched(prev => ({ ...prev, [key]: true }))

    const point = measurementPoints.find(p => p.key === key)
    if (!point) return

    const numValue = parseFloat(rawValue)
    if (rawValue === '' || isNaN(numValue)) {
      if (point.is_required) {
        setErrors(prev => ({ ...prev, [key]: `${point.label} is required` }))
      } else {
        setErrors(prev => { const copy = { ...prev }; delete copy[key]; return copy })
      }
      return
    }

    const result = validateSingleMeasurement(numValue, point.unit, point)
    if (!result.valid) {
      setErrors(prev => ({ ...prev, [key]: result.message || 'Invalid' }))
    } else {
      setErrors(prev => { const copy = { ...prev }; delete copy[key]; return copy })
    }
  }

  const handleSave = () => {
    const newErrors: Record<string, string> = {}
    const allTouched: Record<string, boolean> = {}

    for (const point of sortedPoints) {
      allTouched[point.key] = true
      const raw = values[point.key]

      if (!raw || raw.trim() === '') {
        if (point.is_required) {
          newErrors[point.key] = `${point.label} is required`
        }
        continue
      }

      const numValue = parseFloat(raw)
      if (isNaN(numValue)) {
        newErrors[point.key] = 'Must be a valid number'
        continue
      }

      const result = validateSingleMeasurement(numValue, point.unit, point)
      if (!result.valid) {
        newErrors[point.key] = result.message || 'Invalid'
      }
    }

    setTouched(allTouched)
    setErrors(newErrors)

    if (Object.keys(newErrors).length > 0) return

    const measurements: Record<string, MeasurementValue> = {}
    for (const point of sortedPoints) {
      const raw = values[point.key]
      if (raw && raw.trim() !== '') {
        measurements[point.key] = {
          value: parseFloat(raw),
          unit: point.unit,
        }
      }
    }

    onSave(measurements, instructions)
  }

  const filledCount = sortedPoints.filter(p => {
    const raw = values[p.key]
    return raw && raw.trim() !== '' && !errors[p.key]
  }).length
  const requiredCount = sortedPoints.filter(p => p.is_required).length
  const hasErrors = Object.keys(errors).length > 0

  const handlePrint = () => {
    const today = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })

    const rows = sortedPoints.map(point => {
      const svg = getMeasurementSvgString(point.key, primaryColor)
      return `
        <tr>
          <td class="illus">${svg}</td>
          <td>
            <strong>${point.label}${point.is_required ? ' <span class="req">*</span>' : ''}</strong>
            <br/><span class="desc">${point.description}</span>
          </td>
          <td class="range">${point.min_value} – ${point.max_value} ${point.unit}</td>
          <td class="value-box"></td>
        </tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>Measurement Form – ${productName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1f2937; padding: 24px; max-width: 800px; margin: 0 auto; }
  .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 12px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { font-size: 20px; color: ${primaryColor}; }
  .header .sub { font-size: 13px; color: #6b7280; }
  .meta { font-size: 12px; color: #6b7280; text-align: right; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f9fafb; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; color: #6b7280; border-bottom: 2px solid #e5e7eb; }
  td { padding: 10px 8px; border-bottom: 1px solid #e5e7eb; vertical-align: middle; font-size: 13px; }
  .illus { width: 56px; padding: 4px; }
  .range { width: 110px; font-size: 11px; color: #9ca3af; text-align: center; }
  .value-box { width: 120px; }
  .value-box::after { content: ''; display: block; border-bottom: 1.5px solid #d1d5db; width: 100%; margin-top: 20px; }
  .req { color: #ef4444; }
  .desc { font-size: 11px; color: #9ca3af; }
  .instructions { border: 1px solid #e5e7eb; border-radius: 6px; padding: 12px; min-height: 60px; margin-top: 8px; }
  .instructions-label { font-size: 13px; font-weight: 600; color: #374151; }
  .footer { margin-top: 24px; padding-top: 12px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; text-align: center; }
  @media print {
    body { padding: 12px; }
    .no-print { display: none !important; }
  }
</style></head><body>
  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="padding:8px 24px;background:${primaryColor};color:#fff;border:none;border-radius:6px;font-size:14px;cursor:pointer;">Print this page</button>
  </div>
  <div class="header">
    <div>
      <h1>Body Measurement Form</h1>
      <div class="sub">${productName} — Custom Fit (Made-to-Measure)</div>
    </div>
    <div class="meta">Date: ${today}<br/>Fields marked <span class="req">*</span> are required</div>
  </div>
  <table>
    <thead><tr><th></th><th>Measurement</th><th>Range</th><th>Your Value</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div>
    <div class="instructions-label">Special Instructions (optional):</div>
    <div class="instructions"></div>
  </div>
  <div class="footer">
    After measurements are taken, enter the values in the UDS Employee Portal &rarr; Catalog &rarr; select the product &rarr; Enter Measurements.
  </div>
</body></html>`

    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(html)
      printWindow.document.close()
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Custom Fit Measurements</h2>
            <p className="text-sm text-gray-500">{productName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Progress */}
        <div className="px-6 py-3 bg-gray-50 border-b border-gray-100">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{filledCount} of {sortedPoints.length} measurements entered</span>
            <span>{requiredCount} required</span>
          </div>
          <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${(filledCount / sortedPoints.length) * 100}%`,
                backgroundColor: hasErrors ? '#ef4444' : primaryColor,
              }}
            />
          </div>
        </div>

        {/* Measurement Fields */}
        <div className="px-6 py-4 space-y-4">
          {sortedPoints.map((point) => {
            const hasError = touched[point.key] && errors[point.key]
            const isValid = touched[point.key] && values[point.key] && !errors[point.key]

            return (
              <div key={point.key} className="flex gap-3 items-start border-b border-gray-100 pb-4 last:border-0">
                <div className="flex-shrink-0 pt-0.5 bg-gray-50 rounded-lg p-1">
                  <MeasurementIllustration measurementKey={point.key} color={primaryColor} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-medium text-gray-700 mb-0.5">
                    {point.label}
                    {point.is_required && <span className="text-red-500 ml-0.5">*</span>}
                    <span className="font-normal text-gray-400 ml-1">({point.unit})</span>
                  </label>
                  <p className="text-xs text-gray-400 mb-1.5">{point.description}</p>
                  <div className="relative">
                    <input
                      type="number"
                      step={point.precision}
                      min={point.min_value}
                      max={point.max_value}
                      value={values[point.key] || ''}
                      onChange={(e) => handleChange(point.key, e.target.value)}
                      placeholder={`${point.min_value} – ${point.max_value} ${point.unit}`}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent outline-none text-sm pr-8 ${
                        hasError
                          ? 'border-red-400 focus:ring-red-300'
                          : isValid
                          ? 'border-green-400 focus:ring-green-300'
                          : 'border-gray-300 focus:ring-blue-500'
                      }`}
                    />
                    <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
                      {isValid && <Check className="h-4 w-4 text-green-500" />}
                      {hasError && <AlertCircle className="h-4 w-4 text-red-500" />}
                    </div>
                  </div>
                  {hasError && (
                    <p className="mt-1 text-xs text-red-500">{errors[point.key]}</p>
                  )}
                </div>
              </div>
            )
          })}

          {/* Special Instructions */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Special Instructions
              <span className="font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="e.g., Slightly loose fit preferred, Extra room in shoulders"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-between">
          <button
            onClick={handlePrint}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-100 transition-colors text-sm flex items-center gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print Form
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 text-white rounded-lg font-medium hover:opacity-90 transition-opacity text-sm flex items-center gap-1.5"
              style={{ backgroundColor: primaryColor }}
            >
              <Ruler className="h-4 w-4" />
              Save Measurements
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
