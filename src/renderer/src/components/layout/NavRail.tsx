import { Clock, FlaskConical, GitPullRequestDraft, Home, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { useUiStore } from '../../store/ui-store'

export function NavRail() {
  const { sidebarView, setSidebarView, setSettingsOpen } = useUiStore()
  const unseenCount = usePrReviewStore((s) => s.unseenCount)

  return (
    <div
      className="flex w-[52px] flex-col items-center gap-1.5 border-[var(--color-base-border-subtle)] border-r bg-[var(--color-base-bg)] pt-12 pb-3"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <NavButton
        active={sidebarView === 'home'}
        onClick={() => setSidebarView('home')}
        title="Home"
        icon={Home}
      />
      <NavButton
        active={sidebarView === 'history'}
        onClick={() => setSidebarView(sidebarView === 'history' ? 'home' : 'history')}
        title="Session History"
        icon={Clock}
      />
      <NavButton
        active={sidebarView === 'pr-review'}
        onClick={() => setSidebarView(sidebarView === 'pr-review' ? 'home' : 'pr-review')}
        title="PR Review"
        icon={GitPullRequestDraft}
        badge={unseenCount}
      />
      <NavButton
        active={sidebarView === 'testing'}
        onClick={() => setSidebarView(sidebarView === 'testing' ? 'home' : 'testing')}
        title="AI Testing"
        icon={FlaskConical}
      />

      <div className="mt-auto flex flex-col items-center gap-1">
        <motion.button
          onClick={() => setSettingsOpen(true)}
          title="Settings"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
          className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--color-base-text-muted)] transition-colors hover:text-[var(--color-base-text)]"
        >
          <Settings size={18} />
        </motion.button>
      </div>
    </div>
  )
}

function NavButton({
  active,
  onClick,
  title,
  icon: Icon,
  badge,
}: {
  active: boolean
  onClick: () => void
  title: string
  icon: typeof Home
  badge?: number
}) {
  return (
    <motion.button
      onClick={onClick}
      title={title}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
        active
          ? 'text-[var(--color-accent-text)]'
          : 'text-[var(--color-base-text-muted)] hover:text-[var(--color-base-text)]'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg bg-[var(--color-accent)]/15"
          transition={{ duration: 0.15, ease: 'easeOut' }}
        />
      )}
      <Icon size={18} className="relative z-10" />
      {badge != null && badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 z-20 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[10px] font-medium text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </motion.button>
  )
}
