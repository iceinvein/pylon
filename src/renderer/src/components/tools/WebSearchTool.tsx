import { ExternalLink } from 'lucide-react'
import { CollapsibleOutput } from './CollapsibleOutput'

type WebSearchToolProps = {
  input: Record<string, unknown>
  result?: string
}

type ParsedLink = {
  title: string
  url: string
  domain: string
}

const URL_REGEX = /https?:\/\/[^\s)<>.,;:!'"]+/g

function parseLinks(text: string): ParsedLink[] {
  const links: ParsedLink[] = []
  const lines = text.split('\n')

  for (const line of lines) {
    const urls = line.match(URL_REGEX)
    if (!urls) continue
    for (const url of urls) {
      try {
        const parsed = new URL(url)
        const titlePart = line
          .split(url)[0]
          .replace(/[-*[\]()]/g, '')
          .trim()
        const title =
          titlePart || parsed.pathname.split('/').filter(Boolean).pop() || parsed.hostname
        links.push({
          title,
          url,
          domain: parsed.hostname.replace(/^www\./, ''),
        })
      } catch {
        // skip invalid URLs
      }
    }
  }

  const seen = new Set<string>()
  return links.filter((link) => {
    if (seen.has(link.url)) return false
    seen.add(link.url)
    return true
  })
}

export function WebSearchTool({ input, result }: WebSearchToolProps) {
  const query = String(input.query ?? input.search ?? input.q ?? '')

  if (!result) {
    return (
      <div className="text-[var(--color-base-text-secondary)] text-xs">
        Searching: <span className="text-[var(--color-base-text)]">{query}</span>
      </div>
    )
  }

  const links = parseLinks(result)

  if (links.length === 0) {
    return <CollapsibleOutput text={result} />
  }

  return (
    <div className="space-y-1">
      {links.map((link, i) => (
        <a
          key={i}
          href={link.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 rounded px-2 py-1 text-xs transition-colors hover:bg-[var(--color-base-raised)]"
        >
          <ExternalLink size={11} className="flex-shrink-0 text-[var(--color-base-text-muted)]" />
          <span className="min-w-0 flex-1 truncate text-[var(--color-base-text)]">
            {link.title}
          </span>
          <span className="flex-shrink-0 text-[var(--color-base-text-faint)]">{link.domain}</span>
        </a>
      ))}
    </div>
  )
}
