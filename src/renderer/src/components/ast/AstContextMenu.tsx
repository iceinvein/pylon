import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { useCallback, useEffect } from 'react'

type AstContextMenuProps = {
  x: number
  y: number
  nodeId: string
  nodeName: string
  filePath: string
  onClose: () => void
  onExplain: (nodeId: string, nodeName: string, filePath: string) => void
}

export function AstContextMenu({
  x,
  y,
  nodeId,
  nodeName,
  filePath,
  onClose,
  onExplain,
}: AstContextMenuProps) {
  const handleExplain = useCallback(() => {
    onExplain(nodeId, nodeName, filePath)
    onClose()
  }, [nodeId, nodeName, filePath, onExplain, onClose])

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [onClose])

  return (
    <AnimatePresence>
      {/* Backdrop overlay to catch clicks away */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-50"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.1 }}
      />

      {/* Menu */}
      <motion.div
        key="menu"
        className="fixed z-50 rounded-lg border border-base-border bg-base-surface shadow-xl"
        style={{ left: x, top: y }}
        initial={{ opacity: 0, scale: 0.95, y: -4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.12 }}
      >
        <div className="py-1">
          <button
            type="button"
            onClick={handleExplain}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-base-text text-sm transition-colors hover:bg-base-bg-subtle"
          >
            <Sparkles size={14} className="text-amber-400" />
            Explain with Claude
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
