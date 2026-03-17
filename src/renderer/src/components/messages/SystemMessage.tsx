import { Info, Zap } from 'lucide-react'
import type { ReactNode } from 'react'

type SystemMessageProps = {
  content: string
  subtype?: string
}

/** Parse **bold** markers into <strong> elements, returning React nodes. */
function parseBold(text: string): ReactNode[] {
  const parts = text.split(/(\*\*.+?\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-[var(--color-base-text-secondary)]">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return part
  })
}

function isSkillContent(content: string): string | null {
  // Match "Base directory for this skill: .../skills/<name>"
  const baseDir = content.match(/Base directory for this skill:.*\/skills\/([^\s/]+)/)
  if (baseDir) return baseDir[1]

  // Match "<skill-name>" or "<command-name>" tags at start
  const tagMatch = content.match(/^<(?:skill-name|command-name)>\s*(.+?)\s*<\//)
  if (tagMatch) return tagMatch[1]

  // Match skill content by common patterns (name: / description: header followed by markdown)
  const nameHeader = content.match(/^---\s*\nname:\s*(.+)/m)
  if (nameHeader) return nameHeader[1].trim()

  return null
}

/** Detect skill-like content even without exact pattern matches */
function looksLikeSkillContent(content: string): boolean {
  return (
    content.includes('Base directory for this skill:') ||
    content.includes('skill_directory') ||
    (content.includes('---\nname:') && content.includes('description:')) ||
    /^<(skill-name|command-name)>/.test(content)
  )
}

export function SystemMessage({ content, subtype }: SystemMessageProps) {
  // Skill content → show compact one-liner, hide full content
  const skillName = isSkillContent(content)
  if (skillName || looksLikeSkillContent(content)) {
    return (
      <div className="flex items-center gap-2 py-1 pr-6 pl-[3.75rem]">
        <Zap size={12} className="flex-shrink-0 text-[var(--color-special)]/70" />
        <span className="text-[var(--color-base-text-muted)] text-xs">
          Loaded skill{' '}
          <span className="text-[var(--color-base-text-secondary)]">{skillName ?? 'unknown'}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 py-1.5 pr-6 pl-[3.75rem]">
      <Info size={12} className="mt-0.5 flex-shrink-0 text-[var(--color-base-text-faint)]" />
      <div className="min-w-0">
        {subtype && (
          <span className="mr-2 font-medium text-[var(--color-base-text-faint)] text-xs">
            [{subtype}]
          </span>
        )}
        <span className="whitespace-pre-line text-[var(--color-base-text-muted)] text-xs">
          {parseBold(content)}
        </span>
      </div>
    </div>
  )
}
