import { ChevronRight, FileCode2 } from 'lucide-react'
import { useState } from 'react'
import { useShiki } from '../../hooks/use-shiki'
import { useTestStore } from '../../store/test-store'

type GeneratedTestItemProps = {
  path: string
  cwd: string
}

function HighlightedCode({ code }: { code: string }) {
  const html = useShiki(code, 'typescript')
  if (!html) {
    return (
      <pre className="whitespace-pre-wrap text-base-text-secondary text-xs">{code}</pre>
    )
  }
  // Shiki output is trusted — generated locally by our highlighter from local file content
  return (
    <div
      className="text-xs [&_pre]:!bg-transparent [&_code]:!bg-transparent"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

export function GeneratedTestItem({ path, cwd }: GeneratedTestItemProps) {
  const [expanded, setExpanded] = useState(false)
  const [content, setContent] = useState<string | null>(null)
  const readGeneratedTest = useTestStore((s) => s.readGeneratedTest)

  const handleExpand = async () => {
    if (!expanded && content === null) {
      const result = await readGeneratedTest(cwd, path)
      setContent(result)
    }
    setExpanded(!expanded)
  }

  return (
    <div className="rounded-lg border border-base-border bg-base-raised/50">
      <button
        type="button"
        onClick={handleExpand}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-base-border/30"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-base-text-muted transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <FileCode2 className="h-4 w-4 shrink-0 text-success" />
        <span className="truncate text-base-text">{path}</span>
      </button>
      {expanded && content !== null && (
        <div className="max-h-100 overflow-x-auto border-base-border border-t px-3 pb-3">
          <HighlightedCode code={content} />
        </div>
      )}
    </div>
  )
}
