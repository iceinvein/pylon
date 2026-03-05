import type { ReactNode } from 'react'
import { NavRail } from './NavRail'
import { TabBar } from './TabBar'

type LayoutProps = {
  children: ReactNode
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-950 text-stone-100">
      {/* Drag region for macOS title bar */}
      <div className="fixed top-0 left-0 right-0 h-12 z-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties} />
      <NavRail />
      <div className="flex min-w-0 flex-1 flex-col pt-12">
        <TabBar />
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
