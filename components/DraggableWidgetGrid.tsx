'use client'

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { GridLayout } from 'react-grid-layout'
import type { Layout } from 'react-grid-layout'
import { GripVertical, RotateCcw, Lock, Unlock } from 'lucide-react'

// Import CSS for react-grid-layout
import 'react-grid-layout/css/styles.css'

// ============================================================================
// TYPES
// ============================================================================
export interface WidgetConfig {
  id: string
  title: string
  component: React.ReactNode
  defaultLayout: {
    x: number
    y: number
    w: number
    h: number
    minW?: number
    minH?: number
    maxW?: number
    maxH?: number
  }
}

interface DraggableWidgetGridProps {
  widgets: WidgetConfig[]
  storageKey: string
  cols?: number
  rowHeight?: number
  companyPrimaryColor?: string
  className?: string
}

// ============================================================================
// COMPONENT
// ============================================================================
export default function DraggableWidgetGrid({
  widgets,
  storageKey,
  cols = 12,
  rowHeight = 100,
  companyPrimaryColor = '#f97316',
  className = ''
}: DraggableWidgetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [layout, setLayout] = useState<Layout[]>([])
  const [isLocked, setIsLocked] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // Measure container width - run after mount
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const width = containerRef.current.getBoundingClientRect().width
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    }
    
    // Initial measurement - try multiple times to ensure we get a valid width
    updateWidth()
    
    // Backup measurements in case first one fails
    const timerId1 = setTimeout(updateWidth, 50)
    const timerId2 = setTimeout(updateWidth, 200)
    
    // ResizeObserver for ongoing updates
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        if (width > 0) {
          setContainerWidth(width)
        }
      }
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }
    
    // Window resize listener as fallback
    window.addEventListener('resize', updateWidth)
    
    return () => {
      clearTimeout(timerId1)
      clearTimeout(timerId2)
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateWidth)
    }
  }, [mounted]) // Re-run when mounted changes

  // Generate default layout from widget configs
  const defaultLayout = useMemo(() => {
    return widgets.map(widget => ({
      i: widget.id,
      x: widget.defaultLayout.x,
      y: widget.defaultLayout.y,
      w: widget.defaultLayout.w,
      h: widget.defaultLayout.h,
      minW: widget.defaultLayout.minW || 3,
      minH: widget.defaultLayout.minH || 2,
      maxW: widget.defaultLayout.maxW,
      maxH: widget.defaultLayout.maxH,
    }))
  }, [widgets])

  // Load saved layout from localStorage
  useEffect(() => {
    setMounted(true)
    
    try {
      const savedLayout = localStorage.getItem(`widget-layout-${storageKey}`)
      const savedLock = localStorage.getItem(`widget-locked-${storageKey}`)
      
      if (savedLayout) {
        const parsed = JSON.parse(savedLayout) as Layout[]
        // Merge saved positions with current widget list (handles new/removed widgets)
        const mergedLayout = widgets.map(widget => {
          const saved = parsed.find(l => l.i === widget.id)
          if (saved) {
            return {
              ...saved,
              minW: widget.defaultLayout.minW || 3,
              minH: widget.defaultLayout.minH || 2,
              maxW: widget.defaultLayout.maxW,
              maxH: widget.defaultLayout.maxH,
            }
          }
          return {
            i: widget.id,
            ...widget.defaultLayout,
            minW: widget.defaultLayout.minW || 3,
            minH: widget.defaultLayout.minH || 2,
          }
        })
        setLayout(mergedLayout)
      } else {
        setLayout(defaultLayout)
      }
      
      if (savedLock) {
        setIsLocked(JSON.parse(savedLock))
      }
    } catch (error) {
      console.error('Error loading widget layout:', error)
      setLayout(defaultLayout)
    }
  }, [storageKey, defaultLayout, widgets])

  // Save layout changes to localStorage
  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    setLayout(newLayout)
    try {
      localStorage.setItem(`widget-layout-${storageKey}`, JSON.stringify(newLayout))
    } catch (error) {
      console.error('Error saving widget layout:', error)
    }
  }, [storageKey])

  // Toggle lock state
  const toggleLock = useCallback(() => {
    const newLockState = !isLocked
    setIsLocked(newLockState)
    try {
      localStorage.setItem(`widget-locked-${storageKey}`, JSON.stringify(newLockState))
    } catch (error) {
      console.error('Error saving lock state:', error)
    }
  }, [isLocked, storageKey])

  // Reset to default layout
  const resetLayout = useCallback(() => {
    setLayout(defaultLayout)
    try {
      localStorage.removeItem(`widget-layout-${storageKey}`)
    } catch (error) {
      console.error('Error resetting layout:', error)
    }
  }, [defaultLayout, storageKey])

  // Don't render until mounted (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className={`space-y-6 ${className}`}>
        {widgets.map(widget => (
          <div key={widget.id} className="bg-white rounded-xl border border-gray-100 shadow-sm animate-pulse">
            <div className="h-64 flex items-center justify-center">
              <div className="text-gray-400">Loading...</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className={`w-full ${className}`} ref={containerRef}>
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-2 mb-4">
        <div className="flex items-center gap-1 text-xs text-gray-500 mr-2">
          <GripVertical className="h-3 w-3" />
          <span className="hidden sm:inline">Drag widgets to rearrange</span>
        </div>
        <button
          onClick={resetLayout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          title="Reset to default layout"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </button>
        <button
          onClick={toggleLock}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
            isLocked 
              ? 'text-white' 
              : 'text-gray-600 bg-gray-100 hover:bg-gray-200'
          }`}
          style={isLocked ? { backgroundColor: companyPrimaryColor } : {}}
          title={isLocked ? 'Unlock widgets' : 'Lock widgets'}
        >
          {isLocked ? (
            <>
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Locked</span>
            </>
          ) : (
            <>
              <Unlock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Unlocked</span>
            </>
          )}
        </button>
      </div>

      {/* Grid - use measured width or calculate from container */}
      <GridLayout
        className="layout"
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        width={containerWidth || 1200}
        onLayoutChange={handleLayoutChange}
        isDraggable={!isLocked}
        isResizable={!isLocked}
        draggableHandle=".widget-drag-handle"
        onDragStart={() => setIsDragging(true)}
        onDragStop={() => setIsDragging(false)}
        onResizeStart={() => setIsDragging(true)}
        onResizeStop={() => setIsDragging(false)}
        margin={[12, 12]}
        containerPadding={[0, 0]}
        useCSSTransforms={true}
        compactType="vertical"
        preventCollision={false}
      >
        {widgets.map(widget => (
          <div 
            key={widget.id} 
            className={`widget-container bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
              isDragging ? 'border-gray-300' : 'border-gray-100'
            } ${!isLocked ? 'hover:shadow-md' : ''}`}
          >
            {/* Drag Handle */}
            {!isLocked && (
              <div 
                className="widget-drag-handle absolute top-0 left-0 right-0 h-8 cursor-grab active:cursor-grabbing z-10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                style={{ 
                  background: 'linear-gradient(to bottom, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.8) 70%, transparent 100%)'
                }}
              >
                <div 
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium"
                  style={{ color: companyPrimaryColor }}
                >
                  <GripVertical className="h-3.5 w-3.5" />
                  <span>Drag to move</span>
                </div>
              </div>
            )}
            
            {/* Widget Content */}
            <div className="h-full overflow-auto">
              {widget.component}
            </div>

            {/* Resize Handle Indicator */}
            {!isLocked && (
              <div 
                className="absolute bottom-0 right-0 w-4 h-4 opacity-30 hover:opacity-60 transition-opacity pointer-events-none"
                style={{
                  background: `linear-gradient(135deg, transparent 50%, ${companyPrimaryColor} 50%)`
                }}
              />
            )}
          </div>
        ))}
      </GridLayout>

      {/* Inline styles for grid layout */}
      <style jsx global>{`
        .react-grid-layout {
          min-width: 100% !important;
        }
        
        .react-grid-item.react-grid-placeholder {
          background: ${companyPrimaryColor}20 !important;
          border: 2px dashed ${companyPrimaryColor} !important;
          border-radius: 12px !important;
          opacity: 1 !important;
        }
        
        .react-grid-item > .react-resizable-handle {
          width: 16px !important;
          height: 16px !important;
          bottom: 4px !important;
          right: 4px !important;
          background: none !important;
          cursor: se-resize !important;
        }
        
        .react-grid-item > .react-resizable-handle::after {
          content: '' !important;
          position: absolute !important;
          right: 3px !important;
          bottom: 3px !important;
          width: 8px !important;
          height: 8px !important;
          border-right: 2px solid ${companyPrimaryColor}60 !important;
          border-bottom: 2px solid ${companyPrimaryColor}60 !important;
        }

        .widget-container {
          display: flex;
          flex-direction: column;
        }
      `}</style>
    </div>
  )
}
