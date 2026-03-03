'use client'

import { Scissors } from 'lucide-react'

interface MTMBadgeProps {
  size?: 'sm' | 'md'
  className?: string
}

export default function MTMBadge({ size = 'sm', className = '' }: MTMBadgeProps) {
  const sizeClasses = size === 'sm'
    ? 'text-[10px] px-1.5 py-0.5 gap-0.5'
    : 'text-xs px-2 py-1 gap-1'
  const iconSize = size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  return (
    <span className={`inline-flex items-center ${sizeClasses} bg-violet-50 text-violet-700 border border-violet-200 rounded font-medium ${className}`}>
      <Scissors className={iconSize} />
      Custom Fit
    </span>
  )
}
