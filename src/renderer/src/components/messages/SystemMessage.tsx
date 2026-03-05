import { Info, Zap } from 'lucide-react'

type SystemMessageProps = {
  content: string
  subtype?: string
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
      <div className="flex items-center gap-2 px-6 py-1">
        <Zap size={12} className="flex-shrink-0 text-purple-400/70" />
        <span className="text-xs text-stone-500">
          Loaded skill <span className="text-stone-400">{skillName ?? 'unknown'}</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2 px-6 py-1.5">
      <Info size={12} className="mt-0.5 flex-shrink-0 text-stone-600" />
      <div className="min-w-0">
        {subtype && (
          <span className="mr-2 text-xs font-medium text-stone-600">[{subtype}]</span>
        )}
        <span className="text-xs text-stone-500">{content}</span>
      </div>
    </div>
  )
}
