// src/renderer/src/components/EmptyState.tsx
import logoUrl from '../assets/logo.png'

export function EmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <img src={logoUrl} alt="Pylon" className="h-16 w-16 opacity-40" />
      <p className="mt-4 text-xs text-base-text-faint">
        <kbd className="rounded border border-base-border/50 bg-base-raised/40 px-1.5 py-0.5 text-[10px]">
          ⌘N
        </kbd>
        <span className="ml-2">New session</span>
      </p>
    </div>
  )
}
