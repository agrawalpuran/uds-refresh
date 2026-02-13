'use client'

import { useState, useEffect } from 'react'
import { X, Ruler } from 'lucide-react'
import Image from 'next/image'

interface SizeChartModalProps {
  isOpen: boolean
  onClose: () => void
  /** URL to size chart image; empty string = show "not available" message (Myntra/Amazon-style static link) */
  imageUrl: string
  productName: string
}

export default function SizeChartModal({
  isOpen,
  onClose,
  imageUrl,
  productName,
}: SizeChartModalProps) {
  const [imageLoadError, setImageLoadError] = useState(false)

  useEffect(() => {
    if (isOpen) setImageLoadError(false)
  }, [isOpen, imageUrl])

  if (!isOpen) return null

  const hasImage = Boolean(imageUrl?.trim())
  const showNotAvailable = !hasImage || imageLoadError

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
            Size Guide – {productName}
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
          {showNotAvailable ? (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
              <div className="rounded-full bg-gray-100 p-4 mb-4">
                <Ruler className="h-10 w-10 text-gray-400" />
              </div>
              <p className="text-gray-600 font-medium">Not available at the moment.</p>
            </div>
          ) : (
            <div className="relative w-full" style={{ minHeight: '400px' }}>
              <Image
                src={imageUrl}
                alt={`Size chart for ${productName} – M, L, XL measurements`}
                width={800}
                height={1000}
                className="w-full h-auto object-contain"
                unoptimized={true}
                onError={() => setImageLoadError(true)}
              />
            </div>
          )}
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

