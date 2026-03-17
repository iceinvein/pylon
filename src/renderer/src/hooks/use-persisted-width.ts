import { useCallback, useRef, useState } from 'react'

const STORAGE_PREFIX = 'pylon:panel-width:'

type UsePersistedWidthOptions = {
  /** Unique key for localStorage (e.g. 'changes-panel') */
  key: string
  /** Default width when no stored value exists */
  defaultWidth: number
  /** Minimum allowed width */
  min: number
  /** Maximum allowed width */
  max: number
  /**
   * Drag direction:
   * - 'left': panel is on the right side, dragging left makes it wider (SessionView panels)
   * - 'right': panel is on the left side, dragging right makes it wider (TestView sidebar)
   */
  direction: 'left' | 'right'
}

function readStored(key: string, fallback: number, min: number, max: number): number {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key)
    if (raw === null) return fallback
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return fallback
    return Math.min(max, Math.max(min, parsed))
  } catch {
    return fallback
  }
}

function writeStored(key: string, value: number): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(value))
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

export function usePersistedWidth({
  key,
  defaultWidth,
  min,
  max,
  direction,
}: UsePersistedWidthOptions) {
  const [width, setWidth] = useState(() => readStored(key, defaultWidth, min, max))
  const dragging = useRef(false)
  const dragStartX = useRef(0)
  const dragStartWidth = useRef(0)

  const onDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      dragging.current = true
      dragStartX.current = e.clientX
      dragStartWidth.current = width

      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'

      const handleMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return
        const delta =
          direction === 'left' ? dragStartX.current - ev.clientX : ev.clientX - dragStartX.current
        setWidth(Math.min(max, Math.max(min, dragStartWidth.current + delta)))
      }

      const handleMouseUp = (ev: MouseEvent) => {
        dragging.current = false
        document.body.style.userSelect = ''
        document.body.style.cursor = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)

        // Persist final width on release
        const delta =
          direction === 'left' ? dragStartX.current - ev.clientX : ev.clientX - dragStartX.current
        const finalWidth = Math.min(max, Math.max(min, dragStartWidth.current + delta))
        writeStored(key, finalWidth)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [width, key, min, max, direction],
  )

  return { width, onDragStart } as const
}
