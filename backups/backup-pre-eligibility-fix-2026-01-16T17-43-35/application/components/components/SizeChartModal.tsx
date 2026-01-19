'use client'

import { X } from 'lucide-react'
import Image from 'next/image'

interface SizeChartModalProps {
  isOpen: boolean
  onClose: () => void
  imageUrl: string
  productName: string
}

export default function SizeChartModal({
  isOpen,
  onClose,
  imageUrl,
  productName,
}: SizeChartModalProps) {
  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-xl font-bold text-gray-900">
            Size Chart - {productName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="relative w-full" style={{ minHeight: '400px' }}>
            <Image
              src={imageUrl}
              alt={`Size chart for ${productName}`}
              width={800}
              height={1000}
              className="w-full h-auto object-contain"
              unoptimized={true}
              onError={(e) => {
                const target = e.target as HTMLImageElement
                target.src = '/images/uniforms/default.jpg'
                target.alt = 'Size chart image not available'
              }}
            />
          </div>
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

