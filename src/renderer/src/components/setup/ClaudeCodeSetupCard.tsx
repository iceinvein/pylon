import { ExternalLink, Terminal } from 'lucide-react'
import type { ProviderSetupError } from '../../lib/setup-errors'

const CLAUDE_CODE_DOCS_URL = 'https://code.claude.com/docs'
const DEFAULT_TITLE = 'Claude Code Required'
const DEFAULT_DESCRIPTION =
  'This action requires Claude Code to be installed on your machine. Make sure the `claude` command works in Terminal, then retry.'
const DEFAULT_ACTION_LABEL = 'Install Claude Code'
const DEFAULT_COMMAND = 'claude'

type ClaudeCodeSetupCardProps = {
  errorMessage?: string | null
  setup?: ProviderSetupError
  title?: string
  description?: string
  compact?: boolean
}

export function ClaudeCodeSetupCard({
  errorMessage,
  setup,
  title,
  description,
  compact = false,
}: ClaudeCodeSetupCardProps) {
  const displayTitle = setup?.title ?? title ?? DEFAULT_TITLE
  const displayDescription = setup?.description ?? description ?? DEFAULT_DESCRIPTION
  const actionLabel = setup?.actionLabel ?? DEFAULT_ACTION_LABEL
  const actionUrl = setup?.actionUrl ?? CLAUDE_CODE_DOCS_URL
  const command = setup?.command ?? DEFAULT_COMMAND

  return (
    <div
      className={`rounded-xl border border-base-border bg-base-surface/70 ${compact ? 'p-3' : 'p-4'}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-base-raised text-base-text-secondary">
          <Terminal size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-base-text text-sm">{displayTitle}</div>
          <p className="mt-1 text-base-text-secondary text-xs leading-relaxed">
            {displayDescription}
          </p>
          <div className="mt-2 rounded-lg bg-base-bg px-2.5 py-2 font-mono text-[11px] text-base-text-muted">
            <div className="mb-2">
              <code className="rounded bg-base-raised px-1.5 py-0.5 text-[11px] text-base-text">
                {command}
              </code>
            </div>
            {errorMessage && <div>{errorMessage}</div>}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.open(actionUrl, '_blank')}
              className="inline-flex items-center gap-1.5 rounded-lg bg-base-raised px-3 py-1.5 text-base-text text-xs transition-colors hover:bg-base-border"
            >
              <ExternalLink size={12} />
              {actionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
