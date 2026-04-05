import { Clock, FlaskConical, GitPullRequestDraft, Home, Network, Settings } from 'lucide-react'
import { motion } from 'motion/react'
import { usePrReviewStore } from '../../store/pr-review-store'
import { useUiStore } from '../../store/ui-store'
import { Tooltip } from '../Tooltip'

export function NavRail() {
  const { sidebarView, setSidebarView, setSettingsOpen } = useUiStore()
  const unseenCount = usePrReviewStore((s) => s.unseenCount)

  return (
    <div
      className="flex w-14 flex-col items-center gap-0.5 border-base-border-subtle border-r bg-base-bg pt-12 pb-3"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      <Tooltip content="Sessions" shortcut="⌘⇧1" side="right">
        <NavButton
          active={sidebarView === 'home'}
          onClick={() => setSidebarView('home')}
          title="Sessions"
          label="Home"
          icon={Home}
        />
      </Tooltip>
      <Tooltip content="Session History" shortcut="⌘⇧2" side="right">
        <NavButton
          active={sidebarView === 'history'}
          onClick={() => setSidebarView(sidebarView === 'history' ? 'home' : 'history')}
          title="Session History"
          label="History"
          icon={Clock}
        />
      </Tooltip>
      <Tooltip content="PR Review" shortcut="⌘⇧3" side="right">
        <NavButton
          active={sidebarView === 'pr-review'}
          onClick={() => setSidebarView(sidebarView === 'pr-review' ? 'home' : 'pr-review')}
          title="PR Review"
          label="PRs"
          icon={GitPullRequestDraft}
          badge={unseenCount}
        />
      </Tooltip>
      <Tooltip content="AI Testing" shortcut="⌘⇧4" side="right">
        <NavButton
          active={sidebarView === 'testing'}
          onClick={() => setSidebarView(sidebarView === 'testing' ? 'home' : 'testing')}
          title="AI Testing"
          label="Test"
          icon={FlaskConical}
        />
      </Tooltip>
      <Tooltip content="Explore Codebase" shortcut="⌘⇧5" side="right">
        <NavButton
          active={sidebarView === 'ast'}
          onClick={() => setSidebarView(sidebarView === 'ast' ? 'home' : 'ast')}
          title="Explore Codebase"
          label="Code"
          icon={Network}
        />
      </Tooltip>

      <div className="mt-auto flex flex-col items-center gap-1">
        <Tooltip content="Settings" side="right">
          <motion.button
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ duration: 0.1 }}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-base-text-muted transition-colors hover:text-base-text"
          >
            <Settings size={18} />
          </motion.button>
        </Tooltip>
      </div>
    </div>
  )
}

function NavButton({
  active,
  onClick,
  title,
  label,
  icon: Icon,
  badge,
}: {
  active: boolean
  onClick: () => void
  title: string
  label: string
  icon: typeof Home
  badge?: number
}) {
  return (
    <motion.button
      onClick={onClick}
      title={title}
      aria-label={title}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      transition={{ duration: 0.1 }}
      className={`relative flex h-11 w-12 flex-col items-center justify-center gap-0.5 rounded-lg transition-colors ${
        active ? 'text-accent-text' : 'text-base-text-muted hover:text-base-text'
      }`}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          className="absolute inset-0 rounded-lg bg-accent/15"
          transition={{ duration: 0.15, ease: 'easeOut' }}
        />
      )}
      <Icon size={16} className="relative z-10" />
      <span className="relative z-10 text-[10px] leading-none">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute top-0 -right-0.5 z-20 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-info px-0.5 font-medium text-[9px] text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </motion.button>
  )
}
