import { FileText } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { PrRaiseInfo } from '../../../../shared/types'
import { parseUnifiedDiffToHunks } from '../../lib/diff-utils'

/** Split a multi-file unified diff into per-file sections */
function splitDiff(fullDiff: string): Map<string, string> {
  const fileDiffs = new Map<string, string>()
  const sections = fullDiff.split(/^(?=diff --git )/m)
  for (const section of sections) {
    if (!section.trim()) continue
    const bMatch = section.match(/^\+\+\+ b\/(.+)$/m)
    const aMatch = section.match(/^diff --git a\/(.+?) b\//)
    const name = bMatch?.[1] ?? aMatch?.[1] ?? 'unknown'
    fileDiffs.set(name, section)
  }
  return fileDiffs
}

type Props = {
  info: PrRaiseInfo
}

export function PrRaiseFiles({ info }: Props) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const fileDiffMap = useMemo(() => splitDiff(info.diff), [info.diff])

  const activeFile = selectedFile ?? info.files[0]?.path ?? null
  const activeDiff = activeFile ? fileDiffMap.get(activeFile) : null
  const hunks = useMemo(() => (activeDiff ? parseUnifiedDiffToHunks(activeDiff) : []), [activeDiff])

  return (
    <div className="flex h-full min-h-0">
      {/* File tree */}
      <div className="w-56 flex-shrink-0 overflow-y-auto border-[var(--color-base-border-subtle)] border-r">
        {info.files.map((file) => (
          <button
            key={file.path}
            type="button"
            onClick={() => setSelectedFile(file.path)}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
              activeFile === file.path
                ? 'bg-[var(--color-base-raised)] text-[var(--color-base-text)]'
                : 'text-[var(--color-base-text-secondary)] hover:bg-[var(--color-base-raised)]/50 hover:text-[var(--color-base-text)]'
            }`}
          >
            <FileText size={12} className="flex-shrink-0 text-[var(--color-base-text-faint)]" />
            <span className="min-w-0 truncate font-[family-name:var(--font-mono)]">
              {file.path.split('/').pop()}
            </span>
            <span className="ml-auto flex gap-1 text-[10px]">
              {file.insertions > 0 && (
                <span className="text-[var(--color-success)]">+{file.insertions}</span>
              )}
              {file.deletions > 0 && (
                <span className="text-[var(--color-error)]">-{file.deletions}</span>
              )}
            </span>
          </button>
        ))}
      </div>

      {/* Diff viewer */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {activeFile && (
          <div className="border-[var(--color-base-border-subtle)] border-b bg-[var(--color-base-surface)]/30 px-4 py-2 font-[family-name:var(--font-mono)] text-[12px] text-[var(--color-base-text-secondary)]">
            {activeFile}
          </div>
        )}
        <div className="font-[family-name:var(--font-mono)] text-[12px] leading-5">
          {hunks.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-[var(--color-base-text-faint)] text-xs">
              {activeFile ? 'Binary file or no diff available' : 'Select a file'}
            </div>
          ) : (
            hunks.map((hunk, hi) => (
              <div
                key={hi}
                className="border-[var(--color-base-border-subtle)]/40 border-b last:border-b-0"
              >
                {hunk.lines.map((line, li) => (
                  <div
                    key={`${hi}-${li}`}
                    className={`flex ${
                      line.type === 'added'
                        ? 'bg-[var(--color-success)]/15'
                        : line.type === 'removed'
                          ? 'bg-[var(--color-error)]/15'
                          : ''
                    }`}
                  >
                    <span className="w-12 flex-shrink-0 select-none px-2 text-right text-[var(--color-base-text-faint)]">
                      {line.oldLineNo ?? ''}
                    </span>
                    <span className="w-12 flex-shrink-0 select-none px-2 text-right text-[var(--color-base-text-faint)]">
                      {line.newLineNo ?? ''}
                    </span>
                    <span className="w-5 flex-shrink-0 select-none text-center">
                      {line.type === 'added' ? (
                        <span className="text-[var(--color-success)]">+</span>
                      ) : line.type === 'removed' ? (
                        <span className="text-[var(--color-error)]">-</span>
                      ) : (
                        <span className="text-[var(--color-base-text-faint)]"> </span>
                      )}
                    </span>
                    <span
                      className={`min-w-0 flex-1 whitespace-pre-wrap break-all pr-4 ${
                        line.type === 'added'
                          ? 'text-[var(--color-success)]'
                          : line.type === 'removed'
                            ? 'text-[var(--color-error)]'
                            : 'text-[var(--color-base-text-secondary)]'
                      }`}
                    >
                      {line.content}
                    </span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
