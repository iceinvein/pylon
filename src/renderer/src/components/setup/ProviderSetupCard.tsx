import { ExternalLink, Terminal } from 'lucide-react'
import type { ProviderSetupError } from '../../lib/setup-errors'

type ProviderSetupCardProps = {
  errorMessage?: string | null
  setup: ProviderSetupError
  compact?: boolean
}

export function ProviderSetupCard({
  errorMessage,
  setup,
  compact = false,
}: ProviderSetupCardProps) {
  return (
    <div
      className={`rounded-xl border border-base-border bg-base-surface/70 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-raised text-base-text-secondary">
          <Terminal size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-base-text text-sm">{setup.title}</div>
          <p className="mt-1 text-base-text-secondary text-xs leading-relaxed">
            {setup.description}
          </p>
          <div className="mt-2 rounded-lg bg-base-bg px-2.5 py-2 font-mono text-[11px] text-base-text-muted">
            <div className="mb-2">
              <code className="rounded bg-base-raised px-1.5 py-0.5 text-[11px] text-base-text">
                {setup.command}
              </code>
            </div>
            {errorMessage && <div>{errorMessage}</div>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open(setup.actionUrl, '_blank')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-base-raised px-3 py-1.5 text-base-text text-xs transition-colors hover:bg-base-border"
            >
              <ExternalLink size={12} />
              {setup.actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
